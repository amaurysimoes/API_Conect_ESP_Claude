"""Ações que a máquina executa. Cada uma recebe os parâmetros do comando e devolve o texto do resultado.
Só chegam aqui comandos ASSINADOS pela ponte (veja agente.py). Windows."""
import ctypes
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import threading
import time
from ctypes import wintypes
from pathlib import Path
from urllib.parse import urlparse

import psutil


class ErroAcao(Exception):
    pass


# processos que nunca são encerrados por "fechar_programa"
PROTEGIDOS = {"system", "csrss.exe", "wininit.exe", "winlogon.exe", "services.exe", "lsass.exe", "svchost.exe",
              "explorer.exe", "dwm.exe", "smss.exe"}


def _texto(params, chave, obrigatorio=True, maximo=500):
    v = params.get(chave)
    if v is None or str(v).strip() == "":
        if obrigatorio:
            raise ErroAcao(f"falta o parâmetro '{chave}'")
        return None
    v = str(v).strip()
    if len(v) > maximo or any(ord(c) < 32 for c in v):
        raise ErroAcao(f"parâmetro '{chave}' inválido")
    return v


def _executar(alvo, argumentos=None):
    """Abre programa, arquivo, pasta ou endereço como se tivesse dado dois cliques (ShellExecute)."""
    f = ctypes.windll.shell32.ShellExecuteW
    f.restype = ctypes.c_void_p
    r = int(f(None, "open", alvo, argumentos, None, 1) or 0)
    if r <= 32:
        raise ErroAcao(f"não consegui abrir '{alvo}' (código {r}). Está instalado nesta máquina?")


# ---------- trazer a janela para a frente ----------
user32, dwmapi, kernel32 = ctypes.windll.user32, ctypes.windll.dwmapi, ctypes.windll.kernel32
user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
user32.GetWindow.argtypes = [wintypes.HWND, wintypes.UINT]
user32.GetWindow.restype = wintypes.HWND
user32.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
user32.IsIconic.argtypes = [wintypes.HWND]
user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
user32.SetForegroundWindow.argtypes = [wintypes.HWND]
user32.BringWindowToTop.argtypes = [wintypes.HWND]
user32.GetForegroundWindow.restype = wintypes.HWND
user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
user32.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
dwmapi.DwmGetWindowAttribute.argtypes = [wintypes.HWND, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD]
_ENUM = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)


def _janelas():
    """Janelas de aplicativo visíveis (as que aparecem na barra de tarefas), da mais alta para a mais baixa."""
    achadas = []

    def cb(hwnd, _):
        if (user32.IsWindowVisible(hwnd) and user32.GetWindowTextLengthW(hwnd) > 0 and not user32.GetWindow(hwnd, 4)
                and not user32.GetWindowLongW(hwnd, -20) & 0x80):          # sem dono e não é janela de ferramenta
            oculta = ctypes.c_int(0)
            dwmapi.DwmGetWindowAttribute(hwnd, 14, ctypes.byref(oculta), 4)  # 14 = "cloaked" (janela fantasma do UWP)
            if not oculta.value:
                achadas.append(hwnd)
        return True

    user32.EnumWindows(_ENUM(cb), 0)
    return achadas


def _frente(hwnd):
    """Traz a janela para a frente e dá o foco. O Windows recusa isso para programas em segundo plano; os truques abaixo contornam."""
    if user32.IsIconic(hwnd):
        user32.ShowWindow(hwnd, 9)                              # SW_RESTORE
    user32.keybd_event(0x12, 0, 0, 0)                           # aperta e solta ALT: libera o SetForegroundWindow
    user32.keybd_event(0x12, 0, 2, 0)
    user32.SetWindowPos(hwnd, wintypes.HWND(-1), 0, 0, 0, 0, 0x0003)   # topo, sem mexer no tamanho/posição
    user32.SetWindowPos(hwnd, wintypes.HWND(-2), 0, 0, 0, 0, 0x0003)   # e volta ao normal (fica na frente)
    user32.SetForegroundWindow(hwnd)
    if user32.GetForegroundWindow() != hwnd:                    # plano B: emprestar a "entrada" da janela atual
        fg = user32.GetForegroundWindow()
        t_fg, t_eu = user32.GetWindowThreadProcessId(fg, None), kernel32.GetCurrentThreadId()
        user32.AttachThreadInput(t_eu, t_fg, True)
        user32.BringWindowToTop(hwnd)
        user32.SetForegroundWindow(hwnd)
        user32.AttachThreadInput(t_eu, t_fg, False)
    return user32.GetForegroundWindow() == hwnd


def _do_processo(hwnd, base):
    pid = wintypes.DWORD(0)
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    try:
        return psutil.Process(pid.value).name().lower().startswith(base)
    except psutil.Error:
        return False


def _abrir_na_frente(abrir, alvo=None, espera=6.0):
    """Roda abrir() e traz para a frente a janela que aparecer (ou a do programa que já estava aberto).
    Devolve True se a janela ficou na frente. Continua vigiando alguns segundos (telas de abertura, como a do Word)."""
    antes = set(_janelas())
    base = None
    if alvo and not str(alvo).rstrip().endswith(":"):
        base = os.path.splitext(os.path.basename(str(alvo).strip().strip('"')))[0].lower() or None
    abrir()
    inicio, resultado, pronto = time.time(), {"ok": False}, threading.Event()

    def vigia():
        tratadas, ultima = set(), 0.0
        while time.time() - inicio < 14:
            atuais = _janelas()
            novas = [h for h in atuais if h not in antes and h not in tratadas]
            if not novas and base and not tratadas and time.time() - inicio > 1.5:   # programa que já estava aberto
                novas = [h for h in atuais if _do_processo(h, base)][:1]
            for h in reversed(novas):                                                # a mais alta termina por cima
                tratadas.add(h)
                ok = _frente(h)
                if not pronto.is_set():
                    resultado["ok"] = ok
                    pronto.set()
                ultima = time.time()
            if tratadas and time.time() - ultima > 3:
                break
            time.sleep(0.25)
        pronto.set()

    threading.Thread(target=vigia, daemon=True).start()
    pronto.wait(espera)
    return resultado["ok"]


def _situacao(ok):
    return "na frente" if ok else "aberto, mas a janela não veio para a frente (sem janela ou o Windows recusou)"


# ---------- informações ----------
def resumo():
    """Números curtos, também enviados ao Firebase a cada 10 s."""
    boot = psutil.boot_time()
    return {
        "host": socket.gethostname(),
        "so": f"{platform.system()} {platform.release()}",
        "cpu": round(psutil.cpu_percent(interval=0.3)),
        "memoria": round(psutil.virtual_memory().percent),
        "disco": round(psutil.disk_usage(os.environ.get("SystemDrive", "C:") + "\\").percent),
        "ligado_h": round((time.time() - boot) / 3600, 1),
    }


def info(_params):
    r = resumo()
    return (f"{r['host']} · {r['so']} · CPU {r['cpu']}% · memória {r['memoria']}% · disco {r['disco']}% · "
            f"ligada há {r['ligado_h']} h")


# ---------- existe nesta máquina? ----------
def _parece_caminho(alvo):
    return any(c in alvo for c in "\\/") or (len(alvo) > 1 and alvo[1] == ":")


def _existe(alvo):
    """True se o programa, pasta ou arquivo existe aqui. Nome solto (winword): procura no PATH e nos 'App Paths' do Windows."""
    alvo = os.path.expandvars(str(alvo).strip().strip('"'))
    if not alvo:
        return False
    if re.match(r"^[A-Za-z][A-Za-z0-9+.-]+:", alvo):          # ms-settings:, ms-teams: ... (protocolo do Windows)
        return True
    if _parece_caminho(alvo):
        return Path(alvo).exists()
    if shutil.which(alvo):
        return True
    import winreg
    nome = alvo if alvo.lower().endswith(".exe") else alvo + ".exe"
    for raiz in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
        try:
            winreg.CloseKey(winreg.OpenKey(raiz, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths" + "\\" + nome))
            return True
        except OSError:
            pass
    return False


def verificar_caminhos(params):
    """Diz quais dos caminhos existem nesta máquina (usado pelos atalhos salvos). Resposta: {"existe": [...], "falta": [...]}."""
    caminhos = params.get("caminhos")
    if not isinstance(caminhos, list) or len(caminhos) > 100:
        raise ErroAcao("falta a lista 'caminhos'")
    lista = [str(c) for c in caminhos if isinstance(c, str) and 0 < len(c) <= 500 and not any(ord(x) < 32 for x in c)]
    existe = [c for c in lista if _existe(c)]
    return json.dumps({"existe": existe, "falta": [c for c in lista if c not in existe]}, ensure_ascii=False)


# ---------- abrir ----------
def abrir_programa(params):
    programa = _texto(params, "programa", maximo=260)
    argumentos = _texto(params, "argumentos", False)
    if _parece_caminho(programa) and not _existe(programa):
        raise ErroAcao(f"ainda não existe nesta máquina: {programa} (não instalado ou caminho diferente)")
    ok = _abrir_na_frente(lambda: _executar(programa, argumentos), programa)
    return f"aberto: {programa} · {_situacao(ok)}"


def abrir_url(params):
    url = _texto(params, "url", maximo=2000)
    if "://" not in url:
        url = "https://" + url
    if urlparse(url).scheme not in ("http", "https"):
        raise ErroAcao("só endereços http/https")
    ok = _abrir_na_frente(lambda: _executar(url))
    return f"aberto: {url} · {_situacao(ok)}"


def abrir_pasta(params):
    caminho = _texto(params, "caminho", maximo=260)
    if not Path(caminho).is_dir():
        raise ErroAcao(f"pasta não encontrada: {caminho}")
    ok = _abrir_na_frente(lambda: os.startfile(caminho))
    return f"pasta aberta: {caminho} · {_situacao(ok)}"


def abrir_arquivo(params):
    caminho = _texto(params, "caminho", maximo=260)
    if not Path(caminho).exists():
        raise ErroAcao(f"arquivo não encontrado: {caminho}")
    ok = _abrir_na_frente(lambda: os.startfile(caminho))
    return f"aberto: {caminho} · {_situacao(ok)}"


# ---------- fechar / sistema ----------
def fechar_programa(params):
    nome = _texto(params, "programa", maximo=100).lower()
    nome = nome if nome.endswith(".exe") else nome + ".exe"
    if nome in PROTEGIDOS:
        raise ErroAcao(f"'{nome}' é protegido e não pode ser fechado")
    n = 0
    for p in psutil.process_iter(["name"]):
        if (p.info["name"] or "").lower() == nome:
            try:
                p.terminate()
                n += 1
            except psutil.Error:
                pass
    if not n:
        raise ErroAcao(f"'{nome}' não está aberto")
    return f"fechado: {nome} ({n} processo{'s' if n > 1 else ''})"


def bloquear_tela(_params):
    ctypes.windll.user32.LockWorkStation()
    return "tela bloqueada"


def _confirmado(params, acao):
    if params.get("confirmado") is not True:
        raise ErroAcao(f"'{acao}' exige confirmação explícita")


def desligar(params):
    _confirmado(params, "desligar")
    subprocess.run(["shutdown", "/s", "/t", "10"], check=False)
    return "desligando em 10 s (para cancelar: cancelar_desligamento)"


def reiniciar(params):
    _confirmado(params, "reiniciar")
    subprocess.run(["shutdown", "/r", "/t", "10"], check=False)
    return "reiniciando em 10 s (para cancelar: cancelar_desligamento)"


def cancelar_desligamento(_params):
    subprocess.run(["shutdown", "/a"], check=False)
    return "desligamento cancelado"


ACOES = {f.__name__: f for f in (info, abrir_programa, abrir_url, abrir_pasta, abrir_arquivo, fechar_programa,
                                 bloquear_tela, desligar, reiniciar, cancelar_desligamento,
                                 verificar_caminhos)}
