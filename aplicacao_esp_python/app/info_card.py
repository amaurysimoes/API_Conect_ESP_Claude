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
      "Monte a lista de pinos: + ADICIONAR PINO ou TODOS OS PINOS LIVRES. Cada pino é Saída (ON/OFF) ou Entrada (switch).",
      "Clique em ⚡ Gravar no ESP. Ao ligar, o ESP aparece sozinho no site, na página Automação.",
      "Arquivo → Editar Automações ESP: escolha um arquivo do firmware (abre na pasta firmware; se não achar, em C:\\) e edite o código (o texto aparece com cores e números de linha, como no VS Code). SALVAR grava no arquivo; CANCELAR fecha sem gravar o que não foi salvo.",
      "Arquivo → Nova Automação ESP_Firebase: reservado, em branco por enquanto."]),
    ("4. Site", "https://amauryesp-active.web.app",
     "Página na internet com o Início e as páginas Automação, Brokers IOT, Gerenciar Brokers IOT e Informações do Sistema.",
     "Acionar os ESPs e mandar comandos às máquinas sem abrir este programa, de qualquer lugar.",
     ["Automação: clique num ESP online e use Ligar ou Pulso em cada pino.",
      "Brokers IOT: dois grupos. <b>Broker Firebase</b> (internet: a máquina pode estar em qualquer rede) e <b>Broker MQTT</b> "
      "(rede local: a máquina precisa estar na mesma rede do broker). Clique num broker, escolha a máquina e o comando e clique "
      "em EXECUTAR. O broker aparece online quando está ativo ou quando alguma máquina dele está online.",
      "Gerenciar Brokers IOT: veja todos os brokers criados e apague os que não quer mais (dois cliques).",
      "Informações do Sistema: este mesmo guia, sempre como o último card.",
      "Para atualizar o site depois de mudar algo: veja o passo a passo Publicar_firepage.md."]),
    ("5. Automação IOT Site", "menu Automação IOT Site → Site Gerenciamento IOT e Listar Real Time Database",
     "O mesmo site, aberto dentro deste programa, e a lista do banco de dados em tempo real.",
     "Usar o site sem abrir o navegador e ver o que está gravado no Firebase.",
     ["Os dois abrem como um card sobre a janela principal (como este); cada um fecha só no seu X.",
      "Site Gerenciamento IOT: abre o site aqui dentro. Use Recarregar para atualizar ou Abrir no navegador para abrir fora do programa.",
      "Listar Real Time Database: mostra o conteúdo do banco (esps e brokers, os nós que as regras liberam) com visual de editor de código e atualiza sozinho, na hora que algo muda."]),
    ("6. Broker MQTT IOT", "menu Broker IOT → Broker MQTT IOT",
     "Um broker MQTT que roda dentro deste programa, para a rede local.",
     "Máquinas da mesma rede (ou sem internet) recebem comandos direto. Ele também entrega ao MQTT os comandos que o site "
     "manda pelo Firebase: por isso precisa ficar ativo na rede.",
     ["Informe o nome, a porta (padrão 1883), o usuário e a senha das máquinas.",
      "Clique em ATIVAR BROKER MQTT e deixe o programa aberto. Se o Windows perguntar do Firewall, permita redes privadas.",
      "A lista mostra as máquinas conectadas. PARAR BROKER MQTT desliga."]),
    ("7. Broker Fire IOT", "menu Broker IOT → Broker Fire IOT",
     "Cadastra este computador como broker no Firebase e lista os brokers Firebase, os da internet (online/offline). Os brokers MQTT, da rede local, ficam no Broker MQTT IOT e no site.",
     "Mandar comandos às máquinas por qualquer rede, pela internet.",
     ["Dê um nome e clique em ATIVAR BROKER FIRE.",
      "Clique num broker da lista: abre o card de comandos.",
      "Escolha a máquina e o comando e clique em EXECUTAR. Um clique é um comando, executado uma vez."]),
    ("8. Gerenciar IOT Broker", "menu Broker IOT → Gerenciar IOT Broker (e no site: Gerenciar Brokers IOT)",
     "Lista todos os brokers criados, Firebase e MQTT.",
     "Ver o que existe, trocar o nome e apagar o que não precisa mais (com senha). Apagar remove o broker, as máquinas e a fila de comandos dele.",
     ["Abra o menu Broker IOT → Gerenciar IOT Broker. A lista mostra o tipo (Firebase ou MQTT), o IP, quantas máquinas e se está online.",
      "EDITAR NOME (botão azul): troca o nome do broker. Depois, escolha o nome novo no agente e no app.",
      "APAGAR BROKER (botão vermelho): só apaga se você digitar a senha no campo \"Senha para apagar\".",
      "No site é igual: Gerenciar Brokers IOT, botões Editar e Apagar.",
      "Restos sem tipo aparecem como \"sem tipo (resto de máquina)\": são de uma máquina que ainda escreve ali; apague para limpar."]),
    ("9. Automação IOT Fire", "menu Broker IOT → Automação IOT Fire",
     "Cria planos que o agente da máquina executa sozinho na hora marcada. Por enquanto: enviar e-mail. O plano fica salvo no Firebase.",
     "Mandar e-mails automáticos numa data e hora (uma vez, todo dia ou em dias da semana), com destinatários, título e texto à sua escolha.",
     ["Antes, no Agente IOT (canal Firebase), cadastre em \"Contas de e-mail\" o Gmail e a senha de app que vão enviar. Pode cadastrar várias contas; as senhas ficam só na máquina do agente e o agente precisa ficar ligado.",
      "Abra Automação IOT Fire, escolha o broker e a máquina, escolha a conta que envia, preencha nome, quando, destinatários, título e texto e clique em SALVAR PLANO.",
      "Clique num plano da lista para editar; ATIVAR / DESATIVAR e APAGAR PLANO ficam acima do formulário.",
      "A lista mostra o resultado da última execução (OK ou o erro). Máquina desligada: o e-mail sai se o atraso for de até 10 minutos; depois disso o horário é pulado."]),
    ("10. Agente IOT", "programa à parte: iot_FireMQtt_agente\\dist\\windows\\AgenteIOT.exe (Linux: dist/linux/AgenteIOT)",
     "Programa instalado em cada máquina (Windows ou Linux) que será controlada.",
     "Executa o que chega do broker, só ações permitidas: abrir o Explorer (pasta opcional), abrir um programa cadastrado, "
     "abrir um site, bloquear a tela, informações do sistema, desligar e reiniciar (pedem confirmação). No canal Firebase também executa os planos da Automação IOT Fire (e-mails agendados).",
     ["Abra o agente, dê o nome da máquina e escolha o broker: Firebase ou MQTT. Clique em INICIAR AGENTE.",
      "Marque \"Iniciar sozinho\" para ele ligar junto com o programa.",
      "Depois de configurado, o agente abre escondido: só o ícone ao lado do relógio. Clique no ícone para abrir; ao minimizar, ele volta a se esconder. Botão direito no ícone: Abrir ou Sair (Sair para o agente).",
      "Sites: digite www.gmail.com e o https:// entra sozinho.",
      "No MQTT também vale texto simples, por exemplo: <i>explorer</i>, <i>info</i>, <i>bloquear</i>, <i>url www.site.com</i>.",
      "Cada comando executa uma vez; comando com mais de 30 s é ignorado.",
      "Linux: rode na sessão gráfica (precisa de libxcb-cursor0) e cadastre os programas permitidos no config.json.",
      "Passo a passo completo: Agente_IOT.md."]),
    ("11. Tema e documentos", "botão Light/Dark e pasta 1-#DocumentacaoTecnica",
     "O botão do canto troca entre escuro e claro. A pasta de documentação guarda tudo o que foi feito.",
     "Consultar o histórico e refazer o projeto passo a passo.",
     ["Preferencias_projeto.md: histórico e onde estamos.",
      "Estrutura_projeto.md: o código de todos os arquivos.",
      "Criar_firepage.md, Publicar_firepage.md e Agente_IOT.md: site e agente."]),
    ("12. Informações do Sistema", "menu Informações do Sistema (programa) e último card do Início (site)",
     "Este guia.",
     "Saber o que cada coisa é e como usar. Fica sempre como o último card do programa e do site, e é atualizado a cada "
     "função nova.",
     ["No programa, só fecha no X do card.", "No programa, todos os formulários abrem assim, como card dentro da janela principal, um por vez: abrir outro fecha o atual (os brokers e a gravação do firmware continuam rodando em segundo plano).", "No site, o X volta ao Início."]),
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
