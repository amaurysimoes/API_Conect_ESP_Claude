"""Agendador do agente: lê os planos desta máquina no Firebase e executa na hora marcada.

Plano (brokers/<broker>/maquinas/<maquina>/planos/<id>):
  nome, tipo ("email"), ativo, repetir ("uma_vez" | "todo_dia" | "semanal"), data "AAAA-MM-DD" (só uma_vez),
  remetente (conta Gmail cadastrada no agente), hora "HH:MM", dias [0..6] (semanal; 0 = segunda), destinatarios, assunto, texto
O agente grava: ultima_execucao (horário previsto já tratado, em ms), executado_em, ultimo_ok, ultimo_msg.
Atraso de até ATRASO_MAX_S ainda executa (máquina que acabou de ligar); depois disso o horário é pulado.
"""
import logging
import smtplib
import threading
import time
from datetime import datetime, timedelta
from email.message import EmailMessage

from .canal_firebase import requisitar

log = logging.getLogger("agente")
CONSULTA_S = 15
ATRASO_MAX_S = 600
SERVER_TS = {".sv": "timestamp"}


def ocorrencia_recente(plano, agora):
    """Último horário previsto do plano que já passou (datetime) ou None."""
    try:
        h, m = (int(x) for x in str(plano.get("hora", "")).split(":"))
        repetir = plano.get("repetir", "uma_vez")
        if repetir == "uma_vez":
            a, me, d = (int(x) for x in str(plano.get("data", "")).split("-"))
            quando = datetime(a, me, d, h, m)
            return quando if quando <= agora else None
        dias = plano.get("dias") or []
        dias = list(dias.values()) if isinstance(dias, dict) else list(dias)
        for volta in range(8):
            dia = agora - timedelta(days=volta)
            quando = dia.replace(hour=h, minute=m, second=0, microsecond=0)
            if quando > agora:
                continue
            if repetir == "todo_dia" or quando.weekday() in dias:
                return quando
    except (ValueError, TypeError):
        pass
    return None


def enviar_email(usuario, senha, plano):
    """Envia pelo Gmail (senha de app). Levanta exceção se falhar."""
    destinos = [d.strip() for d in str(plano.get("destinatarios", "")).replace(";", ",").split(",") if d.strip()]
    if not destinos:
        raise ValueError("plano sem destinatário")
    if not usuario or not senha:
        raise ValueError("e-mail do agente não configurado (usuário e senha de app)")
    msg = EmailMessage()
    msg["From"] = usuario
    msg["To"] = ", ".join(destinos)
    msg["Subject"] = str(plano.get("assunto", ""))
    msg.set_content(str(plano.get("texto", "")))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as smtp:
        smtp.login(usuario, senha)
        smtp.send_message(msg)
    return f"enviado para {len(destinos)} destinatário(s)"


class Agendador:
    def __init__(self, cfg, simular=False):
        self.cfg, self.simular = cfg, simular
        self.url = cfg["firebase"]["url"].rstrip("/")
        self.base = f"brokers/{cfg['firebase']['broker']}/maquinas/{cfg['maquina']}/planos"
        self._parar = threading.Event()

    def iniciar(self):
        log.info("Agendador: lendo os planos de %s a cada %s s", self.base, CONSULTA_S)
        threading.Thread(target=self._laco, daemon=True).start()

    def parar(self):
        self._parar.set()

    def _laco(self):
        while not self._parar.is_set():
            try:
                self.verificar(datetime.now())
            except Exception as exc:  # noqa: BLE001 - sem rede etc.: tenta no próximo ciclo
                log.info("Agendador: %s", exc)
            self._parar.wait(CONSULTA_S)

    def verificar(self, agora):
        planos = requisitar(self.url, "GET", self.base) or {}
        for id_, plano in planos.items():
            if not isinstance(plano, dict) or plano.get("ativo") is False:
                continue
            quando = ocorrencia_recente(plano, agora)
            if quando is None:
                continue
            ms = int(quando.timestamp() * 1000)
            if (plano.get("ultima_execucao") or 0) >= ms:
                continue  # esse horário já foi tratado
            atrasado = (agora - quando).total_seconds() > ATRASO_MAX_S
            # marca ANTES de executar: nunca envia duas vezes o mesmo horário
            requisitar(self.url, "PATCH", f"{self.base}/{id_}", {"ultima_execucao": ms})
            if atrasado:
                self._resultado(id_, plano, False, "horário perdido (máquina/agente desligado)")
                continue
            self._executar(id_, plano)

    def _executar(self, id_, plano):
        nome = plano.get("nome", id_)
        if plano.get("tipo") != "email":
            return self._resultado(id_, plano, False, f"tipo desconhecido: {plano.get('tipo')}")
        if self.simular:
            return self._resultado(id_, plano, True, "SIMULADO: e-mail não enviado")
        try:
            remetente = str(plano.get("remetente", ""))
            senha = self.cfg.get("emails", {}).get(remetente)
            if not senha:
                raise ValueError(f"a conta '{remetente}' não está cadastrada neste agente")
            msg = enviar_email(remetente, senha, plano)
            self._resultado(id_, plano, True, msg)
        except Exception as exc:  # noqa: BLE001
            self._resultado(id_, plano, False, f"{exc.__class__.__name__}: {exc}")

    def _resultado(self, id_, plano, ok, msg):
        log.info("Plano '%s': %s — %s", plano.get("nome", id_), "OK" if ok else "FALHOU", msg)
        try:
            requisitar(self.url, "PATCH", f"{self.base}/{id_}",
                       {"executado_em": SERVER_TS, "ultimo_ok": ok, "ultimo_msg": msg})
        except Exception as exc:  # noqa: BLE001
            log.info("Agendador: não gravou o resultado (%s)", exc)
