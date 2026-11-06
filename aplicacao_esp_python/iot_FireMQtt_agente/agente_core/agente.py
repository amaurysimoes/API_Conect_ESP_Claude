"""Junta o núcleo com o canal escolhido (MQTT ou Firebase)."""
import logging

from .agendador import Agendador
from .canal_firebase import CanalFirebase
from .canal_mqtt import CanalMqtt
from .nucleo import Nucleo

log = logging.getLogger("agente")


class Agente:
    def __init__(self, cfg, simular=False):
        self.cfg = cfg
        self.nucleo = Nucleo(cfg, simular)
        self.canal = CanalFirebase(cfg, self.nucleo) if cfg["canal"] == "firebase" else CanalMqtt(cfg, self.nucleo)
        # os planos ficam no Firebase: o agendador roda quando o canal é Firebase
        self.agendador = Agendador(cfg, simular) if cfg["canal"] == "firebase" else None
        self.ativo = False

    def iniciar(self):
        modo = "FIREBASE" if self.cfg["canal"] == "firebase" else "MQTT"
        log.info("Agente '%s' iniciado (canal %s)%s", self.cfg["maquina"], modo,
                 " em modo SIMULADO: nada é executado de verdade" if self.nucleo.simular else "")
        self.canal.iniciar()
        if self.agendador:
            self.agendador.iniciar()
        self.ativo = True

    def parar(self):
        if self.ativo:
            self.ativo = False
            self.canal.parar()
            if self.agendador:
                self.agendador.parar()
