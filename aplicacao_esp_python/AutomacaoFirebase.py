import sys

from PyQt6.QtGui import QIcon
from PyQt6.QtWidgets import QApplication

from app.screens.firebase import FirebaseScreen
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
    win = FirebaseScreen()
    win.setWindowIcon(icon)
    win.setWindowTitle("AHS - Automação FireBase")
    area = app.primaryScreen().availableGeometry()
    hint = win.minimumSizeHint()  # tamanho mínimo real do conteúdo: abaixo dele os blocos se sobreporiam
    win.setMinimumSize(min(hint.width(), area.width()), min(hint.height(), area.height() - 40))
    win.resize(min(1024, area.width() - 40), min(768, area.height() - 40))

    def center():
        frame = win.frameGeometry()
        frame.moveCenter(area.center())
        win.move(frame.topLeft())

    center()
    win.show()
    center()  # de novo com a moldura da janela já calculada
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
