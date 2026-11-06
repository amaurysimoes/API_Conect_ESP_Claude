# Manual: configurar um novo dispositivo (ESP)

Do ESP novo até "liga a luz da frente" no Claude. Painel: https://ponte-casa.onrender.com/

## 1. O que instalar no PC (uma vez)

| O quê | Como |
|---|---|
| Driver USB do ESP (CH340 ou CP210x) | do fabricante da placa; sem ele a porta COM não aparece |
| PlatformIO (compila e grava) | `pip install platformio` (precisa de Python 3.11+ com "Add to PATH") |
| Cabo USB **de dados** | cabo só de carga não funciona |

## 2. Abrir o programa de carga

**Opção A, o executável (mais fácil):** baixe `AUTOMACAO_IOT-AHS.exe` em
https://github.com/amaurysimoes/API_Conect_ESP_Claude/releases e abra.

**Opção B, pelo código** (pasta `aplicacao_esp_python`):
```powershell
cd aplicacao_esp_python
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe main.py
```
Para gerar o `.exe` de novo: `.\build_windows.ps1` (sai em `dist\windows`).

## 3. Gravar o ESP

Menu **Arquivo → Automação ESP_Firebase → Automação Firebase**.

1. Ligue o ESP no USB e clique em **↻** para atualizar a **Porta**; escolha a COM dele.
2. **Nome do ESP:** só letras, números, `-` e `_` (ex.: `FIRE_AHS02`). É o nome que aparece no Firebase (`esps/<nome>`) e que o Claude vai citar. **Cada ESP precisa de um nome diferente.**
3. **Modelo:** livre (ex.: `ESP32`).
4. **Nome do Wi-Fi e senha:** da rede da casa. O ESP32 só enxerga redes de **2,4 GHz**.
5. **Pinos:** clique em **TODOS OS PINOS LIVRES** (lista todos) ou **+ ADICIONAR PINO**.
   - **Saída (ON/OFF):** liga relé, lâmpada, etc.
   - **Entrada (switch):** lê botão/chave. GPIO 34 a 39 só servem de entrada.
   - **Invertido:** marque se o relé liga com nível baixo (LOW).
6. **Display OLED:** marque só se a placa tiver. Sem display, os GPIO 21 e 22 ficam livres.
7. **Alimentação (Vcc):** deixe em **Desligado** se não tem divisor de tensão no pino ADC.
8. Clique em **⚡ Gravar no ESP**. A primeira vez baixa o compilador (vários GB, uns 15 min). No fim aparece **"Carga ESP Concluído!"**.

Se não gravar: troque o cabo/porta USB, feche outros programas que usem a COM e, em algumas placas, segure o botão **BOOT** enquanto começa a gravar.

## 4. Conferir que o ESP entrou

No Firebase (Realtime Database, projeto `amauryesp-active`) deve aparecer `esps/<nome>` com `ip`, `modelo`, `pinos` e `visto_em`, que se atualiza a cada ~10 s. Também dá para ver no próprio programa: **Automação IOT Site → Listar Real Time Database**.

## 5. Dar nome aos pinos (a ponte)

1. Abra https://ponte-casa.onrender.com/ e entre com a senha do painel (usuário qualquer).
2. Na linha de cada pino, escreva as palavras que você usa para falar dele, separadas por vírgula. Ex.: pino 5 → `luz frente, luz da frente`.
3. Clique em **Salvar**. As palavras ficam no Firebase, em `esps/<nome>/palavras/<gpio>`.

## 6. Usar no Claude

Peça normalmente: **"liga a luz da frente de casa"**, "desliga a luz da frente", "dá um pulso no portão".

- Com mais de um ESP e sem ficar claro qual, o Claude pergunta: **"Qual dispositivo você quer acionar?"** e cita os nomes. Responda com o nome, ou já cite na frase ("... no FIRE_AHS02").
- Se o ESP estiver desligado, o Claude avisa e o comando fica gravado; vale quando o ESP voltar.
- O conector do Claude é cadastrado uma vez (Configurações → Conectores). URL: `https://ponte-casa.onrender.com/mcp/<MCP_TOKEN>`.

## 7. Cuidados com os pinos

- **Evite 0, 2, 5, 12 e 15** para relé: são pinos de boot e podem ligar ou piscar quando o ESP reinicia. Preferidos: **4, 13, 14, 16, 17, 18, 19, 23, 25, 26, 27, 32, 33**.
- Os GPIO 1, 3 (serial USB) e 6 a 11 (flash) são reservados e o programa não deixa usar.
- Para portão e coisas críticas, prefira **pulso** (liga ~1 s e desliga sozinho).
- As regras do banco estão abertas em `esps`: não use para segurança crítica (fechadura, alarme).

## 8. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Não aparece porta COM | driver USB ausente ou cabo só de carga |
| `PlatformIO não encontrado` | rode `pip install platformio` e reabra o programa |
| ESP não aparece no Firebase | SSID/senha errados ou rede 5 GHz |
| Claude diz "nenhum pino combina" | faltou cadastrar as palavras no painel |
| Claude diz que o ESP está offline | ESP sem energia/Wi-Fi (`visto_em` parado) |
| Painel demora ~30 s | o plano grátis do Render dorme sem uso; é só esperar |
