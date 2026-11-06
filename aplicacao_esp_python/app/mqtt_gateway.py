"""Gateway Firebase <-> broker MQTT local (usado pelo form Broker MQTT IOT enquanto o broker está ativo).

A página (https) não alcança um broker da rede local; então ela grava o comando no Firebase e este gateway,
que está na mesma rede do broker, o entrega às máquinas:
  Firebase  brokers/<B>/maquinas/<M>/comandos/<id>   ->  MQTT  casa/<M>/cmd        (e o comando é apagado do Firebase)
  MQTT      casa/<M>/result                           ->  Firebase  .../maquinas/<M>/resultado/<id>
  MQTT      casa/<M>/status (online/offline)          ->  Firebase  .../maquinas/<M>/status
Cada comando é entregue UMA vez: ao ser publicado no MQTT ele sai da fila do Firebase.
"""
import json
import queue
import threading

import paho.mqtt.client as mqtt

from . import firebase_rest as fb

CONSULTA_S = 2
CLIENTE_ID = "gateway-firebase"   # o form não conta este cliente como "máquina conectada"


class MqttGateway:
    def __init__(self, broker, porta, usuario, senha, escrever):
        self.broker = broker          # nome do broker em brokers/<nome>
        self.porta, self.usuario, self.senha = porta, usuario, senha
        self.escrever = escrever      # função(texto) que escreve no log do form (pode ser chamada de outra thread)
        self._parar = threading.Event()
        self._fila = queue.Queue()    # trabalhos de escrita no Firebase (não travam o MQTT)
        self._sem_rede = False
        self.cliente = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=CLIENTE_ID)
        self.cliente.username_pw_set(usuario, senha)
        self.cliente.reconnect_delay_set(1, 15)
        self.cliente.on_connect = self._on_connect
        self.cliente.on_message = self._on_message

    @property
    def base(self):
        return f"brokers/{self.broker}/maquinas"

    def iniciar(self):
        self.cliente.connect_async("127.0.0.1", self.porta, keepalive=30)
        self.cliente.loop_start()
        threading.Thread(target=self._laco_escrita, daemon=True).start()
        threading.Thread(target=self._laco_comandos, daemon=True).start()
        self.escrever("Gateway Firebase↔MQTT ligado: comandos da página chegam às máquinas da rede.")

    def parar(self):
        self._parar.set()
        self._fila.put(None)
        try:
            self.cliente.disconnect()
        finally:
            self.cliente.loop_stop()

    # ---------- MQTT -> Firebase ----------
    def _on_connect(self, cliente, userdata, flags, reason_code, properties=None):
        if reason_code == 0 or getattr(reason_code, "is_failure", False) is False:
            cliente.subscribe([("casa/+/status", 1), ("casa/+/result", 1)])
        else:
            self.escrever(f"Gateway: o broker local recusou a conexão ({reason_code}).")

    def _on_message(self, cliente, userdata, msg):
        partes = msg.topic.split("/")
        if len(partes) != 3:
            return
        _, maquina, tipo = partes
        try:
            dados = json.loads(msg.payload.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return
        if not isinstance(dados, dict):
            return
        if tipo == "status":
            status = {"online": bool(dados.get("online")), "so": dados.get("so", ""), "visto_em": fb.SERVER_TS}
            self._fila.put(("PATCH", f"{self.base}/{maquina}/status", status))
        elif tipo == "result" and dados.get("id"):
            self._fila.put(("PUT", f"{self.base}/{maquina}/resultado/{dados['id']}", dados))

    def _laco_escrita(self):
        while True:
            trabalho = self._fila.get()
            if trabalho is None or self._parar.is_set():
                return
            metodo, caminho, dados = trabalho
            try:
                fb.request(metodo, caminho, dados)
                self._avisar(True)
            except Exception as exc:  # noqa: BLE001
                self._avisar(False, exc)

    # ---------- Firebase -> MQTT ----------
    def _laco_comandos(self):
        while not self._parar.is_set():
            try:
                maquinas = fb.request("GET", self.base) or {}
                self._avisar(True)
                for maquina, dados in maquinas.items():
                    comandos = (dados or {}).get("comandos") if isinstance(dados, dict) else None
                    for id_, cmd in sorted((comandos or {}).items(), key=lambda kv: (kv[1] or {}).get("ts") or 0):
                        self._entregar(maquina, id_, cmd)
            except Exception as exc:  # noqa: BLE001
                self._avisar(False, exc)
            self._parar.wait(CONSULTA_S)

    def _entregar(self, maquina, id_, cmd):
        if isinstance(cmd, dict):
            cmd = {**cmd, "id": id_}
            self.cliente.publish(f"casa/{maquina}/cmd", json.dumps(cmd, ensure_ascii=False), qos=1)
            self.escrever(f"Gateway: comando '{cmd.get('acao', '?')}' entregue a {maquina}.")
        try:  # saiu da fila: não será entregue de novo
            fb.request("DELETE", f"{self.base}/{maquina}/comandos/{id_}")
        except Exception as exc:  # noqa: BLE001
            self._avisar(False, exc)

    def _avisar(self, ok, exc=None):
        if not ok and not self._sem_rede:
            self._sem_rede = True
            self.escrever(f"Gateway: sem conexão com o Firebase ({fb.friendly_error(exc)}); o MQTT local continua.")
        elif ok and self._sem_rede:
            self._sem_rede = False
            self.escrever("Gateway: conexão com o Firebase restabelecida.")
