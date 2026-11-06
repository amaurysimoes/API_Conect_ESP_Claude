import sys

from PyQt6.QtGui import QIcon
from PyQt6.QtWidgets import QApplication

from app.main_window import MainWindow, center
from app.paths import icone_do_programa, set_windows_app_id
from app.theme import theme


def main():
    set_windows_app_id()  # ícone do programa (e não o do python) na barra de tarefas
    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    app.setStyleSheet(theme.stylesheet())
    theme.changed.connect(lambda: app.setStyleSheet(theme.stylesheet()))
    icon = icone_do_programa()
    app.setWindowIcon(icon)
    win = MainWindow()
    win.setWindowIcon(icon)
    area = app.primaryScreen().availableGeometry()
    # Ajuste para telas menores
    win.resize(min(1024, area.width() - 40), min(768, area.height() - 40))
    center(win)
    win.show()
    center(win)
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
