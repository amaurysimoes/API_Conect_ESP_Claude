"""Ações de CLP / equipamentos (módulo "Conexao Socket-TCP/IP"). Só valem com o checkbox
"Ativar Conexao CLP: EtherNet/IP" marcado no menu da bandeja (config.json: "clp_ativo").
Duas formas de falar com o CLP, escolhidas no parâmetro "protocolo":
  ethernet_ip  EtherNet/IP Class 1 (área de I/O por assemblies; clp_eip.py)
  tcp_ip       TCP/IP = Modbus TCP direto nas MEMÓRIAS M (bobinas; clp_modbus.py)
Chegam aqui apenas comandos ASSINADOS (veja agente.py). Só aceita IPs de rede privada/local.
Faixa de bits liberada (opcional): "clp_faixa": [512, 767] no config.json; fora dela o agente recusa.
"""
import ipaddress
import json
import sys
import threading
import time

import clp_eip
import clp_modbus
import config

if sys.platform == "win32":
    import acoes
else:
    import acoes_linux as acoes

ErroAcao = acoes.ErroAcao
ROTULO_MENU = "Ativar Conexao CLP: EtherNet/IP"
PULSO_MAX_MS = 5000
EIP, TCP = "ethernet_ip", "tcp_ip"

_cfg = {}
_arquivo = None
_scanner = None      # EtherNet/IP
_mb = None           # TCP/IP (Modbus TCP)
_modo = ""           # "", EIP ou TCP
_param = {}          # parâmetros da conexão atual
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
    global _scanner, _mb, _modo
    with _trava:
        if _scanner is not None:
            try:
                _scanner.desconectar()
            except Exception:  # noqa: BLE001
                pass
        if _mb is not None:
            _mb.fechar()
        _scanner, _mb, _modo = None, None, ""


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


def _protocolo(p):
    v = str(p.get("protocolo") or EIP)
    if v not in (EIP, TCP):
        raise ErroAcao(f"protocolo desconhecido: {v} (use ethernet_ip ou tcp_ip)")
    return v


def _cfg_scanner(p):
    return {
        "ip": _ip(p, "ip", True), "ip_local": _ip(p, "ip_local", False),
        "ot_size": _int(p, "ot_size", 32, 0, 256), "to_size": _int(p, "to_size", 32, 0, 256),
        "rpi_ms": _int(p, "rpi_ms", 20, 1, 3200), "multicast": bool(p.get("multicast", True)),
        "inst_cfg": _int(p, "inst_cfg", 1, 0, 65535), "inst_ot": _int(p, "inst_ot", 150, 0, 65535), "inst_to": _int(p, "inst_to", 100, 0, 65535),
        "porta_udp": _int(p, "porta_udp", clp_eip.PORTA_UDP, 1, 65535), "porta_tcp": _int(p, "porta_tcp", clp_eip.PORTA_TCP, 1, 65535),
    }


def _cfg_tcp(p):
    return {
        "ip": _ip(p, "ip", True), "ip_local": _ip(p, "ip_local", False),
        "porta": _int(p, "porta", clp_modbus.PORTA, 1, 65535), "unidade": _int(p, "unidade", 1, 0, 255),
        "base_m": _int(p, "base_m", 2048, 0, 65535), "primeiro_bit": _int(p, "primeiro_bit", 0, 0, 65535),
        "qtd_m": _int(p, "qtd_m", 64, 1, clp_modbus.MAX_BOBINAS),
    }


def _conectado():
    if _modo == EIP:
        return _scanner is not None and _scanner.conectado
    if _modo == TCP:
        return _mb is not None and _mb.conectado
    return False


def _exigir_conexao():
    if not _conectado():
        raise ErroAcao("não conectado ao CLP" + (f" ({_perdida})" if _perdida else "") + ": use Conectar primeiro.")


def _faixa_liberada(bit):
    faixa = _cfg.get("clp_faixa")
    if isinstance(faixa, (list, tuple)) and len(faixa) == 2 and not faixa[0] <= bit <= faixa[1]:
        raise ErroAcao(f"bit {bit} fora da faixa liberada neste agente ({faixa[0]} a {faixa[1]})")


def _bit(p):
    if "bit" not in p:
        raise ErroAcao("falta o parâmetro 'bit'")
    bit = _int(p, "bit", 0, 0, 10**6)
    if _modo == TCP:
        endereco = _param["base_m"] + bit
        if endereco > 0xFFFF:
            raise ErroAcao(f"memória {bit} fora do limite do Modbus (endereço {endereco} passa de 65535)")
        _faixa_liberada(bit)
        return bit, endereco, 0
    primeiro = _param["primeiro_bit"]
    ultimo = primeiro + _scanner._cfg["ot_size"] * 8 - 1
    if not primeiro <= bit <= ultimo:
        raise ErroAcao(f"bit {bit} fora da área de saída ({primeiro} a {ultimo})")
    _faixa_liberada(bit)
    return bit, (bit - primeiro) >> 3, (bit - primeiro) & 7


def _perdeu(msg):
    global _perdida
    _perdida = msg


# ---------------------------------------------------------------- ações
def clp_identificar(p):
    _exigir_ativo()
    if _protocolo(p) == TCP:
        c = _cfg_tcp(p)
        cli = clp_modbus.ClienteModbus(c["ip"], c["porta"], c["unidade"], c["ip_local"])
        try:
            cli.conectar()
            bits = cli.ler_bobinas(c["base_m"] + c["primeiro_bit"], 1)
        except clp_modbus.ErroModbus as e:
            raise ErroAcao(str(e))
        finally:
            cli.fechar()
        return f"CLP respondeu por TCP/IP (Modbus TCP) em {c['ip']}:{c['porta']}, unidade {c['unidade']}. Memória M{c['primeiro_bit']} = {'ON' if bits[0] & 1 else 'OFF'}."
    ip = _ip(p, "ip", True)
    try:
        return clp_eip.texto_identidade(clp_eip.identificar(ip, _int(p, "porta_tcp", clp_eip.PORTA_TCP, 1, 65535)))
    except clp_eip.ErroEip as e:
        raise ErroAcao(str(e))


def clp_conectar(p):
    global _scanner, _mb, _modo, _perdida
    _exigir_ativo()
    protocolo = _protocolo(p)
    with _trava:
        if protocolo == TCP:
            c = _cfg_tcp(p)
            encerrar()
            _perdida = ""
            cli = clp_modbus.ClienteModbus(c["ip"], c["porta"], c["unidade"], c["ip_local"])
            try:
                cli.conectar()
                cli.ler_bobinas(c["base_m"] + c["primeiro_bit"], 1)    # teste: a memória inicial existe?
            except clp_modbus.ErroModbus as e:
                cli.fechar()
                raise ErroAcao(str(e))
            _mb, _modo = cli, TCP
            _param.clear()
            _param.update({"ip": c["ip"], "primeiro_bit": c["primeiro_bit"], "base_m": c["base_m"], "qtd_m": c["qtd_m"]})
            return (f"Conectado por TCP/IP (Modbus TCP) a {c['ip']}:{c['porta']}. Memórias M{c['primeiro_bit']} a M{c['primeiro_bit'] + c['qtd_m'] - 1} "
                    f"(endereço base {c['base_m']}).")
        cfg = _cfg_scanner(p)
        primeiro = _int(p, "primeiro_bit", 512, 0, 10**6)
        encerrar()
        _perdida = ""
        s = clp_eip.Scanner(ao_perder=_perdeu)
        try:
            s.conectar(cfg)
        except clp_eip.ErroEip as e:
            raise ErroAcao(str(e))
        _scanner, _modo = s, EIP
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
        if _modo == TCP:
            encerrar()
        return json.dumps({"conectado": False, "perdida": _perdida})
    if _modo == TCP:
        inicio = _int(p, "inicio", _param["primeiro_bit"], 0, 65535)
        qtd = _int(p, "quantidade", _param["qtd_m"], 1, clp_modbus.MAX_BOBINAS)
        try:
            dados = _mb.ler_bobinas(_param["base_m"] + inicio, qtd)
        except clp_modbus.ErroModbus as e:
            if not _mb.conectado:
                _perdeu(str(e))
                encerrar()
                return json.dumps({"conectado": False, "perdida": _perdida})
            raise ErroAcao(str(e))
        return json.dumps({"conectado": True, "protocolo": TCP, "ip": _param["ip"], "primeiro_bit": inicio,
                           "quantidade": qtd, "memorias": dados.hex()})
    s = _scanner
    return json.dumps({"conectado": True, "protocolo": EIP, "ip": _param["ip"], "primeiro_bit": _param["primeiro_bit"],
                       "saida": s.saida().hex(), "entrada": s.entrada().hex(),
                       "tx": s.tx, "rx": s.rx, "ms_sem_dados": round(s.ms_sem_dados())})


def _bit_tcp(p):
    bit, endereco, _ = _bit(p)
    acao = str(p.get("modo") or "alternar")
    try:
        if acao == "set":
            _mb.escrever_bobina(endereco, True)
            return f"Memória M{bit} = ON (set)"
        if acao == "reset":
            _mb.escrever_bobina(endereco, False)
            return f"Memória M{bit} = OFF (reset)"
        if acao == "pulso":
            ms = _int(p, "pulso_ms", 500, 10, PULSO_MAX_MS)
            _mb.escrever_bobina(endereco, True)
            time.sleep(ms / 1000.0)
            if _mb.conectado:
                _mb.escrever_bobina(endereco, False)
            return f"Memória M{bit}: pulso de {ms} ms"
        if acao == "alternar":
            novo = not (_mb.ler_bobinas(endereco, 1)[0] & 1)
            _mb.escrever_bobina(endereco, novo)
            return f"Memória M{bit} = {'ON' if novo else 'OFF'} (alternar)"
    except clp_modbus.ErroModbus as e:
        if not _mb.conectado:
            _perdeu(str(e))
            encerrar()
        raise ErroAcao(str(e))
    raise ErroAcao(f"modo desconhecido: {acao} (use alternar, pulso, set ou reset)")


def clp_bit(p):
    _exigir_ativo()
    _exigir_conexao()
    if _modo == TCP:
        return _bit_tcp(p)
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
    if _modo == TCP:
        raise ErroAcao("No modo TCP/IP não existe 'zerar todas': as memórias do CLP são desligadas uma a uma (ação reset), para não apagar o que o programa do CLP usa.")
    _scanner.zerar()
    return "Todas as saídas do PC foram zeradas."


ACOES = {"clp_identificar": clp_identificar, "clp_conectar": clp_conectar, "clp_desconectar": clp_desconectar,
         "clp_estado": clp_estado, "clp_bit": clp_bit, "clp_zerar": clp_zerar}
