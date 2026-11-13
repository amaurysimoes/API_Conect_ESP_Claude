"""Ação do módulo "Consulta Serial" (2ª parte): o servidor (Render) não alcança a rede local; este PC alcança.
Recebe, num comando ASSINADO, o IP/porta do back-end, o serial e um token de uso único. Consulta
GET http://IP:PORTA/busca?sn=<serial> (só leitura) em segundo plano e devolve a resposta ao servidor por HTTPS.
Só aceita IP de rede local/privada.
"""
import ipaddress
import json
import logging
import re
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request

if sys.platform == "win32":
    import acoes
else:
    import acoes_linux as acoes

ErroAcao = acoes.ErroAcao
TEMPO_BACK = 240          # a varredura profunda do back pode demorar
MAX_LINHAS = 20           # linhas por tabela enviadas ao servidor
log = logging.getLogger("agente")


def _post(url, obj):
    req = urllib.request.Request(url, data=json.dumps(obj, default=str).encode("utf-8"), method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        r.read()


def _enxugar(d):
    if isinstance(d, dict) and isinstance(d.get("results"), list):
        for r in d["results"]:
            if isinstance(r, dict) and isinstance(r.get("records"), list):
                r.setdefault("total_found", len(r["records"]))
                r["records"] = r["records"][:MAX_LINHAS]
    return d


def _buscar(destino, back, sn):
    try:
        # sem proxy: o back está na rede local
        abridor = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with abridor.open(f"{back}/busca?sn={urllib.parse.quote(sn, safe='')}", timeout=TEMPO_BACK) as r:
            dados = json.loads(r.read().decode("utf-8", "replace"))
        corpo = {"ok": True, "dados": _enxugar(dados)}
    except urllib.error.HTTPError as e:
        corpo = {"ok": False, "erro": f"o back em {back} respondeu HTTP {e.code}"}
    except Exception as e:  # noqa: BLE001
        corpo = {"ok": False, "erro": f"não alcancei o back em {back}: {e}"}
    try:
        _post(destino, corpo)
        log.info("Consulta Serial %s: %s", sn, "enviado ao servidor" if corpo["ok"] else corpo["erro"])
    except Exception as e:  # noqa: BLE001
        log.warning("Consulta Serial: não consegui devolver ao servidor: %s", e)


def serial_buscar(p):
    try:
        ip = ipaddress.ip_address(str(p.get("ip", "")).strip())
    except ValueError:
        raise ErroAcao("IP do back-end inválido")
    if ip.version != 4 or not (ip.is_private or ip.is_loopback or ip.is_link_local):
        raise ErroAcao("só aceito IP de rede local/privada (ex.: 192.168.x.x, 10.x.x.x)")
    try:
        porta = int(p.get("porta"))
    except (TypeError, ValueError):
        raise ErroAcao("porta inválida")
    if not 1 <= porta <= 65535:
        raise ErroAcao("porta inválida")
    sn = str(p.get("sn", "")).strip()
    if not sn or len(sn) > 200:
        raise ErroAcao("serial inválido")
    url = str(p.get("url", "")).rstrip("/")
    token = str(p.get("token", ""))
    if not re.match(r"^https?://", url) or not re.fullmatch(r"[0-9a-f]{48}", token):
        raise ErroAcao("endereço/token do servidor inválidos")
    threading.Thread(target=_buscar, args=(f"{url}/api/serial/agente/{token}/historico", f"http://{ip}:{porta}", sn), daemon=True).start()
    return f"buscando o serial {sn} em {ip}:{porta}…"


ACOES = {"serial_buscar": serial_buscar}
