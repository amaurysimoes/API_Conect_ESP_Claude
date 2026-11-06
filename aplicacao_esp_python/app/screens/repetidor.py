from datetime import datetime

from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtWidgets import (QAbstractItemView, QButtonGroup, QCheckBox, QComboBox, QHBoxLayout, QLabel, QLineEdit,
                             QListWidget, QListWidgetItem, QPlainTextEdit, QVBoxLayout, QWidget)

from ..serial_link import SerialLink
from .flash_dialog import FlashDialog
from ..theme import DANGER, SUCCESS, WARNING, theme
from ..widgets import ActionButton, BackgroundMixin, Card, ThemeButton

BAUD = 115200
BOOT_WAIT_MS = 2000  # abrir a serial reinicia a maioria das placas ESP32


def list_ports():
    try:
        from serial.tools import list_ports as lp
        return [(p.device, p.description) for p in lp.comports()]
    except Exception:
        return []


def signal_bars(rssi):
    level = 4 if rssi >= -55 else 3 if rssi >= -67 else 2 if rssi >= -78 else 1
    return "▂▄▆█"[:level].ljust(4, "·")


class RepetidorScreen(BackgroundMixin, QWidget):
    def __init__(self):
        super().__init__()
        self.setObjectName("root")
        self.link = SerialLink()
        self.link.line.connect(self._on_line)
        self.link.closed.connect(self._on_link_lost)
        self.repeating = False
        self._networks = {}
        self._heard = False  # algum protocolo recebido do ESP32 desde que a porta abriu

        root = QVBoxLayout(self)
        root.setContentsMargins(32, 20, 32, 24)
        root.setSpacing(10)

        top = QHBoxLayout()
        title = QLabel("Repetidor ESP32")
        title.setObjectName("title")
        top.addWidget(title)
        top.addStretch()
        top.addWidget(ThemeButton())
        root.addLayout(top)

        root.addWidget(self._build_port_card())
        root.addWidget(self._build_network_card(), 4)
        root.addWidget(self._build_log(), 1)

        self._load_ports()
        self._render()

    # ---------- construção da tela ----------
    def _build_port_card(self):
        card = Card()
        lay = QHBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 14)
        self.port = QComboBox()
        self.port.setSizeAdjustPolicy(QComboBox.SizeAdjustPolicy.AdjustToMinimumContentsLengthWithIcon)
        self.port.setMinimumContentsLength(18)  # descrições longas da porta não alargam a janela
        refresh = ActionButton("↻", "primary")
        refresh.setFixedWidth(48)
        refresh.setToolTip("Atualizar portas")
        refresh.clicked.connect(self._load_ports)
        flash = ActionButton("⚡ Gravar firmware (.cpp)", "primary")
        flash.clicked.connect(self._open_flash)
        self.btn_link = ActionButton("CONECTAR", "primary")
        self.btn_link.setFixedWidth(130)
        self.btn_link.clicked.connect(self._toggle_link)
        lay.addWidget(QLabel("Porta"))
        lay.addWidget(self.port, 1)
        lay.addWidget(refresh)
        lay.addWidget(flash)
        lay.addWidget(self.btn_link)
        return card

    def _build_network_card(self):
        card = Card()
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 16)
        lay.setSpacing(10)

        head = QHBoxLayout()
        head.addWidget(QLabel("Redes Wi-Fi detectadas pelo ESP32"))
        head.addStretch()
        self.btn_scan = ActionButton("ESCANEAR", "primary")
        self.btn_scan.clicked.connect(self._scan)
        head.addWidget(self.btn_scan)
        lay.addLayout(head)

        self.nets = QListWidget()
        self.nets.setObjectName("nets")
        self.nets.setMinimumHeight(110)  # a lista é o que encolhe/cresce; o resto nunca se sobrepõe
        self.nets.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOn)
        self.nets.itemClicked.connect(self._pick_network)
        lay.addWidget(self.nets, 1)
        lay.addSpacing(14)  # separa a lista do campo com o nome da rede escolhida

        # Mesmo seletor do projeto Agin_TV: Corporativa (EAP) x Comum.
        kind_row = QHBoxLayout()
        self.kind_eap = QCheckBox("Corporativa (EAP)")
        self.kind_plain = QCheckBox("Comum")
        self.kind_plain.setChecked(True)
        group = QButtonGroup(self)  # exclusivo: sempre uma das duas marcada
        for cb in (self.kind_eap, self.kind_plain):
            group.addButton(cb)
            kind_row.addWidget(cb)
        kind_row.addStretch()
        self.kind_eap.toggled.connect(self._kind_changed)
        lay.addLayout(kind_row)

        self.ssid = QLineEdit(placeholderText="Nome da rede (SSID)")
        self.user = QLineEdit(placeholderText="Usuário (ex: producao)")
        self.password = QLineEdit(placeholderText="Senha da rede", echoMode=QLineEdit.EchoMode.Password)
        self.ap_password = QLineEdit(placeholderText="Senha do repetidor (mín. 8 caracteres; vazio = igual à da rede)",
                                     echoMode=QLineEdit.EchoMode.Password)
        show = QCheckBox("Mostrar senhas")
        show.toggled.connect(lambda on: [f.setEchoMode(QLineEdit.EchoMode.Normal if on else QLineEdit.EchoMode.Password)
                                         for f in (self.password, self.ap_password)])
        for w in (self.ssid, self.user, self.password, self.ap_password, show):
            lay.addWidget(w)
        self._kind_changed()

        self.status = QLabel(alignment=Qt.AlignmentFlag.AlignCenter)
        lay.addWidget(self.status)
        run_row = QHBoxLayout()
        self.btn_run = ActionButton("ATIVAR REPETIDOR", "success")
        self.btn_run.clicked.connect(self._start_repeater)
        self.btn_stop = ActionButton("PARAR REPETIDOR", "danger")
        self.btn_stop.clicked.connect(self._stop_repeater)
        run_row.addWidget(self.btn_run, 1)
        run_row.addWidget(self.btn_stop, 1)
        lay.addLayout(run_row)
        return card

    def _build_log(self):
        self.log = QPlainTextEdit(readOnly=True)
        self.log.setObjectName("log")
        self.log.setMaximumBlockCount(500)
        self.log.setMaximumHeight(130)
        return self.log

    def closeEvent(self, event):
        # Libera a COM ao fechar o formulário. O repetidor continua ativo no ESP32; ao reabrir, o app sincroniza.
        self.link.close()
        self.repeating = False
        self._render()
        super().closeEvent(event)

    def _open_flash(self):
        ports = [(self.port.itemData(i), self.port.itemText(i).split(" - ", 1)[-1])
                 for i in range(self.port.count()) if self.port.itemData(i)]
        FlashDialog(self, ports, self.port.currentData(), self._release_port).exec()
        self._load_ports()

    def _release_port(self):
        """A gravação precisa da serial livre."""
        if self.link.is_open:
            self.link.close()
            self.repeating = False
            self._write("Porta fechada para gravar o firmware.")
            self._render()

    # ---------- portas ----------
    def _load_ports(self):
        if self.link.is_open:
            return
        self.port.clear()
        ports = list_ports()
        for dev, desc in ports:
            self.port.addItem(f"{dev} - {desc}", dev)
        if not ports:
            self.port.addItem("Nenhuma porta encontrada", None)
        self._render()

    def _toggle_link(self):
        if self.link.is_open:
            self.link.close()
            self.repeating = False
            self._write("Porta fechada.")
            return self._render()
        dev = self.port.currentData()
        if not dev:
            return self._write("Selecione uma porta serial válida.")
        try:
            self.link.open(dev, BAUD)
        except Exception as e:
            return self._write(f"Não foi possível abrir {dev}: {e}")
        self._heard = False
        self._write(f"Porta {dev} aberta, aguardando o ESP32...")
        self._render()
        QTimer.singleShot(BOOT_WAIT_MS, self._hello)

    def _on_link_lost(self):
        self.repeating = False
        self._write("Conexão serial perdida (cabo removido?).")
        self._render()

    def _hello(self):
        if self.link.is_open:
            self.link.send("PING")
            QTimer.singleShot(3000, self._check_alive)

    def _check_alive(self):
        if self.link.is_open and not self._heard:
            self._write("O ESP32 não respondeu. O firmware do repetidor (pasta firmware/) precisa estar gravado "
                        "na placa, e a porta deve ser a dela.")
            self.btn_scan.setEnabled(True)

    # ---------- ações ----------
    def _scan(self):
        if not self.link.is_open:
            return
        self.nets.clear()
        self._networks.clear()
        self.btn_scan.setEnabled(False)
        self.link.send("SCAN")
        self._write("Escaneando redes...")

    def _kind_changed(self):
        eap = self.kind_eap.isChecked()
        self.user.setVisible(eap)
        self.password.setPlaceholderText("Senha do usuário" if eap else "Senha da rede")

    def _pick_network(self, item):
        if self.repeating:  # com o repetidor ativo a lista só rola; trocar de rede exige parar antes
            return
        ssid = item.data(Qt.ItemDataRole.UserRole)
        self.ssid.setText(ssid)
        if self._networks[ssid][2] == "2":  # o ESP viu que a rede é WPA2/WPA3-Enterprise
            self.kind_eap.setChecked(True)
        (self.user if self.kind_eap.isChecked() else self.password).setFocus()

    def _stop_repeater(self):
        if self.link.is_open:
            self.link.send("STOP")  # vale mesmo que o app ache que está parado: o ESP é quem sabe
            self._write("Parando o repetidor...")

    def _auto_scan(self):
        # Ao conectar, se o ESP já estava repetindo ele avisa (OK) logo após o PONG: aí não escaneia.
        if self.link.is_open and not self.repeating:
            self._scan()

    def _start_repeater(self):
        ssid = self.ssid.text().strip()
        if not ssid:
            return self._write("Escolha uma rede da lista ou digite o SSID.")
        eap = self.kind_eap.isChecked()
        user = self.user.text().strip() if eap else ""
        if eap and not user:
            return self._write("Rede corporativa (EAP): informe o usuário.")
        pwd = self.password.text()
        # Em rede corporativa a senha do usuário não serve de senha do Wi-Fi do repetidor.
        ap_pwd = self.ap_password.text() or ("" if eap else pwd)
        if not self._heard:
            return self._write("O ESP32 ainda não respondeu; sem o firmware do repetidor gravado nada vai acontecer.")
        self.link.send("START", ssid, "EAP" if eap else "COMUM", user, pwd, ap_pwd)
        self._write(f"Conectando o ESP32 em '{ssid}' ({'corporativa EAP' if eap else 'comum'})...")
        self._set_status("● CONECTANDO...", WARNING)
        self.btn_run.setEnabled(False)

    # ---------- protocolo ----------
    def _on_line(self, text):
        f = text.split("\t")
        cmd = f[0]
        if cmd in ("PONG", "NET", "SCAN_END", "OK", "ERR", "STOPPED", "STAT"):
            self._heard = True
        if cmd == "PONG":
            self._write("ESP32 respondeu.")
            QTimer.singleShot(500, self._auto_scan)
        elif cmd == "NET" and len(f) >= 5:
            ssid, rssi, ch, secure = f[1], int(f[2]), f[3], f[4]  # secure: 0 aberta, 1 senha, 2 corporativa
            if ssid not in self._networks or rssi > self._networks[ssid][0]:
                self._networks[ssid] = (rssi, ch, secure)
            self._fill_networks()
        elif cmd == "SCAN_END":
            self.btn_scan.setEnabled(self.link.is_open)
            self._write(f"{len(self._networks)} redes encontradas.")
        elif cmd == "OK" and len(f) >= 6:
            self.repeating = True
            self.ssid.setText(f[1])
            self._write(f"Repetidor ativo. Rede: {f[1]} | IP: {f[2]} | {f[3]} dBm | canal {f[4]} | "
                        f"Wi-Fi do repetidor: '{f[5]}'")
            self._render()
        elif cmd == "STOPPED":
            self.repeating = False
            self._write("Repetidor parado.")
            self._render()
        elif cmd == "ERR":
            self.repeating = False
            self._write("Erro: " + (f[1] if len(f) > 1 else "desconhecido"))
            self._render()
        elif cmd == "STAT" and len(f) >= 3:
            self._set_status(f"● REPETIDOR ATIVO   {f[1]} dBm   {f[2]} cliente(s)", SUCCESS)
        elif cmd == "LOG" and len(f) > 1:
            self._write(f[1])

    def _fill_networks(self):
        bar = self.nets.verticalScrollBar()
        pos = bar.value()  # a lista é refeita a cada rede achada: sem isso ela voltaria ao topo e não daria para rolar
        self.nets.clear()
        for ssid, (rssi, ch, secure) in sorted(self._networks.items(), key=lambda kv: -kv[1][0]):
            it = QListWidgetItem(f"{signal_bars(rssi)}   {ssid}      {rssi} dBm · canal {ch}{'' if secure == '0' else '  🔒 EAP' if secure == '2' else '  🔒'}")
            it.setData(Qt.ItemDataRole.UserRole, ssid)
            self.nets.addItem(it)
        self.nets.doItemsLayout()  # recalcula a faixa de rolagem agora, senão o setValue abaixo seria cortado a 0
        bar.setValue(pos)

    # ---------- estado visual ----------
    def _write(self, msg):
        self.log.appendPlainText(f"[{datetime.now():%H:%M:%S}] {msg}")

    def _set_status(self, text, color):
        self.status.setText(text)
        self.status.setStyleSheet(f"color: {color}; font-size: 14px; font-weight: bold;")

    def _render(self):
        linked = self.link.is_open
        self.btn_link.setText("DESCONECTAR" if linked else "CONECTAR")
        self.btn_link.set_kind("danger" if linked else "primary")
        self.port.setEnabled(not linked)
        self.btn_scan.setEnabled(linked)  # com o repetidor ativo o ESP para sozinho antes de escanear
        self.btn_run.setEnabled(linked and not self.repeating)
        self.btn_stop.setEnabled(linked)
        for w in (self.ssid, self.user, self.password, self.ap_password, self.kind_eap, self.kind_plain):
            w.setEnabled(not self.repeating)
        self.nets.setSelectionMode(QAbstractItemView.SelectionMode.NoSelection if self.repeating
                                   else QAbstractItemView.SelectionMode.SingleSelection)
        if self.repeating:
            self._set_status("● REPETIDOR ATIVO", SUCCESS)
        elif linked:
            self._set_status("● ESP32 CONECTADO", theme.colors["muted"])
        else:
            self._set_status("● SEM PORTA SERIAL", DANGER)
