"""Card de Informações: o que cada coisa do projeto é, para que serve e como usar (por tópicos).
Aparece sobre a janela principal, em azul neon, e só fecha no X do card.

TOPICOS é a ÚNICA fonte desse conteúdo: o site (fire_page) lê a mesma lista (tools/gerar_topicos_site.py gera
fire_page/src/topicos.js). Regra do projeto: sempre que uma função nova for criada, acrescente-a aqui; o card de
Informações é sempre o ÚLTIMO card do programa e do site."""
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QColor
from PyQt6.QtWidgets import (QFrame, QGraphicsDropShadowEffect, QHBoxLayout, QLabel, QPushButton, QTextBrowser,
                             QVBoxLayout)

NEON = "#00b4ff"

# (título, onde fica, o que é, para que serve, como usar [lista]). Na ordem em que as coisas foram criadas.
TOPICOS = [
    ("1. Repetidor ESP32", "menu Arquivo → Automação ESP_Firebase → Repetidor ESP32",
     "Transforma um ESP32 num repetidor de Wi-Fi e conversa com ele pela USB.",
     "Ampliar uma rede e dar internet a outros aparelhos. O ESP continua repetindo sozinho, sem o PC: se for desligado e "
     "ligado numa fonte externa, volta com a última rede (só não volta se você apertar PARAR). O LED azul da placa pisca "
     "enquanto está conectado.",
     ["Ligue o ESP32 na USB, escolha a porta e clique em CONECTAR.",
      "Clique em ESCANEAR e escolha a rede na lista (ou digite o nome). Marque Comum ou Corporativa (EAP, que pede usuário).",
      "Preencha a senha e clique em ATIVAR REPETIDOR. O Wi-Fi novo se chama <i>REDE + REPET</i>.",
      "PARAR REPETIDOR desliga. Placa vazia? Use ⚡ Gravar firmware (.cpp)."]),
    ("2. Painel do repetidor (dashboard)", "no próprio ESP, pelo navegador",
     "Uma página que o ESP32 mostra enquanto está repetindo.",
     "Ver quantos aparelhos estão conectados e se está tudo funcionando: lista dos aparelhos (MAC, IP e sinal), internet "
     "(DNS, conexão e NAT), rede de origem (sinal, canal, IP), quedas e o motivo da última, tempo ligado, motivo do último "
     "reinício (energia, travou, queda de tensão), memória, temperatura e versão.",
     ["Com o repetidor ativo, conecte no Wi-Fi <i>REDE + REPET</i> e abra http://192.168.4.1/ (se a rede de origem usar "
      "192.168.4.x, o endereço é http://192.168.77.1/).",
      "Ou, de qualquer aparelho na rede de origem, abra http://IP_DO_ESP/ (o IP aparece no display e no log do app).",
      "A página atualiza sozinha a cada 2 s. Não tem senha: quem estiver na rede consegue abrir.",
      "Só funciona depois de ATIVAR REPETIDOR."]),
    ("3. Automação FireBase", "menu Arquivo → Automação ESP_Firebase → Automação Firebase",
     "Configura e grava, num ESP32, o firmware que liga o ESP ao Firebase.",
     "Acionar pinos (ligar/desligar e pulso), ler chaves (switch) e medir a tensão de alimentação pelo site, de qualquer "
     "lugar. O display do ESP mostra o último pino acionado.",
     ["Conecte o ESP32 e escolha a porta.",
      "Informe o nome do ESP, o modelo, o Wi-Fi e a senha. Marque se a placa tem display.",
      "Tipo de rede: Comum (WPA2/WPA3, casa: só nome e senha) ou Corporativa (EAP/PEAP, fábrica: também o usuário). "
      "Se o ESP não conectar, o display mostra o motivo (ex.: WiFi senha errada?, WiFi rede nao achada).",
      "Monte a lista de pinos: + ADICIONAR PINO ou TODOS OS PINOS LIVRES. Cada pino é Saída (ON/OFF) ou Entrada (switch).",
      "Clique em ⚡ Gravar no ESP. Ao ligar, o ESP aparece sozinho no site, na página Automação.",
      "Arquivo → Editar Automações ESP: escolha um arquivo do firmware (abre na pasta firmware; se não achar, em C:\\) e edite o código (o texto aparece com cores e números de linha, como no VS Code). SALVAR grava no arquivo; CANCELAR fecha sem gravar o que não foi salvo."]),
    ("4. Site", "https://amauryesp-active.web.app",
     "Página na internet para acionar os ESPs.",
     "Acionar os ESPs sem abrir este programa, de qualquer lugar.",
     ["Automação: clique num ESP online e use Ligar ou Pulso em cada pino.",
      "Informações do Sistema: este mesmo guia, sempre como o último card.",
      "Para atualizar o site depois de mudar algo: veja o passo a passo Publicar_firepage.md."]),
    ("5. Automação IOT Site", "menu Automação IOT Site → Site Gerenciamento IOT e Listar Real Time Database",
     "O mesmo site, aberto dentro deste programa, e a lista do banco de dados em tempo real.",
     "Usar o site sem abrir o navegador e ver o que está gravado no Firebase.",
     ["Os dois abrem como um card sobre a janela principal (como este); cada um fecha só no seu X.",
      "Site Gerenciamento IOT: abre o site aqui dentro. Use Recarregar para atualizar ou Abrir no navegador para abrir fora do programa.",
      "Listar Real Time Database: mostra o conteúdo do banco (esps e brokers, os nós que as regras liberam) com visual de editor de código e atualiza sozinho, na hora que algo muda."]),
    ("6. Tema e documentos", "botão Light/Dark e pasta 1-#DocumentacaoTecnica",
     "O botão do canto troca entre escuro e claro. A pasta de documentação guarda tudo o que foi feito.",
     "Consultar o histórico e refazer o projeto passo a passo.",
     ["Preferencias_projeto.md: histórico e onde estamos.",
      "Estrutura_projeto.md: passo a passo para recriar o projeto.",
      "Criar_firepage.md e Publicar_firepage.md: o site."]),
    ("7. Informações do Sistema", "menu Informações do Sistema (programa) e último card do Início (site)",
     "Este guia.",
     "Saber o que cada coisa é e como usar. Fica sempre como o último card do programa e do site, e é atualizado a cada "
     "função nova.",
     ["No programa, só fecha no X do card.", "No programa, todos os formulários abrem assim, como card dentro da janela principal, um por vez: abrir outro fecha o atual (a gravação do firmware continua rodando em segundo plano).", "No site, o X volta ao Início."]),
]


def _html():
    css = ("<style>h3{color:#00d4ff;margin-bottom:0}.onde{color:#7fb8ff;font-size:12px}"
           "p{margin:4px 0}li{margin:2px 0}</style>")
    partes = [css]
    for titulo, onde, que, serve, usar in TOPICOS:
        itens = "".join(f"<li>{u}</li>" for u in usar)
        partes.append(f"<h3>{titulo}</h3><div class='onde'>{onde}</div>"
                      f"<p><b>O que é:</b> {que}</p><p><b>Para que serve:</b> {serve}</p>"
                      f"<p><b>Como usar:</b></p><ul>{itens}</ul>")
    return "".join(partes)


class InfoCard(QFrame):
    """Filho da janela principal. Só some quando se clica no X."""

    def __init__(self, parent):
        super().__init__(parent)
        self.setObjectName("infoCard")
        self.setStyleSheet(f"""
            QFrame#infoCard {{ background: #08111f; border: 2px solid {NEON}; border-radius: 16px; }}
            QLabel#infoTitulo {{ color: #00d4ff; font-size: 20px; font-weight: bold; background: transparent; }}
            QPushButton#infoX {{ background: transparent; color: {NEON}; border: 1px solid {NEON}; border-radius: 8px;
                                 font-size: 16px; font-weight: bold; padding: 2px 12px; }}
            QPushButton#infoX:hover {{ background: {NEON}; color: #08111f; }}
            QTextBrowser {{ background: transparent; border: none; color: #d7ecff; font-size: 13px; }}
        """)
        brilho = QGraphicsDropShadowEffect(self)
        brilho.setBlurRadius(45)
        brilho.setOffset(0, 0)
        brilho.setColor(QColor(0, 180, 255, 230))
        self.setGraphicsEffect(brilho)

        lay = QVBoxLayout(self)
        lay.setContentsMargins(22, 16, 22, 18)
        lay.setSpacing(8)
        topo = QHBoxLayout()
        titulo = QLabel("Informações do Sistema")
        titulo.setObjectName("infoTitulo")
        fechar = QPushButton("✕")
        fechar.setObjectName("infoX")
        fechar.setCursor(Qt.CursorShape.PointingHandCursor)
        fechar.setToolTip("Fechar")
        fechar.clicked.connect(self.hide)
        topo.addWidget(titulo)
        topo.addStretch()
        topo.addWidget(fechar)
        lay.addLayout(topo)
        texto = QTextBrowser()
        texto.setHtml(_html())
        lay.addWidget(texto, 1)
        self.hide()

    def fechar(self):
        self.hide()
        return True

    def mostrar(self):
        self.ajustar()
        self.show()
        self.raise_()

    def ajustar(self):
        """Centraliza o card na janela, abaixo da barra de menu."""
        janela = self.parentWidget()
        topo = janela.menuBar().height() + 22 if hasattr(janela, "menuBar") else 22
        largura = min(840, janela.width() - 60)
        altura = max(200, janela.height() - topo - 30)
        self.setGeometry((janela.width() - largura) // 2, topo, largura, altura)
