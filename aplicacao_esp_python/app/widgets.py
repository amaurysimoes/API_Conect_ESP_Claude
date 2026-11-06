"""Componentes visuais reutilizáveis (sem efeitos animados)."""
from PyQt6.QtCore import QEvent, QPointF, Qt
from PyQt6.QtGui import QColor, QPainter, QPixmap
from PyQt6.QtWidgets import QFrame, QGraphicsDropShadowEffect, QPushButton

from .paths import resource_path
from .theme import theme

_BG_FILES = {True: "assets/background_iot.jpg", False: "assets/background_iot_l.jpg"}  # dark / light
_bg_source = {}  # tema escuro? -> imagem original, carregada uma vez
_bg_cache = {}   # (escuro?, largura, altura) em pixels físicos -> imagem já escalada


def _background(width, height):
    """Imagem de fundo do tema atual cobrindo (width x height), sem distorcer: escala até cobrir e corta o
    excesso, ancorada embaixo à direita (onde fica o texto 'Automação IOT')."""
    dark = theme.is_dark
    if dark not in _bg_source:
        _bg_source[dark] = QPixmap(str(resource_path(_BG_FILES[dark])))
    source = _bg_source[dark]
    if source.isNull() or width <= 0 or height <= 0:
        return None
    key = (dark, width, height)
    if key not in _bg_cache:
        if len(_bg_cache) > 8:
            _bg_cache.clear()
        scaled = source.scaled(width, height, Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                               Qt.TransformationMode.SmoothTransformation)
        _bg_cache[key] = scaled.copy(scaled.width() - width, scaled.height() - height, width, height)
    return _bg_cache[key]


class BackgroundMixin:
    """Pinta o background do tema no fundo da janela (Dark: background_iot.jpg, Light: background_iot_l.jpg),
    responsivo ao tamanho. Usar antes do QWidget/QMainWindow/QDialog na herança."""

    def paintEvent(self, event):
        if getattr(self, "sem_fundo", False):  # dentro de um card da janela principal: o card já tem o fundo
            return
        painter = QPainter(self)
        dpr = self.devicePixelRatioF()
        pm = _background(round(self.width() * dpr), round(self.height() * dpr))
        if pm is None:
            painter.fillRect(self.rect(), QColor(theme.colors["bg"]))
        else:
            pm.setDevicePixelRatio(dpr)
            painter.drawPixmap(QPointF(0, 0), pm)
        painter.end()


def _brilho(widget, raio):
    """Brilho (glow) neon em volta do widget; a cor é ajustada depois por `_cor_do_brilho`."""
    efeito = QGraphicsDropShadowEffect(widget)
    efeito.setBlurRadius(raio)
    efeito.setOffset(0, 0)
    widget.setGraphicsEffect(efeito)
    return efeito


class Card(QFrame):
    """Card com borda e brilho neon azul."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("card")
        self._brilho = _brilho(self, 26)
        self._atualizar_brilho()
        theme.changed.connect(self._atualizar_brilho)

    def _atualizar_brilho(self):
        cor = QColor(theme.neon("primary"))
        cor.setAlpha(150 if theme.is_dark else 90)
        self._brilho.setColor(cor)


class ActionButton(QPushButton):
    """Botão neon: contorno e texto na cor do tipo (primary azul, success verde, danger vermelho), com brilho."""

    def __init__(self, text, kind="primary", parent=None):
        super().__init__(text, parent)
        self._kind = kind
        self.setObjectName(kind)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self._brilho = _brilho(self, 22)
        self._atualizar_brilho()
        theme.changed.connect(self._atualizar_brilho)

    def set_kind(self, kind):
        self._kind = kind
        self.setObjectName(kind)
        self.style().unpolish(self)
        self.style().polish(self)
        self._atualizar_brilho()

    def _atualizar_brilho(self):
        cor = QColor(theme.neon(self._kind))
        cor.setAlpha(230 if theme.is_dark else 150)
        self._brilho.setColor(cor)
        self._brilho.setEnabled(self.isEnabled())

    def changeEvent(self, event):
        super().changeEvent(event)
        if event.type() == QEvent.Type.EnabledChange:
            self._brilho.setEnabled(self.isEnabled())  # desabilitado: sem brilho


class ThemeButton(QPushButton):
    """Alterna escuro/claro. O texto indica o modo para o qual vai trocar."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("themeBtn")
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.clicked.connect(theme.toggle)
        self._brilho = _brilho(self, 20)
        theme.changed.connect(self._refresh)
        self._refresh()

    def _refresh(self):
        self.setText("☀  Light" if theme.is_dark else "☾  Dark")
        cor = QColor(theme.neon("primary"))
        cor.setAlpha(230 if theme.is_dark else 150)
        self._brilho.setColor(cor)
