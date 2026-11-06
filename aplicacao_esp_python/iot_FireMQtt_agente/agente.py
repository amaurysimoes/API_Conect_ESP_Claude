"""Agente IOT: roda numa máquina (Windows ou Linux), observa um broker (Firebase ou MQTT) e executa as ações da
lista branca que chegarem, UMA vez cada.

  python agente.py                  abre a tela (escolher o broker, iniciar/parar)
  python agente.py --sem-tela       usa a última configuração salva, sem janela (serviço / inicialização do Windows)
  python agente.py --simular        não executa nada de verdade (testes)
"""
import argparse
import signal
import sys
import threading
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))          # agente_core
sys.path.insert(0, str(AQUI.parent))   # app (tema e widgets do programa principal)

from agente_core import config  # noqa: E402
from agente_core.agente import Agente  # noqa: E402


def sem_tela(caminho, simular):
    log = config.configurar_log(console=True)
    cfg = config.carregar(caminho)
    problema = config.validar(cfg)
    if problema:
        log.info("Configuração incompleta: %s (abra a tela uma vez, configure e salve)", problema)
        return 1
    agente = Agente(cfg, simular=simular)
    agente.iniciar()
    parar = threading.Event()
    for sinal in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sinal, lambda *_: parar.set())
    parar.wait()
    agente.parar()
    return 0


def com_tela(caminho, simular):
    from PyQt6.QtGui import QIcon
    from PyQt6.QtWidgets import QApplication

    from app.paths import icone_do_programa, set_windows_app_id
    from app.theme import theme
    from agente_core.tela import TelaAgente

    set_windows_app_id("AHS.AGENTE_IOT")
    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    app.setStyleSheet(theme.stylesheet())
    theme.changed.connect(lambda: app.setStyleSheet(theme.stylesheet()))
    icone = icone_do_programa()
    app.setWindowIcon(icone)
    tela = TelaAgente(caminho, simular)
    tela.setWindowIcon(icone)
    area = app.primaryScreen().availableGeometry()
    tela.resize(min(1024, area.width() - 40), min(768, area.height() - 40))
    quadro = tela.frameGeometry()
    quadro.moveCenter(area.center())
    tela.move(quadro.topLeft())
    app.setQuitOnLastWindowClosed(False)  # a janela some na bandeja; só fecha por "Sair" ou pelo X
    if tela.bandeja and config.validar(tela._coletar()) is None:
        pass  # configurado: abre escondido, só o ícone ao lado do relógio
    else:
        tela.show()  # primeira vez (sem configuração) ou sem bandeja: mostra a janela
    return app.exec()


def main():
    ap = argparse.ArgumentParser(description="Agente IOT")
    ap.add_argument("--sem-tela", action="store_true", help="roda sem janela, com a configuração salva")
    ap.add_argument("--simular", action="store_true", help="não executa as ações de verdade (testes)")
    ap.add_argument("--config", help="caminho de um config.json (padrão: pasta de dados do usuário)")
    a = ap.parse_args()
    sys.exit(sem_tela(a.config, a.simular) if a.sem_tela else com_tela(a.config, a.simular))


if __name__ == "__main__":
    main()
