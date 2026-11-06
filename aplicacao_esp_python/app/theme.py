"""Tema escuro (padrão) / claro e stylesheet global. O tema não é persistido: sempre abre no escuro."""
from PyQt6.QtCore import QObject, pyqtSignal

from .paths import resource_path

ACCENT = "#0A84FF"
SUCCESS = "#34C759"
DANGER = "#FF3B30"
WARNING = "#FF9F0A"
CHECK_ICON = resource_path("assets/check.png").as_posix()  # "certo" branco das caixas marcadas


def _apagada(hex_cor):
    """Mesma cor, mais fraca (botão desabilitado continua com a cor do seu tipo)."""
    r, g, b = int(hex_cor[1:3], 16), int(hex_cor[3:5], 16), int(hex_cor[5:7], 16)
    return f"rgba({r}, {g}, {b}, 105)"


class Theme(QObject):
    changed = pyqtSignal()

    def __init__(self):
        super().__init__()
        self.is_dark = True

    def toggle(self):
        self.is_dark = not self.is_dark
        self.changed.emit()

    @property
    def colors(self):
        if self.is_dark:
            return {"bg": "#121212", "card": "#1c1c1e", "border": "#2c2c2e", "text": "#f2f2f7",
                    "muted": "#8e8e93", "input": "#2c2c2e", "log_bg": "#0b0b0c", "log_fg": "#7ee787",
                    "menu_fundo": "rgba(18, 18, 18, 215)", "menu_texto": "#b4b8bf", "menu_hover": "rgba(255, 255, 255, 22)", "neon_azul": "#00b4ff", "neon_verde": "#00e676", "neon_vermelho": "#ff3b5c", "neon_cinza": "#8e8e93"}
        return {"bg": "#f2f2f7", "card": "#ffffff", "border": "#d1d1d6", "text": "#1c1c1e",
                "muted": "#6e6e73", "input": "#eeeef0", "log_bg": "#ffffff", "log_fg": "#1a7f37",
                "menu_fundo": "rgba(255, 255, 255, 225)", "menu_texto": "#4a4d54", "menu_hover": "rgba(0, 0, 0, 16)", "neon_azul": "#0a84ff", "neon_verde": "#1fa84a", "neon_vermelho": "#e0244a", "neon_cinza": "#6e6e73"}

    def neon(self, kind):
        """Cor neon de um tipo de botão (primary = azul, success = verde, danger = vermelho)."""
        c = self.colors
        return {"success": c["neon_verde"], "danger": c["neon_vermelho"]}.get(kind, c["neon_azul"])

    def stylesheet(self):
        c = self.colors
        return f"""
        QWidget {{ color: {c['text']}; font-family: 'Segoe UI'; font-size: 13px; }}
        QMenuBar {{ background: {c['menu_fundo']}; border-bottom: 1px solid {c['border']}; padding: 2px 8px;
                    color: {c['menu_texto']}; font-size: 13px; }}
        QMenuBar::item {{ background: transparent; color: {c['menu_texto']}; padding: 7px 14px; margin: 0px 2px;
                          border: none; border-radius: 0px; }}
        QMenuBar::item:selected, QMenuBar::item:pressed {{ background: {c['menu_hover']}; color: {c['text']}; }}
        QMenu {{ background: {c['card']}; border: 1px solid {c['border']}; border-radius: 0px; padding: 4px;
                 color: {c['menu_texto']}; }}
        QMenu::item {{ padding: 7px 28px 7px 14px; border-radius: 0px; color: {c['menu_texto']}; }}
        QMenu::item:selected {{ background: {c['menu_hover']}; color: {c['text']}; }}
        QMenu::item:disabled {{ color: {c['muted']}; }}
        QMenu::separator {{ height: 1px; background: {c['border']}; margin: 6px 10px; }}
        QLabel {{ background: transparent; }}
        QLabel#title {{ font-size: 20px; font-weight: bold; }}
        QLabel#muted {{ color: {c['muted']}; font-size: 12px; }}
        QFrame#card {{ background: {c['card']}; border: 2px solid {c['neon_azul']}; border-radius: 14px; }}
        QLineEdit, QComboBox, QSpinBox, QDoubleSpinBox, QDateEdit, QTimeEdit, QPlainTextEdit {{
            background: {c['input']}; border: 1px solid {c['border']}; border-radius: 8px;
            padding: 7px 10px; selection-background-color: {ACCENT};
        }}
        QLineEdit:focus, QComboBox:focus, QSpinBox:focus, QDoubleSpinBox:focus, QDateEdit:focus, QTimeEdit:focus {{ border: 1px solid {ACCENT}; }}
        QLineEdit:disabled, QComboBox:disabled, QSpinBox:disabled, QDoubleSpinBox:disabled {{ color: {c['muted']}; }}
        QComboBox QAbstractItemView {{
            background: {c['card']}; border: 1px solid {c['border']};
            selection-background-color: {ACCENT}; selection-color: white; outline: 0;
        }}
        QListWidget {{
            background: {c['input']}; border: 1px solid {c['border']}; border-radius: 8px; outline: 0;
        }}
        QListWidget#nets {{ font-size: 12px; }}
        QTableWidget {{
            background: {c['input']}; border: 1px solid {c['border']}; border-radius: 8px; outline: 0;
            gridline-color: {c['border']}; font-size: 12px;
        }}
        QTableWidget::item {{ padding: 4px 8px; }}
        QTableWidget::item:selected {{ background: {ACCENT}; color: white; }}
        QHeaderView::section {{
            background: {c['card']}; color: {c['muted']}; border: none; border-bottom: 1px solid {c['border']};
            padding: 6px 8px; font-weight: bold;
        }}
        QListWidget::item {{ padding: 6px 10px; }}
        QListWidget::item:selected {{ background: {ACCENT}; color: white; }}
        QPushButton {{ background: transparent; border: 2px solid {c['neon_azul']}; border-radius: 8px;
                       padding: 8px 14px; font-weight: bold; color: {c['neon_azul']}; }}
        QPushButton:hover {{ background: {c['neon_azul']}; color: #08111f; }}
        QPushButton#primary {{ border-color: {c['neon_azul']}; color: {c['neon_azul']}; }}
        QPushButton#primary:hover {{ background: {c['neon_azul']}; color: #08111f; }}
        QPushButton#success {{ border-color: {c['neon_verde']}; color: {c['neon_verde']}; }}
        QPushButton#success:hover {{ background: {c['neon_verde']}; color: #08111f; }}
        QPushButton#danger {{ border-color: {c['neon_vermelho']}; color: {c['neon_vermelho']}; }}
        QPushButton#danger:hover {{ background: {c['neon_vermelho']}; color: #08111f; }}
        QPushButton#themeBtn {{ border-color: {c['neon_azul']}; color: {c['neon_azul']}; font-size: 13px; padding: 7px 14px; }}
        QPushButton#themeBtn:hover {{ background: {c['neon_azul']}; color: #08111f; }}
        QPushButton:disabled {{ background: transparent; border-color: {c['border']}; color: {c['muted']}; }}
        QPushButton#primary:disabled, QPushButton#themeBtn:disabled {{ border-color: {_apagada(c['neon_azul'])}; color: {_apagada(c['neon_azul'])}; }}
        QPushButton#success:disabled {{ border-color: {_apagada(c['neon_verde'])}; color: {_apagada(c['neon_verde'])}; }}
        QPushButton#danger:disabled {{ border-color: {_apagada(c['neon_vermelho'])}; color: {_apagada(c['neon_vermelho'])}; }}
        QPlainTextEdit#log {{
            background: {c['log_bg']}; color: {c['log_fg']}; border: 1px solid {c['border']};
            border-radius: 8px; font-family: Consolas; font-size: 11px; padding: 6px;
        }}
        QCheckBox {{ color: {c['muted']}; }}
        QCheckBox::indicator {{
            width: 14px; height: 14px; border-radius: 4px;
            border: 2px solid {c['muted']}; background: {c['input']};
        }}
        QCheckBox::indicator:hover {{ border-color: {ACCENT}; }}
        QCheckBox::indicator:checked {{
            background: {ACCENT}; border-color: {ACCENT}; image: url({CHECK_ICON});
        }}
        QRadioButton {{ color: {c['text']}; spacing: 6px; }}
        QRadioButton::indicator {{
            width: 14px; height: 14px; border-radius: 9px;
            border: 2px solid {c['muted']}; background: {c['input']};
        }}
        QRadioButton::indicator:hover {{ border-color: {ACCENT}; }}
        QRadioButton::indicator:checked {{
            border: 2px solid {ACCENT};
            background: qradialgradient(cx:0.5, cy:0.5, radius:0.5, fx:0.5, fy:0.5,
                stop:0 {ACCENT}, stop:0.5 {ACCENT}, stop:0.56 {c['input']}, stop:1 {c['input']});
        }}
        QScrollBar:vertical {{ background: {c['input']}; width: 14px; margin: 0; border-radius: 7px; }}
        QScrollBar::handle:vertical {{ background: {c['muted']}; min-height: 36px; border-radius: 7px; margin: 2px; }}
        QScrollBar::handle:vertical:hover {{ background: {ACCENT}; }}
        QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0; }}
        QScrollBar::add-page:vertical, QScrollBar::sub-page:vertical {{ background: transparent; }}
        QScrollBar:horizontal {{ background: {c['input']}; height: 14px; margin: 0; border-radius: 7px; }}
        QScrollBar::handle:horizontal {{ background: {c['muted']}; min-width: 36px; border-radius: 7px; margin: 2px; }}
        QScrollBar::handle:horizontal:hover {{ background: {ACCENT}; }}
        QScrollBar::add-line:horizontal, QScrollBar::sub-line:horizontal {{ width: 0; }}
        QScrollBar::add-page:horizontal, QScrollBar::sub-page:horizontal {{ background: transparent; }}
        """


theme = Theme()
