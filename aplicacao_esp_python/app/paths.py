import sys
from pathlib import Path


def resource_path(rel):
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    return base / rel


def set_windows_app_id(app_id="AHS.AUTOMACAO_IOT"):
    """Windows agrupa a janela de um script Python sob o python.exe e mostra o ícone dele na barra de tarefas.
    Dar uma identidade própria ao processo (antes de criar a QApplication) faz valer o ícone do programa."""
    if sys.platform != "win32":
        return
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(app_id)
    except Exception:
        pass


def icone_do_programa():
    """Ícone do programa: assets/icone_ia.ico (o mesmo do executável). Se o formato não carregar, usa o .png."""
    from PyQt6.QtGui import QIcon
    icone = QIcon(str(resource_path("assets/icone_ia.ico")))
    return icone if not icone.isNull() else QIcon(str(resource_path("assets/icone_ia.png")))
