"""Ações do agente no LINUX: os mesmos nomes e respostas do acoes.py (que é do Windows e não é usado aqui).
Só chegam aqui comandos ASSINADOS pela ponte (veja agente.py). Precisa de xdg-open (apt install xdg-utils) para abrir sites, pastas e arquivos."""
import json
import os
import platform
import re
import shlex
import shutil
import socket
import subprocess
import time
from pathlib import Path
from urllib.parse import urlparse

import psutil


class ErroAcao(Exception):
    pass


# processos que nunca são encerrados por "fechar_programa"
PROTEGIDOS = {"systemd", "init", "xorg", "xwayland", "gnome-shell", "kwin_x11", "kwin_wayland", "plasmashell", "dbus-daemon",
              "sshd", "login", "gdm", "gdm3", "sddm", "lightdm", "pulseaudio", "pipewire", "networkmanager", "wsl", "wslg"}


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


def _lancar(comando):
    """Abre o programa solto da nossa sessão (continua vivo mesmo se o agente fechar)."""
    subprocess.Popen(comando, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


def _xdg(alvo):
    exe = shutil.which("xdg-open")
    if not exe:
        raise ErroAcao("xdg-open não está instalado nesta máquina (sudo apt install xdg-utils)")
    _lancar([exe, alvo])


# ---------- existe nesta máquina? ----------
def _parece_caminho(alvo):
    return any(c in alvo for c in "\\/") or (len(alvo) > 1 and alvo[1] == ":")


def _existe(alvo):
    """True se o programa, pasta ou arquivo existe aqui. Nome solto: procura no PATH. Caminho do Windows (C:\\...) não existe no Linux."""
    alvo = os.path.expandvars(os.path.expanduser(str(alvo).strip().strip('"')))
    if not alvo:
        return False
    if re.match(r"^[A-Za-z][A-Za-z0-9+.-]+:", alvo):          # protocolo (https:, mailto:...)
        return True
    if _parece_caminho(alvo):
        return Path(alvo).exists()
    return shutil.which(alvo) is not None


def verificar_caminhos(params):
    """Diz quais dos caminhos existem nesta máquina (usado pelos atalhos salvos). Resposta: {"existe": [...], "falta": [...]}."""
    caminhos = params.get("caminhos")
    if not isinstance(caminhos, list) or len(caminhos) > 100:
        raise ErroAcao("falta a lista 'caminhos'")
    lista = [str(c) for c in caminhos if isinstance(c, str) and 0 < len(c) <= 500 and not any(ord(x) < 32 for x in c)]
    existe = [c for c in lista if _existe(c)]
    return json.dumps({"existe": existe, "falta": [c for c in lista if c not in existe]}, ensure_ascii=False)


# ---------- informações ----------
def resumo():
    """Números curtos, também enviados ao Firebase a cada 10 s."""
    return {
        "host": socket.gethostname(),
        "so": f"{platform.system()} {platform.release()}",
        "cpu": round(psutil.cpu_percent(interval=0.3)),
        "memoria": round(psutil.virtual_memory().percent),
        "disco": round(psutil.disk_usage("/").percent),
        "ligado_h": round((time.time() - psutil.boot_time()) / 3600, 1),
    }


def info(_params):
    r = resumo()
    return (f"{r['host']} · {r['so']} · CPU {r['cpu']}% · memória {r['memoria']}% · disco {r['disco']}% · "
            f"ligada há {r['ligado_h']} h")


# ---------- abrir ----------
def abrir_programa(params):
    programa = _texto(params, "programa", maximo=260)
    argumentos = _texto(params, "argumentos", False)
    if not _existe(programa):
        raise ErroAcao(f"ainda não existe nesta máquina: {programa} (não instalado ou caminho diferente)")
    exe = programa if _parece_caminho(programa) else shutil.which(programa)
    _lancar([exe] + (shlex.split(argumentos) if argumentos else []))
    return f"aberto: {programa}"


def abrir_url(params):
    url = _texto(params, "url", maximo=2000)
    if "://" not in url:
        url = "https://" + url
    if urlparse(url).scheme not in ("http", "https"):
        raise ErroAcao("só endereços http/https")
    _xdg(url)
    return f"aberto: {url}"


def abrir_pasta(params):
    caminho = os.path.expanduser(_texto(params, "caminho", maximo=260))
    if not Path(caminho).is_dir():
        raise ErroAcao(f"pasta não encontrada: {caminho}")
    _xdg(caminho)
    return f"pasta aberta: {caminho}"


def abrir_arquivo(params):
    caminho = os.path.expanduser(_texto(params, "caminho", maximo=260))
    if not Path(caminho).exists():
        raise ErroAcao(f"arquivo não encontrado: {caminho}")
    _xdg(caminho)
    return f"aberto: {caminho}"


# ---------- fechar / sistema ----------
def fechar_programa(params):
    nome = _texto(params, "programa", maximo=100).lower()
    nome = nome[:-4] if nome.endswith(".exe") else nome
    if nome in PROTEGIDOS:
        raise ErroAcao(f"'{nome}' é protegido e não pode ser fechado")
    n = 0
    for p in psutil.process_iter(["name", "pid"]):
        if (p.info["name"] or "").lower() == nome and p.info["pid"] != os.getpid():
            try:
                p.terminate()
                n += 1
            except psutil.Error:
                pass
    if not n:
        raise ErroAcao(f"'{nome}' não está aberto")
    return f"fechado: {nome} ({n} processo{'s' if n > 1 else ''})"


def bloquear_tela(_params):
    for cmd in (["loginctl", "lock-session"], ["xdg-screensaver", "lock"], ["gnome-screensaver-command", "-l"]):
        if shutil.which(cmd[0]) and subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            return "tela bloqueada"
    raise ErroAcao("não consegui bloquear a tela (precisa de loginctl ou xdg-screensaver)")


def _confirmado(params, acao):
    if params.get("confirmado") is not True:
        raise ErroAcao(f"'{acao}' exige confirmação explícita")


def desligar(params):
    _confirmado(params, "desligar")
    subprocess.Popen(["systemctl", "poweroff"], start_new_session=True)
    return "desligando agora (systemctl poweroff)"


def reiniciar(params):
    _confirmado(params, "reiniciar")
    subprocess.Popen(["systemctl", "reboot"], start_new_session=True)
    return "reiniciando agora (systemctl reboot)"


def cancelar_desligamento(_params):
    subprocess.run(["shutdown", "-c"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return "desligamento agendado cancelado (se houvesse)"


ACOES = {f.__name__: f for f in (info, abrir_programa, abrir_url, abrir_pasta, abrir_arquivo, fechar_programa,
                                 bloquear_tela, desligar, reiniciar, cancelar_desligamento,
                                 verificar_caminhos)}
