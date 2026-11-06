import json
import re
import shutil
from pathlib import Path

from PyQt6.QtCore import QProcess, QProcessEnvironment, Qt
from PyQt6.QtWidgets import (QAbstractItemView, QCheckBox, QComboBox, QDoubleSpinBox, QHBoxLayout, QHeaderView,
                             QLabel, QLineEdit, QPlainTextEdit, QSpinBox, QTableWidget, QTableWidgetItem,
                             QVBoxLayout, QWidget)

from ..paths import resource_path
from ..theme import DANGER, SUCCESS
from ..widgets import ActionButton, BackgroundMixin, Card, ThemeButton
from .flash_dialog import SHORT_CORE_DIR, WORK_DIR, find_pio
from .repetidor import list_ports

FW_DIR = "firmware/Automacao"
BUILD_DIR = WORK_DIR.parent / "fw_automacao"        # cópia de trabalho (o .pio com o toolchain fica aqui)
SAVED_FILE = WORK_DIR.parent / "automacao_ultimo.json"  # última configuração usada
DEFAULT_HOST = "amauryesp-active-default-rtdb.firebaseio.com"
# Serial USB (1/3) e flash (6-11) nunca podem ser usados como pino de automação; o display OLED (21/22) só
# é reservado quando a placa tem display (sem display, 21 e 22 são pinos comuns).
EXISTING = set(range(0, 20)) | {21, 22, 23, 25, 26, 27} | set(range(32, 40))  # GPIOs que existem no ESP32


def reserved(display):
    r = {1: "serial USB", 3: "serial USB", **{g: "flash" for g in range(6, 12)}}
    if display:
        r.update({21: "display", 22: "display"})
    return r
SUGGESTED = [26, 27, 25, 33, 32, 23, 19, 18, 17, 16, 14, 13, 4]

DEFAULT_CONFIG = {
    "nome": "esp01", "modelo": "ESP32", "ssid": "", "senha": "", "host": DEFAULT_HOST, "auth": "",
    "display": True, "vcc_pino": 34, "vcc_div": 2.0,
    "pinos": [{"gpio": 26, "nome": "Rele 1", "tipo": "SAIDA", "invertido": False},
              {"gpio": 27, "nome": "Chave 1", "tipo": "ENTRADA", "invertido": True}],
}

HEADER = """#pragma once
// GERADO pelo app AUTOMACAO_IOT-AHS (form Automação FireBase). Não edite à mão: grave de novo pelo app.

#define NOME_DISPOSITIVO "{nome}"
#define MODELO_DISPOSITIVO "{modelo}"

#define WIFI_SSID  "{ssid}"
#define WIFI_SENHA "{senha}"

#define FIREBASE_HOST "{host}"
#define FIREBASE_AUTH "{auth}"

#define TEM_DISPLAY {display}
#define OLED_SDA    21
#define OLED_SCL    22
#define OLED_ADDR   0x3C

enum TipoPino {{
  SAIDA,    // acionamento ON/OFF: o ESP obedece esps/<nome>/pinos/<gpio>/estado
  ENTRADA   // switch: o ESP publica o estado do pino em esps/<nome>/pinos/<gpio>/estado
}};

struct PinoCfg {{
  uint8_t gpio;
  const char* nome;
  TipoPino tipo;
  bool invertido;  // SAIDA: relé que liga em nível baixo. ENTRADA: botão ligado ao GND (pull-up interno) = true
}};

const PinoCfg PINOS[] = {{
{pinos}
}};

#define VCC_PINO    {vcc_pino}
#define VCC_DIVISOR {vcc_div}f
"""


def c_str(text):
    """Texto seguro dentro de uma string C."""
    return re.sub(r"[\r\n\t]", " ", text).replace("\\", "\\\\").replace('"', '\\"')


def build_header(cfg):
    pinos = "\n".join(f'  {{ {p["gpio"]}, "{c_str(p["nome"])}", {p["tipo"]}, {"true" if p["invertido"] else "false"} }},'
                      for p in cfg["pinos"])
    return HEADER.format(
        nome=c_str(cfg["nome"]), modelo=c_str(cfg["modelo"]), ssid=c_str(cfg["ssid"]), senha=c_str(cfg["senha"]),
        host=c_str(cfg["host"]), auth=c_str(cfg["auth"]), display=1 if cfg["display"] else 0, pinos=pinos,
        vcc_pino=cfg["vcc_pino"], vcc_div=f'{cfg["vcc_div"]:.3f}')


def validate(cfg):
    """Devolve a mensagem do primeiro problema, ou None se estiver tudo certo."""
    if not re.fullmatch(r"[A-Za-z0-9_-]+", cfg["nome"]):
        return "Nome do ESP: só letras, números, - e _ (sem espaço)."
    if not cfg["ssid"]:
        return "Informe o nome do Wi-Fi (SSID)."
    if not cfg["host"] or "/" in cfg["host"] or " " in cfg["host"]:
        return "Host do Firebase inválido (só o domínio, sem https://)."
    if not cfg["pinos"]:
        return "Defina pelo menos um pino."
    seen = set()
    res = reserved(cfg["display"])
    for p in cfg["pinos"]:
        g = p["gpio"]
        if g not in EXISTING:
            return f"GPIO {g} não existe no ESP32 (use 0-19, 21-23, 25-27 ou 32-39)."
        if g in res:
            return f"GPIO {g} é reservado ({res[g]}) e não pode ser usado."
        if g in seen:
            return f"GPIO {g} repetido."
        if p["tipo"] == "SAIDA" and g >= 34:
            return f"GPIO {g} só serve de entrada (não pode ser saída)."
        seen.add(g)
    v = cfg["vcc_pino"]
    if v:
        if v in seen or v in res:
            return f"O pino da alimentação (GPIO {v}) já está em uso."
        if not 32 <= v <= 39:
            return "Alimentação: use um pino ADC1 (GPIO 32 a 39); o ADC2 não funciona com Wi-Fi."
    return None


class FirebaseScreen(BackgroundMixin, QWidget):
    """Automação FireBase: monta a configuração do ESP (nome, Wi-Fi, pinos on/off, switch, Vcc) e grava o
    firmware firmware/Automacao/src/automacao_iot.cpp na placa."""

    def __init__(self):
        super().__init__()
        self.setObjectName("root")
        self._proc = None
        self._shown_writing = False

        root = QVBoxLayout(self)
        root.setContentsMargins(32, 20, 32, 24)
        root.setSpacing(10)
        top = QHBoxLayout()
        title = QLabel("Automação FireBase")
        title.setObjectName("title")
        top.addWidget(title)
        top.addStretch()
        top.addWidget(ThemeButton())
        root.addLayout(top)
        root.addWidget(self._build_port_card())
        root.addWidget(self._build_device_card())
        root.addWidget(self._build_pins_card(), 1)
        root.addWidget(self._build_log())

        self._load_ports()
        self._apply(self._load_saved())

    # ---------- construção da tela ----------
    def _build_port_card(self):
        card = Card()
        lay = QHBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 14)
        self.port = QComboBox()
        self.port.setSizeAdjustPolicy(QComboBox.SizeAdjustPolicy.AdjustToMinimumContentsLengthWithIcon)
        self.port.setMinimumContentsLength(18)
        refresh = ActionButton("↻", "primary")
        refresh.setFixedWidth(48)
        refresh.setToolTip("Atualizar portas")
        refresh.clicked.connect(self._load_ports)
        self.btn_flash = ActionButton("⚡ Gravar no ESP", "success")
        self.btn_flash.setFixedWidth(170)
        self.btn_flash.clicked.connect(self._flash)
        lay.addWidget(QLabel("Porta"))
        lay.addWidget(self.port, 1)
        lay.addWidget(refresh)
        lay.addWidget(self.btn_flash)
        return card

    def _build_device_card(self):
        card = Card()
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 14)
        lay.setSpacing(8)
        self.nome = QLineEdit(placeholderText="Nome do ESP (aparece no Firebase: esps/<nome>)")
        self.modelo = QLineEdit(placeholderText="Modelo (ex: ESP32)")
        self.ssid = QLineEdit(placeholderText="Nome do Wi-Fi (SSID)")
        self.senha = QLineEdit(placeholderText="Senha do Wi-Fi", echoMode=QLineEdit.EchoMode.Password)
        self.display = QCheckBox("Placa com display OLED (só mostra informações)")
        show = QCheckBox("Mostrar senhas")
        show.toggled.connect(lambda on: [f.setEchoMode(QLineEdit.EchoMode.Normal if on else QLineEdit.EchoMode.Password)
                                         for f in (self.senha,)])
        for a, b in ((self.nome, self.modelo), (self.ssid, self.senha)):
            row = QHBoxLayout()
            row.addWidget(a, 1)
            row.addWidget(b, 1)
            lay.addLayout(row)
        row = QHBoxLayout()
        row.addWidget(self.display)
        row.addStretch()
        row.addWidget(show)
        lay.addLayout(row)
        return card

    def _build_pins_card(self):
        card = Card()
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 16)
        lay.setSpacing(10)
        head = QHBoxLayout()
        head.addWidget(QLabel("Pinos do ESP (acionamento ON/OFF e switch)"))
        head.addStretch()
        add = ActionButton("+ ADICIONAR PINO", "primary")
        add.clicked.connect(lambda: self._add_row())
        every = ActionButton("TODOS OS PINOS LIVRES", "primary")
        every.setToolTip("Lista todos os GPIO que podem ser usados nesta placa (respeita display e Vcc)")
        every.clicked.connect(self._add_all_free)
        rem = ActionButton("REMOVER", "danger")
        rem.clicked.connect(self._remove_row)
        head.addWidget(add)
        head.addWidget(every)
        head.addWidget(rem)
        lay.addLayout(head)

        self.table = QTableWidget(0, 4)
        self.table.setHorizontalHeaderLabels(["GPIO", "Nome do pino", "Tipo", "Invertido"])
        self.table.verticalHeader().setVisible(False)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.table.setMinimumHeight(110)
        self.table.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOn)
        header = self.table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)  # largura dos combos das células
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.Fixed)
        self.table.setColumnWidth(2, 190)
        self.table.setColumnWidth(3, 90)
        lay.addWidget(self.table, 1)

        vcc = QHBoxLayout()
        vcc.addWidget(QLabel("Alimentação (Vcc) — pino ADC"))
        self.vcc_pino = QSpinBox()
        self.vcc_pino.setRange(0, 39)
        self.vcc_pino.setSpecialValueText("Desligado")
        self.vcc_pino.setToolTip("GPIO 32 a 39 ligado à tensão por um divisor de tensão. 0 = não medir.")
        self.vcc_div = QDoubleSpinBox()
        self.vcc_div.setRange(1.0, 20.0)
        self.vcc_div.setDecimals(2)
        self.vcc_div.setToolTip("Divisor de tensão (R1+R2)/R2. Dois resistores iguais = 2.")
        vcc.addWidget(self.vcc_pino)
        vcc.addSpacing(12)
        vcc.addWidget(QLabel("Divisor (R1+R2)/R2"))
        vcc.addWidget(self.vcc_div)
        vcc.addStretch()
        lay.addLayout(vcc)
        note = QLabel("Reservados: 1/3 (serial) e 6-11 (flash); 21/22 só com display. 34-39 só entrada.")
        note.setObjectName("muted")
        lay.addWidget(note)
        return card

    def _build_log(self):
        box = QWidget()
        lay = QVBoxLayout(box)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(6)
        self.status = QLabel(alignment=Qt.AlignmentFlag.AlignCenter)
        self.status.setStyleSheet("font-size: 13px; font-weight: bold;")
        self.log = QPlainTextEdit(readOnly=True)
        self.log.setObjectName("log")
        self.log.setMaximumBlockCount(1000)
        self.log.setMaximumHeight(120)
        lay.addWidget(self.status)
        lay.addWidget(self.log)
        return box

    # ---------- portas ----------
    def _load_ports(self):
        current = self.port.currentData()
        self.port.clear()
        for dev, desc in list_ports():
            self.port.addItem(f"{dev} - {desc}", dev)
        if current:
            self.port.setCurrentIndex(max(0, self.port.findData(current)))
        if self.port.count() == 0:
            self.port.addItem("Nenhuma porta encontrada", None)

    # ---------- tabela de pinos ----------
    def _add_row(self, gpio=None, nome="", tipo="SAIDA", invertido=False):
        if gpio is None:
            used = {self._cell_gpio(r) for r in range(self.table.rowCount())}
            gpio = next((g for g in SUGGESTED if g not in used), 0)
        r = self.table.rowCount()
        self.table.insertRow(r)
        self.table.setItem(r, 0, QTableWidgetItem(str(gpio)))
        self.table.setItem(r, 1, QTableWidgetItem(nome or f"Pino {gpio}"))
        kind = QComboBox()
        kind.addItem("Saída (ON/OFF)", "SAIDA")
        kind.addItem("Entrada (switch)", "ENTRADA")
        kind.setCurrentIndex(0 if tipo == "SAIDA" else 1)
        self.table.setCellWidget(r, 2, kind)
        inv = QCheckBox()
        inv.setChecked(invertido)
        inv.setToolTip("Saída: relé que liga em nível baixo. Entrada: botão ligado ao GND.")
        holder = QWidget()
        h = QHBoxLayout(holder)
        h.setContentsMargins(0, 0, 0, 0)
        h.setAlignment(Qt.AlignmentFlag.AlignCenter)
        h.addWidget(inv)
        self.table.setCellWidget(r, 3, holder)
        self.table.setRowHeight(r, 38)

    def _add_all_free(self):
        """Lista todos os GPIO utilizáveis: saída (ON/OFF/pulso) até o 33; 34-39 só entrada (switch)."""
        res = reserved(self.display.isChecked())
        vcc = self.vcc_pino.value()
        self.table.setRowCount(0)
        for g in sorted(EXISTING):
            if g in res or g == vcc:
                continue
            self._add_row(g, f"Pino {g}", "ENTRADA" if g >= 34 else "SAIDA", False)

    def _remove_row(self):
        r = self.table.currentRow()
        if r >= 0:
            self.table.removeRow(r)

    def _cell_gpio(self, r):
        item = self.table.item(r, 0)
        try:
            return int(item.text().strip()) if item else -1
        except ValueError:
            return -1

    # ---------- configuração ----------
    def _collect(self):
        pinos = []
        for r in range(self.table.rowCount()):
            nome = self.table.item(r, 1).text().strip() if self.table.item(r, 1) else ""
            g = self._cell_gpio(r)
            pinos.append({"gpio": g, "nome": nome or f"Pino {g}",
                          "tipo": self.table.cellWidget(r, 2).currentData(),
                          "invertido": self.table.cellWidget(r, 3).findChild(QCheckBox).isChecked()})
        return {"nome": self.nome.text().strip(), "modelo": self.modelo.text().strip() or "ESP32",
                "ssid": self.ssid.text().strip(), "senha": self.senha.text(), "host": DEFAULT_HOST,
                "auth": "", "display": self.display.isChecked(),
                "vcc_pino": self.vcc_pino.value(), "vcc_div": self.vcc_div.value(), "pinos": pinos}

    def _apply(self, cfg):
        self.nome.setText(cfg["nome"])
        self.modelo.setText(cfg["modelo"])
        self.ssid.setText(cfg["ssid"])
        self.senha.setText(cfg["senha"])
        self.display.setChecked(cfg["display"])
        self.vcc_pino.setValue(cfg["vcc_pino"])
        self.vcc_div.setValue(cfg["vcc_div"])
        self.table.setRowCount(0)
        for p in cfg["pinos"]:
            self._add_row(p["gpio"], p["nome"], p["tipo"], p["invertido"])

    def _load_saved(self):
        try:
            data = json.loads(SAVED_FILE.read_text(encoding="utf-8"))
            cfg = {**DEFAULT_CONFIG, **data}
            if not all({"gpio", "nome", "tipo", "invertido"} <= set(p) for p in cfg["pinos"]):
                raise ValueError
            return cfg
        except Exception:
            return DEFAULT_CONFIG

    def _save(self, cfg):
        try:
            SAVED_FILE.parent.mkdir(parents=True, exist_ok=True)
            SAVED_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError:
            pass  # não conseguir lembrar a última configuração não impede a gravação

    # ---------- gravação ----------
    def _write(self, msg):
        self.log.appendPlainText(msg)

    def _set_result(self, text, color=None):
        self.status.setText(text)
        self.status.setStyleSheet("font-size: 13px; font-weight: bold;" + (f"color: {color};" if color else ""))

    def _prepare(self, cfg):
        base = resource_path(FW_DIR)
        if not (base / "platformio.ini").exists():
            raise RuntimeError("firmware/Automacao não encontrado.")
        src, inc = BUILD_DIR / "src", BUILD_DIR / "include"
        shutil.rmtree(src, ignore_errors=True)
        shutil.rmtree(inc, ignore_errors=True)
        src.mkdir(parents=True)
        inc.mkdir(parents=True)
        shutil.copy(base / "platformio.ini", BUILD_DIR / "platformio.ini")
        shutil.copy(base / "src" / "automacao_iot.cpp", src / "automacao_iot.cpp")
        (inc / "automacao_config.h").write_text(build_header(cfg), encoding="utf-8")

    def _flash(self):
        if self._proc:
            self._proc.kill()
            return
        cfg = self._collect()
        problem = validate(cfg)
        dev = self.port.currentData()
        pio = find_pio()
        self.log.clear()
        self._set_result("")
        if problem:
            return self._write(problem)
        if not dev:
            return self._write("Selecione a porta do ESP32.")
        if not pio:
            return self._write("PlatformIO não encontrado. Instale com: pip install platformio")
        try:
            self._prepare(cfg)
        except Exception as e:
            return self._write(f"Erro preparando o projeto: {e}")
        self._save(cfg)

        self._write(f"Gravando '{cfg['nome']}' em {dev}. A primeira vez demora (baixa o toolchain).")
        env = QProcessEnvironment.systemEnvironment()
        for var in ("MSYSTEM", "MSYSTEM_PREFIX", "MINGW_PREFIX"):
            env.remove(var)
        env.insert("PYTHONUTF8", "1")
        env.insert("PYTHONIOENCODING", "utf-8")
        if SHORT_CORE_DIR and SHORT_CORE_DIR.exists():
            env.insert("PLATFORMIO_CORE_DIR", str(SHORT_CORE_DIR))
        self._shown_writing = False
        self._proc = QProcess(self)
        self._proc.setProcessEnvironment(env)
        self._proc.setWorkingDirectory(str(BUILD_DIR))
        self._proc.setProcessChannelMode(QProcess.ProcessChannelMode.MergedChannels)
        self._proc.readyReadStandardOutput.connect(self._read)
        self._proc.finished.connect(self._done)
        self._proc.errorOccurred.connect(lambda _: self._done(-1, None) if self._proc else None)
        self._proc.start(pio, ["run", "-t", "upload", "--upload-port", dev])
        self.btn_flash.setText("CANCELAR")
        self.btn_flash.set_kind("danger")

    def _read(self):
        text = bytes(self._proc.readAllStandardOutput()).decode("utf-8", errors="replace")
        for line in re.split(r"[\r\n]+", text):
            line = line.strip()
            if not line or line.startswith("***") or "Warning" in line:
                continue
            if line.startswith("Writing at"):
                if not self._shown_writing:
                    self._shown_writing = True
                    self._write("Gravando na flash...")
                continue
            self._write(line)

    def _done(self, code, _status):
        proc, self._proc = self._proc, None
        if proc is None:
            return
        proc.deleteLater()
        if code == 0:
            self._write("\nCarga ESP Concluído!")
            self._set_result("✔ Carga ESP Concluído!", SUCCESS)
        else:
            self._write(f"\nFalhou (código {code}). Veja o log acima.")
            self._set_result("✖ Falha na carga", DANGER)
        self.btn_flash.setText("⚡ Gravar no ESP")
        self.btn_flash.set_kind("success")

    def closeEvent(self, event):
        if self._proc:
            self._proc.kill()
        super().closeEvent(event)
