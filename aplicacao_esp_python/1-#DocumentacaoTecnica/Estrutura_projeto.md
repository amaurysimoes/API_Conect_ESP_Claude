# Estrutura do projeto — Automacao_IOT-ESP

Passo a passo para montar o projeto do zero: o que instalar, como ficam as pastas e como rodar e compilar.
**Não traz o código**: ele está nos próprios arquivos do projeto. Gerado por `tools/gerar_estrutura.py`
(rode de novo depois de qualquer ajuste: `.venv\Scripts\python.exe tools\gerar_estrutura.py`).

## O que é

**Automacao_IOT-ESP** reúne três partes:

1. **App desktop (PyQt6)**: janela principal só com a barra de menu **Arquivo | Automação IOT Site |
   Informações do Sistema**. Formulários: Repetidor ESP32, Automação Firebase, editor de código dos firmwares, e os cards
   Site Gerenciamento IOT, Listar Real Time Database e Informações do Sistema.
2. **Firmware ESP32** (PlatformIO): `Repetidor` (repetidor Wi-Fi com NAT, display OLED) e `Automacao`
   (aciona pinos e lê switches pelo Firebase).
3. **Site** (`fire_page/`, Vite + React) publicado no Firebase Hosting: https://amauryesp-active.web.app

Projeto Firebase: `amauryesp-active` (Realtime Database `https://amauryesp-active-default-rtdb.firebaseio.com`).

## Passo 1 — Instalar no computador

| O quê | Para quê | Como |
|---|---|---|
| Python 3.11+ | app e agente | https://www.python.org (marque "Add to PATH") |
| Node.js LTS (20+) e npm | construir o site | https://nodejs.org |
| Firebase CLI | publicar o site | `npm install -g firebase-tools` e depois `firebase login` |
| PlatformIO | compilar e gravar o firmware | `pip install platformio` |
| Driver USB-serial (CP210x ou CH340) | gravar/falar com o ESP32 | do fabricante da placa |
| WSL + Ubuntu 24.04 | gerar os executáveis Linux no Windows | `wsl --install -d Ubuntu-24.04` |
| VS Code (opcional) | editar | https://code.visualstudio.com |

No Ubuntu (WSL) instale também: `sudo apt install python3 python3-venv python3-pip libxcb-cursor0`.

## Passo 2 — Criar a pasta e o ambiente virtual

```powershell
mkdir C:\Dev-AHS\AUTOMACAO_IOT
cd C:\Dev-AHS\AUTOMACAO_IOT
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
```

## Passo 3 — Estrutura de pastas

```
AUTOMACAO_IOT/
├── CLAUDE.md
├── main.py  e os atalhos: RepetidorESP.py, AutomacaoFirebase.py, AutomacaoSiteFire.py
├── requirements.txt
├── build_windows.ps1 / build_linux.sh          (executáveis do app)
├── 1-#DocumentacaoTecnica/                      (Preferencias_projeto.md, Estrutura_projeto.md,
│                                                 Criar_firepage.md, Publicar_firepage.md)
├── assets/            icone_ia.ico, icone_ia.png, check.png, background_iot.jpg, background_iot_l.jpg
├── app/               theme, widgets, main_window, info_card, painel_card, code_editor, ...
│   └── screens/       um arquivo por formulário
├── firmware/
│   ├── Repetidor/     platformio.ini, include/, src/repetidor.cpp
│   └── Automacao/     platformio.ini, include/, src/automacao_iot.cpp
├── fire_page/         site: package.json, vite.config.js, firebase.json, index.html, public/, src/
└── tools/             gerar_estrutura.py, gerar_topicos_site.py, gerar_criar_firepage.py
```

Coloque o ícone oficial em `assets/icone_ia.ico` (usado na janela e no executável) e `assets/icone_ia.png`.
A lista de arquivos e o que cada um faz está no Passo 6.

## Passo 4 — Instalar as dependências

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt pyinstaller
cd fire_page
npm install
cd ..
```

## Passo 5 — Firebase (uma vez)

1. Console do Firebase: projeto `amauryesp-active`, **Realtime Database** em modo teste e **Hosting** ativado.
2. Regras do banco: leitura e escrita abertas só em `esps` e `brokers` (o resto fica bloqueado).
3. No terminal: `firebase login` (e `firebase use amauryesp-active` dentro de `fire_page`).
4. Para criar a página do zero: `Criar_firepage.md`. Para publicar: `Publicar_firepage.md`
   (`cd fire_page`, `npm run build`, `firebase deploy --only hosting`).

## Passo 6 — Arquivos do projeto (o que cada um faz)

- `CLAUDE.md` — Instrução lida pelo Claude Code ao abrir a pasta: manda ler os documentos.
- `requirements.txt` — Dependências Python do app.
- `main.py` — Ponto de entrada do app: tema escuro, ícone e janela principal centralizada (1024x768).
- `RepetidorESP.py` — Roda só o formulário Repetidor ESP32.
- `AutomacaoFirebase.py` — Roda só o formulário Automação Firebase.
- `AutomacaoSiteFire.py` — Roda só o Site Gerenciamento IOT.
- `app/paths.py` — Acha arquivos empacotados (dentro do executável) ou no disco; ícone do programa.
- `app/theme.py` — Tema Dark (padrão) / Light, cores neon e o stylesheet global.
- `app/widgets.py` — Card, botões neon, botão de tema e o fundo (background) responsivo por tema.
- `app/main_window.py` — Janela principal: barra de menu neon; TODOS os formulários abrem como card dentro dela, um por vez. Menus: Arquivo | Automação IOT Site | Informações do Sistema.
- `app/info_card.py` — Card neon 'Informações do Sistema' (TOPICOS: o que cada coisa é, para que serve, como usar). Sempre o último card.
- `app/painel_card.py` — Card neon sobre a janela principal, com X próprio: é onde TODOS os formulários abrem (barra de rolagem se não couber; pergunta se há algo não salvo).
- `app/code_editor.py` — Caixa de texto com visual de VS Code (números de linha, cores de sintaxe C/C++, JSON, INI).
- `app/firebase_rest.py` — Acesso ao Realtime Database por REST (sem SDK), com execução em thread.
- `app/serial_link.py` — Comunicação serial com o ESP32 (linhas com TAB).
- `app/screens/firebase.py` — Formulário Automação Firebase: gera o automacao_config.h e grava o firmware Automação.
- `app/screens/repetidor.py` — Formulário Repetidor ESP32: porta, redes, tipo/usuário/senha, ativar/parar.
- `app/screens/flash_dialog.py` — Card 'Gravar firmware (.cpp)': compila e grava via PlatformIO.
- `app/screens/site_fire.py` — Site Gerenciamento IOT: mostra https://amauryesp-active.web.app/ (QtWebEngine).
- `app/screens/listar_rtdb.py` — Listar Real Time Database: esps e brokers ao vivo (streaming do Firebase).
- `app/screens/editar_automacoes_esp.py` — Editar Automações ESP: editor de código de um arquivo (abre em firmware/), SALVAR/CANCELAR.
- `firmware/Repetidor/platformio.ini` — Projeto PlatformIO do repetidor (pioarduino / Arduino-ESP32 3.x).
- `firmware/Repetidor/include/repetidor_config.h` — Liga/desliga o display e define os pinos do OLED.
- `firmware/Repetidor/include/dashboard.h` — Página do dashboard servida pelo ESP32 (porta 80) e o JSON /status.
- `firmware/Repetidor/src/repetidor.cpp` — Firmware do ESP32: scan, repetidor (NAT), display.
- `firmware/Automacao/platformio.ini` — Projeto PlatformIO da Automação (pioarduino + ArduinoJson).
- `firmware/Automacao/include/automacao_config.h` — Configuração do dispositivo; o form Automação Firebase gera este arquivo.
- `firmware/Automacao/src/automacao_iot.cpp` — Firmware Automação: segue esps/<nome>/pinos no Firebase, aciona saídas, lê switches e Vcc.
- `fire_page/package.json` — Site (Vite + React): dependências e scripts.
- `fire_page/vite.config.js` — Site: configuração do Vite.
- `fire_page/firebase.json` — Site: configuração do Firebase Hosting.
- `fire_page/index.html` — Site: HTML base (ícone, título).
- `fire_page/src/*.jsx / *.js / styles.css` — Site: páginas (Início, Automação, Brokers, Gerenciar, Informações), ícones, comandos, estilo neon. topicos.js é GERADO.
- `build_windows.ps1` — Gera o Automacao_IOT-ESP.exe.
- `build_linux.sh` — Gera o Automacao_IOT-ESP para Linux.
- `tools/` — gerar_estrutura.py (este documento), gerar_topicos_site.py, gerar_criar_firepage.py.


## Passo 7 — Rodar

**App** (na raiz):

```powershell
.\.venv\Scripts\python.exe main.py
```

**Site em desenvolvimento**: `cd fire_page` e `npm run dev`.

**Firmware pelo terminal** (opcional; no app existe o botão "⚡ Gravar firmware"). Use o **PowerShell**
(no Git Bash falha com "MSys/Mingw is not supported"). O toolchain fica numa pasta curta porque o Windows limita
caminhos a 260 caracteres. Feche o app antes (ele segura a porta serial):

```powershell
cd firmware\Repetidor
$env:PLATFORMIO_CORE_DIR = 'C:\pio'
pio run -t upload --upload-port COM3
```

A primeira vez baixa vários GB (~15 min). Apagar a flash: `python -m esptool --chip esp32 --port COM3 erase-flash`.

## Protocolo serial do Repetidor (115200, uma linha por comando, campos separados por TAB)

| Direção | Mensagem |
|---|---|
| App → ESP | `PING`, `SCAN`, `START<TAB>ssid<TAB>COMUM ou EAP<TAB>usuario<TAB>senha<TAB>senhaRepetidor`, `STOP` |
| ESP → App | `PONG` (e `OK` logo depois, se já estiver repetindo), `NET<TAB>ssid<TAB>rssi<TAB>canal<TAB>seguranca` (0 aberta, 1 senha, 2 corporativa), `SCAN_END`, `OK<TAB>rede<TAB>ip<TAB>rssi<TAB>canal<TAB>apSsid`, `ERR<TAB>msg`, `STOPPED`, `STAT<TAB>rssi<TAB>clientes`, `LOG<TAB>msg` |

## Se renomear a pasta raiz

O `.venv` guarda o caminho antigo: recrie com `Remove-Item .venv -Recurse -Force; python -m venv .venv` e repita o
Passo 4. O estado atual e o histórico estão em `Preferencias_projeto.md` (seção "ESTADO ATUAL e como retomar").

## Regenerar este documento

```powershell
.\.venv\Scripts\python.exe tools\gerar_estrutura.py
```

## Criar os executáveis (Windows e Linux)

Sempre gerar **os dois**: o app para Windows e para Linux. O PyInstaller não faz build cruzado:
o Windows é gerado no Windows e o Linux no Linux (no Windows, pelo WSL). Os scripts não dependem do nome da pasta.
Antes de gerar o site: `tools\gerar_estrutura.py` (gera o `topicos.js` do card Informações do Sistema).

### Windows

Se o programa estiver aberto, **renomeie o .exe antes** (o Windows deixa renomear um .exe em execução). No PowerShell,
na raiz do projeto:

```powershell
.\build_windows.ps1                          # dist\windows\Automacao_IOT-ESP.exe
```

### Linux

No Linux, na raiz do projeto:

```bash
chmod +x build_linux.sh
./build_linux.sh                             # dist/linux/Automacao_IOT-ESP
```

No Windows, pelo WSL (copia o projeto sem a .venv, gera os dois e traz os binários de volta). No PowerShell, na raiz:

```powershell
$src = (wsl wslpath -a ($PWD.Path -replace '\\','/')).Trim()   # caminho da pasta no WSL
wsl -d Ubuntu-24.04 -- bash -lc "rm -rf ~/rep_build && mkdir ~/rep_build && cd $src && tar --exclude=.venv --exclude=dist --exclude=build --exclude=__pycache__ --exclude=.pio --exclude=.venv-linux --exclude=node_modules -cf - . | tar -xf - -C ~/rep_build && cd ~/rep_build && sed -i 's/\r$//' build_linux.sh iot_FireMQtt_agente/build_linux.sh && bash build_linux.sh && bash iot_FireMQtt_agente/build_linux.sh && mkdir -p $src/dist/linux $src/iot_FireMQtt_agente/dist/linux && cp dist/linux/Automacao_IOT-ESP $src/dist/linux/ && cp iot_FireMQtt_agente/dist/linux/AgenteIOT $src/iot_FireMQtt_agente/dist/linux/"
```

Para rodar no Linux: instale `libxcb-cursor0` (Qt) e coloque o usuário no grupo da serial
(`sudo usermod -aG dialout $USER`, depois relogar). O agente no Linux roda na sessão gráfica.
