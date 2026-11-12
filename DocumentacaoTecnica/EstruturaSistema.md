# Estrutura do sistema

Tudo conversa pelo Firebase Realtime Database `amauryesp-active` (`https://amauryesp-active-default-rtdb.firebaseio.com`).

```
Claude / navegador ──► Ponte (Render) ──► Firebase ──► ESP32 · agente do PC · app Android
```

| Parte | Pasta |
|---|---|
| IOT-Automacao-ESP (ESP, painel, MCP, Firebase) | `iot_automacao_esp/` |
| Firmware ESP32 | `aplicacao_esp_python/firmware/Automacao` (cópia: `firmware_esp/Automacao`) |
| Programa de carga do ESP | `aplicacao_esp_python/` |
| Mapas e GPS | `aplicacao_gps/` |
| Agente do PC + aba Desk | `aplicacao_desk_agente/` |
| App Android | `aplicacao_android/` |
| Aba CLP EtherNet/IP | `aplicacao_clp/` (+ `clp_eip.py` e `acoes_clp.py` no agente) |
| Aba Consulta Serial (leitor de código pela câmera) | `aplicacao_consultar_sn/` |
| Aba Documentos Database (Aiven MySQL) | `aplicacao_docs_mysqlaiven/` (+ `acoes_docs.py` no agente) |
| Manuais | `DocumentacaoTecnica/` |

## 1. Instalar
| O quê | Onde |
|---|---|
| Git | https://git-scm.com |
| Node.js 20+ | https://nodejs.org |
| Python 3.11 ou 3.12 (marcar "Add to PATH"; 3.14 falha no `amqtt`) | https://www.python.org |
| PlatformIO | `pip install platformio` |
| Driver USB do ESP (CH340 ou CP210x) + cabo USB de dados | fabricante da placa |
| Contas: Firebase, GitHub, Render, Claude | — |

## 2. Firebase
1. https://console.firebase.google.com → criar projeto → **Realtime Database** → criar.
2. **Regras** (sem login; só esses dois caminhos):
```json
{ "rules": { "esps": { ".read": true, ".write": true }, "brokers": { ".read": true, ".write": true } } }
```
3. Dados:
```
esps/<nome>/{modelo, ip, vcc, visto_em, pinos/<gpio>/{nome,tipo,estado,pulso}, palavras/<gpio>}
brokers/<broker>/maquinas/<maquina>/{status, comandos/<id>, resultado/<id>}
brokers/<broker>/android/<celular>/{status, comandos, resultado, apps, atalhos}
brokers/<broker>/atalhos/<id>
```
- Saída: a ponte grava `estado`; o ESP obedece. `pulso: true` liga ~1 s.
- Entrada: o ESP grava `estado`.
- Online = `visto_em` há menos de 30 s.
- Endereços e atalhos vão cifrados; comandos de PC e celular vão assinados (HMAC-SHA256).

## 3. Ponte (Node)
```powershell
cd C:\Dev-AHS\api_conect
copy .env.example .env      # preencha PAINEL_SENHA e MCP_TOKEN
npm install
npm run local               # http://localhost:3333
```
Render: `DocumentacaoTecnica/CriarServico_bluePrint.md`.

Claude:
- claude.ai → Configurações → Conectores → URL `https://<servico>.onrender.com/mcp/<MCP_TOKEN>`
- Claude Code: `claude mcp add --transport http casa https://<servico>.onrender.com/mcp --header "Authorization: Bearer <MCP_TOKEN>"`

## 4. Firmware do ESP32
```powershell
cd aplicacao_esp_python\firmware\Automacao
# editar include\automacao_config.h
pio run
pio run -t upload
pio device monitor
```
- Evite GPIO 0, 2, 5, 12, 15 para relé. Preferidos: 4, 13, 14, 16–19, 23, 25–27, 32, 33.
- 34–39 só entrada. 1, 3, 6–11 reservados.
- Não altere o suporte Wi-Fi WPA2/WPA3 do `.cpp`.

## 5. Programa de carga
```powershell
cd aplicacao_esp_python
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt pyinstaller paho-mqtt==2.1.0
.\.venv\Scripts\python.exe main.py
```
- Executável: `.\build_windows.ps1` → `dist\windows` (mais de 100 MB: não vai para o git).
- O `.venv` não vale em outro PC: recrie.
- Passo a passo do ESP: `DocumentacaoTecnica/ManualNovosDispositivos.md`.

## 6. Ordem para montar tudo
1. Instalar (seção 1).
2. Firebase e regras (seção 2).
3. Clonar o repositório: `git clone https://github.com/amaurysimoes/API_Conect_ESP_Claude.git`
4. Rodar a ponte no PC; testar `http://localhost:3333/saude`.
5. Gravar o ESP (`ManualNovosDispositivos.md`); conferir `esps/<nome>` no Firebase.
6. Publicar no Render (`CriarServico_bluePrint.md`).
7. No painel, escrever as palavras de cada pino e **Salvar**.
8. Cadastrar o conector no Claude e pedir: "liga a luz da frente".
9. Agente do PC: `aplicacao_desk_agente/Instrucoes.md`. App Android: `aplicacao_android/Instrucoes.md`.

## 7. Documentos Database (Aiven MySQL)
Aba **Documentos Database** (`/docs`): guarda **qualquer documento** (`.xls .xlsx .doc .docx .pdf .txt`, imagens, etc.; programas/scripts não) no MySQL do Aiven. A IA lê o texto, baixa e abre no PC pelo conector. Projeto original (app Python): `C:\Dev-AHS\AIVEN_DATABASE`.

Criar do zero:
1. Aiven: serviço MySQL; baixar o **CA certificate** (`ca.pem`); anotar host, porta, usuário, senha e banco. **Allowed IP addresses**: `0.0.0.0/0` (o Render grátis não tem IP fixo; a proteção é SSL + senha).
2. Pasta `aplicacao_docs_mysqlaiven/` com `ca.pem` e:
   - `banco.js`: conecta (mysql2, SSL com o `ca.pem`) e cria a tabela `ia_documentacao_tecnica` se faltar.
   - `documentos.js`: enviar/listar/baixar/ler/excluir. `fflate` abre o zip (xlsx, xlsm, docx, docm, pptx); `sharp` converte as imagens png/jpeg de dentro para WebP (qualidade 75, lado máx. 1280 px). Outros tipos são guardados inteiros. Executáveis são recusados.
   - `texto.js`: texto de xlsx/docx (XML do zip), xls (`xlsx`), doc (`word-extractor`), pdf (`pdf-parse@1.1.1`, importar `pdf-parse/lib/pdf-parse.js`), txt/csv/json/etc.
   - `paginas.js` + `http.js`: aba `/docs`, `/api/docs/*`. `trabalhos.js` + `mcpDocs.js`: ferramentas do Claude e token de uso único do agente.
3. `npm install mysql2 fflate sharp xlsx word-extractor pdf-parse@1.1.1`
4. Somar nos arquivos antigos (1 importação + 1 chamada cada): `iot_automacao_esp/ferramentas.js` (`instalarDocs(server)`), `iot_automacao_esp/servidor.js` (`docsAgenteHttp` ANTES de `painelAutorizado`; `docsHttp` depois) e o link no menu em `aplicacao_gps/paginas.js`.
5. Agente (`aplicacao_desk_agente/agente_python/`): `acoes_docs.py` (ações `docs_enviar`, `docs_baixar`, `docs_abrir`; menu **Upload Documentos**) + linhas somadas em `agente.py` (import, `or acoes_docs.ACOES.get(acao)`, nomes em `status.acoes`), `main.py` (import, `acoes_docs.iniciar(cfg)`, `acoes_docs.item_menu(pystray)`) e `config.py` (`servidor`). Refazer o `Render_Agente.exe`.
6. `.env` local e **Render → Environment**: `DOCS_DB_HOST`, `DOCS_DB_PORT`, `DOCS_DB_USER`, `DOCS_DB_PASSWORD`, `DOCS_DB_NAME`. Salvar = redeploy.
7. Testar: `node --env-file=.env aplicacao_docs_mysqlaiven/teste.mjs` (usa o Aiven real; só mexe em `__teste_docs__*` e apaga).

Formato no banco (igual ao app Python; os dois lêem o mesmo banco): linha `doc` (nome, tamanho, sha256, nº de partes), linhas `parte` (arquivo SEM as imagens, em pedaços de 8 MB por causa do `max_allowed_packet`), linhas `img` (WebP por imagem, chave = caminho no zip). O Render não grava as linhas `pos` (posição na tela do app Python).

## 8. Consulta Serial (câmera do celular)
Aba **Consulta Serial** (`/serial`) e ferramenta **consultar_serial** do conector: lê código de barras (qualquer padrão) e QR pela câmera do celular (iPhone e Android).

Criar do zero:
1. Pasta `aplicacao_consultar_sn/`: `sessao.js` (token de uso único, 10 min), `http.js` (rotas; serve a biblioteca e o `.wasm` de `node_modules/zxing-wasm`), `pagina.js` (HTML), `cliente.js` (código do celular), `mcpSn.js` (ferramenta).
2. `npm install zxing-wasm` e `npm install -D bwip-js` (testes).
3. `cliente.js`: `getUserMedia` (câmera traseira) → desenha o quadro num `<canvas>` (máx. 1280 px) → `ZXingWASM.readBarcodes(imageData, { tryHarder: true, maxNumberOfSymbols: 1, formats: [] })` → moldura vermelha sem código, verde com os 4 cantos devolvidos (`position`) e o nome do padrão; 2 leituras iguais seguidas = confirma e faz `POST /api/serial/<token>/resultado`. Apontar o `.wasm` com `ZXingWASM.setZXingModuleOverrides({ locateFile })`.
4. Somar nos arquivos antigos: `iot_automacao_esp/ferramentas.js` (`instalarSn(server)`), `iot_automacao_esp/servidor.js` (`snHttp` ANTES de `painelAutorizado`; `snPainelHttp` depois) e o link no menu em `aplicacao_gps/paginas.js`.
5. Usa o endereço do servidor (`RENDER_EXTERNAL_URL`, o Render já define; local: `DOCS_URL_PUBLICA`). Nenhuma variável nova.
6. Testar: `node aplicacao_consultar_sn/teste.mjs` · `npm i --no-save playwright-core` e `node aplicacao_consultar_sn/teste_navegador.mjs`.

## 9. Problemas
| Sintoma | Solução |
|---|---|
| "nenhum pino combina" | cadastre só o nome (`led`, `luz frente`), sem verbo |
| ESP offline | sem energia ou Wi-Fi; o comando fica gravado |
| Painel ou MCP 503 | `PAINEL_SENHA` ou `MCP_TOKEN` não definida |
| MCP 401 | token errado |
| Primeiro pedido ~30 s | Render grátis acordando |
| ESP não aparece no Firebase | SSID/senha errados, rede 5 GHz, ou `FIREBASE_HOST` com `https://` |
| Sem porta COM | driver ausente ou cabo só de carga |
| `pip` falha no PyYAML | Python 3.14: use 3.11 ou 3.12 |
| `No Python at ...` | `.venv` de outro PC: apague e recrie |
| Consulta Serial: "Sem acesso à câmera" | permitir a câmera para o site no navegador do celular; só funciona em HTTPS |
| Consulta Serial não lê | aproximar, firmar, sem reflexo; botão **Foto** como plano B |
| `Banco do Aiven não configurado` | faltam `DOCS_DB_*` no Render (Environment) |
| Documentos: timeout/ECONNREFUSED | Aiven sem `0.0.0.0/0` em Allowed IP addresses, ou serviço MySQL desligado |
