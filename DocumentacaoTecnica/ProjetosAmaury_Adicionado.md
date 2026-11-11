# Projetos adicionados

Um capítulo por projeto. ESP: `ManualNovosDispositivos.md`.

---

# Projeto maps

Rota com trânsito ao vivo (Google Routes API). Pasta: `aplicacao_gps/`.

## Chave do Google
1. https://console.cloud.google.com/projectcreate → projeto (usado: `ProjetoAmauryExpert`).
2. **Faturamento** → vincular cartão.
3. https://console.cloud.google.com/apis/library/routes.googleapis.com → **Ativar**.
4. **APIs e serviços → Credenciais → Criar credenciais → Chave de API**.
5. Chave → **Restrições de API** → só **Routes API**.
6. **Faturamento → Orçamentos e alertas** → orçamento (ex.: R$ 20/mês).

Chave só no Render (`ponte-casa` → **Environment**) e no `.env`. Nunca no git nem no chat.

| Variável | Valor |
|---|---|
| `GOOGLE_MAPS_KEY` | a chave |
| `CIDADE_PADRAO` | ex.: `Rio Claro - SP` |
| `ORIGEM_PADRAO` | opcional: lugar salvo ou endereço |

## Usar
- `/enderecos`: Nome, Endereço, CEP. `/gps`: abrir no celular e compartilhar.
- Claude: "melhor rota para a casa do centro" · "me oriente até o Amazonas Shopping" · "errei o caminho".
- Origem: o que você disser > GPS (15 min) > `ORIGEM_PADRAO`.
- Teste: `node aplicacao_gps/teste.mjs`

---

# Projeto agente

Agente do PC (bandeja, Windows/Linux) + aba **Desk-Automacao_Firebase**. Pasta: `aplicacao_desk_agente/`. Passo a passo: `aplicacao_desk_agente/Instrucoes.md`.

- Windows: `agente_python\dist\Windows\Render_Agente.exe` · Linux: `agente_python/dist/Linux/Render_Agente`.
- Chave: `MCP_TOKEN` (ou `AGENTE_CHAVE`) igual no Render e no agente.
- Cards **Abrir** têm **Abrir** e **Salvar**; a IA só acha o que estiver salvo.
- Claude: "qual máquina está ativa?" · "abre o Excel" · "abre meu sistema de estoque".
- Teste: `node aplicacao_desk_agente/agente/teste.mjs`

---

# Projeto android

`api_conect.apk`. Pasta: `aplicacao_android/`. Uso: `Instrucoes.md` · criar: `DocumentacaoTecnica/CriacaoAppAndroid.md` · editar: `Kotlin.md`.

- Instalar o APK; informar nome, broker, chave (`MCP_TOKEN`); liberar as 3 permissões.
- Toque no ícone: **Meus atalhos** (sites; apps marcados, inclusive os padrão do Android).
- Claude: "quais apps eu tenho?" · "abre o WhatsApp" · "abre google.com no Firefox" · "abre o meu banco".
- Teste: `node aplicacao_android/servidor/teste.mjs` · `.\gradlew.bat testDebugUnitTest`

---

# Projeto CLP (Conexao Socket-TCP/IP)

Liga/desliga bits de CLP ou robô por **EtherNet/IP** ou memórias M por **TCP/IP (Modbus TCP)**; escolha em **Tipo de conexão**. Aba **Conexao Socket-TCP/IP** (depois de IOT-Automacao-ESP). Pasta: `aplicacao_clp/` (servidor) + `aplicacao_desk_agente/agente_python/` (`clp_eip.py`, `acoes_clp.py`). Origem: porte do `EipScanner` do Robo_conect, sem a voz.

```
Render / Claude ──► Firebase (comando assinado clp_*) ──► agente (RJ45 do CLP + Wi-Fi) ──► CLP
```

Passos:
1. Máquina do agente com cabo RJ45 no CLP (mesma faixa de IP) e internet.
2. Bandeja do agente → marcar **Ativar Conexao CLP: EtherNet/IP**.
3. Firewall do PC: `TCP 44818` e `UDP 2222`.
4. Aba → máquina → IP do CLP → **Identificar** → **Conectar**.
5. **Adicionar faixa** (ex.: 512 a 519), nome e ação (alternar, pulso, set, reset) por bit → **Acionar**.
6. Claude: "liga a garra do CLP" · "pulsa o bit 513" · "o CLP está conectado?".

Notas:
- **EtherNet/IP**: área de I/O (assemblies); só CLP que fale EtherNet/IP; precisa do EDS. **TCP/IP**: Modbus TCP direto nas memórias M, sem EDS (CLP com Modbus TCP, porta 502). Botão **Instruções de Seleção** explica.
- TCP/IP: endereço da memória = base + número. Delta DVP: base 2048 (M0 = 0800H). Botão **Valores Padrão TCP/IP (Delta)**. Sem registradores D, sem "zerar todas".
- Delta: respondeu EtherNet/IP mas recusou a instância 150 (0x012A): confira o EDS ou use TCP/IP. FX3U **não** fala EtherNet/IP; com ENET usa MC (MELSEC), que a aba não tem.
- Padrões vêm do EDS Epson (instâncias 1/150/100, 32+32 bytes, RPI 20 ms, primeiro bit 512). Trocar para o EDS do CLP.
- Botões: **Valores Padrão Robô** (Epson), **Valores Padrão CLP (Universal)** (primeiro bit 0, 8+8 bytes, RPI 50, sem multicast; só ponto de partida) e **Instruções de Ajustes Padrão** (explica cada campo).
- Atraso 1 a 4 s; não é tempo real; não é dispositivo de segurança.
- Config (IP, pontos) em `brokers/<broker>/maquinas/<maquina>/clp_config` (sem senha).
- Botão **Instruções** na aba tem tudo isso e a tabela de erros.
- Testado só com equipamentos simulados (EtherNet/IP e Modbus TCP). CLP real: não testado.
- Testes: `node aplicacao_clp/servidor/teste.mjs` · `agente_python\.venv\Scripts\python.exe teste_clp.py`

---

# Próximo projeto
