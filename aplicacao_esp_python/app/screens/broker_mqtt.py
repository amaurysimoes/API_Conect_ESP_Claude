import asyncio
import json
import logging
import os
import re
import socket
import sys
from datetime import datetime
from pathlib import Path

from PyQt6.QtCore import Qt, QThread, QTimer, pyqtSignal
from PyQt6.QtWidgets import (QCheckBox, QHBoxLayout, QLabel, QLineEdit, QListWidget, QListWidgetItem,
                             QPlainTextEdit, QSpinBox, QVBoxLayout, QWidget)

from .. import firebase_rest as fb
from ..mqtt_gateway import CLIENTE_ID, MqttGateway
from ..theme import DANGER, SUCCESS
from ..widgets import ActionButton, BackgroundMixin, Card, ThemeButton

HEARTBEAT_MS = 10000   # renova o cadastro em brokers/<nome> no Firebase
CLIENTS_MS = 2000      # atualiza a lista de máquinas conectadas
STOP_TIMEOUT_S = 5     # tempo máximo esperando o broker encerrar as conexões


def _data_dir():
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home()))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "AUTOMACAO_IOT-AHS"


DATA_DIR = _data_dir()
SAVED_FILE = DATA_DIR / "broker_mqtt.json"      # última configuração (inclui a senha, como nos outros forms)
PASSWORD_FILE = DATA_DIR / "mqtt_senhas.txt"    # usuário:hash (o broker só lê o hash)


class _LogBridge(logging.Handler):
    """Leva os avisos do amqtt para o log do form."""

    def __init__(self, emit_fn):
        super().__init__(logging.INFO)
        self._emit = emit_fn

    RUIDO = ("connections acquired", "EVENT FIRED", "session expiration monitor", "max_connections")

    def emit(self, record):
        try:
            msg = record.getMessage()
            if any(r in msg for r in self.RUIDO):  # mensagens internas repetitivas do amqtt
                return
            self._emit(msg)
        except Exception:  # noqa: BLE001
            pass


class BrokerThread(QThread):
    """Roda o broker MQTT (amqtt) com o seu próprio loop asyncio, fora da interface."""
    ligou = pyqtSignal()
    falhou = pyqtSignal(str)
    desligou = pyqtSignal()
    mensagem = pyqtSignal(str)

    def __init__(self, port, user, password, parent=None):
        super().__init__(parent)
        self.port, self.user, self.password = port, user, password
        self._loop = None
        self._broker = None

    def run(self):
        try:  # importado só aqui: o resto do programa não depende do amqtt
            from amqtt.broker import Broker
            from passlib.hash import sha512_crypt
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            PASSWORD_FILE.write_text(f"{self.user}:{sha512_crypt.hash(self.password)}\n", encoding="utf-8")
            config = {
                "listeners": {"default": {"type": "tcp", "bind": f"0.0.0.0:{self.port}"}},
                "sys_interval": 0,
                "auth": {"allow-anonymous": False, "password-file": str(PASSWORD_FILE), "plugins": ["auth_file"]},
                "topic-check": {"enabled": False},
            }
            handler = _LogBridge(self.mensagem.emit)
            for name in ("amqtt.broker", "amqtt.mqtt.protocol.broker_handler"):
                logging.getLogger(name).addHandler(handler)
                logging.getLogger(name).setLevel(logging.INFO)
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            self._broker = Broker(config, loop=self._loop)
            self._loop.run_until_complete(self._broker.start())
        except Exception as exc:  # noqa: BLE001 - porta ocupada, falta de pacote etc.
            self.falhou.emit(str(exc) or exc.__class__.__name__)
            return
        self.ligou.emit()
        self._loop.run_forever()
        try:  # encerra com tempo limite: o shutdown pode demorar se houver clientes conectados
            self._loop.run_until_complete(asyncio.wait_for(self._broker.shutdown(), STOP_TIMEOUT_S))
        except Exception:  # noqa: BLE001
            pass
        finally:
            self._loop.close()
            self.desligou.emit()

    def stop(self):
        if self._loop and self._loop.is_running():
            self._loop.call_soon_threadsafe(self._loop.stop)

    def clients(self):
        """[(id do cliente, endereço)] dos clientes conectados agora."""
        out = []
        try:
            for cid, (session, _handler) in list(self._broker._sessions.items()):
                if cid == CLIENTE_ID:  # cliente interno do gateway, não é uma máquina
                    continue
                if getattr(getattr(session, "transitions", None), "state", "connected") == "connected":
                    addr = f"{getattr(session, 'remote_address', '') or ''}"
                    out.append((cid, addr))
        except Exception:  # noqa: BLE001
            pass
        return out


class BrokerMqttScreen(BackgroundMixin, QWidget):
    gateway_log = pyqtSignal(str)

    """Broker MQTT IOT: broker MQTT embutido no programa (para máquinas na mesma rede ou sem internet).
    As máquinas (agentes) conectam aqui com usuário e senha. O broker também se cadastra em brokers/<nome> no Firebase."""

    def __init__(self):
        super().__init__()
        self.setObjectName("root")
        self.active = False
        self._thread = None
        self._calls = set()
        self._erro_avisado = False
        self._current = ""
        self._gateway = None
        self.gateway_log.connect(self._write)

        root = QVBoxLayout(self)
        root.setContentsMargins(32, 20, 32, 24)
        root.setSpacing(10)
        top = QHBoxLayout()
        title = QLabel("Broker MQTT IOT")
        title.setObjectName("title")
        top.addWidget(title)
        top.addStretch()
        top.addWidget(ThemeButton())
        root.addLayout(top)
        root.addWidget(self._build_config_card())
        root.addWidget(self._build_clients_card(), 1)
        root.addWidget(self._build_log())

        self._beat = QTimer(self, interval=HEARTBEAT_MS)
        self._beat.timeout.connect(self._heartbeat)
        self._clients_timer = QTimer(self, interval=CLIENTS_MS)
        self._clients_timer.timeout.connect(self._update_clients)
        self._load_saved()
        self._render()

    # ---------- construção da tela ----------
    def _build_config_card(self):
        card = Card()
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 16)
        lay.setSpacing(10)
        lay.addWidget(QLabel("Broker MQTT nesta máquina (rede local)"))
        self.name = QLineEdit(placeholderText="Nome do broker (letras, números, - e _)")
        row = QHBoxLayout()
        self.port = QSpinBox()
        self.port.setRange(1, 65535)
        self.port.setValue(1883)
        self.port.setToolTip("Porta do broker (padrão MQTT: 1883)")
        row.addWidget(self.name, 1)
        row.addWidget(QLabel("Porta"))
        row.addWidget(self.port)
        lay.addLayout(row)
        self.user = QLineEdit(placeholderText="Usuário das máquinas")
        self.password = QLineEdit(placeholderText="Senha das máquinas", echoMode=QLineEdit.EchoMode.Password)
        row2 = QHBoxLayout()
        row2.addWidget(self.user, 1)
        row2.addWidget(self.password, 1)
        lay.addLayout(row2)
        show = QCheckBox("Mostrar senha")
        show.toggled.connect(lambda on: self.password.setEchoMode(
            QLineEdit.EchoMode.Normal if on else QLineEdit.EchoMode.Password))
        lay.addWidget(show)
        self.status = QLabel(alignment=Qt.AlignmentFlag.AlignCenter)
        lay.addWidget(self.status)
        btns = QHBoxLayout()
        self.btn_on = ActionButton("ATIVAR BROKER MQTT", "success")
        self.btn_on.clicked.connect(self._start)
        self.btn_off = ActionButton("PARAR BROKER MQTT", "danger")
        self.btn_off.clicked.connect(self._stop)
        btns.addWidget(self.btn_on, 1)
        btns.addWidget(self.btn_off, 1)
        lay.addLayout(btns)
        self._fields = (self.name, self.port, self.user, self.password)
        return card

    def _build_clients_card(self):
        card = Card()
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 16)
        lay.setSpacing(10)
        self.clients_title = QLabel("Máquinas conectadas ao broker")
        lay.addWidget(self.clients_title)
        self.clients = QListWidget()
        self.clients.setObjectName("nets")
        self.clients.setMinimumHeight(90)
        self.clients.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOn)
        lay.addWidget(self.clients, 1)
        return card

    def _build_log(self):
        self.log = QPlainTextEdit(readOnly=True)
        self.log.setObjectName("log")
        self.log.setMaximumBlockCount(500)
        self.log.setMaximumHeight(110)
        return self.log

    # ---------- configuração salva ----------
    def _load_saved(self):
        cfg = {}
        try:
            cfg = json.loads(SAVED_FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass
        host = re.sub(r"[^A-Za-z0-9_-]", "_", socket.gethostname()).upper()
        self.name.setText(cfg.get("nome") or f"MQTT_{host}")
        self.port.setValue(int(cfg.get("porta", 1883)))
        self.user.setText(cfg.get("usuario", "iot"))
        self.password.setText(cfg.get("senha", ""))

    def _save(self):
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            SAVED_FILE.write_text(json.dumps({"nome": self.name.text().strip(), "porta": self.port.value(),
                                              "usuario": self.user.text().strip(), "senha": self.password.text()},
                                             ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError:
            pass  # não lembrar a configuração não impede o broker

    # ---------- ações ----------
    def _write(self, msg):
        self.log.appendPlainText(f"[{datetime.now():%H:%M:%S}] {msg}")

    def _call(self, fn, ok=None, err=None):
        call = fb.Chamada(fn, self)
        self._calls.add(call)
        call.pronto.connect(lambda r: (ok(r) if ok else None, self._calls.discard(call)))
        call.erro.connect(lambda e: (err(e) if err else None, self._calls.discard(call)))
        call.start()

    def _start(self):
        name = self.name.text().strip()
        user = self.user.text().strip()
        if not re.fullmatch(r"[A-Za-z0-9_-]+", name):
            return self._write("Nome do broker: só letras, números, - e _ (sem espaço).")
        if not user or ":" in user or " " in user:
            return self._write("Informe o usuário (sem espaço e sem ':').")
        if not self.password.text():
            return self._write("Informe a senha: o broker não aceita conexão sem senha.")
        self._save()
        self._current = name
        self._erro_avisado = False
        self._write(f"Iniciando o broker MQTT na porta {self.port.value()}...")
        self.btn_on.setEnabled(False)
        self._thread = BrokerThread(self.port.value(), user, self.password.text(), self)
        self._thread.ligou.connect(self._on_started)
        self._thread.falhou.connect(self._on_failed)
        self._thread.desligou.connect(lambda: self._write("Broker MQTT encerrado."))
        self._thread.finished.connect(self._after_thread)
        self._thread.mensagem.connect(self._write)
        self._thread.start()

    def _on_started(self):
        self.active = True
        self._write(f"Broker MQTT ATIVO em {fb.local_ip()}:{self.port.value()} (as máquinas conectam aqui).")
        self._write("Se o Windows perguntar sobre o Firewall, permita o acesso em redes privadas.")
        self._clients_timer.start()
        self._gateway = MqttGateway(self._current, self.port.value(), self.user.text().strip(), self.password.text(),
                                    self.gateway_log.emit)
        self._gateway.iniciar()
        self._beat.start()
        self._heartbeat()
        self._render()

    def _after_thread(self):
        """A thread do broker terminou (parou ou falhou): libera os botões."""
        self.active = False
        self._thread = None
        self._render()

    def _on_failed(self, msg):
        self._write(f"Não foi possível iniciar o broker: {msg}")
        if "10048" in msg or "in use" in msg.lower() or "Address" in msg:
            self._write("A porta já está em uso por outro programa: escolha outra porta.")

    def _stop(self):
        if not self.active and not self._thread:
            return
        self._beat.stop()
        self._clients_timer.stop()
        name = self._current
        self.active = False
        self._parar_gateway()
        if self._thread:
            self._thread.stop()
        self._call(lambda: fb.request("PATCH", f"brokers/{name}", {"ativo": False, "clientes": 0, "visto_em": fb.SERVER_TS}),
                   None, lambda e: self._write(f"Firebase: {e}"))
        self._render()
        self.clients.clear()

    def _parar_gateway(self):
        if self._gateway:
            self._gateway.parar()
            self._gateway = None

    def _payload(self):
        return {"tipo": "mqtt", "maquina": socket.gethostname(), "ip": fb.local_ip(), "porta": self.port.value(),
                "ativo": True, "clientes": len(self._thread.clients()) if self._thread else 0,
                "visto_em": fb.SERVER_TS}

    def _heartbeat(self):
        name = self._current
        data = self._payload()

        def fail(e):
            if not self._erro_avisado:
                self._erro_avisado = True
                self._write(f"Sem conexão com o Firebase ({e}); o broker local continua funcionando.")

        def ok(_):
            if self._erro_avisado:
                self._erro_avisado = False
                self._write("Conexão com o Firebase restabelecida.")

        self._call(lambda: fb.request("PATCH", f"brokers/{name}", data), ok, fail)

    def _update_clients(self):
        if not self._thread:
            return
        pos = self.clients.verticalScrollBar().value()
        items = self._thread.clients()
        self.clients.clear()
        for cid, addr in items:
            self.clients.addItem(QListWidgetItem(f"●  {cid}   ·   {addr}"))
        if not items:
            item = QListWidgetItem("Nenhuma máquina conectada ainda.")
            item.setFlags(Qt.ItemFlag.NoItemFlags)
            self.clients.addItem(item)
        self.clients_title.setText(f"Máquinas conectadas ao broker: {len(items)}")
        self.clients.doItemsLayout()
        self.clients.verticalScrollBar().setValue(pos)

    def _render(self):
        busy = self.active or (self._thread is not None and self._thread.isRunning())
        self.btn_on.setEnabled(not busy)
        self.btn_off.setEnabled(busy)
        for w in self._fields:
            w.setEnabled(not busy)
        if self.active:
            self.status.setText(f"● BROKER MQTT ATIVO  {fb.local_ip()}:{self.port.value()}")
            self.status.setStyleSheet(f"color: {SUCCESS}; font-size: 14px; font-weight: bold;")
        else:
            self.status.setText("● PARADO")
            self.status.setStyleSheet(f"color: {DANGER}; font-size: 14px; font-weight: bold;")
            self.clients_title.setText("Máquinas conectadas ao broker")

    def closeEvent(self, event):
        if self.active or self._thread:
            name = self._current
            self._beat.stop()
            self._clients_timer.stop()
            self.active = False
            self._parar_gateway()
            if self._thread:
                self._thread.stop()
                self._thread.wait((STOP_TIMEOUT_S + 2) * 1000)
            fb.Chamada(lambda: fb.request("PATCH", f"brokers/{name}", {"ativo": False, "clientes": 0,
                                                                        "visto_em": fb.SERVER_TS}), None).start()
        super().closeEvent(event)
