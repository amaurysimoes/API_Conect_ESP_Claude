"""Configuração do agente leve: um JSON em %LOCALAPPDATA%. Na primeira vez uma janelinha pergunta os 3 dados."""
import json
import os
import socket
import sys
from pathlib import Path

PADRAO = {
    "firebase": "https://amauryesp-active-default-rtdb.firebaseio.com",
    "broker": "AMAURY_01",   # onde a máquina se cadastra: brokers/<broker>/maquinas/<maquina>
    "maquina": "",           # nome desta máquina (vazio = nome do Windows)
    "chave": "",             # a MESMA AGENTE_CHAVE do Render: só comandos assinados com ela são obedecidos
}


def pasta_dados():
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home()))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "AutomacaoIOTAmaury-Agente"


def arquivo(caminho=None):
    return Path(caminho) if caminho else pasta_dados() / "config.json"


def carregar(caminho=None):
    cfg = dict(PADRAO)
    try:
        cfg.update(json.loads(arquivo(caminho).read_text(encoding="utf-8-sig")))
    except (OSError, ValueError):
        pass
    cfg["maquina"] = cfg["maquina"].strip() or socket.gethostname()
    return cfg


def salvar(cfg, caminho=None):
    a = arquivo(caminho)
    a.parent.mkdir(parents=True, exist_ok=True)
    a.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


def completa(cfg):
    return bool(cfg["chave"] and cfg["broker"] and cfg["maquina"])


def perguntar(cfg):
    """Janelinha da primeira execução. Devolve a config preenchida, ou None se o usuário fechar."""
    try:
        import tkinter as tk
    except ImportError:                                  # Linux sem python3-tk: pergunta no terminal
        return _perguntar_terminal(cfg)

    resultado = {}
    import ctypes
    import recursos

    FUNDO, CARD, TEXTO, SUAVE, AZUL = "#0f1115", "#171a21", "#e6e8ee", "#9aa3b2", "#4c8dff"
    raiz = tk.Tk()
    raiz.title("Agente Automacao IOT Amaury")
    raiz.resizable(False, False)
    raiz.configure(bg=FUNDO)
    try:
        raiz.iconbitmap(recursos.caminho("icone.ico"))
    except tk.TclError:
        pass
    try:  # barra de título escura do Windows
        raiz.update()
        ctypes.windll.dwmapi.DwmSetWindowAttribute(ctypes.windll.user32.GetParent(raiz.winfo_id()), 20, ctypes.byref(ctypes.c_int(1)), 4)
    except Exception:  # noqa: BLE001
        pass
    campos = {}
    for i, (rotulo, chave, oculto) in enumerate([("Nome desta máquina", "maquina", False), ("Broker", "broker", False),
                                                  ("Chave (o MCP_TOKEN do Render)", "chave", True)]):
        tk.Label(raiz, text=rotulo, anchor="w", bg=FUNDO, fg=SUAVE).grid(row=i, column=0, sticky="w", padx=10, pady=6)
        e = tk.Entry(raiz, width=38, show="*" if oculto else "", bg=CARD, fg=TEXTO, insertbackground=TEXTO, relief="flat",
                     highlightthickness=1, highlightbackground="#2a2f3a", highlightcolor=AZUL)
        e.insert(0, cfg.get(chave, ""))
        e.grid(row=i, column=1, padx=10, pady=6)
        campos[chave] = e

    def ok():
        resultado.update({k: e.get().strip() for k, e in campos.items()})
        raiz.destroy()

    tk.Button(raiz, text="Salvar e iniciar", command=ok, bg=AZUL, fg="white", activebackground="#6aa2ff", activeforeground="white",
              relief="flat", padx=16, pady=6, cursor="hand2").grid(row=3, column=0, columnspan=2, pady=12)
    raiz.protocol("WM_DELETE_WINDOW", raiz.destroy)
    raiz.mainloop()
    if not resultado:
        return None
    return {**cfg, **resultado}


def _perguntar_terminal(cfg):
    """Sem janela (sem tkinter): pergunta no terminal. Sem terminal, avisa como configurar e sai."""
    if not (sys.stdin and sys.stdin.isatty()):
        sys.stderr.write(f"Agente sem configuração. Crie {arquivo()} com maquina, broker e chave, ou rode em um terminal.\n")
        return None
    def ler(rotulo, atual):
        v = input(f"{rotulo} [{atual}]: ").strip()
        return v or atual
    return {**cfg, "maquina": ler("Nome desta máquina", cfg.get("maquina", "")), "broker": ler("Broker", cfg.get("broker", "")),
            "chave": ler("Chave (o MCP_TOKEN do Render)", cfg.get("chave", ""))}
