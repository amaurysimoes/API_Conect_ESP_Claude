"""Canal Firebase: o agente consulta o Realtime Database (REST, sem SDK). Caminhos, dentro do broker escolhido:
  brokers/<broker>/maquinas/<maquina>/comandos/<id>    comando pendente, apagado depois de tratado
  brokers/<broker>/maquinas/<maquina>/resultado/<id>   resultado de cada comando
  brokers/<broker>/maquinas/<maquina>/status           online + sinal de vida a cada 10 s
"""
import json
import logging
import platform
import threading
import urllib.error
import urllib.request

log = logging.getLogger("agente")
CONSULTA_S = 2          # de quanto em quanto tempo procura comandos novos
HEARTBEAT_S = 10
SERVER_TS = {".sv": "timestamp"}


def requisitar(url_base, metodo, caminho, dados=None, timeout=8):
    corpo = None if dados is None else json.dumps(dados).encode("utf-8")
    req = urllib.request.Request(f"{url_base}/{caminho.strip('/')}.json", data=corpo, method=metodo,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8") or "null")


class CanalFirebase:
    def __init__(self, cfg, nucleo):
        self.cfg, self.nucleo = cfg, nucleo
        self.url = cfg["firebase"]["url"].rstrip("/")
        self.base = f"brokers/{cfg['firebase']['broker']}/maquinas/{cfg['maquina']}"
        self._parar = threading.Event()
        self._sem_rede = False

    def iniciar(self):
        log.info("Firebase: observando %s (consulta a cada %s s)", self.base, CONSULTA_S)
        threading.Thread(target=self._laco_comandos, daemon=True).start()
        threading.Thread(target=self._laco_batimento, daemon=True).start()

    def parar(self):
        self._parar.set()
        try:
            requisitar(self.url, "PATCH", f"{self.base}/status", {"online": False, "visto_em": SERVER_TS}, timeout=4)
        except Exception:  # noqa: BLE001
            pass
        log.info("Firebase: agente parado.")

    def _avisar_rede(self, ok, erro=""):
        if not ok and not self._sem_rede:
            self._sem_rede = True
            log.info("Firebase: sem conexão (%s). Tentando de novo...", erro)
        elif ok and self._sem_rede:
            self._sem_rede = False
            log.info("Firebase: conexão restabelecida.")

    def _laco_comandos(self):
        while not self._parar.is_set():
            try:
                pendentes = requisitar(self.url, "GET", f"{self.base}/comandos") or {}
                self._avisar_rede(True)
                for id_, cmd in sorted(pendentes.items(), key=lambda kv: (kv[1] or {}).get("ts") or 0):
                    self._tratar(id_, cmd)
            except Exception as exc:  # noqa: BLE001
                self._avisar_rede(False, exc)
            self._parar.wait(CONSULTA_S)

    def _tratar(self, id_, cmd):
        if not isinstance(cmd, dict):
            cmd = {}
        cmd = {**cmd, "id": id_}
        resultado = self.nucleo.processar(cmd, "firebase")
        try:
            if resultado is not None:
                requisitar(self.url, "PUT", f"{self.base}/resultado/{id_}", resultado)
            requisitar(self.url, "DELETE", f"{self.base}/comandos/{id_}")  # tratado: sai da fila
        except Exception as exc:  # noqa: BLE001 - o ID fica lembrado: não executa de novo
            self._avisar_rede(False, exc)

    def _laco_batimento(self):
        while not self._parar.is_set():
            try:
                requisitar(self.url, "PATCH", f"{self.base}/status",
                           {"online": True, "so": platform.system(), "visto_em": SERVER_TS,
                            "emails": sorted(self.cfg.get("emails", {}))})  # só os endereços, nunca as senhas
                self._avisar_rede(True)
            except Exception as exc:  # noqa: BLE001
                self._avisar_rede(False, exc)
            self._parar.wait(HEARTBEAT_S)
