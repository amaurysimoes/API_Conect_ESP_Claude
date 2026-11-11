"""Teste do módulo CLP EtherNet/IP contra um equipamento SIMULADO (nada de CLP real). Rodar nesta pasta:
  .venv\\Scripts\\python.exe teste_clp.py
"""
import json
import sys
import time

import acoes_clp
import clp_eip
from clp_adaptador_falso import AdaptadorFalso

ok = 0


def confere(cond, msg):
    global ok
    if not cond:
        print("FALHOU:", msg)
        sys.exit(1)
    ok += 1
    print("OK", msg)


def erro(fn, params, trecho):
    try:
        fn(params)
    except acoes_clp.ErroAcao as e:
        confere(trecho in str(e), f"erro esperado '{trecho}' -> {e}")
        return
    confere(False, f"deveria falhar com '{trecho}'")


def estado():
    return json.loads(acoes_clp.clp_estado({}))


def bit(b, h):
    return clp_eip.testar_bit(bytes.fromhex(h), b, 512)


adap = AdaptadorFalso(24818, 24819, forcadas=bytes([0x00, 0x08])).iniciar()
cfg = {"clp_ativo": False}
acoes_clp.iniciar(cfg, None)
acoes_clp.config.salvar = lambda *a, **k: None   # o teste não grava o config.json de verdade
base = {"ip": "127.0.0.1", "porta_tcp": 24818, "porta_udp": 22222, "multicast": False, "primeiro_bit": 512}
try:
    confere(acoes_clp.nomes_acoes() == [], "checkbox desligado: nenhuma ação CLP é anunciada no status")
    erro(acoes_clp.clp_conectar, base, "Ativar Conexao CLP")
    acoes_clp.definir_ativo(True)
    confere("clp_conectar" in acoes_clp.nomes_acoes() and len(acoes_clp.nomes_acoes()) == 6, "checkbox ligado: 6 ações anunciadas")

    erro(acoes_clp.clp_conectar, {**base, "ip": "8.8.8.8"}, "rede local")
    erro(acoes_clp.clp_conectar, {**base, "ip": "abc"}, "IPv4")
    erro(acoes_clp.clp_bit, {"bit": 512, "modo": "set"}, "não conectado")

    ident = acoes_clp.clp_identificar({"ip": "127.0.0.1", "porta_tcp": 24818})
    confere("SIMULADOR EtherNet/IP" in ident and "Vendor 1" in ident, "Identificar: " + ident)

    adap.recusar = (0x01, [0x0106])
    erro(acoes_clp.clp_conectar, base, "outro scanner")
    confere(estado()["conectado"] is False, "falha no Forward Open deixa desconectado")

    r = acoes_clp.clp_conectar(base)
    confere("Conectado a 127.0.0.1" in r and "512 a 767" in r, "Conectar: " + r)
    time.sleep(0.5)
    e = estado()
    confere(e["conectado"] and e["rx"] > 5 and e["tx"] > 5, f"I/O cíclico rodando (tx={e['tx']}, rx={e['rx']})")
    confere(bit(523, e["entrada"]) and not bit(512, e["entrada"]), "bit que o equipamento liga sozinho (523) aparece na entrada")

    acoes_clp.clp_bit({"bit": 512, "modo": "set"})
    time.sleep(0.3)
    confere(bit(512, estado()["saida"]) and bit(512, estado()["entrada"]) and adap.recebido[0] & 1, "set 512: saída, eco e equipamento recebeu")
    acoes_clp.clp_bit({"bit": 512, "modo": "reset"})
    time.sleep(0.3)
    confere(not bit(512, estado()["saida"]) and not adap.recebido[0] & 1, "reset 512")
    t = acoes_clp.clp_bit({"bit": 515})
    confere("ON (alternar)" in t and bit(515, estado()["saida"]), "alternar liga")
    t = acoes_clp.clp_bit({"bit": 515})
    confere("OFF (alternar)" in t and not bit(515, estado()["saida"]), "alternar desliga")
    t0 = time.time()
    acoes_clp.clp_bit({"bit": 520, "modo": "pulso", "pulso_ms": 400})
    confere(0.35 < time.time() - t0 < 1.2 and not bit(520, estado()["saida"]), "pulso de 400 ms volta a zero")
    erro(acoes_clp.clp_bit, {"bit": 511, "modo": "set"}, "fora da área")
    erro(acoes_clp.clp_bit, {"bit": 768, "modo": "set"}, "fora da área")
    erro(acoes_clp.clp_bit, {"modo": "set"}, "falta o parâmetro")
    erro(acoes_clp.clp_bit, {"bit": 512, "modo": "voar"}, "modo desconhecido")

    cfg["clp_faixa"] = [512, 519]
    erro(acoes_clp.clp_bit, {"bit": 530, "modo": "set"}, "faixa liberada")
    acoes_clp.clp_bit({"bit": 519, "modo": "set"})
    confere(True, "faixa liberada no agente respeitada")
    del cfg["clp_faixa"]

    acoes_clp.clp_zerar({})
    time.sleep(0.2)
    confere(not any(bytes.fromhex(estado()["saida"])), "zerar todas as saídas")

    acoes_clp.clp_desconectar({})
    time.sleep(0.2)
    confere(estado()["conectado"] is False and adap.forward_closes >= 1, "desconectar envia Forward Close")

    # conexão cai sozinha quando o equipamento some
    acoes_clp.clp_conectar(base)
    adap.parar()
    for _ in range(40):
        time.sleep(0.25)
        if not estado()["conectado"]:
            break
    e = estado()
    confere(e["conectado"] is False and "Conexão perdida" in e["perdida"], "equipamento some: " + e["perdida"])

    acoes_clp.definir_ativo(False)
    confere(acoes_clp.nomes_acoes() == [], "desmarcar o checkbox esconde as ações")
finally:
    acoes_clp.encerrar()
    adap.parar()
print(f"\n{ok} verificações passaram.")
