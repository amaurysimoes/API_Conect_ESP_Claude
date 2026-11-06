"""Configuração do agente (arquivo JSON na pasta de dados do usuário) e log com rotação."""
import copy
import json
import logging
import logging.handlers
import os
import socket
import sys
from pathlib import Path

NOME_APP = "AUTOMACAO_IOT-AHS-Agente"
DB_URL = "https://amauryesp-active-default-rtdb.firebaseio.com"


def pasta_dados():
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home()))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    pasta = base / NOME_APP
    pasta.mkdir(parents=True, exist_ok=True)
    return pasta


def programas_padrao():
    if sys.platform == "win32":
        return {"bloco de notas": "notepad.exe", "calculadora": "calc.exe"}
    return {}


def padrao():
    return {
        "maquina": socket.gethostname(),
        "canal": "mqtt",                 # "mqtt" ou "firebase": qual broker o agente observa
        "firebase": {"url": DB_URL, "broker": ""},
        "mqtt": {"host": "", "porta": 1883, "usuario": "", "senha": ""},
        "emails": {},                    # contas Gmail que podem enviar: endereço -> senha de app (só nesta máquina)
        "programas": programas_padrao(),  # SÓ estes programas podem ser abertos (nome -> caminho)
        "iniciar_ao_abrir": False,
    }


def _mesclar(base, novo):
    for k, v in novo.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict) and k not in ("programas", "emails"):
            _mesclar(base[k], v)
        else:
            base[k] = v
    return base


def arquivo_config(caminho=None):
    return Path(caminho) if caminho else pasta_dados() / "config.json"


def carregar(caminho=None):
    cfg = padrao()
    try:
        _mesclar(cfg, json.loads(arquivo_config(caminho).read_text(encoding="utf-8")))
    except (OSError, ValueError):
        pass
    return cfg


def salvar(cfg, caminho=None):
    try:
        arquivo_config(caminho).write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        pass


def validar(cfg):
    """Mensagem do primeiro problema, ou None."""
    import re
    if not re.fullmatch(r"[A-Za-z0-9_-]+", cfg["maquina"]):
        return "Nome da máquina: só letras, números, - e _ (sem espaço)."
    if cfg["canal"] == "firebase":
        if not cfg["firebase"]["broker"]:
            return "Escolha o broker do Firebase que o agente vai observar."
    elif cfg["canal"] == "mqtt":
        m = cfg["mqtt"]
        if not m["host"]:
            return "Informe o endereço (IP) do broker MQTT."
        if not m["usuario"] or not m["senha"]:
            return "Informe o usuário e a senha do broker MQTT."
    else:
        return "Canal inválido."
    return None


def configurar_log(console=False, extra_handler=None):
    """Log do agente: arquivo com rotação (3 x 1 MB) na pasta de dados; opcionalmente console e um handler extra."""
    log = logging.getLogger("agente")
    if log.handlers:
        return log
    log.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s  %(message)s", "%H:%M:%S")
    arq = logging.handlers.RotatingFileHandler(pasta_dados() / "agente.log", maxBytes=1_000_000, backupCount=3,
                                               encoding="utf-8")
    arq.setFormatter(fmt)
    log.addHandler(arq)
    if console:
        h = logging.StreamHandler()
        h.setFormatter(fmt)
        log.addHandler(h)
    if extra_handler:
        extra_handler.setFormatter(fmt)
        log.addHandler(extra_handler)
    return log


def copia(cfg):
    return copy.deepcopy(cfg)
