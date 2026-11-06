from PyQt6.QtCore import Qt
from PyQt6.QtGui import QColor
from PyQt6.QtWidgets import (QFrame, QGraphicsDropShadowEffect, QHBoxLayout, QLabel, QMessageBox, QPushButton,
                             QScrollArea, QVBoxLayout)

from .widgets import ThemeButton

NEON = "#00b4ff"


class PainelCard(QFrame):
    """Card neon sobre a janela principal (mesmo modelo do card de Informações), com um X que fecha SÓ este card.

    O conteúdo (um formulário) é criado ao abrir. Ao fechar é destruído (o formulário encerra o que estava fazendo),
    exceto com `manter=True` (formulários que têm trabalho em andamento, como os brokers e a gravação do firmware):
    aí o card só se esconde e o formulário continua vivo; ele é encerrado de verdade ao sair do programa."""

    def __init__(self, parent, titulo, fabrica, manter=False):
        super().__init__(parent)
        self._fabrica = fabrica
        self._manter = manter
        self._conteudo = None
        self._rolagem = None
        self._fechando = False
        self.setObjectName("painelCard")
        self.setStyleSheet(f"""
            QFrame#painelCard {{ background: #08111f; border: 2px solid {NEON}; border-radius: 16px; }}
            QLabel#painelTitulo {{ color: #00d4ff; font-size: 20px; font-weight: bold; background: transparent; }}
            QPushButton#painelX {{ background: transparent; color: {NEON}; border: 1px solid {NEON}; border-radius: 8px;
                                   font-size: 16px; font-weight: bold; padding: 2px 12px; }}
            QPushButton#painelX:hover {{ background: {NEON}; color: #08111f; }}
        """)
        brilho = QGraphicsDropShadowEffect(self)
        brilho.setBlurRadius(45)
        brilho.setOffset(0, 0)
        brilho.setColor(QColor(0, 180, 255, 230))
        self.setGraphicsEffect(brilho)

        self._lay = QVBoxLayout(self)
        self._lay.setContentsMargins(22, 16, 22, 18)
        self._lay.setSpacing(8)
        topo = QHBoxLayout()
        rotulo = QLabel(titulo)
        rotulo.setObjectName("painelTitulo")
        fechar = QPushButton("✕")
        fechar.setObjectName("painelX")
        fechar.setCursor(Qt.CursorShape.PointingHandCursor)
        fechar.setToolTip("Fechar")
        fechar.clicked.connect(self.fechar)
        topo.addWidget(rotulo)
        topo.addStretch()
        topo.addWidget(fechar)
        self._lay.addLayout(topo)
        self.hide()

    # ---------- abrir ----------
    def mostrar(self):
        if self._conteudo is None:
            c = self._conteudo = self._fabrica()
            c.sem_fundo = True  # o card já tem o fundo
            for w in c.findChildren(QLabel):  # o título e o botão de tema ficam por conta do card e da janela principal
                if w.objectName() == "title":
                    w.hide()
            for w in c.findChildren(ThemeButton):
                w.hide()
            if hasattr(c, "fechou"):  # o próprio formulário pediu para fechar (ex.: CANCELAR do editor)
                c.fechou.connect(self._fechou_sozinho)
            # formulário maior que o card: aparece a barra de rolagem (a janela continua em 1024x768)
            self._rolagem = QScrollArea()
            self._rolagem.setWidgetResizable(True)
            self._rolagem.setFrameShape(QFrame.Shape.NoFrame)
            self._rolagem.setStyleSheet("QScrollArea { background: transparent; border: none; } "
                                        "QScrollArea > QWidget > QWidget { background: transparent; }")
            self._rolagem.setWidget(c)
            self._lay.addWidget(self._rolagem, 1)
        self._conteudo.show()
        self.ajustar()
        self.show()
        self.raise_()

    # ---------- fechar ----------
    def _tem_alteracao_pendente(self):
        c = self._conteudo
        return c is not None and hasattr(c, "tem_alteracao") and c.tem_alteracao()

    def pode_fechar(self):
        """Pergunta o que fazer se o formulário tem algo não salvo. False = o usuário desistiu de fechar."""
        if not self.isVisible() or not self._tem_alteracao_pendente():
            return True
        caixa = QMessageBox(self.window())
        caixa.setWindowTitle("Alterações não salvas")
        caixa.setText("Há alterações não salvas. O que fazer?")
        salvar = caixa.addButton("Salvar", QMessageBox.ButtonRole.AcceptRole)
        descartar = caixa.addButton("Descartar", QMessageBox.ButtonRole.DestructiveRole)
        caixa.addButton("Cancelar", QMessageBox.ButtonRole.RejectRole)
        caixa.exec()
        if caixa.clickedButton() is salvar:
            self._conteudo.salvar()
            return not self._tem_alteracao_pendente()  # se não conseguiu salvar, não fecha
        return caixa.clickedButton() is descartar

    def fechar(self):
        """X do card (ou troca de formulário). Devolve False se o usuário cancelou."""
        if not self.pode_fechar():
            return False
        self.encerrar(destruir=not self._manter)
        return True

    def _fechou_sozinho(self):
        if not self._fechando:
            self.encerrar(destruir=True)

    def encerrar(self, destruir=True):
        """Esconde o card; com destruir=True também fecha e apaga o formulário (encerra o que ele fazia)."""
        self.hide()
        c = self._conteudo
        if c is None or not destruir or self._fechando:
            return
        self._fechando = True
        try:
            c.close()
            self._lay.removeWidget(self._rolagem)
            self._rolagem.deleteLater()  # apaga junto o formulário
            self._rolagem = None
            self._conteudo = None
        finally:
            self._fechando = False

    def ajustar(self):
        """Ocupa a janela abaixo da barra de menu."""
        janela = self.parentWidget()
        topo = janela.menuBar().height() + 22 if hasattr(janela, "menuBar") else 22
        largura = janela.width() - 60
        altura = max(200, janela.height() - topo - 30)
        self.setGeometry((janela.width() - largura) // 2, topo, largura, altura)
