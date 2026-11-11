from pathlib import Path

from PyQt6.QtGui import QAction, QKeySequence
from PyQt6.QtWidgets import QApplication, QFileDialog, QMainWindow

from .screens.firebase import FirebaseScreen
from .info_card import InfoCard
from .screens.editar_automacoes_esp import EditarAutomacoesEspScreen, pasta_inicial
from .screens.listar_rtdb import ListarRtdbScreen
from .screens.repetidor import RepetidorScreen
from .painel_card import PainelCard
from .screens.site_fire import SiteFireScreen
from .widgets import BackgroundMixin, ThemeButton

APP_NAME = "Automacao_IOT-ESP"
FORM_SIZE = (1024, 768)  # tamanho inicial dos formulários


class MainWindow(BackgroundMixin, QMainWindow):
    """Janela principal: só a barra de menu (Arquivo | Automação IOT Site | Informações do Sistema).
    TODOS os formulários abrem DENTRO desta janela, num card neon (modelo do card de Informações), cada um com seu X.
    Só um fica aberto por vez: abrir outro fecha o atual (se houver algo não salvo, pergunta antes)."""

    def __init__(self):
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self._paineis = {}
        self._atual = None  # card aberto agora

        bar = self.menuBar()
        arquivo = bar.addMenu("Arquivo")
        esp = arquivo.addMenu("Automação ESP_Firebase")
        esp.addAction("Automação Firebase", lambda: self._painel("firebase", "Automação Firebase", FirebaseScreen, manter=True))
        esp.addAction("Repetidor ESP32", lambda: self._painel("repetidor", "Repetidor ESP32", RepetidorScreen))
        arquivo.addAction("Editar Automações ESP", self._editar_esp)
        arquivo.addSeparator()
        sair = QAction("Sair", self)
        sair.setShortcut(QKeySequence("Ctrl+Q"))
        sair.triggered.connect(self.close)
        arquivo.addAction(sair)
        monitor = bar.addMenu("Automação IOT Site")
        monitor.addAction("Site Gerenciamento IOT", lambda: self._painel("site", "Site Gerenciamento IOT", SiteFireScreen))
        monitor.addAction("Listar Real Time Database", lambda: self._painel("rtdb", "Listar Real Time Database", ListarRtdbScreen))
        bar.addAction("Informações do Sistema", self._mostrar_info)
        self._info = InfoCard(self)
        bar.setCornerWidget(ThemeButton())

        self.resize(*FORM_SIZE)  # 1024 x 768; sem card aberto, só a barra de menu

    def _mostrar_info(self):
        if self._trocar_para(self._info):
            self._info.mostrar()  # card azul neon sobre a janela principal

    def _trocar_para(self, novo):
        """Fecha o card que está aberto (se for outro). False = o usuário desistiu (havia algo não salvo)."""
        atual = self._atual
        if atual is not None and atual is not novo and atual.isVisible() and not atual.fechar():
            return False
        self._atual = novo
        return True

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if hasattr(self, "_info") and self._info.isVisible():
            self._info.ajustar()
        for painel in getattr(self, "_paineis", {}).values():
            if painel.isVisible():
                painel.ajustar()

    def _painel(self, chave, titulo, fabrica, manter=False):
        """Abre um formulário num card sobre esta janela, fechando o que estava aberto.
        manter=True: formulário com trabalho em andamento (gravação): fechar só esconde, não encerra."""
        painel = self._paineis.get(chave)
        if painel is None:
            painel = self._paineis[chave] = PainelCard(self, titulo, fabrica, manter)
        if not self._trocar_para(painel):
            return
        painel.mostrar()

    def _editar_esp(self):
        """Escolhe o arquivo (começa em ...\\firmware; se não existir, em C:\\) e abre o editor de código num card."""
        caminho, _ = QFileDialog.getOpenFileName(self, "Escolha o arquivo para editar", pasta_inicial(),
                                                 "Código (*.cpp *.h *.ino *.ini *.c);;Todos os arquivos (*)")
        if caminho:
            self._painel(f"editar:{caminho}", f"Editar Automações ESP  —  {Path(caminho).name}",
                         lambda: EditarAutomacoesEspScreen(caminho))

    def closeEvent(self, event):
        for painel in self._paineis.values():  # algo não salvo? pergunta antes de sair
            if painel.isVisible() and not painel.pode_fechar():
                event.ignore()
                return
        for painel in self._paineis.values():  # encerra de verdade os formulários (serial, gravação)
            painel.encerrar(destruir=True)
        QApplication.closeAllWindows()
        super().closeEvent(event)


def center(widget):
    frame = widget.frameGeometry()
    frame.moveCenter(widget.screen().availableGeometry().center())
    widget.move(frame.topLeft())
