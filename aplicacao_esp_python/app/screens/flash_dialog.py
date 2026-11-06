import os
import re
import shutil
import sys
from pathlib import Path

from PyQt6.QtCore import QProcess, QProcessEnvironment, Qt
from PyQt6.QtWidgets import (QComboBox, QDialog, QFileDialog, QHBoxLayout, QLabel, QLineEdit,
                             QPlainTextEdit, QVBoxLayout)

from ..paths import resource_path
from ..theme import DANGER, SUCCESS
from ..widgets import ActionButton, BackgroundMixin, Card

IS_WINDOWS = sys.platform == "win32"
# Windows: toolchain em caminho curto (limite de 260 caracteres). Linux/macOS usam o padrão do PlatformIO.
SHORT_CORE_DIR = Path("C:/pio") if IS_WINDOWS else None


def _work_dir():
    if IS_WINDOWS:
        base = Path(os.environ.get("LOCALAPPDATA", Path.home()))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "AUTOMACAO_IOT-AHS" / "fw"


WORK_DIR = _work_dir()


def find_pio():
    found = shutil.which("pio") or shutil.which("platformio")
    if found:
        return found
    bin_dir = "Scripts" if IS_WINDOWS else "bin"
    candidate = Path.home() / ".platformio" / "penv" / bin_dir / ("pio.exe" if IS_WINDOWS else "pio")
    return str(candidate) if candidate.exists() else None


class FlashDialog(BackgroundMixin, QDialog):
    """Compila um .cpp com o PlatformIO e grava no ESP32 da porta escolhida."""

    def __init__(self, parent, ports, current_port, release_port):
        super().__init__(parent)
        self.setObjectName("root")
        self.setWindowTitle("Gravar firmware no ESP32")
        self.resize(640, 560)
        self._release_port = release_port
        self._proc = None

        root = QVBoxLayout(self)
        root.setContentsMargins(24, 20, 24, 20)
        root.setSpacing(12)
        title = QLabel("Gravar firmware (.cpp)")
        title.setObjectName("title")
        root.addWidget(title)

        card = Card()
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 16)
        lay.setSpacing(10)

        lay.addWidget(QLabel("Arquivo .cpp"))
        row = QHBoxLayout()
        self.file = QLineEdit(str(resource_path("firmware/Repetidor/src/repetidor.cpp")))
        browse = ActionButton("Procurar…", "primary")
        browse.clicked.connect(self._browse)
        row.addWidget(self.file, 1)
        row.addWidget(browse)
        lay.addLayout(row)

        lay.addWidget(QLabel("Porta do ESP32"))
        self.port = QComboBox()
        for dev, desc in ports:
            self.port.addItem(f"{dev} - {desc}", dev)
        if current_port:
            self.port.setCurrentIndex(max(0, self.port.findData(current_port)))
        lay.addWidget(self.port)

        self.result = QLabel(alignment=Qt.AlignmentFlag.AlignCenter)
        self.result.setStyleSheet("font-size: 13px; font-weight: bold;")
        self.log = QPlainTextEdit(readOnly=True)
        self.log.setObjectName("log")
        self.log.setMaximumBlockCount(1000)
        lay.addWidget(self.log, 1)
        lay.addWidget(self.result)

        btns = QHBoxLayout()
        self.btn_go = ActionButton("COMPILAR E GRAVAR", "success")
        self.btn_go.clicked.connect(self._start)
        close = ActionButton("Fechar", "primary")
        close.clicked.connect(self.reject)
        btns.addWidget(self.btn_go, 1)
        btns.addWidget(close)
        lay.addLayout(btns)
        root.addWidget(card, 1)

    def _browse(self):
        path, _ = QFileDialog.getOpenFileName(self, "Escolher .cpp", str(Path(self.file.text()).parent),
                                              "C++ (*.cpp *.ino)")
        if path:
            self.file.setText(path)

    def _write(self, msg):
        self.log.appendPlainText(msg)

    def _prepare(self, cpp):
        base = resource_path("firmware/Repetidor")
        if not (base / "platformio.ini").exists():
            raise RuntimeError("platformio.ini do firmware não encontrado.")
        src, inc = WORK_DIR / "src", WORK_DIR / "include"
        shutil.rmtree(src, ignore_errors=True)
        shutil.rmtree(inc, ignore_errors=True)
        src.mkdir(parents=True)
        shutil.copy(base / "platformio.ini", WORK_DIR / "platformio.ini")
        if (base / "include").exists():
            shutil.copytree(base / "include", inc)
        else:
            inc.mkdir()
        # cabeçalhos ao lado do .cpp e na pasta include irmã também vão junto
        for folder in (cpp.parent, cpp.parent.parent / "include"):
            for h in folder.glob("*.h") if folder.exists() else []:
                shutil.copy(h, inc / h.name)
        shutil.copy(cpp, src / cpp.name)

    def _start(self):
        if self._proc:
            self._proc.kill()
            return
        cpp = Path(self.file.text().strip())
        dev = self.port.currentData()
        pio = find_pio()
        if not cpp.is_file():
            return self._write("Escolha um arquivo .cpp válido.")
        if not dev:
            return self._write("Selecione a porta do ESP32.")
        if not pio:
            return self._write("PlatformIO não encontrado. Instale com: pip install platformio")
        try:
            self._prepare(cpp)
        except Exception as e:
            return self._write(f"Erro preparando o projeto: {e}")

        self._release_port()
        self.log.clear()
        self.result.clear()
        self._write(f"Compilando {cpp.name} e gravando em {dev}. A primeira vez demora (baixa o toolchain).")
        env = QProcessEnvironment.systemEnvironment()
        for var in ("MSYSTEM", "MSYSTEM_PREFIX", "MINGW_PREFIX"):
            env.remove(var)
        env.insert("PYTHONUTF8", "1")  # sem TTY o Python usa cp1252 e quebra nas barras de progresso
        env.insert("PYTHONIOENCODING", "utf-8")
        if SHORT_CORE_DIR and SHORT_CORE_DIR.exists():
            env.insert("PLATFORMIO_CORE_DIR", str(SHORT_CORE_DIR))
        self._shown_writing = False
        self._proc = QProcess(self)
        self._proc.setProcessEnvironment(env)
        self._proc.setWorkingDirectory(str(WORK_DIR))
        self._proc.setProcessChannelMode(QProcess.ProcessChannelMode.MergedChannels)
        self._proc.readyReadStandardOutput.connect(self._read)
        self._proc.finished.connect(self._done)
        self._proc.errorOccurred.connect(lambda _: self._done(-1, None) if self._proc else None)
        self._proc.start(pio, ["run", "-t", "upload", "--upload-port", dev])
        self.btn_go.setText("CANCELAR")
        self.btn_go.set_kind("danger")

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
            self._write("\nCarga ESP Concluído! Reconecte a porta no app.")
            self.result.setText("✔ Carga ESP Concluído!")
            self.result.setStyleSheet(f"font-size: 13px; font-weight: bold; color: {SUCCESS};")
        else:
            self._write(f"\nFalhou (código {code}). Veja o log acima.")
            self.result.setText("✖ Falha na carga")
            self.result.setStyleSheet(f"font-size: 13px; font-weight: bold; color: {DANGER};")
        self.btn_go.setText("COMPILAR E GRAVAR")
        self.btn_go.set_kind("success")

    def reject(self):
        if self._proc:
            self._proc.kill()
        super().reject()
