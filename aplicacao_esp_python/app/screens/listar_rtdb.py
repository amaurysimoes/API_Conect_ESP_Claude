import json
import threading
import urllib.request

from PyQt6.QtCore import pyqtSignal
from PyQt6.QtWidgets import QHBoxLayout, QLabel, QVBoxLayout, QWidget

from ..code_editor import CodeEditor
from ..firebase_rest import DB_URL
from ..widgets import BackgroundMixin, ThemeButton

NOS = ("esps", "brokers")  # o que as regras do banco deixam ler


def _aplicar(dados, caminho, valor, mesclar):
    """Aplica um evento do Firebase (put/patch) em `dados` (dict local) no caminho dado."""
    chaves = [c for c in caminho.split("/") if c]
    if not chaves:
        if mesclar and isinstance(valor, dict):
            for k, v in valor.items():
                if v is None:
                    dados.pop(k, None)
                else:
                    dados[k] = v
            return dados
        return valor
    alvo = dados
    for c in chaves[:-1]:
        if not isinstance(alvo.get(c), dict):
            alvo[c] = {}
        alvo = alvo[c]
    ultimo = chaves[-1]
    if mesclar and isinstance(valor, dict):
        atual = alvo.setdefault(ultimo, {})
        for k, v in valor.items():
            if v is None:
                atual.pop(k, None)
            else:
                atual[k] = v
    elif valor is None:
        alvo.pop(ultimo, None)
    else:
        alvo[ultimo] = valor
    return dados


class ListarRtdbScreen(BackgroundMixin, QWidget):
    """Listar Real Time Database: mostra o banco (nós liberados pelas regras) e atualiza sozinho, na hora que algo muda
    (conexão de streaming do Firebase, sem recarregar)."""
    mudou = pyqtSignal(str, object)
    estado = pyqtSignal(str)

    def __init__(self, embutido=False):
        super().__init__()
        self.setObjectName("root")
        self.sem_fundo = embutido
        self._dados = {}
        self._parar = threading.Event()

        root = QVBoxLayout(self)
        root.setContentsMargins(32, 20, 32, 24)
        root.setSpacing(10)
        if not embutido:  # dentro da janela principal a aba já tem o nome e o botão de tema
            top = QHBoxLayout()
            title = QLabel("Listar Real Time Database")
            title.setObjectName("title")
            top.addWidget(title)
            top.addStretch()
            top.addWidget(ThemeButton())
            root.addLayout(top)
        self.lbl = QLabel(f"{DB_URL}/  —  atualiza em tempo real")
        self.lbl.setObjectName("muted")
        root.addWidget(self.lbl)

        self.texto = CodeEditor("json", somente_leitura=True)  # visual de editor de código (cores do VS Code)
        root.addWidget(self.texto, 1)
        self.status = QLabel("Conectando...")
        self.status.setObjectName("muted")
        root.addWidget(self.status)

        self.mudou.connect(self._receber)
        self.estado.connect(self.status.setText)
        for no in NOS:
            threading.Thread(target=self._ouvir, args=(no,), daemon=True).start()

    # ---------- streaming (uma conexão por nó) ----------
    def _ouvir(self, no):
        while not self._parar.is_set():
            try:
                req = urllib.request.Request(f"{DB_URL}/{no}.json", headers={"Accept": "text/event-stream"})
                with urllib.request.urlopen(req, timeout=75) as resp:
                    self.estado.emit("Conectado: atualizando em tempo real.")
                    evento, dado = None, None
                    for linha in resp:
                        if self._parar.is_set():
                            return
                        linha = linha.decode("utf-8").rstrip("\r\n")
                        if linha.startswith("event:"):
                            evento = linha[6:].strip()
                        elif linha.startswith("data:"):
                            dado = linha[5:].strip()
                        elif linha == "" and evento in ("put", "patch") and dado:
                            corpo = json.loads(dado)
                            self.mudou.emit(no, (evento, corpo.get("path", "/"), corpo.get("data")))
                            evento, dado = None, None
            except Exception as exc:  # noqa: BLE001 - cai a conexão: tenta de novo
                if not self._parar.is_set():
                    self.estado.emit(f"Sem conexão ({exc}). Tentando de novo...")
            self._parar.wait(3)

    def _receber(self, no, ev):
        tipo, caminho, valor = ev
        atual = self._dados.get(no)
        if caminho in ("", "/") and tipo == "put":
            self._dados[no] = valor
        else:
            base = atual if isinstance(atual, dict) else {}
            self._dados[no] = _aplicar(base, caminho, valor, tipo == "patch")
        self._mostrar()

    def _mostrar(self):
        barra = self.texto.verticalScrollBar()
        pos = barra.value()
        ordenado = {no: self._dados[no] for no in NOS if self._dados.get(no) is not None}
        self.texto.setPlainText(json.dumps(ordenado, ensure_ascii=False, indent=2, sort_keys=True))
        barra.setValue(pos)

    def closeEvent(self, event):
        self._parar.set()  # as conexões encerram no próximo sinal de vida / timeout
        super().closeEvent(event)
