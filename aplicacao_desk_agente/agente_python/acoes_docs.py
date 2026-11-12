"""Ações de documentos (módulo "Documentos Database"): enviar um arquivo do PC para o banco Aiven, baixar um do banco ou abri-lo
no programa padrão do tipo (Excel, Word, leitor de PDF...). O menu da bandeja "Upload Documentos" abre o seletor de arquivos.
O agente NÃO tem senha do banco: nas ações da IA o servidor manda, dentro de um comando ASSINADO, o endereço dele e um token de
uso único; a transferência é por HTTPS, em segundo plano (o comando responde na hora, o servidor acompanha).
No menu da bandeja o agente se identifica com a própria chave (a mesma que assina os comandos).
"""
import json
import logging
import re
import sys
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

if sys.platform == "win32":
    import acoes
else:
    import acoes_linux as acoes

ErroAcao = acoes.ErroAcao
# programas/scripts não são documentos: nunca enviados nem abertos por aqui (o servidor também recusa)
BLOQUEADAS = {"exe", "bat", "cmd", "com", "scr", "msi", "ps1", "vbs", "vbe", "js", "jse", "wsf", "lnk", "reg", "jar", "dll", "sh", "appimage", "apk"}
MAX = 40 * 1024 * 1024
TEMPO = 300
ROTULO_MENU = "Upload Documentos"
log = logging.getLogger("agente")
_cfg = {}


def iniciar(cfg):
    global _cfg
    _cfg = cfg


def _documento_ok(nome):
    e = Path(str(nome)).suffix.lower().lstrip(".")
    if not e:
        raise ErroAcao("o arquivo precisa ter extensão (ex.: .pdf, .xlsx)")
    if e in BLOQUEADAS:
        raise ErroAcao(f"programas/scripts (.{e}) não são aceitos: só documentos")


def _base(p):
    url = str(p.get("url", "")).rstrip("/")
    token = str(p.get("token", ""))
    if not re.match(r"^https?://", url) or not re.fullmatch(r"[0-9a-f]{48}", token):
        raise ErroAcao("endereço/token do servidor inválidos")
    return f"{url}/api/docs/agente/{token}"


def _post(url, dados, tipo="application/json", cabecalhos=None):
    req = urllib.request.Request(url, data=dados, method="POST", headers={"Content-Type": tipo, **(cabecalhos or {})})
    with urllib.request.urlopen(req, timeout=TEMPO) as r:
        return json.loads(r.read().decode("utf-8") or "{}")


def _fim(base, ok, texto):
    try:
        _post(f"{base}/fim", json.dumps({"ok": ok, "texto": texto}).encode())
    except Exception:  # noqa: BLE001 - o servidor pode já ter encerrado o trabalho
        pass


def _erro_http(e):
    try:
        return json.loads(e.read().decode("utf-8")).get("erro") or f"HTTP {e.code}"
    except Exception:  # noqa: BLE001
        return f"HTTP {e.code}"


def _livre(pasta, nome):
    destino = pasta / nome
    n = 1
    while destino.exists():
        destino = pasta / f"{Path(nome).stem} ({n}){Path(nome).suffix}"
        n += 1
    return destino


def _enviar(base, arquivo):
    try:
        _post(f"{base}/enviar?nome={urllib.parse.quote(arquivo.name)}", arquivo.read_bytes(), "application/octet-stream")
        # o servidor já marcou o trabalho como concluído; o /fim só vale se ele ainda estiver aberto
    except urllib.error.HTTPError as e:
        _fim(base, False, f"o servidor recusou: {_erro_http(e)}")
    except Exception as e:  # noqa: BLE001
        _fim(base, False, f"falha ao enviar {arquivo.name}: {e}")


def _baixar(base, nome, pasta, abrir=False):
    try:
        pasta.mkdir(parents=True, exist_ok=True)
        destino = _livre(pasta, nome)
        tmp = destino.with_name(destino.name + ".part")
        with urllib.request.urlopen(f"{base}/baixar", timeout=TEMPO) as r, open(tmp, "wb") as f:
            while True:
                bloco = r.read(1 << 20)
                if not bloco:
                    break
                f.write(bloco)
        tmp.replace(destino)
        if abrir:
            try:
                acoes.abrir_arquivo({"caminho": str(destino)})      # programa padrão do tipo, trazido para a frente
            except Exception as e:  # noqa: BLE001
                _fim(base, False, f"baixado em {destino}, mas não consegui abrir: {e}")
                return
            _fim(base, True, f"Aberto no programa padrão do tipo: {destino}")
        else:
            _fim(base, True, f"Baixado em {destino}")
    except urllib.error.HTTPError as e:
        _fim(base, False, f"o servidor recusou: {_erro_http(e)}")
    except Exception as e:  # noqa: BLE001
        _fim(base, False, f"falha ao baixar {nome}: {e}")


def docs_enviar(p):
    base = _base(p)
    arquivo = Path(str(p.get("caminho", ""))).expanduser()
    _documento_ok(arquivo.name)
    if not arquivo.is_file():
        raise ErroAcao(f"arquivo não encontrado nesta máquina: {arquivo}")
    if arquivo.stat().st_size > MAX:
        raise ErroAcao(f"arquivo maior que {MAX // 1048576} MB")
    threading.Thread(target=_enviar, args=(base, arquivo), daemon=True).start()
    return f"enviando {arquivo.name} ao servidor…"


def _preparar_baixar(p, abrir):
    base = _base(p)
    nome = Path(str(p.get("nome", ""))).name            # só o nome: nada de caminho vindo do servidor
    if not nome:
        raise ErroAcao("nome de documento inválido")
    _documento_ok(nome)
    if abrir:
        pasta = Path(tempfile.gettempdir()) / "AutomacaoIOT-Docs"
    elif p.get("pasta"):
        pasta = Path(str(p["pasta"])).expanduser()
    else:
        pasta = Path.home() / "Downloads"
    return base, nome, pasta


def docs_baixar(p):
    base, nome, pasta = _preparar_baixar(p, False)
    threading.Thread(target=_baixar, args=(base, nome, pasta), daemon=True).start()
    return f"baixando {nome} para {pasta}…"


def docs_abrir(p):
    base, nome, pasta = _preparar_baixar(p, True)
    threading.Thread(target=_baixar, args=(base, nome, pasta, True), daemon=True).start()
    return f"baixando {nome} para abrir…"


ACOES = {"docs_enviar": docs_enviar, "docs_baixar": docs_baixar, "docs_abrir": docs_abrir}


# ---------------------------------------------------------------- menu da bandeja: Upload Documentos
def _escolher_arquivos():
    import tkinter as tk
    from tkinter import filedialog
    raiz = tk.Tk()
    raiz.withdraw()
    raiz.attributes("-topmost", True)
    try:
        return list(filedialog.askopenfilenames(parent=raiz, title="Upload Documentos — escolha os arquivos"))
    finally:
        raiz.destroy()


def enviar_direto(arquivo, cfg=None):
    """Envia usando a chave do agente. Devolve o resumo do servidor (dict)."""
    cfg = cfg or _cfg
    servidor = str(cfg.get("servidor", "")).rstrip("/")
    chave = str(cfg.get("chave", ""))
    if not servidor or not chave:
        raise ErroAcao("faltam 'servidor' e 'chave' no config.json do agente")
    arquivo = Path(arquivo)
    _documento_ok(arquivo.name)
    if arquivo.stat().st_size > MAX:
        raise ErroAcao(f"{arquivo.name}: maior que {MAX // 1048576} MB")
    try:
        return _post(f"{servidor}/api/docs/agente/enviar?nome={urllib.parse.quote(arquivo.name)}", arquivo.read_bytes(),
                     "application/octet-stream", {"Authorization": f"Bearer {chave}"})
    except urllib.error.HTTPError as e:
        raise ErroAcao(f"o servidor recusou: {_erro_http(e)}")


def _upload_menu(icone):
    try:
        escolhidos = _escolher_arquivos()
    except Exception as e:  # noqa: BLE001
        log.warning("Upload Documentos: seletor de arquivos falhou: %s", e)
        return
    ok = erro = 0
    ultimo = ""
    for c in escolhidos:
        try:
            r = enviar_direto(c)
            ok += 1
            ultimo = str(r.get("documento", Path(c).name))
        except Exception as e:  # noqa: BLE001
            erro += 1
            ultimo = f"{Path(c).name}: {e}"
            log.warning("Upload Documentos: %s", ultimo)
    if escolhidos:
        msg = f"{ok} enviado(s) ao banco" + (f", {erro} com erro" if erro else "") + f" · {ultimo}"
        log.info("Upload Documentos: %s", msg)
        try:
            icone.notify(msg, "Upload Documentos")
        except Exception:  # noqa: BLE001
            pass


def item_menu(pystray):
    return pystray.MenuItem(ROTULO_MENU, lambda i, _: threading.Thread(target=_upload_menu, args=(i,), daemon=True).start())
