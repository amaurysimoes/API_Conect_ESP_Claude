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
- TCP/IP: endereço da memória = base + número. Delta DVP: base 2048 (M0 = 0800H). **Atualizar faixa** deixa na lista só De..Até; **Adicionar faixa** acrescenta; no TCP/IP o estado é lido na faixa da lista. Máquina nova já abre em **TCP/IP** com 502 / 1 / base 0 / M0 / 64. Botões **Valores Padrão TCP/IP (Delta DVP)** (base 2048) e **(Delta AS)** (base 0, deduzido no AS332P: confirme). Sem registradores D, sem "zerar todas".
- Delta: respondeu EtherNet/IP mas recusou a instância 150 (0x012A): confira o EDS ou use TCP/IP. FX3U **não** fala EtherNet/IP; com ENET usa MC (MELSEC), que a aba não tem.
- Padrões vêm do EDS Epson (instâncias 1/150/100, 32+32 bytes, RPI 20 ms, primeiro bit 512). Trocar para o EDS do CLP.
- Botões: **Valores Padrão Robô** (Epson), **Valores Padrão CLP (Universal)** (primeiro bit 0, 8+8 bytes, RPI 50, sem multicast; só ponto de partida) e **Instruções de Ajustes Padrão** (explica cada campo).
- Atraso 1 a 4 s; não é tempo real; não é dispositivo de segurança.
- Config (IP, pontos) em `brokers/<broker>/maquinas/<maquina>/clp_config` (sem senha).
- Botão **Instruções** na aba tem tudo isso e a tabela de erros.
- Testado só com equipamentos simulados (EtherNet/IP e Modbus TCP). CLP real: não testado.
- Testes: `node aplicacao_clp/servidor/teste.mjs` · `agente_python\.venv\Scripts\python.exe teste_clp.py`

---

# Projeto Documentos Database (Aiven MySQL)

Aba **Documentos Database** (`/docs`). Guarda **qualquer documento** (planilha, Word, PDF, texto, imagem...; programas/scripts não) no MySQL do Aiven; imagens png/jpeg dentro de xlsx/docx viram WebP. Pasta: `aplicacao_docs_mysqlaiven/` + `acoes_docs.py` no agente. Origem: app Python `AIVEN_DATABASE`.

Passos:
1. Render → Environment: `DOCS_DB_HOST`, `DOCS_DB_PORT`, `DOCS_DB_USER`, `DOCS_DB_PASSWORD`, `DOCS_DB_NAME` (valores do `.env` do AIVEN_DATABASE). Aiven → Allowed IP addresses: `0.0.0.0/0`.
2. Aba → botão do tipo (**.xls .xlsx .doc .docx .pdf** ou **Todos**; tipos novos aparecem sozinhos) lista os arquivos; **Enviar arquivo** grava; **Ler / Baixar / Excluir** por linha.
3. Agente: trocar o `Render_Agente.exe` pelo novo. Ícone da bandeja → botão direito → **Upload Documentos** abre o seletor de arquivos e envia.
4. Claude: "quais documentos eu tenho?" · "leia o Relatorio.xlsx" · "procure XPTO nos documentos" · "abre o Relatorio.xlsx" (abre no Excel/Word/leitor de PDF do PC) · "baixe o x.pdf para o PC" · "envie C:\...\x.xlsx para o banco".

Notas:
- A IA lê texto de xls/xlsx/doc/docx/pdf/txt/csv etc.; imagens e PDF escaneado não. Outros tipos: só baixar/abrir.
- Abrir/baixar remonta o arquivo com as imagens (planilha com centenas de imagens leva dezenas de segundos). Ler baixa só o arquivo sem imagens (rápido).
- IA só lê/envia/baixa/abre; **excluir só na aba**. Limite 40 MB por arquivo. Mesmo nome = substitui.
- O menu da bandeja usa a chave do agente e o campo `servidor` do `config.json` (padrão `https://ponte-casa.onrender.com`). Nas ações da IA o agente recebe do servidor um token de uso único (15 min) dentro do comando assinado.
- Testes: `node --env-file=.env aplicacao_docs_mysqlaiven/teste.mjs` (Aiven real, apaga o que cria).

---

# Próximo projeto
