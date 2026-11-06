"""Caixa de texto com visual de editor de código (cores do VS Code Dark+ / Light+): número de linha, linha atual
destacada e cores de sintaxe para C/C++ (.cpp .h .ino), JSON (dados do Firebase) e INI."""
import re
from pathlib import Path

from PyQt6.QtCore import QRect, QSize, Qt
from PyQt6.QtGui import (QColor, QFont, QFontDatabase, QPainter, QSyntaxHighlighter, QTextCharFormat, QTextFormat)
from PyQt6.QtWidgets import QPlainTextEdit, QTextEdit, QWidget

from .theme import theme

CORES = {
    "dark": {"bg": "#1e1e1e", "fg": "#d4d4d4", "linha": "#2a2d2e", "num": "#858585", "num_ativa": "#c6c6c6",
             "sel": "#264f78", "borda": "#3c3c3c",
             "palavra": "#569cd6", "controle": "#c586c0", "tipo": "#4ec9b0", "texto": "#ce9178",
             "numero": "#b5cea8", "comentario": "#6a9955", "funcao": "#dcdcaa", "preproc": "#c586c0",
             "chave": "#9cdcfe", "secao": "#4ec9b0"},
    "light": {"bg": "#ffffff", "fg": "#000000", "linha": "#f0f0f0", "num": "#237893", "num_ativa": "#0b216f",
              "sel": "#add6ff", "borda": "#c8c8c8",
              "palavra": "#0000ff", "controle": "#af00db", "tipo": "#267f99", "texto": "#a31515",
              "numero": "#098658", "comentario": "#008000", "funcao": "#795e26", "preproc": "#af00db",
              "chave": "#0451a5", "secao": "#267f99"},
}


def cores():
    return CORES["dark" if theme.is_dark else "light"]


def _fmt(cor, negrito=False, italico=False):
    f = QTextCharFormat()
    f.setForeground(QColor(cor))
    if negrito:
        f.setFontWeight(QFont.Weight.Bold)
    f.setFontItalic(italico)
    return f


PALAVRAS = ("alignas auto break case catch class const constexpr continue default delete do else enum explicit "
            "extern false final for friend goto if inline namespace new nullptr operator override private protected "
            "public return sizeof static struct switch template this throw true try typedef typename union using "
            "virtual volatile while").split()
CONTROLE = {"break", "case", "catch", "continue", "default", "do", "else", "for", "goto", "if", "return", "switch",
            "throw", "try", "while"}
TIPOS = ("void bool char short int long float double signed unsigned size_t uint8_t uint16_t uint32_t uint64_t "
         "int8_t int16_t int32_t int64_t byte String WiFiClient WiFiClientSecure HTTPClient JsonDocument "
         "JsonObject JsonArray IPAddress Preferences WebServer String std string vector").split()


class Realce(QSyntaxHighlighter):
    """Cores de sintaxe. `linguagem`: 'cpp', 'json' ou 'ini' (outra = sem cores)."""

    def __init__(self, documento, linguagem):
        super().__init__(documento)
        self.linguagem = linguagem
        self.atualizar_cores()

    def atualizar_cores(self):
        c = cores()
        self._c = {k: _fmt(c[k]) for k in ("palavra", "controle", "tipo", "texto", "numero", "funcao", "preproc",
                                           "chave", "secao")}
        self._c["comentario"] = _fmt(c["comentario"], italico=True)
        self.rehighlight()

    # ---------- util ----------
    def _pintar(self, regex, fmt, texto, grupo=0):
        for m in re.finditer(regex, texto):
            self.setFormat(m.start(grupo), m.end(grupo) - m.start(grupo), fmt)

    def highlightBlock(self, texto):
        if self.linguagem == "cpp":
            self._cpp(texto)
        elif self.linguagem == "json":
            self._json(texto)
        elif self.linguagem == "ini":
            self._ini(texto)

    # ---------- C / C++ / Arduino ----------
    def _cpp(self, t):
        c = self._c
        self._pintar(r"\b\d+(\.\d+)?([eE][+-]?\d+)?[fFuUlL]*\b|\b0[xX][0-9a-fA-F]+\b", c["numero"], t)
        self._pintar(r"\b[A-Za-z_]\w*(?=\s*\()", c["funcao"], t)
        for m in re.finditer(r"\b[A-Za-z_]\w*\b", t):
            p = m.group()
            if p in CONTROLE:
                self.setFormat(m.start(), len(p), c["controle"])
            elif p in PALAVRAS:
                self.setFormat(m.start(), len(p), c["palavra"])
            elif p in TIPOS:
                self.setFormat(m.start(), len(p), c["tipo"])
        self._pintar(r"^\s*#\s*\w+", c["preproc"], t)
        self._pintar(r'(?<=#include)\s*<[^>]*>', c["texto"], t)
        self._pintar(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', c["texto"], t)
        # comentário de linha (fora de texto entre aspas) e de bloco (pode atravessar linhas)
        em_texto = [(m.start(), m.end()) for m in re.finditer(r'"(?:\\.|[^"\\])*"', t)]
        self.setCurrentBlockState(0)
        i = 0
        if self.previousBlockState() == 1:
            fim = t.find("*/")
            if fim < 0:
                self.setFormat(0, len(t), c["comentario"])
                self.setCurrentBlockState(1)
                return
            self.setFormat(0, fim + 2, c["comentario"])
            i = fim + 2
        while i < len(t):
            if any(a <= i < b for a, b in em_texto):
                i += 1
                continue
            if t.startswith("//", i):
                self.setFormat(i, len(t) - i, c["comentario"])
                return
            if t.startswith("/*", i):
                fim = t.find("*/", i + 2)
                if fim < 0:
                    self.setFormat(i, len(t) - i, c["comentario"])
                    self.setCurrentBlockState(1)
                    return
                self.setFormat(i, fim + 2 - i, c["comentario"])
                i = fim + 2
                continue
            i += 1

    # ---------- JSON ----------
    def _json(self, t):
        c = self._c
        self._pintar(r"-?\b\d+(\.\d+)?([eE][+-]?\d+)?\b", c["numero"], t)
        self._pintar(r"\b(true|false|null)\b", c["palavra"], t)
        self._pintar(r'"(?:\\.|[^"\\])*"', c["texto"], t)
        self._pintar(r'("(?:\\.|[^"\\])*")\s*:', c["chave"], t, grupo=1)

    # ---------- INI (platformio.ini) ----------
    def _ini(self, t):
        c = self._c
        self._pintar(r"^\s*([A-Za-z0-9_.-]+)\s*(?==)", c["chave"], t, grupo=1)
        self._pintar(r"^\s*\[[^\]]*\]", c["secao"], t)
        self._pintar(r"^\s*[;#].*$", c["comentario"], t)


def linguagem_do_arquivo(caminho):
    ext = Path(caminho).suffix.lower()
    if ext in (".cpp", ".h", ".hpp", ".c", ".ino", ".cc"):
        return "cpp"
    if ext in (".json",):
        return "json"
    if ext in (".ini",):
        return "ini"
    return ""


class _NumerosDeLinha(QWidget):
    def __init__(self, editor):
        super().__init__(editor)
        self._ed = editor

    def sizeHint(self):
        return QSize(self._ed.largura_numeros(), 0)

    def paintEvent(self, event):
        self._ed.pintar_numeros(event)


class CodeEditor(QPlainTextEdit):
    """QPlainTextEdit com cara de VS Code."""

    def __init__(self, linguagem="", somente_leitura=False, parent=None):
        super().__init__(parent)
        self.setReadOnly(somente_leitura)
        fonte = QFontDatabase.systemFont(QFontDatabase.SystemFont.FixedFont)
        fonte.setFamilies(["Consolas", "Cascadia Mono", "DejaVu Sans Mono", fonte.family()])
        fonte.setPointSize(11)
        self.setFont(fonte)
        self.setLineWrapMode(QPlainTextEdit.LineWrapMode.NoWrap)
        self.setTabStopDistance(self.fontMetrics().horizontalAdvance(" ") * 4)
        self._numeros = _NumerosDeLinha(self)
        self.realce = Realce(self.document(), linguagem)
        self.blockCountChanged.connect(self._ajustar_margem)
        self.updateRequest.connect(self._rolar_numeros)
        self.cursorPositionChanged.connect(self._linha_atual)
        theme.changed.connect(self._tema)
        self._ajustar_margem()
        self._tema()

    def _tema(self):
        c = cores()
        self.setStyleSheet(
            f"QPlainTextEdit {{ background: {c['bg']}; color: {c['fg']}; border: 1px solid {c['borda']}; "
            f"border-radius: 6px; padding: 0px; selection-background-color: {c['sel']}; selection-color: {c['fg']}; }}")
        self.realce.atualizar_cores()
        self._linha_atual()
        self._numeros.update()

    # ---------- número de linha ----------
    def largura_numeros(self):
        digitos = max(3, len(str(max(1, self.blockCount()))))
        return 16 + self.fontMetrics().horizontalAdvance("9") * digitos

    def _ajustar_margem(self, *_):
        self.setViewportMargins(self.largura_numeros(), 0, 0, 0)

    def _rolar_numeros(self, rect, dy):
        if dy:
            self._numeros.scroll(0, dy)
        else:
            self._numeros.update(0, rect.y(), self._numeros.width(), rect.height())
        if rect.contains(self.viewport().rect()):
            self._ajustar_margem()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        r = self.contentsRect()
        self._numeros.setGeometry(QRect(r.left(), r.top(), self.largura_numeros(), r.height()))

    def pintar_numeros(self, event):
        c = cores()
        p = QPainter(self._numeros)
        p.fillRect(event.rect(), QColor(c["bg"]))
        atual = self.textCursor().blockNumber()
        bloco = self.firstVisibleBlock()
        n = bloco.blockNumber()
        topo = round(self.blockBoundingGeometry(bloco).translated(self.contentOffset()).top())
        base = topo + round(self.blockBoundingRect(bloco).height())
        while bloco.isValid() and topo <= event.rect().bottom():
            if bloco.isVisible() and base >= event.rect().top():
                p.setPen(QColor(c["num_ativa"] if n == atual else c["num"]))
                p.drawText(0, topo, self._numeros.width() - 8, self.fontMetrics().height(),
                           Qt.AlignmentFlag.AlignRight, str(n + 1))
            bloco = bloco.next()
            topo = base
            base = topo + round(self.blockBoundingRect(bloco).height())
            n += 1
        p.end()

    # ---------- linha atual ----------
    def _linha_atual(self):
        sel = QTextEdit.ExtraSelection()
        sel.format.setBackground(QColor(cores()["linha"]))
        sel.format.setProperty(QTextFormat.Property.FullWidthSelection, True)
        sel.cursor = self.textCursor()
        sel.cursor.clearSelection()
        self.setExtraSelections([sel])
        self._numeros.update()
