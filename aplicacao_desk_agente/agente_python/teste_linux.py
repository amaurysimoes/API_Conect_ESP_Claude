"""Teste de ponta a ponta do binário LINUX, sem tocar no seu Firebase: um Firebase falso (local) + o binário de verdade.
Rodar no Linux/WSL, na pasta do build:
  wsl -d Ubuntu-24.04 -- bash -c "cd ~/build_render_agente && ./.venv-linux/bin/python teste_linux.py /mnt/c/Dev-AHS/api_conect/aplicacao_desk_agente/agente_python/dist/Linux/Render_Agente"
"""
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from agente import assinar

BINARIO = sys.argv[1] if len(sys.argv) > 1 else "dist/Linux/Render_Agente"
CHAVE, PORTA = "chave-de-teste", 4590
BANCO, TRAVA = {}, threading.Lock()


def carimbo(v):
    if isinstance(v, dict):
        return int(time.time() * 1000) if v.get(".sv") == "timestamp" else {k: carimbo(x) for k, x in v.items()}
    return v


class Falso(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _partes(self):
        return [p for p in self.path.split("?")[0].replace(".json", "").split("/") if p]

    def _responder(self, valor):
        corpo = json.dumps(valor).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(corpo)

    def _pai(self, criar):
        no = BANCO
        for k in self._partes()[:-1]:
            if k not in no and not criar:
                return None
            no = no.setdefault(k, {}) if criar else no[k]
        return no

    def _corpo(self):
        n = int(self.headers.get("Content-Length") or 0)
        return carimbo(json.loads(self.rfile.read(n) or "null"))

    def do_GET(self):
        with TRAVA:
            p = self._partes()
            pai = self._pai(False)
            self._responder(BANCO if not p else (pai.get(p[-1]) if pai is not None else None))

    def do_PUT(self):
        with TRAVA:
            self._pai(True)[self._partes()[-1]] = self._corpo(); self._responder(None)

    def do_PATCH(self):
        with TRAVA:
            self._pai(True).setdefault(self._partes()[-1], {}).update(self._corpo()); self._responder(None)

    def do_DELETE(self):
        with TRAVA:
            pai = self._pai(False)
            if pai is not None:
                pai.pop(self._partes()[-1], None)
            self._responder(None)


def maquina():
    with TRAVA:
        return BANCO.get("brokers", {}).get("TESTE", {}).get("maquinas", {}).get("PC_LINUX", {})


def enviar(acao, parametros, assinado=True):
    id_ = uuid.uuid4().hex[:12]
    cmd = {"acao": acao, "parametros": parametros, "ts": int(time.time() * 1000)}
    if assinado:
        cmd["assinatura"] = assinar(CHAVE, id_, cmd)
    with TRAVA:
        BANCO.setdefault("brokers", {}).setdefault("TESTE", {}).setdefault("maquinas", {}).setdefault("PC_LINUX", {}).setdefault("comandos", {})[id_] = cmd
    for _ in range(40):
        time.sleep(0.4)
        r = maquina().get("resultado", {}).get(id_)
        if r:
            return r
    return None


def confere(cond, msg):
    print(("OK  " if cond else "FALHOU  ") + msg)
    if not cond:
        raise SystemExit(1)


servidor = ThreadingHTTPServer(("127.0.0.1", PORTA), Falso)
threading.Thread(target=servidor.serve_forever, daemon=True).start()
cfg = os.path.join(tempfile.mkdtemp(), "config.json")
open(cfg, "w").write(json.dumps({"firebase": f"http://127.0.0.1:{PORTA}", "broker": "TESTE", "maquina": "PC_LINUX", "chave": CHAVE}))
proc = subprocess.Popen([BINARIO, "--sem-bandeja", "--config", cfg], env={**os.environ, "AGENTE_MUTEX": "AgenteDeTesteLinux"},
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(40):
        time.sleep(0.5)
        if maquina().get("status", {}).get("online"):
            break
    st = maquina().get("status", {})
    confere(st.get("online") is True and isinstance(st.get("resumo", {}).get("cpu"), int), f"agente Linux online: {st.get('resumo', {}).get('host')} · {st.get('resumo', {}).get('so')}")
    confere("verificar_caminhos" in st.get("acoes", []) and "desligar" in st.get("acoes", []), "informa as ações que suporta")

    r = enviar("info", {})
    confere(r and r["ok"] and "CPU" in r["texto"], f"info: {r and r['texto']}")

    r = enviar("verificar_caminhos", {"caminhos": ["/bin/sh", "sleep", "C:\\Projetos\\sistema.exe", "programa_inexistente_xyz"]})
    v = json.loads(r["texto"])
    confere(set(v["existe"]) == {"/bin/sh", "sleep"} and len(v["falta"]) == 2, f"verificar caminhos: existe={v['existe']} falta={v['falta']}")

    r = enviar("abrir_programa", {"programa": "sleep", "argumentos": "30"})
    confere(r["ok"] and r["texto"] == "aberto: sleep", f"abrir programa: {r['texto']}")
    time.sleep(0.5)
    r = enviar("fechar_programa", {"programa": "sleep"})
    confere(r["ok"] and r["texto"].startswith("fechado: sleep"), f"fechar programa: {r['texto']}")

    r = enviar("abrir_programa", {"programa": "meu_sistema_que_nao_existe"})
    confere(not r["ok"] and "ainda não existe nesta máquina" in r["texto"], f"programa inexistente: {r['texto']}")

    r = enviar("desligar", {})
    confere(not r["ok"] and "confirmação" in r["texto"], "desligar sem confirmação é recusado")

    antes = len(maquina().get("resultado", {}))
    enviar_sem = enviar("info", {}, assinado=False)
    time.sleep(3)
    confere(enviar_sem is None and not maquina().get("comandos"), "comando sem assinatura foi descartado e não respondido")
    print("LINUX_TESTE_OK")
finally:
    proc.terminate()
    servidor.shutdown()
