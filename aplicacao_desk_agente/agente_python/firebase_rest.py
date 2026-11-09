"""Realtime Database por REST (sem SDK): só urllib, para o agente ficar leve."""
import json
import urllib.request

SERVER_TS = {".sv": "timestamp"}  # o servidor do Firebase grava o horário


def requisitar(url_base, metodo, caminho, dados=None, timeout=8):
    corpo = None if dados is None else json.dumps(dados).encode("utf-8")
    req = urllib.request.Request(f"{url_base.rstrip('/')}/{caminho.strip('/')}.json", data=corpo, method=metodo,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8") or "null")
