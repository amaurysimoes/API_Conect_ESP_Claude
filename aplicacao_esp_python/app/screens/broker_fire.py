import re
import socket
import time
from datetime import datetime

from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QBrush, QColor
from PyQt6.QtWidgets import (QHBoxLayout, QLabel, QLineEdit, QListWidget, QListWidgetItem, QPlainTextEdit,
                             QVBoxLayout, QWidget)

from .. import firebase_rest as fb
from .comandos_dialog import ComandosDialog
from ..theme import DANGER, SUCCESS
from ..widgets import ActionButton, BackgroundMixin, Card, ThemeButton

HEARTBEAT_MS = 10000   # renova "visto_em" no Firebase enquanto o broker está ativo
LIST_MS = 5000         # atualiza a lista de brokers cadastrados


class BrokerFireScreen(BackgroundMixin, QWidget):
    """Broker Fire IOT: o caminho dos comandos pelo Firebase (máquinas em redes diferentes, com internet).
    Este form cadastra este computador como broker em brokers/<nome> e mostra todos os brokers (online/offline)."""

    def __init__(self):
        super().__init__()
        self.setObjectName("root")
        self.active = False
        self._calls = set()  # mantém as chamadas ao Firebase vivas até terminarem
        self._erro_avisado = False

        root = QVBoxLayout(self)
        root.setContentsMargins(32, 20, 32, 24)
        root.setSpacing(10)
        top = QHBoxLayout()
        title = QLabel("Broker Fire IOT")
        title.setObjectName("title")
        top.addWidget(title)
        top.addStretch()
        top.addWidget(ThemeButton())
        root.addLayout(top)
        root.addWidget(self._build_register_card())
        root.addWidget(self._build_list_card(), 1)
        root.addWidget(self._build_log())

        self._beat = QTimer(self, interval=HEARTBEAT_MS)
        self._beat.timeout.connect(self._heartbeat)
        self._refresh_timer = QTimer(self, interval=LIST_MS)
        self._refresh_timer.timeout.connect(self._refresh)
        self._refresh_timer.start()
        self._render()
        self._refresh()

    # ---------- construção da tela ----------
    def _build_register_card(self):
        card = Card()
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 16)
        lay.setSpacing(10)
        lay.addWidget(QLabel("Este computador como broker (comandos pelo Firebase)"))
        self.name = QLineEdit(placeholderText="Nome do broker (letras, números, - e _)")
        self.name.setText("FIRE_" + re.sub(r"[^A-Za-z0-9_-]", "_", socket.gethostname()).upper())
        lay.addWidget(self.name)
        self.status = QLabel(alignment=Qt.AlignmentFlag.AlignCenter)
        lay.addWidget(self.status)
        row = QHBoxLayout()
        self.btn_on = ActionButton("ATIVAR BROKER FIRE", "success")
        self.btn_on.clicked.connect(self._start)
        self.btn_off = ActionButton("PARAR BROKER FIRE", "danger")
        self.btn_off.clicked.connect(self._stop)
        row.addWidget(self.btn_on, 1)
        row.addWidget(self.btn_off, 1)
        lay.addLayout(row)
        return card

    def _build_list_card(self):
        card = Card()
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 16)
        lay.setSpacing(10)
        head = QHBoxLayout()
        head.addWidget(QLabel("Brokers Firebase cadastrados  (clique num broker para enviar comandos)"))
        head.addStretch()
        refresh = ActionButton("ATUALIZAR", "primary")
        refresh.clicked.connect(self._refresh)
        head.addWidget(refresh)
        lay.addLayout(head)
        self.brokers = QListWidget()
        self.brokers.setObjectName("nets")
        self.brokers.setMinimumHeight(110)
        self.brokers.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOn)
        self.brokers.itemClicked.connect(self._abrir_comandos)
        lay.addWidget(self.brokers, 1)
        return card

    def _build_log(self):
        self.log = QPlainTextEdit(readOnly=True)
        self.log.setObjectName("log")
        self.log.setMaximumBlockCount(500)
        self.log.setMaximumHeight(110)
        return self.log

    # ---------- ações ----------
    def _write(self, msg):
        self.log.appendPlainText(f"[{datetime.now():%H:%M:%S}] {msg}")

    def _call(self, fn, ok=None, err=None):
        call = fb.Chamada(fn, self)
        self._calls.add(call)

        def finish():
            self._calls.discard(call)

        call.pronto.connect(lambda r: (ok(r) if ok else None, finish()))
        call.erro.connect(lambda e: (err(e) if err else None, finish()))
        call.start()

    def _broker_name(self):
        name = self.name.text().strip()
        if not re.fullmatch(r"[A-Za-z0-9_-]+", name):
            self._write("Nome do broker: só letras, números, - e _ (sem espaço).")
            return None
        return name

    def _payload(self, ativo):
        data = {"tipo": "fire", "maquina": socket.gethostname(), "ip": fb.local_ip(), "ativo": ativo,
                "visto_em": fb.SERVER_TS}
        return data

    def _start(self):
        name = self._broker_name()
        if not name:
            return
        self._erro_avisado = False
        self._write(f"Cadastrando '{name}' no Firebase...")
        self.btn_on.setEnabled(False)

        def done(_):
            self.active = True
            self._current = name
            self._beat.start()
            self._write(f"Broker Fire '{name}' ATIVO (renova o sinal a cada {HEARTBEAT_MS // 1000} s).")
            self._render()
            self._refresh()

        def fail(e):
            self._write(f"Não foi possível ativar: {e}")
            self._render()

        self._call(lambda: fb.request("PATCH", f"brokers/{name}", self._payload(True)), done, fail)

    def _stop(self):
        if not self.active:
            return
        name = self._current
        self._beat.stop()
        self.active = False
        self._call(lambda: fb.request("PATCH", f"brokers/{name}", {"ativo": False, "visto_em": fb.SERVER_TS}),
                   lambda _: self._write(f"Broker Fire '{name}' parado."), lambda e: self._write(f"Erro ao parar: {e}"))
        self._render()
        self._refresh()

    def _heartbeat(self):
        name = self._current

        def fail(e):
            if not self._erro_avisado:
                self._erro_avisado = True
                self._write(f"Sem conexão com o Firebase ({e}). Tentando de novo a cada {HEARTBEAT_MS // 1000} s.")

        def ok(_):
            if self._erro_avisado:
                self._erro_avisado = False
                self._write("Conexão com o Firebase restabelecida.")

        self._call(lambda: fb.request("PATCH", f"brokers/{name}", self._payload(True)), ok, fail)

    def _refresh(self):
        self._call(lambda: fb.request("GET", "brokers"), self._fill, self._refresh_failed)

    def _refresh_failed(self, e):
        self.brokers.clear()
        item = QListWidgetItem(f"Não foi possível ler o Firebase: {e}")
        item.setFlags(Qt.ItemFlag.NoItemFlags)
        self.brokers.addItem(item)

    def _fill(self, data):
        pos = self.brokers.verticalScrollBar().value()
        self.brokers.clear()
        now = time.time() * 1000
        for name, b in sorted((data or {}).items()):
            if not isinstance(b, dict) or b.get("tipo") != "fire":  # aqui só os da internet; os MQTT são da rede local
                continue
            seen = b.get("visto_em")
            online = b.get("ativo") is not False and isinstance(seen, (int, float)) and now - seen < fb.ONLINE_MS
            if not online:  # ou alguma máquina (agente) deste broker está online
                for m in (b.get("maquinas") or {}).values():
                    st = (m or {}).get("status") or {}
                    visto = st.get("visto_em")
                    if st.get("online") is True and isinstance(visto, (int, float)) and now - visto < fb.ONLINE_MS:
                        online = True
                        break
            tipo = "Firebase (internet)"
            text = (f"{'●' if online else '○'}  {name}   ·   {tipo}   ·   {b.get('ip', '—')}"
                    f"   ·   {'online' if online else 'offline'}")
            item = QListWidgetItem(text)
            item.setData(Qt.ItemDataRole.UserRole, name)
            item.setForeground(QBrush(QColor(SUCCESS if online else DANGER)))
            self.brokers.addItem(item)
        if self.brokers.count() == 0:
            item = QListWidgetItem("Nenhum broker Firebase cadastrado ainda.")
            item.setFlags(Qt.ItemFlag.NoItemFlags)
            self.brokers.addItem(item)
        self.brokers.doItemsLayout()
        self.brokers.verticalScrollBar().setValue(pos)

    # ---------- comandos ----------
    def _abrir_comandos(self, item):
        nome = item.data(Qt.ItemDataRole.UserRole)
        if not nome:
            return
        ComandosDialog(self, nome).exec()

    def _render(self):
        self.btn_on.setEnabled(not self.active)
        self.btn_off.setEnabled(self.active)
        self.name.setEnabled(not self.active)
        if self.active:
            self.status.setText(f"● BROKER FIRE ATIVO  ({self._current})")
            self.status.setStyleSheet(f"color: {SUCCESS}; font-size: 14px; font-weight: bold;")
        else:
            self.status.setText("● PARADO")
            self.status.setStyleSheet(f"color: {DANGER}; font-size: 14px; font-weight: bold;")

    def closeEvent(self, event):
        if self.active:  # avisa o Firebase que este broker saiu (a chamada termina sozinha na thread)
            name = self._current
            self._beat.stop()
            self.active = False
            fb.Chamada(lambda: fb.request("PATCH", f"brokers/{name}", {"ativo": False, "visto_em": fb.SERVER_TS}),
                       None).start()
        super().closeEvent(event)
