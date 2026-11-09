# Automacao IOT Amaury — leia antes de qualquer coisa

Este arquivo guarda TUDO para retomar o projeto de onde parou, se o console fechar. Mantenha-o atualizado a cada mudança.
Pasta: `C:\Dev-AHS\api_conect` · GitHub (privado/público: confirmar): https://github.com/amaurysimoes/API_Conect_ESP_Claude · branch `main`.

## Regras permanentes do usuário (Amaury)
- **SÓ SOMAR, NUNCA MUDAR o que já funciona.** Recurso novo = pasta própria (módulo, ex.: `gps_amaury/`), ligada ao código antigo por poucas linhas SOMADAS (hoje: 4 linhas em `src/ferramentas.js` e 4 em `src/servidor.js`, uma importação + uma chamada por módulo). Não refatorar, não renomear, não mexer em `src/` antigo (pinos, painel, firebase, mapa). Antes de commitar: `git diff af8a97c -- src/` deve mostrar só linhas `+`. Em 09/11/2026 errei isso uma vez e refiz: não repetir.
- **Respostas diretas, sem resenha e sem "mimimi".** Português do Brasil. Ele fica irritado com texto longo.
- **Instruções nos arquivos `.md` (manuais): sempre resumidas, em passos curtos, sem resenha.**
- **Depois de cada alteração: commit + `git push origin main`** (o Render faz deploy sozinho em 1-3 min). Use `git add <arquivos>` explícitos, NÃO `git add -A` (já enviou um arquivo solto por engano). Trailer de commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Modo escuro sempre** em páginas E janelas (inclusive a janelinha dos executáveis; ele detesta o claro).
- **Ícone único em TUDO (páginas e executáveis):** `img/circuito-azul.svg` (original) → `img/icone.png`, `img/icone.ico`, `img/favicon-64.png`. Páginas: `gps_amaury/favicon.js` (data URI). Apps/exes: `aplicacao_esp_python/assets/icone_ia.*` e `fire_page/public/icone_ia.*` (mesmos nomes, trocados), `aplicacao_desk_agente/agente_python/icone.*` (`--icon` no build). Todo exe novo usa `--icon` com esse `.ico`. Tray do agente = circuito + ponto verde/vermelho.
- **Nunca** colocar chaves/senhas/tokens em arquivo, git ou chat. Se ele colar uma chave no chat, avise para restringir e regenerar. Variáveis ficam no Render (Environment) e no `.env` local (ignorado pelo git).
- Não afirmar que testou o que não testou. Dizer o que falta.
- Não fazer ações públicas/irreversíveis sem pedir (ex.: Release no GitHub foi negado pelo sistema; ele decide).
- Para fatos desta conversa que já viraram memória: `C:\Users\amaur\.claude\projects\c--Dev-AHS-api-conect\memory\`.

## O que é
Uma ponte entre o **Claude** (conector personalizado "Automacao IOT Amaury", no claude.ai e no app do celular) e o mundo real:
1. **Acionar pinos de ESPs** ("liga a luz da frente") pelo Firebase Realtime Database.
2. **Projeto maps** (pasta `gps_amaury/`): melhor rota com trânsito ao vivo (Google Routes API), GPS do celular como origem, passo a passo, trânsito por trecho, endereços salvos.
Manuais: `DocumentacaoTecnica/ManualNovosDispositivos.md` (ESP), `DocumentacaoTecnica/ProjetosAmaury_Adicionado.md` (um capítulo por projeto novo; "Projeto maps:"), `DocumentacaoTecnica/EstruturaSistema.md` (montar tudo do zero; escrito pelo usuário em outra sessão).

## Arquitetura
```
Claude ──► https://ponte-casa.onrender.com/mcp  (token) ──► src/servidor.js ──► Firebase (esps/...)  ──► ESP32 obedece (consulta a cada 1 s)
                                                                             └─► Google Routes API
Você (navegador, senha) ──► /  /enderecos  /gps
```
- Render: Web Service `ponte-casa` (Blueprint `render.yaml`, plano Free, Node 20, `node src/servidor.js`, health `/saude`). Service ID `srv-dbn20tbl550s73f0gd60`. Auto Sync do Blueprint = Yes. Plano grátis **dorme** sem uso (~15 min): 1ª chamada demora ~30 s.
- Banco: `https://amauryesp-active-default-rtdb.firebaseio.com` (projeto Firebase `amauryesp-active`). **Regras ABERTAS só em `esps`** (sem login, sem chave); fora disso bloqueado. Por isso: palavras dos pinos ficam em `esps/<nome>/palavras/<gpio>` e os endereços ficam em `esps/<ESP>/lugares_cifrados/<id>` **CIFRADOS** (AES-256-GCM, `src/cripto.js`). Ficam dentro do nó de um ESP (`LUGARES_ESP` ou o primeiro): `esps/<ESP>/lugares_cifrados/<id>`; o código antigo ignora esse campo (nenhum ESP fantasma na lista).
- Segurança: painel = senha (Basic Auth); `/mcp` = token (cabeçalho `Authorization: Bearer <tok>`, "bearer" em qualquer caixa, ou `/mcp/<tok>` na URL — o conector do claude.ai aceita os dois). Sem `PAINEL_SENHA`/`MCP_TOKEN` as rotas ficam desligadas (503). O banco aberto é o ponto fraco conhecido: quem tem a URL do banco aciona pinos sem passar pela ponte. Não usar para portão/fechadura/alarme até haver login no Firebase.

## ESP
- Firmware: `aplicacao_esp_python/firmware/Automacao` (C++/PlatformIO, pioarduino Arduino-ESP32 3.x). Lê `esps/<nome>/pinos/<gpio>/estado` (bool) e `pulso` (bool, liga ~1 s) a cada 1 s; heartbeat `visto_em` a cada 10 s. Não usa autenticação. Cópia de referência (modelo `esp01`) em `firmware_esp/Automacao`.
- ESP real: **`FIRE_AHS01`** (modelo CH340, IP 10.70.40.251). Palavras cadastradas pelo usuário: pino 4 = "ligar refletor", pino 5 = "ligar led" (em 09/11/2026). Estava **offline** em 09/11 (o último sinal era de dias antes).
- Programa de carga (PyQt6 + PlatformIO): `aplicacao_esp_python/` (cópia completa do projeto original `C:\Dev-AHS\AUTOMACAO_IOT`, sem .venv/node_modules/.pio/dist/build). Rodar: `cd aplicacao_esp_python; python -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r requirements.txt; .\.venv\Scripts\python.exe main.py`. Menu: Arquivo → Automação ESP_Firebase → Automação Firebase. Build do Windows: `.\build_windows.ps1` → `dist\windows\AUTOMACAO_IOT-AHS.exe` (197 MB, **não está no git**: passa de 100 MB; fica só no PC do usuário; o Release no GitHub foi negado pelo sistema, o usuário decide).
- Pendência antiga: o usuário disse ter ajustado scripts para conectar em rede WPA3, mas **não achei essa mudança** em nenhum lugar (nem no git, nem no `AUTOMACAO_IOT`). Perguntar onde está.

## Arquivos
- **Código antigo (não mexer):** `src/servidor.js` (painel de pinos `/`, `/api/dados`, `/api/palavras`, `/mcp`, `/saude`), `src/ferramentas.js` (`listar_dispositivos`, `acionar`), `src/firebase.js`, `src/mapa.js`, `src/mcp.js` (MCP local por stdio; `.mcp.json` registra `casa`). As únicas linhas somadas neles ligam o módulo novo.
- **Módulo maps/GPS (`gps_amaury/`):** (menu IOT-Automacao | Endereços | GPS; na página antiga ele é injetado pela `http.js` na resposta, sem editar o código dela) `mcpGps.js` (`instalarGps`: registra `melhor_rota`, `orientar`, `listar_lugares` e põe em TODAS as ferramentas a dica "Aguarde 10 segundos até o render responder" + aviso "acabou de acordar" nos 90 s após o boot), `http.js` (`gpsHttp`: páginas `/enderecos` e `/gps`, APIs `/api/lugares`, `/api/posicao`), `paginas.js` (HTML, modo escuro, menu), `rotas.js` (Google Routes: TRAFFIC_AWARE + alternativas + TRAFFIC_ON_POLYLINE, trânsito por trecho, passos), `lugares.js`, `lugaresStore.js` (endereços cifrados no Firebase), `cripto.js` (AES-256-GCM), `posicao.js` (GPS só em memória), `teste.mjs` (`node gps_amaury/teste.mjs`: Firebase falso + Google simulado; também confere que o código antigo segue igual).
- `render.yaml`, `.env.example` (nomes das variáveis), `.gitignore` (`.env`, `node_modules`, `aplicacao_esp_python/.venv|dist|build`, `\#AutoAmaury.txt`).

## Módulo agente (pasta `aplicacao_desk_agente/`, antes `agente/`) — Desk-Automacao_Firebase
- `aplicacao_desk_agente/agente/` (Node, servidor): `catalogo.js` (20 programas + resolve nomes livres), `maquinas.js` (lista máquinas e manda comando ASSINADO, espera `resultado`), `executar.js` (regra única), `mcpMaquinas.js` (ferramentas `listar_maquinas`, `executar_na_maquina`), `http.js` + `paginas.js` (aba `/desk`, menu logo depois de IOT-Automacao), `teste.mjs` (E2E com Firebase falso + agente real; abre/fecha o Bloco de Notas).
- `aplicacao_desk_agente/agente_python/` (app do PC, leve): `main.py` (bandeja pystray: verde conectado, vermelho sem conexão; só menu "Sair"), `agente.py` (consulta `brokers/<broker>/maquinas/<maquina>/comandos` a cada 2 s, confere assinatura HMAC-SHA256 + validade 60 s + ID único, executa, grava `resultado`, `status` a cada 10 s), `acoes.py` (tudo que abre traz a janela para a FRENTE com foco: `_abrir_na_frente`/`_frente`, vigia ~14 s por janelas novas; info, abrir_programa [qualquer app via ShellExecute], abrir_url, abrir_pasta, abrir_arquivo, fechar_programa, bloquear_tela, desligar/reiniciar [exigem confirmado], cancelar_desligamento), `config.py` (janelinha escura na 1ª vez, aceita o `MCP_TOKEN` como chave; JSON em `%LOCALAPPDATA%/AutomacaoIOTAmaury-Agente`), `build_windows.ps1`, `.venv` (ignorado pelo git). Mesmo caminho do agente antigo (broker `AMAURY_01`, máquina `DEV_ENG`): não rodar os dois juntos.
- Assinatura: `HMAC-SHA256(AGENTE_CHAVE, id + quebra de linha + acao + quebra de linha + parametros JSON ordenado + quebra de linha + ts)`. `AGENTE_CHAVE` (ou, se não existir, o `MCP_TOKEN`) tem de ser IGUAL no Render e no agente.
- Instruções para o usuário: `aplicacao_desk_agente/Instrucoes.md`.
- Pendente: usuário colar o `MCP_TOKEN` (ou uma `AGENTE_CHAVE`) na janelinha do agente, instalar o `Render_Agente.exe`; testar no Render de verdade. Ideias: mais ações (volume, captura de tela, listar processos), mais atalhos na aba.

## Comportamento das ferramentas
- `acionar`: acha o pino pelas palavras; com vários ESPs e sem ficar claro qual, manda perguntar "Qual dispositivo você quer acionar?" citando os nomes; se o ESP estiver offline avisa (o comando fica gravado e vale quando ele voltar). 1 ESP só: não pergunta.
- Origem das rotas: 1) a que o usuário disser, 2) **GPS** (página `/gps` aberta no celular; vale 15 min), 3) `ORIGEM_PADRAO`. O conector NÃO recebe GPS sozinho. Orientação "errei o caminho": chamar `orientar` de novo (recalcula da posição atual).
- Endereços: nome + endereço + CEP na página `/enderecos` (ex.: Casa 1, Trabalho). Destino que não é lugar salvo (ex.: Amazonas Shopping) vai pelo nome + `CIDADE_PADRAO`.

## Variáveis do Render (Environment) — só os NOMES
`MCP_TOKEN`, `PAINEL_SENHA` (geradas pelo Blueprint), `AGENTE_CHAVE` (assina os comandos das máquinas), `NODE_VERSION=20`, `GOOGLE_MAPS_KEY` (usuário já adicionou), `CIDADE_PADRAO` (ex.: "Rio Claro - SP"), `ORIGEM_PADRAO` (opcional), `LUGARES_ESP` (opcional: qual ESP hospeda os endereços cifrados), `LUGARES_CHAVE` (opcional; senão usa `MCP_TOKEN` para cifrar os endereços — **trocar a chave deixa os endereços salvos ilegíveis**), `LUGARES_JSON` (opcional, alternativa à página). Local: copiar `.env.example` para `.env`; rodar `npm run local`. `npm start` NÃO lê o `.env`.

## Google Cloud (Projeto maps)
Projeto `ProjetoAmauryExpert` (ID `gen-lang-client-0130062667`), Routes API ativada. A chave antiga foi colada no chat: o usuário deve **restringir à Routes API, gerar uma nova, colocar no Render e apagar a antiga** (confirmar se foi feito). Escolheu NÃO restringir por aplicativo/IP (o Render grátis não tem IP fixo). Recomendado criar orçamento com alerta de gasto. Os campos de passos e `TRAFFIC_ON_POLYLINE` podem cair numa faixa de preço mais cara do Google: conferir https://developers.google.com/maps/billing-and-pricing/pricing.

## Estado em 09/11/2026
- Feito e no ar (verificar): pinos, painel, conector funcionando no claude.ai (usuário testou "funcionou"), manuais, `melhor_rota` básica.
- Feito em código, **testado só com banco e Google simulados** (`gps_amaury/teste.mjs` passa): páginas `/enderecos` e `/gps`, endereços cifrados, GPS como origem, `orientar`, trânsito por trecho, aviso do Render. **Falta testar com o Google de verdade** e no celular.
- Falta o usuário: cadastrar os endereços em `/enderecos` (casas e trabalho; os dados dele ficam só no Firebase cifrado, nunca em arquivos), definir `CIDADE_PADRAO`, abrir `/gps` no celular, atualizar o conector (ferramentas novas) e testar "qual a melhor rota para a casa do centro?".
- Ideias combinadas e não feitas: ferramentas grátis de hora (fuso de São Paulo, sem API), qualidade do ar e tempo (Open-Meteo, sem chave); login no Firebase; manter o Render acordado (pinger externo em `/saude` a cada ~10 min); firmware gravar confirmação do que aplicou.

## Dicas do ambiente (Windows)
- Bash do Claude Code não tem `pkill`; para matar servidor de teste: PowerShell `Get-NetTCPConnection -LocalPort <porta> -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`.
- Em `node -e/import` dentro do Git Bash use `file:///C:/...` (caminho `/c/...` quebra).
- `.gitignore`: linha começando com `#` é comentário; escapar `\#`.
- Testar localmente: `node gps_amaury/teste.mjs` (portas 4598/4599, não gasta nada).
