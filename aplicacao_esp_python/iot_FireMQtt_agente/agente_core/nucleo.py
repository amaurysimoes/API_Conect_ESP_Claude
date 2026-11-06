"""Núcleo do agente: entende o comando, confere segurança (lista branca, validade, duplicidade) e executa.

Formatos aceitos:
  texto simples:  explorer | windows explorer | explorer C:\\Users | bloquear | info | url https://... | desligar confirmar
  JSON:           {"id": "...", "acao": "abrir_explorer", "parametros": {"caminho": "C:\\\\"}, "ts": 1700000000000}
"""
import json
import logging
import threading
import time
import unicodedata
from collections import OrderedDict

from . import acoes

log = logging.getLogger("agente")
EXPIRA_MS = 30000        # comando com mais de 30 s (ou do futuro) é ignorado
MAX_IDS = 500            # quantos IDs já executados lembrar (não executar duas vezes)

# Apelidos do texto simples -> ação. Tudo em minúsculas e sem acento.
ALIASES = {
    "explorer": "abrir_explorer", "windows explorer": "abrir_explorer", "abrir explorer": "abrir_explorer",
    "explorador": "abrir_explorer", "explorador de arquivos": "abrir_explorer", "abrir_explorer": "abrir_explorer",
    "programa": "abrir_programa", "abrir programa": "abrir_programa", "abrir_programa": "abrir_programa",
    "url": "abrir_url", "abrir url": "abrir_url", "abrir_url": "abrir_url", "site": "abrir_url",
    "bloquear": "bloquear_tela", "bloquear tela": "bloquear_tela", "bloquear_tela": "bloquear_tela",
    "desligar": "desligar", "reiniciar": "reiniciar",
    "info": "info_sistema", "info sistema": "info_sistema", "info_sistema": "info_sistema", "informacoes": "info_sistema",
}
# Qual parâmetro recebe o "resto do texto" de cada ação (ex.: "explorer C:\Users" -> caminho).
ARGUMENTO = {"abrir_explorer": "caminho", "abrir_programa": "nome", "abrir_url": "url"}


def agora_ms():
    return int(time.time() * 1000)


def _normalizar(texto):
    sem = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    return " ".join(sem.lower().split())


def interpretar(bruto):
    """Texto/bytes -> {"id","acao","parametros","ts"} ou None se não entendeu."""
    if isinstance(bruto, (bytes, bytearray)):
        bruto = bytes(bruto).decode("utf-8", errors="replace")
    if isinstance(bruto, dict):
        d = bruto
    else:
        texto = str(bruto).strip()
        if not texto:
            return None
        if texto.startswith("{"):
            try:
                d = json.loads(texto)
            except ValueError:
                return None
        else:
            return _interpretar_texto(texto)
    acao = str(d.get("acao") or "").strip()
    if not acao:
        return None
    params = d.get("parametros")
    return {"id": str(d["id"]) if d.get("id") else None, "acao": ALIASES.get(_normalizar(acao), acao),
            "parametros": params if isinstance(params, dict) else {}, "ts": d.get("ts")}


def _interpretar_texto(texto):
    norm = _normalizar(texto)
    # tenta o apelido MAIS LONGO que começa o texto ("windows explorer" antes de "explorer")
    for apelido in sorted(ALIASES, key=len, reverse=True):
        if norm == apelido or norm.startswith(apelido + " "):
            acao = ALIASES[apelido]
            resto = " ".join(texto.split()[len(apelido.split()):])  # o que vem depois do apelido, como foi digitado
            params = {}
            if acao in ("desligar", "reiniciar") and resto.lower() == "confirmar":
                params["confirmado"] = True
            elif resto and acao in ARGUMENTO:
                params[ARGUMENTO[acao]] = resto
            return {"id": None, "acao": acao, "parametros": params, "ts": None}
    return None


class Nucleo:
    def __init__(self, cfg, simular=False):
        self.cfg = cfg
        self.simular = simular
        self._vistos = OrderedDict()
        self._trava = threading.Lock()

    def processar(self, bruto, origem):
        """Trata um comando recebido. `origem` = "mqtt" ou "firebase". Devolve o resultado (dict) para publicar,
        ou None se for para ignorar (comando repetido)."""
        with self._trava:
            cmd = interpretar(bruto)
            if cmd is None:
                log.info("[%s] comando não reconhecido: %r", origem, str(bruto)[:120])
                return self._resultado(None, "?", False, "comando não reconhecido")
            id_, acao = cmd["id"], cmd["acao"]
            if id_ and id_ in self._vistos:
                log.info("[%s] comando %s repetido: ignorado", origem, id_)
                return None
            erro = self._conferir(cmd, origem)
            if id_:
                self._vistos[id_] = True
                while len(self._vistos) > MAX_IDS:
                    self._vistos.popitem(last=False)
            if erro:
                log.info("[%s] comando '%s' recusado: %s", origem, acao, erro)
                return self._resultado(id_, acao, False, erro)
            try:
                msg = acoes.executar(acao, cmd["parametros"], self.cfg, self.simular)
                log.info("[%s] %s%s: %s", origem, acao, " (simulado)" if self.simular else "", msg)
                return self._resultado(id_, acao, True, msg)
            except acoes.ErroAcao as exc:
                log.info("[%s] %s recusado: %s", origem, acao, exc)
                return self._resultado(id_, acao, False, str(exc))
            except Exception as exc:  # noqa: BLE001 - falha do sistema ao executar
                log.info("[%s] %s falhou: %s", origem, acao, exc)
                return self._resultado(id_, acao, False, f"falhou: {exc}")

    def _conferir(self, cmd, origem):
        if cmd["acao"] not in acoes.ACOES:
            return f"ação '{cmd['acao']}' não permitida"
        ts = cmd["ts"]
        if ts is not None:
            try:
                if abs(agora_ms() - int(ts)) > EXPIRA_MS:
                    return "comando expirado (mais de 30 s) ou com relógio fora de hora"
            except (TypeError, ValueError):
                return "horário (ts) inválido"
        return None

    @staticmethod
    def _resultado(id_, acao, ok, mensagem):
        return {"id": id_, "acao": acao, "ok": ok, "mensagem": mensagem, "em": agora_ms()}
