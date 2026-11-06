"""Manda um comando a um agente, para testar (ou para usar na linha de comando).

MQTT (texto simples, como se você escrevesse no broker):
  python enviar_comando.py mqtt --host 192.168.0.10 --usuario iot --senha SENHA --maquina MEU_PC explorer
  python enviar_comando.py mqtt --host 192.168.0.10 --usuario iot --senha SENHA --maquina MEU_PC "explorer C:\\Users"

Firebase:
  python enviar_comando.py firebase --broker FIRE_MEU_PC --maquina MEU_PC abrir_explorer
  python enviar_comando.py firebase --broker FIRE_MEU_PC --maquina MEU_PC desligar --confirmar

Ações: abrir_explorer [caminho] | abrir_programa nome | abrir_url url | bloquear_tela | desligar | reiniciar | info_sistema
"""
import argparse
import json
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agente_core import config, nucleo  # noqa: E402
from agente_core.canal_firebase import requisitar  # noqa: E402

ARGUMENTO = {"abrir_explorer": "caminho", "abrir_programa": "nome", "abrir_url": "url"}


def main():
    ap = argparse.ArgumentParser(description="Envia um comando ao agente")
    ap.add_argument("canal", choices=["mqtt", "firebase"])
    ap.add_argument("comando", nargs="+", help="ação e, se houver, o argumento (ex.: abrir_url https://...)")
    ap.add_argument("--maquina", required=True)
    ap.add_argument("--host"), ap.add_argument("--porta", type=int, default=1883)
    ap.add_argument("--usuario"), ap.add_argument("--senha")
    ap.add_argument("--broker", help="nome do broker no Firebase")
    ap.add_argument("--confirmar", action="store_true", help="confirma desligar/reiniciar")
    ap.add_argument("--esperar", type=int, default=8, help="segundos esperando o resultado")
    a = ap.parse_args()

    if a.canal == "mqtt":
        import paho.mqtt.client as mqtt
        texto = " ".join(a.comando) + (" confirmar" if a.confirmar else "")
        recebido = []
        c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"enviar-{uuid.uuid4().hex[:6]}")
        c.username_pw_set(a.usuario, a.senha)
        c.on_connect = lambda cl, u, f, rc, p=None: cl.subscribe(f"casa/{a.maquina}/result", qos=1)
        c.on_message = lambda cl, u, m: recebido.append(m.payload.decode("utf-8", "replace"))
        c.connect(a.host, a.porta)
        c.loop_start()
        time.sleep(1)
        c.publish(f"casa/{a.maquina}/cmd", texto, qos=1)
        fim = time.time() + a.esperar
        while time.time() < fim and not recebido:
            time.sleep(0.2)
        c.loop_stop()
        print(recebido[0] if recebido else "(sem resposta: o agente está ligado e observando este broker?)")
        return

    acao = nucleo.ALIASES.get(a.comando[0].lower(), a.comando[0])
    params = {}
    if len(a.comando) > 1 and acao in ARGUMENTO:
        params[ARGUMENTO[acao]] = " ".join(a.comando[1:])
    if a.confirmar:
        params["confirmado"] = True
    id_, ts = uuid.uuid4().hex[:12], nucleo.agora_ms()
    cmd = {"acao": acao, "parametros": params, "ts": ts}
    base = f"brokers/{a.broker}/maquinas/{a.maquina}"
    requisitar(config.DB_URL, "PUT", f"{base}/comandos/{id_}", cmd)
    fim = time.time() + a.esperar
    while time.time() < fim:
        r = requisitar(config.DB_URL, "GET", f"{base}/resultado/{id_}")
        if r:
            print(json.dumps(r, ensure_ascii=False))
            return
        time.sleep(0.5)
    print("(sem resposta: o agente está ligado e observando este broker do Firebase?)")


if __name__ == "__main__":
    main()
