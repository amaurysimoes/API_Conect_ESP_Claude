# Histórico: conectar o conector (Render) ao back `IA_automation-agente`

Data: 13/11/2026. Objetivo: a aba/ferramenta **Consulta Serial** (pasta `aplicacao_consultar_sn/`) buscar o histórico do serial no back que roda no Docker da fábrica, como o front `IA_automation_front` faz.

## 1. Resposta registrada (o que é possível)

Em parte é verdade.

**O que é verdade:** o front que está dentro da fábrica (`10.105.103.24`, portas 3341/3442) conecta no back. Você digita `http://IP:4012`, o front salva no localStorage e chama o back. Os dois estão na mesma rede e falam HTTP, então funciona.

**O que não vale para a nossa página:** `https://automation-ahs.onrender.com/serial` é HTTPS e a internet. Mesmo com o celular na rede da fábrica, o navegador bloqueia uma página HTTPS chamando `http://10.105.103.24:4012` (mixed content). O próprio front já avisa disso na tela de configuração dele.

**Como contornar, sem mexer no que já funciona:**
1. **HTTPS no back:** a documentação dele fala em `https://IP:3443` com certificado autoassinado, mas no `main.ts` que li só aparece `http` na porta 4012. Eu não sei se essa porta 3443 está no ar. Para a página do Render chamar direto, o back precisaria também liberar acesso a rede privada no CORS, e você aceitar o certificado uma vez em cada celular.
2. **Agente do PC como ponte:** o PC da fábrica chama o back por HTTP, que é como o CLP funciona. Não depende de certificado nem do navegador.

O caminho direto (1) depende de alterar o back, e você pediu para não mexer em nada. Por isso a recomendação continua sendo o agente (2).

Pendente: testar se a porta 3443 aceita conexão (só conexão, como foi feito na 4012). Isso diria se o caminho (1) existe hoje.

## 2. Fatos levantados (leitura, nada foi alterado)

### Teste de conexão
- `10.105.103.24:4012` aceitou conexão TCP a partir deste PC (Wi-Fi, IP `10.70.32.217`) em 13/11/2026. Só abri e fechei, sem enviar nada. Ping não responde (ICMP bloqueado, normal).

### Back: `C:\Dev-AHS\IA_automation-agente` (NestJS, Docker)
- Porta: `process.env.APP_PORT || 4012`, **HTTP puro** (`src/main.ts`). Só há `app.listen(port)`; nenhum listener HTTPS no `main.ts`. `app.enableCors()` ligado. Sem prefixo global `/api`.
- Rota de busca: `GET /busca?sn=<serial>` (`src/busca/busca.controller.ts`). Parâmetro `sn` obrigatório (senão 400). **Só leitura.**
- Rota que grava (NÃO usar): `POST /busca/cadastrar` `{produto, serial}` mexe no `padrao_serial.json` do back.
- Lógica (`src/busca/busca.service.ts`):
  - Gera o padrão do serial: só números = `NUMERICO_<tamanho>`; só letras = `TEXTO_PURO`; misto = números viram `X` (ex.: `XCPXXXIXXXXXXXX`).
  - Procura o padrão em `busca_router` (banco `ia`, local e/ou remoto BRC). Com padrão conhecido: consulta em paralelo só as tabelas/colunas aprendidas ("Cache Rápido", `usou_memoria: true`). Padrão novo, ou termo com "busca detalhada"/"encontrar todas": **varredura profunda** em todos os bancos (pode demorar), depois aprende o padrão.
  - Bancos varridos: `multi_am01_sge`, `SGE_MAO`, `passmark_mgtconsole_ddr2`, `passmark_mgtconsole_ssd`, `sistemabalanca`. Bancos/tabelas podem ser desabilitados em "Config de Rastreabilidade" (`busca_config`).
  - `LIKE '%serial%'` em colunas varchar/char/text, até 100 linhas por tabela.
  - Em "Rede Pessoal" (`tipoRede === 'LOCAL'`) responde `status: "offline"`, sem base.
- Resposta: `{ searched_serial, padrao_identificado, usou_memoria, aviso, total_tables_with_data, results: [{ database, table, column, total_found, records: [linhas cruas] }] }`. Sem resultado: `{ status: "AVISO", message, results: [] }`.
- `padrao_serial.json` (raiz do back): mapa padrão → produto (`NUMERICO_15`: TV, `XCPXXXIXXXXXXXX`: TABLET, `XXXXXXMXXXXXXX`: MEMORIA, `XCPXXXGXXXXXXXX`: WI-FI etc.).
- O `.env` do back NÃO foi aberto.

### Front: `C:\Dev-AHS\IA_automation_front` (React/Vite, nginx no Docker)
- Servido pelo mesmo servidor da fábrica: HTTP na porta 3341 e HTTPS (certificado autoassinado) na 3442 (`nginx.conf`, doc `#14.0` do back).
- Endereço do back: digitado na tela de configuração do Agente e salvo no `localStorage` (chave `agenteBaseUrl`, `src/comandos.js`). Sem endereço salvo, sonda `http://<candidatos>:4012`.
- Busca: o usuário digita `Serial: xxxx` (também "procurar serial", "rastreio" etc.); o front faz `fetch(<baseUrl>/busca?sn=...)` (`src/comandos.js`, ~linha 636) e mostra tabelas por banco/tabela/coluna, com selo "Cache Rápido" ou "Varredura" e botão de PDF (`src/relatorioSerialPdf.js`).
- O front já detecta "conteúdo misto" (`isMixedContentRisk`) e sugere HTTPS na porta 3443 (`sugerirAgentUrlHttps`). A doc do front fala em portas 3000 (HTTP) e 3443 (HTTPS) do Agente; o `main.ts` atual só mostra 4012 HTTP. Divergência a conferir.

## 3. Decisões em aberto (para a próxima conversa)
1. Caminho: agente do PC como ponte (recomendado) ou HTTPS direto no back.
2. Qual máquina com agente fica na rede da fábrica (`DEV_ENG` alcança o back).
3. Onde guardar IP e porta digitados na aba `/serial`: Firebase por máquina (vale para todos os celulares) ou localStorage do celular.
4. Ao ficar verde, a busca começa sozinha; a varredura profunda pode demorar (mostrar "buscando…").
5. Como exibir o histórico (tudo cru ou resumo: produto, estágio, data). Para escolher, é preciso ver uma resposta real de um serial (só consultar com autorização).

## 4. Regras combinadas
- **Só somar:** nada do que já funciona no conector é alterado; tudo em arquivos novos dentro de `aplicacao_consultar_sn/` (+ poucas linhas somadas de ligação).
- Back e front do usuário não são alterados por nós sem ele pedir.
