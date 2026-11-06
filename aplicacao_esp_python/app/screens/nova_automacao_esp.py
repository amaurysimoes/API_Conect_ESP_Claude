from PyQt6.QtWidgets import QHBoxLayout, QLabel, QVBoxLayout, QWidget

from ..widgets import BackgroundMixin, ThemeButton


class NovaAutomacaoEspScreen(BackgroundMixin, QWidget):
    """Nova Automação ESP_Firebase: formulário reservado, em branco por enquanto."""

    def __init__(self):
        super().__init__()
        self.setObjectName("root")
        root = QVBoxLayout(self)
        root.setContentsMargins(32, 20, 32, 24)
        top = QHBoxLayout()
        title = QLabel("Nova Automação ESP_Firebase")
        title.setObjectName("title")
        top.addWidget(title)
        top.addStretch()
        top.addWidget(ThemeButton())
        root.addLayout(top)
        root.addStretch()
