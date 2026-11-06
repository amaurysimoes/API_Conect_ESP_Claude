from PyQt6.QtCore import Qt, QUrl
from PyQt6.QtGui import QDesktopServices
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWidgets import QHBoxLayout, QLabel, QVBoxLayout, QWidget

from ..widgets import ActionButton, BackgroundMixin, ThemeButton

SITE_URL = "https://amauryesp-active.web.app/"


class SiteFireScreen(BackgroundMixin, QWidget):
    """Site Gerenciamento IOT: a página da automação (hospedada no Firebase) dentro de um formulário, com um link no canto
    superior para abrir a mesma página no navegador."""

    def __init__(self, embutido=False):
        super().__init__()
        self.setObjectName("root")
        self.sem_fundo = embutido
        root = QVBoxLayout(self)
        root.setContentsMargins(16, 12, 16, 16)
        root.setSpacing(8)

        top = QHBoxLayout()
        if not embutido:  # dentro da janela principal a aba já tem o nome
            title = QLabel("Site Gerenciamento IOT")
            title.setObjectName("title")
            top.addWidget(title)
        top.addStretch()
        reload_btn = ActionButton("↻ Recarregar", "primary")
        reload_btn.clicked.connect(lambda: self.view.reload())
        browser = ActionButton("🌐 Abrir no navegador", "primary")
        browser.setToolTip(SITE_URL)
        browser.clicked.connect(lambda: QDesktopServices.openUrl(QUrl(SITE_URL)))
        top.addWidget(reload_btn)
        top.addWidget(browser)
        if not embutido:
            top.addWidget(ThemeButton())
        root.addLayout(top)

        self.view = QWebEngineView()
        self.view.setUrl(QUrl(SITE_URL))
        root.addWidget(self.view, 1)

    def closeEvent(self, event):
        self.view.setUrl(QUrl("about:blank"))  # para o que a página estiver fazendo ao fechar o formulário
        super().closeEvent(event)
