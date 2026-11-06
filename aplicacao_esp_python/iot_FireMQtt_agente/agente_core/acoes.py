"""LISTA BRANCA de ações. Só o que está registrado aqui pode ser executado: nunca um comando livre vindo da rede.

Para adicionar uma ação nova, escreva uma função com @acao("nome", "descrição") neste arquivo (e, se quiser
um apelido em texto simples, acrescente em ALIASES, no nucleo.py). Cada função recebe (params, ctx) e devolve
o texto do resultado; para recusar, levante ErroAcao("motivo").
  params = dict com os parâmetros do comando; ctx = {"cfg": configuração, "simular": bool}
"""
import ctypes
import os
import platform
import re
import subprocess
import sys
import time
import webbrowser
from urllib.parse import urlparse

ACOES = {}  # nome -> (função, descrição)
SO = platform.system()  # "Windows", "Linux", "Darwin"


class ErroAcao(Exception):
    """Ação recusada ou que falhou: a mensagem vai no resultado."""


def acao(nome, descricao):
    def registrar(funcao):
        ACOES[nome] = (funcao, descricao)
        return funcao
    return registrar


def executar(nome, params, cfg, simular=False):
    """Executa uma ação da lista branca. Devolve o texto do resultado. Levanta ErroAcao se não puder."""
    if nome not in ACOES:
        raise ErroAcao(f"ação '{nome}' não existe (permitidas: {', '.join(sorted(ACOES))})")
    return ACOES[nome][0](params or {}, {"cfg": cfg, "simular": simular})


def _abrir(argumentos, ctx):
    """Inicia um programa SEM shell (sem interpretar texto como comando)."""
    if ctx["simular"]:
        return
    kwargs = {}
    if SO == "Windows":
        kwargs["creationflags"] = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    subprocess.Popen(argumentos, shell=False, close_fds=True, **kwargs)


def _janelas_explorer():
    """Windows: handles das janelas do Explorer abertas agora."""
    user32 = ctypes.windll.user32
    achadas = []
    enum = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

    def ver(hwnd, _):
        nome = ctypes.create_unicode_buffer(64)
        user32.GetClassNameW(hwnd, nome, 64)
        if nome.value == "CabinetWClass" and user32.IsWindowVisible(hwnd):
            achadas.append(hwnd)
        return True

    user32.EnumWindows(enum(ver), 0)
    return set(achadas)


def _maximizar_nova_janela(antes):
    """Windows: acha a janela nova do Explorer, maximiza e traz para a frente (sem isso ela abre no tamanho
    antigo e o ícone só pisca na barra de tarefas, porque o agente roda em segundo plano)."""
    user32 = ctypes.windll.user32
    limite = time.time() + 4
    while time.time() < limite:
        novas = _janelas_explorer() - antes
        if novas:
            hwnd = novas.pop()
            user32.keybd_event(0x12, 0, 0, 0)       # tecla ALT: libera o direito de trazer a janela para a frente
            user32.keybd_event(0x12, 0, 2, 0)
            user32.ShowWindow(hwnd, 3)               # SW_MAXIMIZE
            user32.SetForegroundWindow(hwnd)
            return hwnd
        time.sleep(0.15)
    return None


@acao("abrir_explorer", "Abre o gerenciador de arquivos (opcional: caminho da pasta)")
def abrir_explorer(p, ctx):
    caminho = str(p.get("caminho") or "").strip().strip('"')
    if caminho and not os.path.isdir(caminho):
        raise ErroAcao(f"a pasta '{caminho}' não existe nesta máquina")
    if SO == "Windows":
        antes = set() if ctx["simular"] else _janelas_explorer()
        _abrir(["explorer", caminho] if caminho else ["explorer"], ctx)
        if not ctx["simular"]:
            _maximizar_nova_janela(antes)
    else:
        _abrir(["xdg-open", caminho or os.path.expanduser("~")], ctx)
    return f"explorador aberto{' em ' + caminho if caminho else ''}"


@acao("abrir_programa", "Abre um programa cadastrado na configuração (parâmetro: nome)")
def abrir_programa(p, ctx):
    nome = str(p.get("nome") or "").strip().lower()
    permitidos = {k.lower(): v for k, v in ctx["cfg"].get("programas", {}).items()}
    if nome not in permitidos:
        raise ErroAcao(f"programa '{nome}' não cadastrado (cadastrados: {', '.join(sorted(permitidos)) or 'nenhum'})")
    _abrir([permitidos[nome]], ctx)
    return f"programa '{nome}' aberto"


def normalizar_url(texto):
    """Sem http:// nem https:// na frente (ex.: www.gmail.com), coloca https:// sozinho."""
    url = str(texto or "").strip()
    if url and not re.match(r"^[A-Za-z][A-Za-z0-9+.-]*://", url):
        url = "https://" + url
    return url


@acao("abrir_url", "Abre um endereço no navegador (parâmetro: url; o https:// é colocado sozinho)")
def abrir_url(p, ctx):
    url = normalizar_url(p.get("url"))
    try:
        partes = urlparse(url)
        host = partes.hostname or ""
        partes.port  # porta inválida levanta ValueError
    except ValueError:
        host = ""
    if partes.scheme.lower() not in ("http", "https") or " " in url or not ("." in host or host == "localhost"):
        raise ErroAcao("endereço inválido: use um site, como www.gmail.com")
    if not ctx["simular"]:
        webbrowser.open(url)
    return f"endereço aberto: {url}"


@acao("bloquear_tela", "Bloqueia a sessão do usuário")
def bloquear_tela(p, ctx):
    if not ctx["simular"]:
        if SO == "Windows":
            if not ctypes.windll.user32.LockWorkStation():
                raise ErroAcao("o Windows recusou bloquear a tela")
        else:
            _abrir(["loginctl", "lock-session"], ctx)
    return "tela bloqueada"


def _exigir_confirmacao(p, o_que):
    if p.get("confirmado") is not True:
        raise ErroAcao(f"{o_que} exige confirmação (parâmetro confirmado=true)")


@acao("desligar", "Desliga a máquina em 10 s (exige confirmado=true)")
def desligar(p, ctx):
    _exigir_confirmacao(p, "desligar")
    if SO == "Windows":
        _abrir(["shutdown", "/s", "/t", "10", "/c", "Desligamento remoto (agente IOT)"], ctx)
    else:
        _abrir(["systemctl", "poweroff"], ctx)
    return "desligando em 10 s" if SO == "Windows" else "desligando"


@acao("reiniciar", "Reinicia a máquina em 10 s (exige confirmado=true)")
def reiniciar(p, ctx):
    _exigir_confirmacao(p, "reiniciar")
    if SO == "Windows":
        _abrir(["shutdown", "/r", "/t", "10", "/c", "Reinício remoto (agente IOT)"], ctx)
    else:
        _abrir(["systemctl", "reboot"], ctx)
    return "reiniciando em 10 s" if SO == "Windows" else "reiniciando"


@acao("info_sistema", "Devolve CPU, memória, disco e tempo ligado")
def info_sistema(p, ctx):
    import socket
    import psutil
    disco = psutil.disk_usage(os.path.abspath(os.sep) if SO != "Windows" else os.environ.get("SystemDrive", "C:") + "\\")
    mem = psutil.virtual_memory()
    ligada_h = (time.time() - psutil.boot_time()) / 3600
    return (f"{socket.gethostname()} ({SO} {platform.release()}) | CPU {psutil.cpu_percent(interval=0.5):.0f}% | "
            f"memória {mem.percent:.0f}% de {mem.total / 2**30:.1f} GB | disco {disco.percent:.0f}% de "
            f"{disco.total / 2**30:.0f} GB | ligada há {ligada_h:.1f} h")
