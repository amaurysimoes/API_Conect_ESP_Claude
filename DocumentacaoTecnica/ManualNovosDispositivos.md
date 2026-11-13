# Novo dispositivo (ESP)

Painel: https://automation-ahs.onrender.com/

## 1. Instalar no PC (uma vez)
- Driver USB do ESP (CH340 ou CP210x).
- `pip install platformio` (Python 3.11+ com "Add to PATH").
- Cabo USB de dados.

## 2. Abrir o programa de carga
```powershell
cd aplicacao_esp_python
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe main.py
```
Executável: `dist\windows\Automacao_IOT-ESP.exe` (projeto `C:\Dev-AHS\AUTOMACAO_IOT` ou `aplicacao_esp_python`). Gerar de novo: `.\build_windows.ps1`.

## 3. Gravar
Menu **Arquivo → Automação ESP_Firebase → Automação Firebase**.
1. Ligar o ESP no USB; **↻**; escolher a porta COM.
2. **Nome do ESP**: letras, números, `-`, `_` (ex.: `FIRE_AHS02`). Um nome por ESP.
3. **Modelo**: `ESP32`.
4. **Wi-Fi e senha**: rede 2,4 GHz.
5. **Pinos**: **TODOS OS PINOS LIVRES** ou **+ ADICIONAR PINO**. Saída = liga/desliga; Entrada = lê botão (GPIO 34–39 só entrada); **Invertido** = relé que liga em LOW.
6. **Display OLED**: marcar só se a placa tiver.
7. **Vcc**: **Desligado** se não há divisor de tensão.
8. **⚡ Gravar no ESP** (1ª vez baixa o compilador: ~15 min). Fim: "Carga ESP Concluído!".

Falhou: trocar cabo/porta, fechar o que usa a COM, segurar **BOOT** ao iniciar.

## 4. Conferir
Firebase: `esps/<nome>` com `ip`, `modelo`, `pinos`, `visto_em` (muda a cada ~10 s). Ou no programa: **Automação IOT Site → Listar Real Time Database**.

## 5. Nomear os pinos
1. Abrir o painel; senha = `PAINEL_SENHA`; usuário qualquer.
2. Na linha do pino, escrever as palavras separadas por vírgula (ex.: `luz frente, luz da frente`).
3. **Salvar**.

## 6. Usar no Claude
- "liga a luz da frente de casa" · "desliga a luz da frente" · "dá um pulso no portão"
- Vários ESPs: o Claude pergunta "Qual dispositivo você quer acionar?". Responda o nome.
- Conector: `https://automation-ahs.onrender.com/mcp/<MCP_TOKEN>`

## 7. Pinos
- Evite 0, 2, 5, 12, 15 para relé (boot). Preferidos: 4, 13, 14, 16–19, 23, 25–27, 32, 33.
- 1, 3, 6–11 são reservados.
- Portão e itens críticos: use **pulso**. Não use para fechadura ou alarme (regras do banco abertas).

## 8. Problemas
| Sintoma | Causa |
|---|---|
| Sem porta COM | driver ausente ou cabo só de carga |
| `PlatformIO não encontrado` | `pip install platformio` |
| ESP não aparece no Firebase | SSID/senha errados ou rede 5 GHz |
| "nenhum pino combina" | faltam palavras no painel |
| ESP offline | sem energia ou Wi-Fi |
| Painel demora ~30 s | Render grátis acordando |
