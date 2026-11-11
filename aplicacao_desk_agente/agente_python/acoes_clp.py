"""Ações de CLP / equipamentos EtherNet/IP (módulo "Conexao Socket-TCP/IP"). Só valem com o checkbox
"Ativar Conexao CLP: EtherNet/IP" marcado no menu da bandeja (config.json: "clp_ativo").
Chegam aqui apenas comandos ASSINADOS (veja agente.py). Só aceita IPs de rede privada/local.
Faixa de bits liberada (opcional): "clp_faixa": [512, 767] no config.json; fora dela o agente recusa.
"""
import ipaddress
import json
import sys
import threading
import time

import clp_eip
import config

if sys.platform == "win32":
    import acoes
else:
    import acoes_linux as acoes

ErroAcao = acoes.ErroAcao
ROTULO_MENU = "Ativar Conexao CLP: EtherNet/IP"
PULSO_MAX_MS = 5000

_cfg = {}
_arquivo = None
_scanner = None
_param = {}          # parâmetros da conexão atual (ip, primeiro_bit...)
_perdida = ""        # motivo, se a conexão caiu sozinha
_trava = threading.RLock()


def iniciar(cfg, caminho=None):
    global _cfg, _arquivo
    _cfg, _arquivo = cfg, caminho


def ativo():
    return bool(_cfg.get("clp_ativo"))


def definir_ativo(valor):
    _cfg["clp_ativo"] = bool(valor)
    try:
        config.salvar(_cfg, _arquivo)
    except OSError:
        pass
    if not valor:
        encerrar()


def encerrar():
    global _scanner
    with _trava:
        if _scanner is not None:
            try:
                _scanner.desconectar()
            except Exception:  # noqa: BLE001
                pass
            _scanner = None


def nomes_acoes():
    """Entram na lista de ações do status só com o checkbox marcado (é assim que a aba do Render sabe)."""
    return sorted(ACOES) if ativo() else []


def item_menu(pystray):
    return pystray.MenuItem(ROTULO_MENU, lambda i, _: definir_ativo(not ativo()), checked=lambda i: ativo())


# ---------------------------------------------------------------- utilidades
def _exigir_ativo():
    if not ativo():
        raise ErroAcao(f'"{ROTULO_MENU}" está desligado neste agente: marque essa opção no menu do ícone da bandeja.')


def _int(p, chave, padrao, minimo, maximo):
    v = p.get(chave, padrao)
    try:
        v = int(v)
    except (TypeError, ValueError):
        raise ErroAcao(f"parâmetro '{chave}' inválido")
    if not minimo <= v <= maximo:
        raise ErroAcao(f"parâmetro '{chave}' deve estar entre {minimo} e {maximo}")
    return v


def _ip(p, chave, obrigatorio):
    v = str(p.get(chave) or "").strip()
    if not v:
        if obrigatorio:
            raise ErroAcao(f"falta o parâmetro '{chave}' (IP do equipamento)")
        return ""
    try:
        ip = ipaddress.IPv4Address(v)
    except ValueError:
        raise ErroAcao(f"'{v}' não é um IPv4 válido")
    if not (ip.is_private or ip.is_loopback or ip.is_link_local):
        raise ErroAcao("só aceito IP de rede local/privada (ex.: 192.168.x.x, 10.x.x.x)")
    return v


def _cfg_scanner(p):
    return {
        "ip": _ip(p, "ip", True), "ip_local": _ip(p, "ip_local", False),
        "ot_size": _int(p, "ot_size", 32, 0, 256), "to_size": _int(p, "to_size", 32, 0, 256),
        "rpi_ms": _int(p, "rpi_ms", 20, 1, 3200), "multicast": bool(p.get("multicast", True)),
        "inst_cfg": _int(p, "inst_cfg", 1, 0, 65535), "inst_ot": _int(p, "inst_ot", 150, 0, 65535), "inst_to": _int(p, "inst_to", 100, 0, 65535),
        "porta_udp": _int(p, "porta_udp", clp_eip.PORTA_UDP, 1, 65535), "porta_tcp": _int(p, "porta_tcp", clp_eip.PORTA_TCP, 1, 65535),
    }


def _conectado():
    return _scanner is not None and _scanner.conectado


def _exigir_conexao():
    if not _conectado():
        raise ErroAcao("não conectado ao CLP" + (f" ({_perdida})" if _perdida else "") + ": use Conectar primeiro.")


def _bit(p):
    if "bit" not in p:
        raise ErroAcao("falta o parâmetro 'bit'")
    bit = _int(p, "bit", 0, 0, 10**6)
    primeiro = _param["primeiro_bit"]
    ultimo = primeiro + _scanner._cfg["ot_size"] * 8 - 1
    if not primeiro <= bit <= ultimo:
        raise ErroAcao(f"bit {bit} fora da área de saída ({primeiro} a {ultimo})")
    faixa = _cfg.get("clp_faixa")
    if isinstance(faixa, (list, tuple)) and len(faixa) == 2 and not faixa[0] <= bit <= faixa[1]:
        raise ErroAcao(f"bit {bit} fora da faixa liberada neste agente ({faixa[0]} a {faixa[1]})")
    return bit, (bit - primeiro) >> 3, (bit - primeiro) & 7


# ---------------------------------------------------------------- ações
def clp_identificar(p):
    _exigir_ativo()
    ip = _ip(p, "ip", True)
    try:
        return clp_eip.texto_identidade(clp_eip.identificar(ip, _int(p, "porta_tcp", clp_eip.PORTA_TCP, 1, 65535)))
    except clp_eip.ErroEip as e:
        raise ErroAcao(str(e))


def clp_conectar(p):
    global _scanner, _perdida
    _exigir_ativo()
    cfg = _cfg_scanner(p)
    primeiro = _int(p, "primeiro_bit", 512, 0, 10**6)
    with _trava:
        encerrar()
        _perdida = ""

        def perdeu(msg):
            global _perdida
            _perdida = msg
        s = clp_eip.Scanner(ao_perder=perdeu)
        try:
            s.conectar(cfg)
        except clp_eip.ErroEip as e:
            raise ErroAcao(str(e))
        _scanner = s
        _param.clear()
        _param.update({"ip": cfg["ip"], "primeiro_bit": primeiro})
    return f"Conectado a {cfg['ip']}. Bits {primeiro} a {primeiro + cfg['ot_size'] * 8 - 1} (saída do PC), RPI {cfg['rpi_ms']} ms."


def clp_desconectar(p):
    _exigir_ativo()
    encerrar()
    return "Desconectado."


def clp_estado(p):
    _exigir_ativo()
    if not _conectado():
        return json.dumps({"conectado": False, "perdida": _perdida})
    s = _scanner
    return json.dumps({"conectado": True, "ip": _param["ip"], "primeiro_bit": _param["primeiro_bit"],
                       "saida": s.saida().hex(), "entrada": s.entrada().hex(),
                       "tx": s.tx, "rx": s.rx, "ms_sem_dados": round(s.ms_sem_dados())})


def clp_bit(p):
    _exigir_ativo()
    _exigir_conexao()
    bit, byte, k = _bit(p)
    acao = str(p.get("modo") or "alternar")
    s = _scanner
    try:
        if acao == "set":
            s.definir_bit(byte, k, True)
            return f"Bit {bit} = ON (set)"
        if acao == "reset":
            s.definir_bit(byte, k, False)
            return f"Bit {bit} = OFF (reset)"
        if acao == "pulso":
            ms = _int(p, "pulso_ms", 500, 10, PULSO_MAX_MS)
            s.definir_bit(byte, k, True)
            time.sleep(ms / 1000.0)
            if _conectado():
                s.definir_bit(byte, k, False)
            return f"Bit {bit}: pulso de {ms} ms"
        if acao == "alternar":
            novo = not clp_eip.testar_bit(s.saida(), bit, _param["primeiro_bit"])
            s.definir_bit(byte, k, novo)
            return f"Bit {bit} = {'ON' if novo else 'OFF'} (alternar)"
    except clp_eip.ErroEip as e:
        raise ErroAcao(str(e))
    raise ErroAcao(f"modo desconhecido: {acao} (use alternar, pulso, set ou reset)")


def clp_zerar(p):
    _exigir_ativo()
    _exigir_conexao()
    _scanner.zerar()
    return "Todas as saídas do PC foram zeradas."


ACOES = {"clp_identificar": clp_identificar, "clp_conectar": clp_conectar, "clp_desconectar": clp_desconectar,
         "clp_estado": clp_estado, "clp_bit": clp_bit, "clp_zerar": clp_zerar}
