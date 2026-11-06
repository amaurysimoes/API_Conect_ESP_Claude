"""Canal MQTT: o agente conecta no broker da rede local e obedece ao tópico casa/<maquina>/cmd.
  casa/<maquina>/cmd     (assina)   comando: texto simples ou JSON
  casa/<maquina>/result  (publica)  resultado de cada comando
  casa/<maquina>/status  (publica)  online/offline + sinal a cada 10 s (retido; Last Will marca offline se cair)
"""
import json
import logging
import platform
import threading
import time

import paho.mqtt.client as mqtt

log = logging.getLogger("agente")
HEARTBEAT_S = 10


class CanalMqtt:
    def __init__(self, cfg, nucleo):
        self.cfg, self.nucleo = cfg, nucleo
        m = cfg["mqtt"]
        self.maquina = cfg["maquina"]
        self.host, self.porta = m["host"], int(m["porta"])
        self.topico = f"casa/{self.maquina}"
        self._parar = threading.Event()
        self._conectado = False
        self.cliente = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"agente-{self.maquina}")
        self.cliente.username_pw_set(m["usuario"], m["senha"])
        self.cliente.will_set(f"{self.topico}/status", json.dumps({"online": False}), qos=1, retain=True)
        self.cliente.reconnect_delay_set(min_delay=1, max_delay=30)  # reconecta sozinho se cair a rede ou o broker
        self.cliente.on_connect = self._on_connect
        self.cliente.on_disconnect = self._on_disconnect
        self.cliente.on_message = self._on_message

    def iniciar(self):
        log.info("MQTT: conectando em %s:%s como '%s'...", self.host, self.porta, self.maquina)
        self.cliente.connect_async(self.host, self.porta, keepalive=30)
        self.cliente.loop_start()
        threading.Thread(target=self._batimento, daemon=True).start()

    def parar(self):
        self._parar.set()
        try:
            if self._conectado:
                self.cliente.publish(f"{self.topico}/status", json.dumps({"online": False}), qos=1, retain=True)
                time.sleep(0.3)
            self.cliente.disconnect()
        finally:
            self.cliente.loop_stop()
        log.info("MQTT: agente parado.")

    # ---------- callbacks do paho ----------
    def _on_connect(self, cliente, userdata, flags, reason_code, properties=None):
        if reason_code == 0 or getattr(reason_code, "is_failure", False) is False:
            self._conectado = True
            cliente.subscribe(f"{self.topico}/cmd", qos=1)
            log.info("MQTT: conectado; observando %s/cmd", self.topico)
            self._publicar_status()
        else:
            log.info("MQTT: o broker recusou a conexão (%s). Confira usuário e senha.", reason_code)

    def _on_disconnect(self, cliente, userdata, flags, reason_code, properties=None):
        if self._conectado:
            log.info("MQTT: conexão perdida (%s). Tentando reconectar...", reason_code)
        self._conectado = False

    def _on_message(self, cliente, userdata, msg):
        if msg.retain:  # mensagem guardada de antes: nunca executar
            return
        resultado = self.nucleo.processar(msg.payload, "mqtt")
        if resultado is not None:
            cliente.publish(f"{self.topico}/result", json.dumps(resultado, ensure_ascii=False), qos=1)

    # ---------- sinal de vida ----------
    def _publicar_status(self):
        status = {"online": True, "so": platform.system(), "em": int(time.time() * 1000)}
        self.cliente.publish(f"{self.topico}/status", json.dumps(status), qos=1, retain=True)

    def _batimento(self):
        while not self._parar.wait(HEARTBEAT_S):
            if self._conectado:
                self._publicar_status()
