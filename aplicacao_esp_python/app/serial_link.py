"""Enlace serial com o ESP32: protocolo de linhas, campos separados por TAB."""
import serial
from PyQt6.QtCore import QObject, QTimer, pyqtSignal


class SerialLink(QObject):
    line = pyqtSignal(str)
    closed = pyqtSignal()

    def __init__(self):
        super().__init__()
        self._ser = None
        self._buf = b""
        self._timer = QTimer(self, interval=40)
        self._timer.timeout.connect(self._poll)

    @property
    def is_open(self):
        return self._ser is not None

    def open(self, port, baud):
        self._ser = serial.Serial(port, baud, timeout=0, write_timeout=1)
        self._buf = b""
        self._timer.start()

    def close(self):
        self._timer.stop()
        if self._ser:
            try:
                self._ser.close()
            except Exception:
                pass
        self._ser = None

    def send(self, *fields):
        clean = [str(f).replace("\t", " ").replace("\r", " ").replace("\n", " ") for f in fields]
        self._ser.write(("\t".join(clean) + "\n").encode("utf-8"))

    def _poll(self):
        try:
            data = self._ser.read(4096)
        except Exception:
            self.close()
            self.closed.emit()
            return
        if not data:
            return
        self._buf += data
        while b"\n" in self._buf:
            raw, self._buf = self._buf.split(b"\n", 1)
            text = raw.decode("utf-8", errors="replace").strip()
            if text:
                self.line.emit(text)
