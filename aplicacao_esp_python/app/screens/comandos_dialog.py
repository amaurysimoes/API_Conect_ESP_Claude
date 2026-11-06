import json
import time

from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtWidgets import (QCheckBox, QComboBox, QDialog, QHBoxLayout, QLabel, QLineEdit, QVBoxLayout)

from .. import firebase_rest as fb
from ..comandos import COMANDOS, montar
from ..theme import DANGER, SUCCESS, WARNING
from ..widgets import ActionButton, BackgroundMixin, Card

ESPERA_S = 20          # quanto tempo espera o resultado do agente
CONSULTA_MS = 700


class ComandosDialog(BackgroundMixin, QDialog):
    """Cardzinho de comandos de um broker: escolhe a máquina e o comando e clica EXECUTAR.
    Cada clique grava UM comando no Firebase (o agente o executa uma vez e a fila é esvaziada)."""

    def __init__(self, parent, broker):
        super().__init__(parent)
        self.setObjectName("root")
        self.setWindowTitle(f"Comandos — {broker}")
        self.resize(560, 520)
        self.broker = broker
        self._calls = set()
        self._esperando = None  # (id, até quando)

        root = QVBoxLayout(self)
        root.setContentsMargins(24, 20, 24, 20)
        root.setSpacing(10)
        titulo = QLabel(f"Comandos — {broker}")
        titulo.setObjectName("title")
        root.addWidget(titulo)

        card = Card()
        lay = QVBoxLayout(card)
        lay.setContentsMargins(16, 14, 16, 16)
        lay.setSpacing(10)

        lay.addWidget(QLabel("Máquina"))
        self.maquina = QComboBox()
        lay.addWidget(self.maquina)

        lay.addWidget(QLabel("Comando"))
        self.comando = QComboBox()
        for c in COMANDOS:
            self.comando.addItem(c["titulo"], c)
        self.comando.currentIndexChanged.connect(self._trocou_comando)
        lay.addWidget(self.comando)

        self.param = QLineEdit()
        lay.addWidget(self.param)
        self.confirma = QCheckBox("Confirmo: esta ação desliga/reinicia a máquina")
        lay.addWidget(self.confirma)

        self.resultado = QLabel(alignment=Qt.AlignmentFlag.AlignCenter)
        self.resultado.setWordWrap(True)
        self.resultado.setMinimumHeight(40)
        lay.addWidget(self.resultado)

        botoes = QHBoxLayout()
        self.btn_exec = ActionButton("EXECUTAR", "success")
        self.btn_exec.clicked.connect(self._executar)
        fechar = ActionButton("Fechar", "primary")
        fechar.clicked.connect(self.reject)
        botoes.addWidget(self.btn_exec, 1)
        botoes.addWidget(fechar)
        lay.addLayout(botoes)
        root.addWidget(card, 1)

        self._poll = QTimer(self, interval=CONSULTA_MS)
        self._poll.timeout.connect(self._consultar_resultado)
        self._maquinas_timer = QTimer(self, interval=4000)
        self._maquinas_timer.timeout.connect(self._carregar_maquinas)
        self._maquinas_timer.start()
        self._trocou_comando()
        self._carregar_maquinas()

    # ---------- máquinas ----------
    def _call(self, fn, ok, err=None):
        call = fb.Chamada(fn, self)
        self._calls.add(call)
        call.pronto.connect(lambda r: (ok(r), self._calls.discard(call)))
        call.erro.connect(lambda e: ((err or self._falha)(e), self._calls.discard(call)))
        call.start()

    def _falha(self, e):
        self._mostrar(f"✖ {e}", DANGER)
        self._liberar()

    def _carregar_maquinas(self):
        self._call(lambda: fb.request("GET", f"brokers/{self.broker}/maquinas"), self._preencher_maquinas,
                   lambda e: None)

    def _preencher_maquinas(self, dados):
        atual = self.maquina.currentData()
        self.maquina.clear()
        agora = time.time() * 1000
        for nome, m in sorted((dados or {}).items()):
            st = (m or {}).get("status") or {}
            visto = st.get("visto_em")
            online = st.get("online") is True and isinstance(visto, (int, float)) and agora - visto < fb.ONLINE_MS
            self.maquina.addItem(f"{'●' if online else '○'}  {nome}  ({'online' if online else 'offline'})", nome)
        if self.maquina.count() == 0:
            self.maquina.addItem("Nenhuma máquina neste broker ainda", None)
        i = self.maquina.findData(atual)
        if i >= 0:
            self.maquina.setCurrentIndex(i)

    # ---------- comando ----------
    def _trocou_comando(self):
        c = self.comando.currentData()
        self.param.setVisible(bool(c["param"]))
        self.param.setPlaceholderText(c.get("dica", ""))
        self.param.clear()
        self.confirma.setVisible(c["confirmar"])
        self.confirma.setChecked(False)

    def _mostrar(self, texto, cor=None):
        self.resultado.setText(texto)
        self.resultado.setStyleSheet(f"font-size: 13px; font-weight: bold;{f' color: {cor};' if cor else ''}")

    def _liberar(self):
        self._esperando = None
        self._poll.stop()
        self.btn_exec.setEnabled(True)

    def _executar(self):
        c = self.comando.currentData()
        maquina = self.maquina.currentData()
        if not maquina:
            return self._mostrar("Escolha uma máquina.", WARNING)
        valor = self.param.text().strip()
        if c["param"] and c.get("obrigatorio") and not valor:
            return self._mostrar("Preencha o campo do comando.", WARNING)
        if c["confirmar"] and not self.confirma.isChecked():
            return self._mostrar("Marque a confirmação para desligar/reiniciar.", WARNING)
        params = {}
        if c["param"] and valor:
            params[c["param"]] = valor
        if c["confirmar"]:
            params["confirmado"] = True
        id_, cmd = montar(c["acao"], params)
        base = f"brokers/{self.broker}/maquinas/{maquina}"
        self.btn_exec.setEnabled(False)  # um clique = um comando: só libera quando terminar
        self._mostrar("Enviando o comando...", None)

        def enviado(_):
            self._esperando = (f"{base}/resultado/{id_}", time.time() + ESPERA_S)
            self._mostrar("Enviado. Esperando o agente executar...", None)
            self._poll.start()

        self._call(lambda: fb.request("PUT", f"{base}/comandos/{id_}", cmd), enviado)

    def _consultar_resultado(self):
        if not self._esperando:
            return
        caminho, ate = self._esperando
        if time.time() > ate:
            self._mostrar("Sem resposta do agente (ele está ligado e observando este broker?).", WARNING)
            return self._liberar()

        def chegou(r):
            if not r or not self._esperando:
                return
            ok = bool(r.get("ok"))
            self._mostrar(("✔ " if ok else "✖ ") + str(r.get("mensagem", "")), SUCCESS if ok else DANGER)
            self._liberar()

        self._call(lambda: fb.request("GET", caminho), chegou, lambda e: None)

    def reject(self):
        self._poll.stop()
        self._maquinas_timer.stop()
        super().reject()
