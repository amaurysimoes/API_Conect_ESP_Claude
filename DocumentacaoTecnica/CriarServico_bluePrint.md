# Criar o serviço no Render (Blueprint)

Serviço: `automation-ahs` · plano Free · `node iot_automacao_esp/servidor.js` · health `/saude`.
Nenhuma senha fica aqui. Os valores ficam só no Render (Environment) e no `.env` local.

## 1. Subir o código no GitHub
1. Repositório: https://github.com/amaurysimoes/API_Conect_ESP_Claude (branch `main`).
2. `git push origin main`.

## 2. Criar o Blueprint
1. https://dashboard.render.com → **New → Blueprint**.
2. Conectar a conta do GitHub e escolher o repositório.
3. O Render lê o `render.yaml` e mostra o serviço `automation-ahs`.
4. **Apply**. Ele faz `npm install` e liga `node iot_automacao_esp/servidor.js`.
5. Auto Sync = Yes: cada `git push` faz deploy sozinho (1-3 min).

## 3. Como as senhas foram criadas
Você não digitou nenhuma. Ao criar o Blueprint, o Render leu o `render.yaml`:
- `PAINEL_SENHA`: `generateValue: true`, então o Render sorteou.
- `MCP_TOKEN`: `generateValue: true`, então o Render sorteou.
- `NODE_VERSION`: `value: 20`, valor copiado do arquivo.

Para ver os valores: Render → automation-ahs → **Environment** → olho ao lado da variável.

Só funciona como **Blueprint**. Um Web Service comum não gera nada.

## 4. Variáveis colocadas à mão
Render → automation-ahs → **Environment → Add Environment Variable**:
- `GOOGLE_MAPS_KEY`: Google Cloud (projeto `ProjetoAmauryExpert`) → APIs e serviços → Credenciais → Criar chave de API (Routes API ativada).
- `AGENTE_CHAVE`: tem de ser igual à do agente do PC. Sem ela, vale o `MCP_TOKEN`.
- `CIDADE_PADRAO` (ex.: `Rio Claro - SP`).
- Opcionais: `ORIGEM_PADRAO`, `LUGARES_ESP`, `LUGARES_CHAVE`, `LUGARES_JSON`.

Salvar → o Render reinicia sozinho.

## 5. Senha local (`.env`) é outra coisa
- `localhost:3333` lê a `PAINEL_SENHA` do `.env`. O Render lê a dele.
- O `.env` foi criado copiando o `.env.example` e preenchendo à mão. Não há registro de onde veio a senha local.
- Para usar a mesma do Render: copiar o valor do Render para o `.env` e reiniciar `npm run local`.

## 6. Conferir
1. `https://automation-ahs.onrender.com/saude` → `{"ok":true}` (1ª vez demora ~30 s: o plano grátis dorme).
2. `https://automation-ahs.onrender.com/` → usuário qualquer, senha = `PAINEL_SENHA` do Render.
3. Conector do claude.ai: `https://automation-ahs.onrender.com/mcp/<MCP_TOKEN>`.
