"""Configuração do agente leve: um JSON em %LOCALAPPDATA%. Na primeira vez uma janelinha pergunta os 3 dados."""
import json
import os
import socket
from pathlib import Path

PADRAO = {
    "firebase": "https://amauryesp-active-default-rtdb.firebaseio.com",
    "broker": "AMAURY_01",   # onde a máquina se cadastra: brokers/<broker>/maquinas/<maquina>
    "maquina": "",           # nome desta máquina (vazio = nome do Windows)
    "chave": "",             # a MESMA AGENTE_CHAVE do Render: só comandos assinados com ela são obedecidos
}


def pasta_dados():
    return Path(os.environ.get("LOCALAPPDATA", Path.home())) / "AutomacaoIOTAmaury-Agente"


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
    import tkinter as tk

    resultado = {}
    raiz = tk.Tk()
    raiz.title("Agente Automacao IOT Amaury")
    raiz.resizable(False, False)
    campos = {}
    for i, (rotulo, chave, oculto) in enumerate([("Nome desta máquina", "maquina", False), ("Broker", "broker", False),
                                                  ("Chave (AGENTE_CHAVE do Render)", "chave", True)]):
        tk.Label(raiz, text=rotulo, anchor="w").grid(row=i, column=0, sticky="w", padx=10, pady=6)
        e = tk.Entry(raiz, width=38, show="*" if oculto else "")
        e.insert(0, cfg.get(chave, ""))
        e.grid(row=i, column=1, padx=10, pady=6)
        campos[chave] = e

    def ok():
        resultado.update({k: e.get().strip() for k, e in campos.items()})
        raiz.destroy()

    tk.Button(raiz, text="Salvar e iniciar", command=ok).grid(row=3, column=0, columnspan=2, pady=10)
    raiz.protocol("WM_DELETE_WINDOW", raiz.destroy)
    raiz.mainloop()
    if not resultado:
        return None
    return {**cfg, **resultado}
