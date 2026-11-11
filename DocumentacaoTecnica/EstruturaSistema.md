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

## 7. Problemas
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
