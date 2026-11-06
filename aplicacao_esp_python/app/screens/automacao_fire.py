import re
import time
from datetime import datetime

from PyQt6.QtCore import QDate, QTime, Qt, QTimer
from PyQt6.QtGui import QBrush, QColor
from PyQt6.QtWidgets import (QCheckBox, QComboBox, QDateEdit, QHBoxLayout, QLabel, QLineEdit, QListWidget,
                             QListWidgetItem, QPlainTextEdit, QTimeEdit, QVBoxLayout, QWidget)

from .. import firebase_rest as fb
from ..theme import DANGER, SUCCESS
from ..widgets import ActionButton, BackgroundMixin, Card, ThemeButton

LIST_MS = 6000
REPETIR = [("Uma vez", "uma_vez"), ("Todo dia", "todo_dia"), ("Dias da semana", "semanal")]
DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]


class AutomacaoFireScreen(BackgroundMixin, QWidget):
    """Automação IOT Fire: cria planos (por enquanto, enviar e-mail em data/hora marcadas). O plano fica no Firebase
    (brokers/<broker>/maquinas/<máquina>/planos/<id>) e o AGENTE daquela máquina executa na hora marcada."""

    def __init__(self):
        super().__init__()
        self.setObjectName("root")
        self._calls = set()
        self._brokers = {}
        self._planos = {}
        self._editando = None  # id do plano carregado no formulário (None = plano novo)

        root = QVBoxLayout(self)
        root.setContentsMargins(32, 20, 32, 24)
        root.setSpacing(10)
        top = QHBoxLayout()
        title = QLabel("Automação IOT Fire")
        title.setObjectName("title")
        top.addWidget(title)
        top.addStretch()
        top.addWidget(ThemeButton())
        root.addLayout(top)

        # onde o plano roda
        onde = Card()
        lo = QHBoxLayout(onde)
        lo.setContentsMargins(16, 12, 16, 12)
        self.cb_broker = QComboBox()
        self.cb_maquina = QComboBox()
        atualizar = ActionButton("ATUALIZAR", "primary")
        atualizar.clicked.connect(self._refresh)
        lo.addWidget(QLabel("Broker"))
        lo.addWidget(self.cb_broker, 1)
        lo.addWidget(QLabel("Máquina"))
        lo.addWidget(self.cb_maquina, 1)
        lo.addWidget(atualizar)
        self.cb_broker.activated.connect(lambda _: self._trocou_broker())
        self.cb_maquina.activated.connect(lambda _: self._trocou_maquina())
        root.addWidget(onde)

        # planos já criados
        card_lista = Card()
        ll = QVBoxLayout(card_lista)
        ll.setContentsMargins(16, 12, 16, 12)
        ll.addWidget(QLabel("Planos desta máquina (clique para editar)"))
        self.lista = QListWidget()
        self.lista.setObjectName("nets")
        self.lista.setMinimumHeight(90)
        self.lista.itemClicked.connect(self._carregar)
        ll.addWidget(self.lista)
        botoes = QHBoxLayout()
        self.btn_ativar = ActionButton("ATIVAR / DESATIVAR", "primary")
        self.btn_apagar = ActionButton("APAGAR PLANO", "danger")
        self.btn_ativar.clicked.connect(self._alternar)
        self.btn_apagar.clicked.connect(self._apagar)
        botoes.addWidget(self.btn_ativar, 1)
        botoes.addWidget(self.btn_apagar, 1)
        ll.addLayout(botoes)
        root.addWidget(card_lista)

        # formulário do plano
        card = Card()
        lf = QVBoxLayout(card)
        lf.setContentsMargins(16, 12, 16, 12)
        lf.setSpacing(8)
        self.titulo_form = QLabel("Novo plano: enviar e-mail")
        lf.addWidget(self.titulo_form)
        self.nome = QLineEdit(placeholderText="Nome do plano")
        lf.addWidget(self.nome)
        quando = QHBoxLayout()
        self.cb_repetir = QComboBox()
        for texto, valor in REPETIR:
            self.cb_repetir.addItem(texto, valor)
        self.data = QDateEdit(QDate.currentDate())
        self.data.setCalendarPopup(True)
        self.data.setDisplayFormat("dd/MM/yyyy")
        self.hora = QTimeEdit(QTime(8, 0))
        self.hora.setDisplayFormat("HH:mm")
        quando.addWidget(QLabel("Repetir"))
        quando.addWidget(self.cb_repetir)
        self.lbl_data = QLabel("Data")
        quando.addWidget(self.lbl_data)
        quando.addWidget(self.data)
        quando.addWidget(QLabel("Hora"))
        quando.addWidget(self.hora)
        quando.addStretch()
        lf.addLayout(quando)
        self.linha_dias = QWidget()
        ld = QHBoxLayout(self.linha_dias)
        ld.setContentsMargins(0, 0, 0, 0)
        self.chk_dias = [QCheckBox(d) for d in DIAS]
        for c in self.chk_dias:
            ld.addWidget(c)
        ld.addStretch()
        lf.addWidget(self.linha_dias)
        self.cb_repetir.currentIndexChanged.connect(self._ajustar_repetir)
        remet = QHBoxLayout()
        remet.addWidget(QLabel("Enviar pela conta"))
        self.cb_remetente = QComboBox()
        self.cb_remetente.setEditable(False)
        remet.addWidget(self.cb_remetente, 1)
        lf.addLayout(remet)
        self.dest = QLineEdit(placeholderText="Destinatários (separe com vírgula)")
        self.assunto = QLineEdit(placeholderText="Título do e-mail")
        self.texto = QPlainTextEdit(placeholderText="Texto do e-mail")
        self.texto.setMinimumHeight(70)
        lf.addWidget(self.dest)
        lf.addWidget(self.assunto)
        lf.addWidget(self.texto, 1)
        acoes = QHBoxLayout()
        self.btn_salvar = ActionButton("SALVAR PLANO", "success")
        self.btn_novo = ActionButton("NOVO PLANO", "primary")
        self.btn_salvar.clicked.connect(self._salvar)
        self.btn_novo.clicked.connect(self._novo)
        acoes.addWidget(self.btn_salvar, 1)
        acoes.addWidget(self.btn_novo, 1)
        lf.addLayout(acoes)
        root.addWidget(card, 1)

        self.log = QPlainTextEdit(readOnly=True)
        self.log.setObjectName("log")
        self.log.setMaximumBlockCount(300)
        self.log.setMaximumHeight(70)
        root.addWidget(self.log)

        self._ajustar_repetir()
        self._timer = QTimer(self, interval=LIST_MS)
        self._timer.timeout.connect(self._refresh)
        self._timer.start()
        self._refresh()

    # ---------- Firebase ----------
    def _call(self, fn, ok):
        call = fb.Chamada(fn, self)
        self._calls.add(call)
        call.pronto.connect(lambda r: (ok(r), self._calls.discard(call)))
        call.erro.connect(lambda e: (self._escrever(f"Firebase: {e}"), self._calls.discard(call)))
        call.start()

    def _escrever(self, msg):
        self.log.appendPlainText(msg)

    def _broker(self):
        return self.cb_broker.currentData()

    def _maquina(self):
        return self.cb_maquina.currentData()

    def _caminho(self):
        return f"brokers/{self._broker()}/maquinas/{self._maquina()}/planos"

    def _refresh(self):
        self._call(lambda: fb.request("GET", "brokers"), self._preencher)

    def _preencher(self, dados):
        self._brokers = {k: v for k, v in (dados or {}).items() if isinstance(v, dict) and v.get("tipo") == "fire"}
        atual = self._broker()
        self.cb_broker.blockSignals(True)
        self.cb_broker.clear()
        for nome in sorted(self._brokers):
            self.cb_broker.addItem(nome, nome)
        i = self.cb_broker.findData(atual)
        self.cb_broker.setCurrentIndex(max(i, 0))
        self.cb_broker.blockSignals(False)
        self._trocou_broker(manter=True)

    def _trocou_broker(self, manter=False):
        maquinas = (self._brokers.get(self._broker()) or {}).get("maquinas") or {}
        atual = self._maquina() if manter else None
        self.cb_maquina.blockSignals(True)
        self.cb_maquina.clear()
        agora = time.time() * 1000
        for nome in sorted(maquinas):
            st = (maquinas[nome] or {}).get("status") or {}
            on = st.get("online") is True and isinstance(st.get("visto_em"), (int, float)) and agora - st["visto_em"] < fb.ONLINE_MS
            self.cb_maquina.addItem(f"{'●' if on else '○'} {nome}", nome)
        i = self.cb_maquina.findData(atual)
        self.cb_maquina.setCurrentIndex(max(i, 0))
        self.cb_maquina.blockSignals(False)
        self._trocou_maquina(manter=True)

    def _trocou_maquina(self, manter=False):
        if not manter:
            self._novo()
        maq = ((self._brokers.get(self._broker()) or {}).get("maquinas") or {}).get(self._maquina()) or {}
        contas = (maq.get("status") or {}).get("emails") or []
        contas = list(contas.values()) if isinstance(contas, dict) else list(contas)
        atual = self.cb_remetente.currentData()
        self.cb_remetente.clear()
        for c in contas:
            self.cb_remetente.addItem(c, c)
        i = self.cb_remetente.findData(atual)
        self.cb_remetente.setCurrentIndex(max(i, 0))
        planos = maq.get("planos") or {}
        self._planos = {k: v for k, v in planos.items() if isinstance(v, dict)}
        self._mostrar_planos()

    def _mostrar_planos(self):
        selecionado = self._editando
        self.lista.clear()
        for id_, p in sorted(self._planos.items(), key=lambda kv: kv[1].get("criado_em") or 0):
            ativo = p.get("ativo") is not False
            ult = ""
            if "ultimo_ok" in p:
                ult = f"   ·   último: {'OK' if p['ultimo_ok'] else 'FALHOU'} — {p.get('ultimo_msg', '')}"
            quando = f"{p.get('data', '')} {p.get('hora', '')}" if p.get("repetir") == "uma_vez" else \
                f"{dict(zip([v for _, v in REPETIR], [t for t, _ in REPETIR])).get(p.get('repetir'), '')} {p.get('hora', '')}"
            item = QListWidgetItem(f"{'●' if ativo else '○'}  {p.get('nome', id_)}   ·   {quando}   ·   "
                                   f"{'ativo' if ativo else 'desativado'}{ult}")
            item.setData(Qt.ItemDataRole.UserRole, id_)
            falhou = p.get("ultimo_ok") is False
            item.setForeground(QBrush(QColor(DANGER if falhou or not ativo else SUCCESS)))
            self.lista.addItem(item)
            if id_ == selecionado:
                item.setSelected(True)
        if not self._planos:
            vazio = QListWidgetItem("Nenhum plano nesta máquina.")
            vazio.setFlags(Qt.ItemFlag.NoItemFlags)
            self.lista.addItem(vazio)

    # ---------- formulário ----------
    def _ajustar_repetir(self):
        r = self.cb_repetir.currentData()
        self.lbl_data.setVisible(r == "uma_vez")
        self.data.setVisible(r == "uma_vez")
        self.linha_dias.setVisible(r == "semanal")

    def _novo(self):
        self._editando = None
        self.titulo_form.setText("Novo plano: enviar e-mail")
        self.nome.clear()
        self.dest.clear()
        self.assunto.clear()
        self.texto.clear()
        self.cb_repetir.setCurrentIndex(0)
        self.data.setDate(QDate.currentDate())
        self.hora.setTime(QTime(8, 0))
        for c in self.chk_dias:
            c.setChecked(False)
        self.lista.clearSelection()

    def _carregar(self, item):
        id_ = item.data(Qt.ItemDataRole.UserRole)
        p = self._planos.get(id_)
        if not p:
            return
        self._editando = id_
        self.titulo_form.setText(f"Editando o plano: {p.get('nome', id_)}")
        self.nome.setText(p.get("nome", ""))
        self.dest.setText(p.get("destinatarios", ""))
        self.assunto.setText(p.get("assunto", ""))
        self.texto.setPlainText(p.get("texto", ""))
        self.cb_repetir.setCurrentIndex(max(self.cb_repetir.findData(p.get("repetir")), 0))
        if p.get("data"):
            self.data.setDate(QDate.fromString(p["data"], "yyyy-MM-dd"))
        h = QTime.fromString(p.get("hora", "08:00"), "HH:mm")
        self.hora.setTime(h if h.isValid() else QTime(8, 0))
        dias = p.get("dias") or []
        dias = list(dias.values()) if isinstance(dias, dict) else list(dias)
        for i, c in enumerate(self.chk_dias):
            c.setChecked(i in dias)
        i = self.cb_remetente.findData(p.get("remetente"))
        if i >= 0:
            self.cb_remetente.setCurrentIndex(i)

    def _salvar(self):
        if not self._broker() or not self._maquina():
            return self._escrever("Escolha o broker e a máquina.")
        repetir = self.cb_repetir.currentData()
        dias = [i for i, c in enumerate(self.chk_dias) if c.isChecked()]
        nome = self.nome.text().strip()
        destinos = [d.strip() for d in self.dest.text().replace(";", ",").split(",") if d.strip()]
        if not nome:
            return self._escrever("Dê um nome ao plano.")
        if not self.cb_remetente.currentData():
            return self._escrever("Esta máquina ainda não tem conta de e-mail: cadastre no agente (Contas de e-mail) e deixe o agente ligado.")
        if not destinos or any(not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", d) for d in destinos):
            return self._escrever("Destinatários: informe e-mails válidos separados por vírgula.")
        if repetir == "semanal" and not dias:
            return self._escrever("Marque pelo menos um dia da semana.")
        data = self.data.date().toString("yyyy-MM-dd")
        hora = self.hora.time().toString("HH:mm")
        if repetir == "uma_vez" and datetime.strptime(f"{data} {hora}", "%Y-%m-%d %H:%M") <= datetime.now():
            return self._escrever("Essa data e hora já passaram.")
        plano = {"nome": nome, "tipo": "email", "repetir": repetir, "hora": hora,
                 "remetente": self.cb_remetente.currentData(), "destinatarios": ", ".join(destinos),
                 "assunto": self.assunto.text().strip(), "texto": self.texto.toPlainText(),
                 "data": data if repetir == "uma_vez" else None, "dias": dias if repetir == "semanal" else None,
                 "ultima_execucao": None, "ultimo_ok": None, "ultimo_msg": None, "executado_em": None}
        if self._editando:
            caminho, metodo = f"{self._caminho()}/{self._editando}", "PATCH"
        else:
            plano.update(ativo=True, criado_em=fb.SERVER_TS)
            caminho, metodo = f"{self._caminho()}/{int(time.time() * 1000)}", "PUT"
            plano = {k: v for k, v in plano.items() if v is not None}
        self._call(lambda: fb.request(metodo, caminho, plano), lambda _: (self._escrever(f"Plano '{nome}' salvo."), self._novo(), self._refresh()))

    def _plano_selecionado(self):
        itens = self.lista.selectedItems()
        return itens[0].data(Qt.ItemDataRole.UserRole) if itens else None

    def _alternar(self):
        id_ = self._plano_selecionado()
        if not id_:
            return self._escrever("Clique num plano da lista.")
        ativo = self._planos[id_].get("ativo") is not False
        self._call(lambda: fb.request("PATCH", f"{self._caminho()}/{id_}", {"ativo": not ativo}),
                   lambda _: (self._escrever(f"Plano {'desativado' if ativo else 'ativado'}."), self._refresh()))

    def _apagar(self):
        id_ = self._plano_selecionado()
        if not id_:
            return self._escrever("Clique num plano da lista.")
        self._call(lambda: fb.request("DELETE", f"{self._caminho()}/{id_}"),
                   lambda _: (self._escrever("Plano apagado."), self._novo(), self._refresh()))
