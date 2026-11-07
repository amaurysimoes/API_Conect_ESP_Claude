# Estrutura do Sistema — Automacao IOT Amaury

Passo a passo para montar e pôr para funcionar o sistema inteiro, do zero, sem ajuda.
O código está nos próprios arquivos do repositório; aqui está **o que cada parte faz, como elas se falam,
o que instalar e em que ordem fazer**.

---

## 1. Visão geral

O sistema tem 4 partes, todas ligadas pelo mesmo banco: o **Firebase Realtime Database** do projeto
`amauryesp-active` (`https://amauryesp-active-default-rtdb.firebaseio.com`).

```
                      ┌──────────────────────── Firebase Realtime Database ────────────────────────┐
                      │  esps/<nome>/pinos/<gpio>/estado | pulso    esps/<nome>/palavras/<gpio>     │
                      └───────▲───────────────────────▲──────────────────────────▲──────────────────┘
                              │ lê a cada 1 s          │ grava (REST)              │ grava (REST)
                              │ heartbeat a cada 10 s  │                           │
   ┌──────────────┐    ┌──────┴──────┐        ┌───────┴────────┐          ┌───────┴─────────┐
   │ Programa de  │──► │   ESP32     │        │ Ponte (Node)   │ ◄─ MCP ─ │     Claude      │
   │ carga (PyQt6)│USB │  firmware   │        │ src/servidor.js│          │ (claude.ai/Code)│
   └──────────────┘    │  Automacao  │        │ painel /       │ ◄─ web ─ │ Você (navegador)│
                       └─────────────┘        └────────────────┘          └─────────────────┘
```

| Parte | Pasta | Função |
|---|---|---|
| Ponte (painel + MCP) | `src/` | Painel web para dar nomes ("luz frente") aos pinos e servidor MCP que deixa o Claude ligar/desligar os pinos. |
| Firmware do ESP | `aplicacao_esp_python/firmware/Automacao` (cópia em `firmware_esp/Automacao`) | O ESP se registra no Firebase, obedece `estado`/`pulso` das saídas e publica as entradas. |
| Programa de carga | `aplicacao_esp_python/` | App desktop PyQt6 que gera a configuração do ESP, compila e grava o firmware (e outras ferramentas). |
| Documentação | `DocumentacaoTecnica/` | Este arquivo e o `ManualNovosDispositivos.md`. |

Fluxo de um pedido: você diz ao Claude *"liga a luz da frente"* → o Claude chama a ferramenta `acionar`
da ponte → a ponte acha o pino pelas palavras cadastradas e grava `estado: true` no Firebase → o ESP lê
em até ~1 s e liga o pino.

---

## 2. Contas e programas necessários

| O quê | Para quê | Onde |
|---|---|---|
| Conta Google + projeto Firebase | o banco | https://console.firebase.google.com |
| Conta GitHub | guardar o código e o Render puxar dele | https://github.com |
| Conta Render (plano grátis) | hospedar a ponte na internet | https://render.com |
| Conta Claude | usar o conector | https://claude.ai |
| Git | versionar | https://git-scm.com |
| Node.js 20+ | rodar a ponte | https://nodejs.org |
| Python 3.11 ou 3.12 (marcar "Add to PATH") | programa de carga | https://www.python.org |
| PlatformIO | compilar/gravar o firmware | `pip install platformio` |
| Driver USB-serial (CP210x ou CH340) | a porta COM do ESP aparecer | fabricante da placa |
| Placa ESP32 (ex.: ESP32 DevKit) + cabo USB **de dados** | o dispositivo | — |

> Use Python 3.11 ou 3.12. Com 3.14 a instalação do `amqtt` falha (o PyYAML que ele pede não tem pacote
> pronto e exige o compilador do Visual C++).

---

## 3. Firebase (o banco)

1. No console do Firebase: **Adicionar projeto** (aqui: `amauryesp-active`).
2. **Build → Realtime Database → Criar banco de dados**. Anote a URL
   (`https://<projeto>-default-rtdb.firebaseio.com`).
3. Em **Regras**, libere só o caminho `esps` (sem login, é o que o firmware e a ponte usam):

   ```json
   {
     "rules": {
       "esps": { ".read": true, ".write": true }
     }
   }
   ```
   Atenção: quem souber a URL pode ler e gravar em `esps`. Não use para fechadura, alarme ou algo crítico.

4. Estrutura dos dados (criada sozinha pelo ESP quando ele conecta; as `palavras` pelo painel):

   ```
   esps/
     FIRE_AHS01/
       modelo:   "ESP32"
       ip:       "192.168.0.50"
       vcc:      4.98                       (se a medição estiver ligada)
       visto_em: 1767225600000              (hora do servidor; o ESP atualiza a cada 10 s)
       pinos/
         26/ { nome: "Rele 1",  tipo: "saida",   estado: false, pulso: false }
         27/ { nome: "Chave 1", tipo: "entrada", estado: true }
       palavras/
         26: "luz frente, luz da varanda"     (texto, separado por vírgula)
   ```

   Regras do protocolo:
   - **Saída**: quem grava `estado` é a ponte/site; o ESP obedece. `pulso: true` = liga ~1 s, desliga sozinho
     e o ESP volta `pulso` para `false`.
   - **Entrada (switch)**: quem grava `estado` é o ESP.
   - **Online** = `visto_em` há menos de 30 s.
   - As palavras ficam dentro de `esps/<nome>` porque é o único caminho que as regras liberam.
     O ESP se registra com PATCH de caminhos (`pinos/<gpio>/nome`...), então nunca apaga as `palavras`.

---

## 4. A ponte (Node.js) — `src/`

### 4.1 Criar o projeto

```powershell
mkdir C:\Dev_AHS\API_Conect_Firebase
cd C:\Dev_AHS\API_Conect_Firebase
git init
npm init -y
npm install @modelcontextprotocol/sdk zod
```

No `package.json`: `"type": "module"` e os scripts:

```json
"scripts": {
  "start": "node src/servidor.js",
  "local": "node --env-file=.env src/servidor.js",
  "mcp":   "node src/mcp.js"
}
```

`.gitignore`: `node_modules/`, `.env`, `*.log` (e as linhas da `aplicacao_esp_python`: `.venv/`, `dist/`,
`build/`, `**/node_modules/`, `**/.pio/`, `__pycache__/`, `*.pyc`).

### 4.2 Os arquivos e o que cada um faz

| Arquivo | Faz |
|---|---|
| `src/firebase.js` | Acesso ao banco por REST (`fetch` em `<URL>/<caminho>.json`, tempo limite 8 s). `listarEsps()` lê `esps` e devolve, por ESP: nome, ip, modelo, `online` (visto_em < 30 s), `visto_ha_s`, lista de pinos `{gpio, nome, tipo, estado}` e as palavras `{gpio: [frases]}`. Trata o Firebase devolver `pinos` como **array** quando as chaves são números seguidos. `gravarPalavras(esp, gpio, texto)` faz PUT (ou DELETE se vazio). `acionar(esp, gpio, acao)` faz PATCH `{estado: true/false}` ou `{pulso: true}`. URL vem de `FIREBASE_URL` (padrão: o projeto `amauryesp-active`). |
| `src/mapa.js` | Encontra o pino pelo que foi pedido. `tokens()` deixa em minúsculas, tira acentos e descarta palavras de ligação (a, o, da, do, na, casa, minha...). `achar()`: uma frase cadastrada bate quando **todas** as palavras dela aparecem no pedido; se várias batem, fica só a mais específica (com mais palavras); empate = devolve todas. |
| `src/ferramentas.js` | Cria o servidor MCP (`McpServer` do SDK) com 2 ferramentas: **`listar_dispositivos`** (ESPs, online, saídas com estado e palavras) e **`acionar`** (`acao`: ligar/desligar/pulso; `descricao` com o que o usuário falou, ou `esp`+`pino`). Se há mais de um ESP e não ficou claro qual, ou a descrição bate com vários pinos, devolve erro pedindo para o Claude perguntar ao usuário. Se o nome do ESP aparece na frase, só vale esse ESP. Recusa pino de entrada. Avisa se o ESP está offline (o comando fica gravado). |
| `src/servidor.js` | Servidor HTTP (sem framework). Rotas: `/saude` (para o Render), `/mcp` e `/mcp/<token>` (MCP remoto sem estado: cada POST cria servidor + `StreamableHTTPServerTransport`), `/` (painel HTML embutido), `/api/dados` (GET, ESPs) e `/api/palavras` (POST, lista `{esp, gpio, texto}`; valida `esp` só letras/números/`-`/`_` e `gpio` só número). Painel protegido por **Basic Auth** (usuário qualquer, senha `PAINEL_SENHA`); MCP protegido por `Authorization: Bearer <MCP_TOKEN>` **ou** token no fim da URL (o conector do claude.ai só aceita URL). Comparação com `timingSafeEqual`. Sem a variável definida a rota fica desligada (503). Escuta em `0.0.0.0` se existir `PORT` (nuvem), senão só em `127.0.0.1`. |
| `src/mcp.js` | MCP local por stdio (para o Claude Code no próprio PC). Nunca usar `console.log` nele (stdout é do protocolo). |
| `.mcp.json` | Registra o servidor `casa` (`node src/mcp.js`) para o Claude Code aberto nesta pasta. |
| `.env.example` | Modelo das variáveis: `FIREBASE_URL`, `PAINEL_SENHA`, `MCP_TOKEN`, `PORTA`. |
| `render.yaml` | Blueprint do Render: serviço web Node, plano free, `npm install`, `node src/servidor.js`, health check `/saude`, `NODE_VERSION=20`, `MCP_TOKEN` e `PAINEL_SENHA` gerados automaticamente. |

### 4.3 Rodar no PC

```powershell
copy .env.example .env      # e troque a senha e o token por valores seus
npm install
npm run local               # abre em http://localhost:3333
```

Teste rápido (PowerShell):

```powershell
Invoke-WebRequest http://127.0.0.1:3333/saude -UseBasicParsing   # deve responder {"ok":true}
```

### 4.4 Publicar no Render

1. Crie o repositório **privado** no GitHub e envie: `git remote add origin <url>` e `git push -u origin main`.
2. Render → **New → Blueprint** → escolha o repositório (o `render.yaml` configura tudo).
3. No serviço → **Environment**: copie `PAINEL_SENHA` e `MCP_TOKEN` (foram gerados sozinhos).
4. Abra `https://<servico>.onrender.com/` (usuário qualquer, senha = `PAINEL_SENHA`).
5. O plano grátis dorme após ~15 min parado: o primeiro pedido demora ~30 s.

### 4.5 Ligar ao Claude

- **claude.ai**: Configurações → Conectores → Adicionar conector personalizado → URL
  `https://<servico>.onrender.com/mcp/<MCP_TOKEN>`.
- **Claude Code (remoto)**:
  `claude mcp add --transport http casa https://<servico>.onrender.com/mcp --header "Authorization: Bearer <MCP_TOKEN>"`
- **Claude Code (local, sem Render)**: abrir esta pasta; o `.mcp.json` já registra `casa`.

---

## 5. O firmware do ESP32 — `firmware/Automacao`

PlatformIO com Arduino-ESP32 3.x (plataforma **pioarduino**). `platformio.ini`:

```ini
[env:esp32dev]
platform = https://github.com/pioarduino/platform-espressif32/releases/download/stable/platform-espressif32.zip
board = esp32dev
framework = arduino
monitor_speed = 115200
upload_speed = 460800
lib_deps =
	adafruit/Adafruit SSD1306@^2.5.11
	adafruit/Adafruit GFX Library@^1.11.9
	bblanchon/ArduinoJson@^7.0.0
```

| Arquivo | Faz |
|---|---|
| `include/automacao_config.h` | **Único arquivo que muda de um ESP para outro** (o programa de carga o gera): `NOME_DISPOSITIVO`, `MODELO_DISPOSITIVO`, `WIFI_SSID`/`WIFI_SENHA`, `FIREBASE_HOST` (sem `https://`), `FIREBASE_AUTH` (vazio = regras abertas), display OLED (`TEM_DISPLAY`, SDA 21, SCL 22, 0x3C), lista `PINOS[]` `{gpio, nome, SAIDA/ENTRADA, invertido}` e medição de Vcc (`VCC_PINO`, `VCC_DIVISOR`; 0 desliga). |
| `src/automacao_iot.cpp` | Conecta no Wi-Fi; registra-se no Firebase (PATCH com `modelo`, `ip`, `pinos/<gpio>/nome|tipo`, `visto_em` = timestamp do servidor) sem apagar o `estado` das saídas; a cada ~1 s lê o nó do ESP e aplica `estado`/`pulso` nas saídas; lê as entradas com debounce e publica quando mudam; a cada 10 s manda Vcc + `visto_em` (heartbeat); mostra status no OLED (última linha = último pino acionado). Reinicia se ficar muito tempo sem falar com o Firebase. |

Compilar e gravar à mão (sem o programa de carga):

```powershell
cd aplicacao_esp_python\firmware\Automacao
# edite include\automacao_config.h
pio run                     # compila
pio run -t upload           # grava (ESP no USB; em algumas placas segure BOOT no início)
pio device monitor          # vê o log a 115200
```

Pinos: evitar 0, 2, 5, 12 e 15 para relé (boot); preferidos 4, 13, 14, 16–19, 23, 25–27, 32, 33;
34–39 só entrada (sem pull-up); 1, 3 e 6–11 são reservados.

Mantenha `firmware_esp/Automacao` igual a `aplicacao_esp_python/firmware/Automacao` (é só cópia de referência).

---

## 6. O programa de carga — `aplicacao_esp_python/`

O passo a passo completo dele (instalação, estrutura, cada arquivo, como gerar os executáveis Windows e
Linux, o site `fire_page` e o agente) está em:

- `aplicacao_esp_python/1-#DocumentacaoTecnica/Estrutura_projeto.md` — montar o app do zero.
- `aplicacao_esp_python/1-#DocumentacaoTecnica/Criar_firepage.md` e `Publicar_firepage.md` — o site.
- `aplicacao_esp_python/1-#DocumentacaoTecnica/Agente_IOT.md` — o agente.

Resumo para rodar pelo código:

```powershell
cd aplicacao_esp_python
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt pyinstaller
.\.venv\Scripts\python.exe -m pip install paho-mqtt==2.1.0
.\.venv\Scripts\python.exe main.py
```

Cuidados conhecidos:
- O `.venv` **não vai para o git e não serve em outro PC** (ele guarda o caminho do Python da máquina onde foi
  criado). Em cada computador, crie o seu com os comandos acima.
- `paho-mqtt` é usado por `app/mqtt_gateway.py`, mas não está no `requirements.txt` do app: instale à parte
  (está no `requirements.txt` do agente).
- Em `app/screens/editar_automacoes_esp.py` a pasta inicial do editor é fixa em `C:\Dev-AHS\AUTOMACAO_IOT\firmware`;
  em outra pasta o seletor abre em `C:\` (funciona, só não abre direto no firmware).
- Gerar o executável Windows: `.\build_windows.ps1` (sai em `dist\windows`). O `.exe` passa de 100 MB e vai
  em **Releases** do GitHub, não no repositório.

---

## 7. Ordem para montar tudo do zero

1. Instalar os programas da seção 2.
2. Criar o Firebase e as regras (seção 3).
3. Clonar ou criar o repositório com `src/`, `package.json`, `render.yaml`, `.mcp.json`, `.env.example`
   e `aplicacao_esp_python/` (seção 4.1).
4. Rodar a ponte no PC e testar `/saude` (seção 4.3).
5. Gravar um ESP pelo programa de carga ou à mão (seções 5 e 6). Passo a passo do dispositivo:
   `DocumentacaoTecnica/ManualNovosDispositivos.md`.
6. Conferir no Firebase que apareceu `esps/<nome>` e que `visto_em` muda a cada ~10 s.
7. Publicar a ponte no Render (seção 4.4).
8. No painel, escrever as palavras de cada pino e **Salvar**.
9. Cadastrar o conector no Claude (seção 4.5) e pedir: *"liga a luz da frente"*.

---

## 8. Dicas e problemas comuns

| Sintoma | Causa / solução |
|---|---|
| Claude diz "nenhum pino combina" | Faltam palavras no painel, ou a frase cadastrada tem uma palavra que você não fala. **Cadastre só o nome da coisa** (`led`, `refletor`, `luz frente`), sem o verbo: com `ligar led` cadastrado, o pedido "liga o led" não bate (`liga` ≠ `ligar`) e "desliga o led" também não. |
| Claude avisa que o ESP está offline | ESP sem energia ou sem Wi-Fi (`visto_em` parado). O comando fica gravado e vale quando ele voltar. |
| Painel ou MCP responde 503 | `PAINEL_SENHA` ou `MCP_TOKEN` não definida no ambiente. |
| MCP responde 401 | Token errado na URL ou no cabeçalho. |
| Primeiro pedido demora ~30 s | Render grátis acordando. |
| ESP não aparece no Firebase | SSID/senha errados, rede 5 GHz (o ESP32 só vê 2,4 GHz) ou `FIREBASE_HOST` com `https://`. |
| Não aparece porta COM | Driver USB ausente ou cabo só de carga. |
| `pip install` falha no PyYAML | Python 3.14; use 3.11 ou 3.12. |
| `No Python at ...` ao rodar o `.venv` | `.venv` criado em outro PC; apague e crie de novo. |
