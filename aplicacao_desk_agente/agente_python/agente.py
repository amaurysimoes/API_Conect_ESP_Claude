"""Núcleo do agente leve. Fala com o Firebase e obedece SÓ comandos assinados.

  brokers/<broker>/maquinas/<maquina>/comandos/<id>    {acao, parametros, ts, assinatura}   (a ponte grava)
  brokers/<broker>/maquinas/<maquina>/resultado/<id>   {ok, texto}                           (o agente responde)
  brokers/<broker>/maquinas/<maquina>/status           online, visto_em, resumo da máquina    (a cada 10 s)

Assinatura: HMAC-SHA256(chave, "<id>\\n<acao>\\n<parametros em JSON ordenado>\\n<ts>"). Mesmo formato do Render.
"""
import hashlib
import hmac
import json
import logging
import threading
import time
from collections import OrderedDict

import acoes
from firebase_rest import SERVER_TS, requisitar

log = logging.getLogger("agente")
CONSULTA_S = 2
BATIMENTO_S = 10
EXPIRA_MS = 60_000        # comando mais velho (ou do futuro) que isso é descartado
CONECTADO_S = 15          # sem resposta do Firebase por mais que isso = "desconectado"


def mensagem(id_, cmd):
    params = json.dumps(cmd.get("parametros") or {}, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return f"{id_}\n{cmd.get('acao')}\n{params}\n{cmd.get('ts')}"


def assinar(chave, id_, cmd):
    return hmac.new(chave.encode("utf-8"), mensagem(id_, cmd).encode("utf-8"), hashlib.sha256).hexdigest()


def assinatura_valida(chave, id_, cmd):
    return hmac.compare_digest(assinar(chave, id_, cmd), str(cmd.get("assinatura", "")))


class Agente:
    def __init__(self, cfg):
        self.cfg = cfg
        self.url = cfg["firebase"].rstrip("/")
        self.base = f"brokers/{cfg['broker']}/maquinas/{cfg['maquina']}"
        self._parar = threading.Event()
        self._vistos = OrderedDict()
        self.ultimo_ok = 0.0

    @property
    def conectado(self):
        return time.time() - self.ultimo_ok < CONECTADO_S

    def iniciar(self):
        log.info("Agente %s observando %s (consulta a cada %s s)", self.cfg["maquina"], self.base, CONSULTA_S)
        threading.Thread(target=self._laco_comandos, daemon=True).start()
        threading.Thread(target=self._laco_batimento, daemon=True).start()

    def parar(self):
        self._parar.set()
        try:
            requisitar(self.url, "PATCH", f"{self.base}/status", {"online": False, "visto_em": SERVER_TS}, timeout=4)
        except Exception:  # noqa: BLE001
            pass

    # ---------- comandos ----------
    def _laco_comandos(self):
        while not self._parar.is_set():
            try:
                pendentes = requisitar(self.url, "GET", f"{self.base}/comandos") or {}
                self.ultimo_ok = time.time()
                for id_, cmd in sorted(pendentes.items(), key=lambda kv: (kv[1] or {}).get("ts") or 0):
                    self._tratar(id_, cmd if isinstance(cmd, dict) else {})
            except Exception as exc:  # noqa: BLE001
                log.warning("Firebase: %s", exc)
            self._parar.wait(CONSULTA_S)

    def _tratar(self, id_, cmd):
        resultado = self._executar(id_, cmd)
        try:
            if resultado is not None:
                requisitar(self.url, "PUT", f"{self.base}/resultado/{id_}", {**resultado, "em": SERVER_TS})
            requisitar(self.url, "DELETE", f"{self.base}/comandos/{id_}")  # tratado (ou recusado): sai da fila
        except Exception as exc:  # noqa: BLE001 - o id fica lembrado: não executa de novo
            log.warning("Firebase (resultado): %s", exc)

    def _executar(self, id_, cmd):
        if id_ in self._vistos:
            return None
        self._vistos[id_] = True
        while len(self._vistos) > 500:
            self._vistos.popitem(last=False)
        if not assinatura_valida(self.cfg["chave"], id_, cmd):
            log.warning("Comando %s recusado: assinatura inválida", id_)
            return None  # não responde a quem não tem a chave
        agora = int(time.time() * 1000)
        ts = cmd.get("ts")
        if not isinstance(ts, (int, float)) or abs(agora - ts) > EXPIRA_MS:
            log.warning("Comando %s recusado: fora da validade (relógio do PC fora de sincronia?)", id_)
            return {"ok": False, "texto": "comando fora da validade de 60 s (confira o relógio do PC)"}
        acao = cmd.get("acao")
        funcao = acoes.ACOES.get(acao)
        if not funcao:
            return {"ok": False, "texto": f"ação desconhecida: {acao}"}
        try:
            texto = funcao(cmd.get("parametros") or {})
            log.info("Executado %s: %s", acao, texto)
            return {"ok": True, "texto": texto}
        except acoes.ErroAcao as e:
            return {"ok": False, "texto": str(e)}
        except Exception as e:  # noqa: BLE001
            log.exception("Erro em %s", acao)
            return {"ok": False, "texto": f"erro: {e}"}

    # ---------- sinal de vida ----------
    def _laco_batimento(self):
        while not self._parar.is_set():
            try:
                requisitar(self.url, "PATCH", f"{self.base}/status",
                           {"online": True, "visto_em": SERVER_TS, "resumo": acoes.resumo(), "so": "Windows"})
                self.ultimo_ok = time.time()
            except Exception as exc:  # noqa: BLE001
                log.warning("Firebase (status): %s", exc)
            self._parar.wait(BATIMENTO_S)
