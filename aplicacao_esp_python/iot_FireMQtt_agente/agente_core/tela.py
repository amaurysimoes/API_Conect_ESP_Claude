"""Tela do agente: escolher qual broker observar (Firebase ou MQTT), iniciar/parar e ver o log."""
import logging
import threading

from PyQt6.QtCore import QEvent, QTimer, Qt, pyqtSignal
from PyQt6.QtGui import QAction
from PyQt6.QtWidgets import (QApplication, QMenu, QSystemTrayIcon, QButtonGroup, QCheckBox, QComboBox, QHBoxLayout, QLabel, QLineEdit, QListWidget, QPlainTextEdit,
                             QSpinBox, QVBoxLayout, QWidget)

from app.theme import DANGER, SUCCESS
from app.widgets import ActionButton, BackgroundMixin, Card, ThemeButton

from . import config
from .agente import Agente
from .canal_firebase import requisitar


class _LogQt(logging.Handler):
    def __init__(self, sinal):
        super().__init__(logging.INFO)
        self._sinal = sinal

    def emit(self, record):
        self._sinal.emit(self.format(record))


class TelaAgente(BackgroundMixin, QWidget):
    log_sinal = pyqtSignal(str)
    brokers_sinal = pyqtSignal(object)

    def __init__(self, caminho_config=None, simular=False):
        super().__init__()
        self.setObjectName("root")
        self.setWindowTitle("Agente IOT")
        self._caminho = caminho_config
        self._simular = simular
        self.agente = None
        self.bandeja = None
        self._brokers = {}

        root = QVBoxLayout(self)
        root.setContentsMargins(32, 20, 32, 24)
        root.setSpacing(10)
        top = QHBoxLayout()
        titulo = QLabel("Agente IOT")
        titulo.setObjectName("title")
        top.addWidget(titulo)
        top.addStretch()
        top.addWidget(ThemeButton())
        root.addLayout(top)
        root.addWidget(self._card_maquina())
        root.addWidget(self._card_broker())
        root.addWidget(self._card_email())
        root.addWidget(self._card_controle())
        root.addWidget(self._log(), 1)

        self.log_sinal.connect(self.log.appendPlainText)
        self.brokers_sinal.connect(self._preencher_brokers)
        config.configurar_log(extra_handler=_LogQt(self.log_sinal))

        self._aplicar(config.carregar(self._caminho))
        self._criar_bandeja()
        self._render()
        self._atualizar_brokers()
        if self.chk_auto.isChecked() and config.validar(self._coletar()) is None:
            QTimer.singleShot(800, self._iniciar)

    # ---------- bandeja (ícone ao lado do relógio) ----------
    def _criar_bandeja(self):
        """Ícone na bandeja: clique abre a janela; minimizar esconde de novo. Sem bandeja (alguns Linux), a janela é normal."""
        if not QSystemTrayIcon.isSystemTrayAvailable():
            return
        self.bandeja = QSystemTrayIcon(QApplication.windowIcon(), self)
        menu = QMenu()
        abrir = QAction("Abrir o agente", menu)
        abrir.triggered.connect(self.mostrar_janela)
        sair = QAction("Sair (para o agente)", menu)
        sair.triggered.connect(self.close)
        menu.addAction(abrir)
        menu.addAction(sair)
        self._menu_bandeja = menu
        self.bandeja.setContextMenu(menu)
        self.bandeja.activated.connect(
            lambda motivo: self.mostrar_janela() if motivo in (QSystemTrayIcon.ActivationReason.Trigger,
                                                              QSystemTrayIcon.ActivationReason.DoubleClick) else None)
        self.bandeja.show()

    def mostrar_janela(self):
        self.setWindowState(self.windowState() & ~Qt.WindowState.WindowMinimized)
        self.show()
        self.raise_()
        self.activateWindow()

    def changeEvent(self, event):
        super().changeEvent(event)
        if event.type() == QEvent.Type.WindowStateChange and self.isMinimized() and self.bandeja:
            QTimer.singleShot(0, self.hide)  # minimizou: some da barra de tarefas e fica só o ícone da bandeja

    # ---------- construção ----------
    def _card_maquina(self):
        card = Card()
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 14)
        lay.setSpacing(8)
        lay.addWidget(QLabel("Esta máquina"))
        self.maquina = QLineEdit(placeholderText="Nome desta máquina (letras, números, - e _)")
        row = QHBoxLayout()
        row.addWidget(self.maquina, 1)
        lay.addLayout(row)
        return card

    def _card_broker(self):
        card = Card()
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 14)
        lay.setSpacing(8)
        head = QHBoxLayout()
        head.addWidget(QLabel("Qual broker este agente vai observar?"))
        head.addStretch()
        atualizar = ActionButton("↻ ATUALIZAR BROKERS", "primary")
        atualizar.clicked.connect(self._atualizar_brokers)
        head.addWidget(atualizar)
        lay.addLayout(head)

        row = QHBoxLayout()
        self.c_fire = QCheckBox("Firebase (internet)")
        self.c_mqtt = QCheckBox("MQTT (rede local)")
        grupo = QButtonGroup(self)  # exclusivo: sempre um dos dois
        for c in (self.c_fire, self.c_mqtt):
            grupo.addButton(c)
            row.addWidget(c)
        row.addStretch()
        self.c_mqtt.setChecked(True)
        self.c_fire.toggled.connect(self._render)
        lay.addLayout(row)

        self.painel_fire = QWidget()
        pf = QHBoxLayout(self.painel_fire)
        pf.setContentsMargins(0, 0, 0, 0)
        pf.addWidget(QLabel("Broker do Firebase"))
        self.cb_fire = QComboBox()
        pf.addWidget(self.cb_fire, 1)
        lay.addWidget(self.painel_fire)

        self.painel_mqtt = QWidget()
        pm = QVBoxLayout(self.painel_mqtt)
        pm.setContentsMargins(0, 0, 0, 0)
        pm.setSpacing(8)
        r1 = QHBoxLayout()
        r1.addWidget(QLabel("Brokers MQTT cadastrados"))
        self.cb_mqtt = QComboBox()
        self.cb_mqtt.activated.connect(self._escolheu_mqtt)
        r1.addWidget(self.cb_mqtt, 1)
        pm.addLayout(r1)
        r2 = QHBoxLayout()
        self.host = QLineEdit(placeholderText="Endereço (IP) do broker")
        self.porta = QSpinBox()
        self.porta.setRange(1, 65535)
        self.porta.setValue(1883)
        r2.addWidget(self.host, 1)
        r2.addWidget(QLabel("Porta"))
        r2.addWidget(self.porta)
        pm.addLayout(r2)
        r3 = QHBoxLayout()
        self.usuario = QLineEdit(placeholderText="Usuário do broker")
        self.senha = QLineEdit(placeholderText="Senha do broker", echoMode=QLineEdit.EchoMode.Password)
        r3.addWidget(self.usuario, 1)
        r3.addWidget(self.senha, 1)
        pm.addLayout(r3)
        mostrar = QCheckBox("Mostrar senha")
        mostrar.toggled.connect(self._mostrar_senhas)
        pm.addWidget(mostrar)
        lay.addWidget(self.painel_mqtt)
        return card

    def _card_email(self):
        card = Card()
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 14)
        lay.setSpacing(8)
        lay.addWidget(QLabel("Contas de e-mail (Gmail + senha de app). Cada plano escolhe a conta; as senhas ficam só nesta máquina."))
        self.lista_emails = QListWidget()
        self.lista_emails.setObjectName("nets")
        self.lista_emails.setMaximumHeight(80)
        self.lista_emails.itemClicked.connect(lambda i: self.email_usuario.setText(i.text()))
        lay.addWidget(self.lista_emails)
        row = QHBoxLayout()
        self.email_usuario = QLineEdit(placeholderText="Conta Gmail")
        self.email_senha = QLineEdit(placeholderText="Senha de app do Gmail", echoMode=QLineEdit.EchoMode.Password)
        add = ActionButton("SALVAR CONTA", "primary")
        rem = ActionButton("REMOVER CONTA", "danger")
        add.clicked.connect(self._salvar_conta)
        rem.clicked.connect(self._remover_conta)
        for w in (self.email_usuario, self.email_senha):
            row.addWidget(w, 1)
        row.addWidget(add)
        row.addWidget(rem)
        lay.addLayout(row)
        return card

    def _salvar_conta(self):
        conta, senha = self.email_usuario.text().strip(), self.email_senha.text().strip()
        if "@" not in conta or not senha:
            return self.log.appendPlainText("Conta: informe o e-mail e a senha de app.")
        self._emails[conta] = senha
        self.email_senha.clear()
        self._mostrar_emails()
        config.salvar(self._coletar(), self._caminho)

    def _remover_conta(self):
        if self._emails.pop(self.email_usuario.text().strip(), None) is not None:
            self.email_usuario.clear()
            self._mostrar_emails()
            config.salvar(self._coletar(), self._caminho)

    def _mostrar_emails(self):
        self.lista_emails.clear()
        self.lista_emails.addItems(sorted(self._emails))

    def _card_controle(self):
        card = Card()
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 14)
        lay.setSpacing(8)
        self.status = QLabel(alignment=Qt.AlignmentFlag.AlignCenter)
        lay.addWidget(self.status)
        row = QHBoxLayout()
        self.btn_on = ActionButton("INICIAR AGENTE", "success")
        self.btn_on.clicked.connect(self._iniciar)
        self.btn_off = ActionButton("PARAR AGENTE", "danger")
        self.btn_off.clicked.connect(self._parar)
        row.addWidget(self.btn_on, 1)
        row.addWidget(self.btn_off, 1)
        lay.addLayout(row)
        self.chk_auto = QCheckBox("Iniciar o agente sozinho ao abrir o programa")
        lay.addWidget(self.chk_auto)
        return card

    def _log(self):
        self.log = QPlainTextEdit(readOnly=True)
        self.log.setObjectName("log")
        self.log.setMaximumBlockCount(1000)
        return self.log

    # ---------- configuração ----------
    def _mostrar_senhas(self, ligado):
        modo = QLineEdit.EchoMode.Normal if ligado else QLineEdit.EchoMode.Password
        self.senha.setEchoMode(modo)

    def _aplicar(self, cfg):
        self._cfg_base = cfg
        self.maquina.setText(cfg["maquina"])
        (self.c_fire if cfg["canal"] == "firebase" else self.c_mqtt).setChecked(True)
        self.host.setText(cfg["mqtt"]["host"])
        self.porta.setValue(int(cfg["mqtt"]["porta"]))
        self.usuario.setText(cfg["mqtt"]["usuario"])
        self.senha.setText(cfg["mqtt"]["senha"])
        self._broker_fire_salvo = cfg["firebase"]["broker"]
        self.chk_auto.setChecked(bool(cfg["iniciar_ao_abrir"]))
        self._emails = dict(cfg["emails"])
        self._mostrar_emails()

    def _coletar(self):
        cfg = config.copia(self._cfg_base)
        cfg["maquina"] = self.maquina.text().strip()
        cfg["canal"] = "firebase" if self.c_fire.isChecked() else "mqtt"
        cfg["firebase"]["broker"] = self.cb_fire.currentData() or ""
        cfg["mqtt"].update(host=self.host.text().strip(), porta=self.porta.value(),
                           usuario=self.usuario.text().strip(), senha=self.senha.text())
        cfg["iniciar_ao_abrir"] = self.chk_auto.isChecked()
        cfg["emails"] = dict(self._emails)
        return cfg

    # ---------- brokers cadastrados no Firebase ----------
    def _atualizar_brokers(self):
        def buscar():
            try:
                self.brokers_sinal.emit(requisitar(config.DB_URL, "GET", "brokers") or {})
            except Exception as exc:  # noqa: BLE001
                self.brokers_sinal.emit(str(exc))
        threading.Thread(target=buscar, daemon=True).start()

    def _preencher_brokers(self, dados):
        if isinstance(dados, str):
            self.log.appendPlainText(f"Não foi possível ler os brokers do Firebase: {dados}")
            return
        self._brokers = {k: v for k, v in dados.items() if isinstance(v, dict)}
        atual_fire = self.cb_fire.currentData() or self._broker_fire_salvo
        self.cb_fire.clear()
        self.cb_mqtt.clear()
        self.cb_mqtt.addItem("(digitar à mão)", None)
        for nome, b in sorted(self._brokers.items()):
            if b.get("tipo") == "fire":
                self.cb_fire.addItem(nome, nome)
            elif b.get("tipo") == "mqtt":
                self.cb_mqtt.addItem(f"{nome}  —  {b.get('ip', '?')}:{b.get('porta', 1883)}", nome)
        i = self.cb_fire.findData(atual_fire)
        if i >= 0:
            self.cb_fire.setCurrentIndex(i)

    def _escolheu_mqtt(self, _indice):
        nome = self.cb_mqtt.currentData()
        b = self._brokers.get(nome) if nome else None
        if b:
            self.host.setText(str(b.get("ip", "")))
            self.porta.setValue(int(b.get("porta", 1883)))

    # ---------- controle ----------
    def _iniciar(self):
        cfg = self._coletar()
        problema = config.validar(cfg)
        if problema:
            self.log.appendPlainText(problema)
            return
        config.salvar(cfg, self._caminho)
        self.agente = Agente(cfg, simular=self._simular)
        self.agente.iniciar()
        self._render()

    def _parar(self):
        if self.agente:
            self.agente.parar()
            self.agente = None
        self._render()

    def _render(self):
        ativo = self.agente is not None and self.agente.ativo
        fire = self.c_fire.isChecked()
        self.painel_fire.setVisible(fire)
        self.painel_mqtt.setVisible(not fire)
        self.btn_on.setEnabled(not ativo)
        self.btn_off.setEnabled(ativo)
        for w in (self.maquina, self.c_fire, self.c_mqtt, self.cb_fire, self.cb_mqtt, self.host,
                  self.porta, self.usuario, self.senha):
            w.setEnabled(not ativo)
        if self.bandeja:
            self.bandeja.setToolTip("Agente IOT: " + ("ativo" if ativo else "parado"))
        if ativo:
            onde = f"Firebase: {self.cb_fire.currentData()}" if fire else f"MQTT: {self.host.text()}:{self.porta.value()}"
            self.status.setText(f"● AGENTE ATIVO  ({onde})")
            self.status.setStyleSheet(f"color: {SUCCESS}; font-size: 14px; font-weight: bold;")
        else:
            self.status.setText("● AGENTE PARADO")
            self.status.setStyleSheet(f"color: {DANGER}; font-size: 14px; font-weight: bold;")

    def closeEvent(self, event):
        self._parar()
        if self.bandeja:
            self.bandeja.hide()
        super().closeEvent(event)
        QApplication.quit()
