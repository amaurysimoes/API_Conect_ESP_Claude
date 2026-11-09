"""Ações que a máquina executa. Cada uma recebe os parâmetros do comando e devolve o texto do resultado.
Só chegam aqui comandos ASSINADOS pela ponte (veja agente.py). Windows."""
import ctypes
import os
import platform
import socket
import subprocess
import time
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


# ---------- abrir ----------
def abrir_programa(params):
    programa = _texto(params, "programa", maximo=260)
    _executar(programa, _texto(params, "argumentos", False))
    return f"aberto: {programa}"


def abrir_url(params):
    url = _texto(params, "url", maximo=2000)
    if "://" not in url:
        url = "https://" + url
    if urlparse(url).scheme not in ("http", "https"):
        raise ErroAcao("só endereços http/https")
    _executar(url)
    return f"aberto: {url}"


def abrir_pasta(params):
    caminho = _texto(params, "caminho", maximo=260)
    if not Path(caminho).is_dir():
        raise ErroAcao(f"pasta não encontrada: {caminho}")
    os.startfile(caminho)
    return f"pasta aberta: {caminho}"


def abrir_arquivo(params):
    caminho = _texto(params, "caminho", maximo=260)
    if not Path(caminho).exists():
        raise ErroAcao(f"arquivo não encontrado: {caminho}")
    os.startfile(caminho)
    return f"aberto: {caminho}"


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
                                 bloquear_tela, desligar, reiniciar, cancelar_desligamento)}
