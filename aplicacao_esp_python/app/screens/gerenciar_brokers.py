import hashlib
import re
import time

from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QBrush, QColor
from PyQt6.QtWidgets import (QHBoxLayout, QLabel, QLineEdit, QListWidget, QListWidgetItem,
                             QPlainTextEdit, QVBoxLayout, QWidget)

from .. import firebase_rest as fb
from ..theme import DANGER, SUCCESS
from ..widgets import ActionButton, BackgroundMixin, Card, ThemeButton

LIST_MS = 5000
TIPOS = {"fire": "Firebase (internet)", "mqtt": "MQTT (rede local)"}
# Só apaga quem digitar a senha. Guardamos apenas a verificação (SHA-256), não a senha escrita no código.
SENHA_APAGAR_SHA256 = "86a54b1b9582afe628355269c62919645163dd1029040795cb941d126ab65553"


def senha_ok(texto):
    return hashlib.sha256(texto.encode("utf-8")).hexdigest() == SENHA_APAGAR_SHA256


class GerenciarBrokersScreen(BackgroundMixin, QWidget):
    """Gerenciar IOT Broker: mostra todos os brokers criados (Firebase e MQTT), permite trocar o nome e apagar.
    Apagar exige a senha. Apagar remove brokers/<nome> do Firebase (máquinas e fila de comandos inclusive)."""

    def __init__(self):
        super().__init__()
        self.setObjectName("root")
        self._calls = set()
        self._brokers = {}

        root = QVBoxLayout(self)
        root.setContentsMargins(32, 20, 32, 24)
        root.setSpacing(10)
        top = QHBoxLayout()
        title = QLabel("Gerenciar IOT Broker")
        title.setObjectName("title")
        top.addWidget(title)
        top.addStretch()
        top.addWidget(ThemeButton())
        root.addLayout(top)

        card = Card()
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 16)
        lay.setSpacing(10)
        head = QHBoxLayout()
        head.addWidget(QLabel("Brokers criados (Firebase e MQTT)"))
        head.addStretch()
        atualizar = ActionButton("ATUALIZAR", "primary")
        atualizar.clicked.connect(self._refresh)
        head.addWidget(atualizar)
        lay.addLayout(head)
        self.lista = QListWidget()
        self.lista.setObjectName("nets")
        self.lista.setMinimumHeight(140)
        self.lista.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOn)
        self.lista.itemSelectionChanged.connect(self._mudou_selecao)
        lay.addWidget(self.lista, 1)

        # editar o nome (aparece ao clicar em EDITAR)
        self.linha_nome = QWidget()
        ln = QHBoxLayout(self.linha_nome)
        ln.setContentsMargins(0, 0, 0, 0)
        self.novo_nome = QLineEdit(placeholderText="Novo nome (letras, números, - e _)")
        self.btn_salvar = ActionButton("SALVAR NOME", "primary")
        self.btn_cancelar = ActionButton("CANCELAR", "primary")
        ln.addWidget(self.novo_nome, 1)
        ln.addWidget(self.btn_salvar)
        ln.addWidget(self.btn_cancelar)
        self.btn_salvar.clicked.connect(self._salvar_nome)
        self.btn_cancelar.clicked.connect(lambda: self.linha_nome.setVisible(False))
        self.linha_nome.setVisible(False)
        lay.addWidget(self.linha_nome)

        aviso = QLabel("Antes de trocar o nome ou apagar, pare o broker e o agente que usam esse broker.")
        aviso.setObjectName("muted")
        lay.addWidget(aviso)
        self.senha = QLineEdit(placeholderText="Senha para apagar", echoMode=QLineEdit.EchoMode.Password)
        lay.addWidget(self.senha)
        botoes = QHBoxLayout()
        self.btn_editar = ActionButton("EDITAR NOME", "primary")
        self.btn_apagar = ActionButton("APAGAR BROKER", "danger")
        self.btn_editar.clicked.connect(self._editar)
        self.btn_apagar.clicked.connect(self._apagar)
        botoes.addWidget(self.btn_editar, 1)
        botoes.addWidget(self.btn_apagar, 1)
        lay.addLayout(botoes)
        root.addWidget(card, 1)

        self.log = QPlainTextEdit(readOnly=True)
        self.log.setObjectName("log")
        self.log.setMaximumBlockCount(300)
        self.log.setMaximumHeight(90)
        root.addWidget(self.log)

        self._timer = QTimer(self, interval=LIST_MS)
        self._timer.timeout.connect(self._refresh)
        self._timer.start()
        self._mudou_selecao()
        self._refresh()

    # ---------- Firebase ----------
    def _call(self, fn, ok, err=None):
        call = fb.Chamada(fn, self)
        self._calls.add(call)
        call.pronto.connect(lambda r: (ok(r), self._calls.discard(call)))
        call.erro.connect(lambda e: ((err or self._escrever)(f"Firebase: {e}"), self._calls.discard(call)))
        call.start()

    def _escrever(self, msg):
        self.log.appendPlainText(msg)

    def _refresh(self):
        self._call(lambda: fb.request("GET", "brokers"), self._preencher)

    def _preencher(self, dados):
        self._brokers = {k: v for k, v in (dados or {}).items() if isinstance(v, dict)}
        selecionado = self._nome_selecionado()
        agora = time.time() * 1000
        self.lista.blockSignals(True)
        self.lista.clear()
        for nome, b in sorted(self._brokers.items()):
            visto = b.get("visto_em")
            online = b.get("ativo") is not False and isinstance(visto, (int, float)) and agora - visto < fb.ONLINE_MS
            maquinas = b.get("maquinas") or {}
            for m in maquinas.values():  # ou alguma máquina (agente) dele está online
                st = (m or {}).get("status") or {}
                if st.get("online") is True and isinstance(st.get("visto_em"), (int, float)) \
                        and agora - st["visto_em"] < fb.ONLINE_MS:
                    online = True
            tipo = TIPOS.get(b.get("tipo"), "sem tipo (resto de máquina)")
            texto = (f"{'●' if online else '○'}  {nome}   ·   {tipo}   ·   {b.get('ip', '—')}   ·   "
                     f"{len(maquinas)} máquina(s)   ·   {'online' if online else 'offline'}")
            item = QListWidgetItem(texto)
            item.setData(Qt.ItemDataRole.UserRole, nome)
            item.setForeground(QBrush(QColor(SUCCESS if online else DANGER)))
            self.lista.addItem(item)
            if nome == selecionado:
                item.setSelected(True)
        if not self._brokers:
            vazio = QListWidgetItem("Nenhum broker criado.")
            vazio.setFlags(Qt.ItemFlag.NoItemFlags)
            self.lista.addItem(vazio)
        self.lista.blockSignals(False)
        self.lista.doItemsLayout()

    # ---------- seleção ----------
    def _nome_selecionado(self):
        itens = self.lista.selectedItems()
        return itens[0].data(Qt.ItemDataRole.UserRole) if itens else None

    def _mudou_selecao(self):
        tem = self._nome_selecionado() is not None
        self.btn_editar.setEnabled(tem)
        self.btn_apagar.setEnabled(tem)
        self.linha_nome.setVisible(False)

    # ---------- editar o nome ----------
    def _editar(self):
        nome = self._nome_selecionado()
        if nome:
            self.novo_nome.setText(nome)
            self.linha_nome.setVisible(True)
            self.novo_nome.setFocus()
            self.novo_nome.selectAll()

    def _salvar_nome(self):
        antigo = self._nome_selecionado()
        novo = self.novo_nome.text().strip()
        if not antigo:
            return
        if novo == antigo:
            return self.linha_nome.setVisible(False)
        if not re.fullmatch(r"[A-Za-z0-9_-]+", novo):
            return self._escrever("Nome: só letras, números, - e _ (sem espaço).")
        if novo in self._brokers:
            return self._escrever(f"Já existe um broker chamado '{novo}'.")

        def renomear():  # copia o cadastro inteiro para o nome novo e remove o antigo
            dados = fb.request("GET", f"brokers/{antigo}")
            if dados is None:
                raise RuntimeError("o broker não existe mais")
            fb.request("PUT", f"brokers/{novo}", dados)
            fb.request("DELETE", f"brokers/{antigo}")

        def pronto(_):
            self._escrever(f"Broker '{antigo}' agora se chama '{novo}'. Escolha o nome novo no agente e no app.")
            self.linha_nome.setVisible(False)
            self._refresh()

        self._call(renomear, pronto)

    # ---------- apagar (só com a senha) ----------
    def _apagar(self):
        nome = self._nome_selecionado()
        if not nome:
            return
        if not senha_ok(self.senha.text()):
            return self._escrever("Senha incorreta: o broker não foi apagado.")
        self.senha.clear()
        self._call(lambda: fb.request("DELETE", f"brokers/{nome}"), lambda _: self._apagou(nome))

    def _apagou(self, nome):
        self._escrever(f"Broker '{nome}' apagado.")
        self._refresh()
