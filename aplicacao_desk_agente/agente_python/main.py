"""Agente leve: fica escondido na bandeja do Windows. Ícone verde = conectado ao Firebase, vermelho = sem conexão.
Sem janelas nem controles (só o menu "Sair").

  Render_Agente.exe                      normal (bandeja)
  Render_Agente.exe --sem-bandeja        sem ícone (testes)
  Render_Agente.exe --config arq.json    usa outro arquivo de configuração
  Render_Agente.exe --iniciar-com-windows / --nao-iniciar-com-windows
"""
import argparse
import ctypes
import logging
import logging.handlers
import sys
import threading
import time

import config
import recursos
from agente import Agente

NOME_REGISTRO = "AutomacaoIOTAmaury-Agente"


def uma_instancia():
    ctypes.windll.kernel32.CreateMutexW(None, False, "Global\\AgenteLeveAutomacaoIOTAmaury")
    return ctypes.windll.kernel32.GetLastError() != 183  # 183 = já existe outro rodando


def iniciar_com_windows(ligar):
    import winreg
    chave = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE)
    if ligar:
        exe = sys.executable if getattr(sys, "frozen", False) else f'"{sys.executable}" "{__file__}"'
        winreg.SetValueEx(chave, NOME_REGISTRO, 0, winreg.REG_SZ, f'"{exe}"' if getattr(sys, "frozen", False) else exe)
    else:
        try:
            winreg.DeleteValue(chave, NOME_REGISTRO)
        except FileNotFoundError:
            pass


def log_em_arquivo():
    pasta = config.pasta_dados()
    pasta.mkdir(parents=True, exist_ok=True)
    h = logging.handlers.RotatingFileHandler(pasta / "agente.log", maxBytes=1_000_000, backupCount=2, encoding="utf-8")
    h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logging.basicConfig(level=logging.INFO, handlers=[h])


def bandeja(agente):
    import pystray
    from PIL import Image, ImageDraw

    base = Image.open(recursos.caminho("icone.png")).convert("RGBA").resize((64, 64), Image.LANCZOS)

    def imagem(cor):
        img = base.copy()
        ImageDraw.Draw(img).ellipse((34, 34, 62, 62), fill=cor, outline=(255, 255, 255, 255), width=3)
        return img

    verde, vermelho = imagem((46, 204, 113, 255)), imagem((231, 76, 60, 255))
    icone = pystray.Icon("agente", vermelho, "Agente: conectando…", menu=pystray.Menu(
        pystray.MenuItem("Sair", lambda i, _: i.stop())))

    def atualizar():
        antes = None
        while icone.visible is not False:
            ok = agente.conectado
            if ok != antes:
                icone.icon = verde if ok else vermelho
                icone.title = f"{agente.cfg['maquina']}: {'conectado' if ok else 'sem conexão'}"
                antes = ok
            time.sleep(2)

    icone.run(setup=lambda i: (setattr(i, "visible", True), threading.Thread(target=atualizar, daemon=True).start()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config")
    ap.add_argument("--sem-bandeja", action="store_true")
    ap.add_argument("--iniciar-com-windows", action="store_true")
    ap.add_argument("--nao-iniciar-com-windows", action="store_true")
    a = ap.parse_args()

    if a.iniciar_com_windows or a.nao_iniciar_com_windows:
        iniciar_com_windows(a.iniciar_com_windows)
        return
    if not uma_instancia():
        return
    log_em_arquivo()

    cfg = config.carregar(a.config)
    if not config.completa(cfg):
        cfg = config.perguntar(cfg)
        if not cfg or not config.completa(cfg):
            return
        config.salvar(cfg, a.config)

    agente = Agente(cfg)
    agente.iniciar()
    try:
        if a.sem_bandeja:
            while True:
                time.sleep(1)
        else:
            bandeja(agente)
    except KeyboardInterrupt:
        pass
    finally:
        agente.parar()


if __name__ == "__main__":
    main()
