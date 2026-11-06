"""Acesso simples ao Realtime Database por REST (sem SDK), usado pelos forms Broker. As regras do banco decidem
o que pode ser lido/escrito. As chamadas bloqueiam: use `Chamada` para rodar fora da interface."""
import json
import socket
import threading
import urllib.request

from PyQt6.QtCore import QObject, pyqtSignal

DB_URL = "https://amauryesp-active-default-rtdb.firebaseio.com"
ONLINE_MS = 30000  # sem sinal por mais que isso = offline (os brokers renovam "visto_em" a cada 10 s)
SERVER_TS = {".sv": "timestamp"}  # o servidor do Firebase grava o horário


def request(method, path, data=None, timeout=8):
    """Devolve o JSON da resposta. Levanta exceção se der erro de rede ou de permissão."""
    body = None if data is None else json.dumps(data).encode("utf-8")
    req = urllib.request.Request(f"{DB_URL}/{path.strip('/')}.json", data=body, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8") or "null")


def local_ip():
    """IP desta máquina na rede local (o que sai para a rede, sem enviar nada)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def friendly_error(exc):
    text = str(exc)
    if "401" in text or "403" in text or "Permission" in text:
        return "o Firebase recusou (confira as regras do banco: 'brokers')"
    return text or exc.__class__.__name__


class Chamada(QObject):
    """Roda `fn()` numa thread e entrega o resultado na interface: pronto(resultado) ou erro(texto)."""
    pronto = pyqtSignal(object)
    erro = pyqtSignal(str)

    def __init__(self, fn, parent=None):
        super().__init__(parent)
        self._fn = fn

    def start(self):
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        try:
            self.pronto.emit(self._fn())
        except Exception as exc:  # noqa: BLE001 - qualquer falha vira mensagem no log
            self.erro.emit(friendly_error(exc))
