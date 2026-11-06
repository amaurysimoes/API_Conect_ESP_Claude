from pathlib import Path

from PyQt6.QtCore import pyqtSignal
from PyQt6.QtGui import QKeySequence
from PyQt6.QtWidgets import QHBoxLayout, QLabel, QVBoxLayout, QWidget

from ..code_editor import CodeEditor, linguagem_do_arquivo
from ..widgets import ActionButton, BackgroundMixin, ThemeButton

PASTA_FIRMWARE = Path(r"C:\Dev-AHS\AUTOMACAO_IOT\firmware")


def pasta_inicial():
    """Onde o seletor de arquivo começa: a pasta firmware; se não existir, C:\ (ou a pasta do usuário fora do Windows)."""
    for pasta in (PASTA_FIRMWARE, Path("C:/")):
        if pasta.is_dir():
            return str(pasta)
    return str(Path.home())


class EditarAutomacoesEspScreen(BackgroundMixin, QWidget):
    """Editar Automações ESP: editor de código de um arquivo (.cpp, .h, .ini...) com SALVAR e CANCELAR."""
    fechou = pyqtSignal()

    def __init__(self, caminho):
        super().__init__()
        self.setObjectName("root")
        self._caminho = Path(caminho)
        self._crlf = False

        root = QVBoxLayout(self)
        root.setContentsMargins(32, 20, 32, 24)
        root.setSpacing(10)
        top = QHBoxLayout()
        title = QLabel(f"Editar Automações ESP  —  {self._caminho.name}")
        title.setObjectName("title")
        top.addWidget(title)
        top.addStretch()
        top.addWidget(ThemeButton())
        root.addLayout(top)
        onde = QLabel(str(self._caminho))
        onde.setObjectName("muted")
        root.addWidget(onde)

        self.editor = CodeEditor(linguagem_do_arquivo(self._caminho))  # visual de editor de código (cores do VS Code)
        root.addWidget(self.editor, 1)

        self.status = QLabel("")
        self.status.setObjectName("muted")
        root.addWidget(self.status)
        botoes = QHBoxLayout()
        self.btn_salvar = ActionButton("SALVAR", "success")
        self.btn_salvar.setShortcut(QKeySequence("Ctrl+S"))
        self.btn_cancelar = ActionButton("CANCELAR", "danger")
        self.btn_salvar.clicked.connect(self.salvar)
        self.btn_cancelar.clicked.connect(self.close)
        botoes.addWidget(self.btn_salvar, 1)
        botoes.addWidget(self.btn_cancelar, 1)
        root.addLayout(botoes)

        self._abrir()
        self.editor.document().modificationChanged.connect(self._marcar)

    def _abrir(self):
        try:
            bruto = self._caminho.read_bytes()
            texto = bruto.decode("utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            self.editor.setReadOnly(True)
            self.btn_salvar.setEnabled(False)
            self.status.setText(f"Não foi possível abrir este arquivo como texto: {exc}")
            return
        self._crlf = b"\r\n" in bruto  # mantém o fim de linha original ao salvar
        self.editor.setPlainText(texto)
        self.editor.document().setModified(False)
        self.status.setText("Arquivo aberto.")

    def _marcar(self, alterado):
        self.status.setText("Alterado: falta salvar." if alterado else "Salvo.")

    def tem_alteracao(self):
        return self.editor.document().isModified()

    def salvar(self):
        texto = self.editor.toPlainText()
        if self._crlf:
            texto = texto.replace("\n", "\r\n")
        try:
            self._caminho.write_bytes(texto.encode("utf-8"))
        except OSError as exc:
            self.status.setText(f"Erro ao salvar: {exc}")
            return
        self.editor.document().setModified(False)
        self.status.setText(f"Salvo em {self._caminho}")

    def closeEvent(self, event):
        super().closeEvent(event)
        self.fechou.emit()  # CANCELAR (ou o X) fecha sem salvar o que não foi salvo
