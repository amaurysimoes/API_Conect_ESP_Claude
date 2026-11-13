# Criar o conector no Claude

Servidor: `https://automation-ahs.onrender.com` · Token: variável `MCP_TOKEN` (Render → Environment).

## Antes
1. `https://automation-ahs.onrender.com/saude` → `{"ok":true}`.
2. Navegador: `https://automation-ahs.onrender.com/mcp/SEU_MCP_TOKEN` → `{"erro":"use POST"}` = token certo.
3. Token só com letras e números (sem `=`, `+`, `/`). Gerar no PowerShell:
   ```powershell
   -join ((48..57)+(97..122) | Get-Random -Count 48 | % {[char]$_})
   ```
4. Remover conector antigo com o mesmo nome ou URL.

## Abrir a tela
claude.ai → Configurações → **Plugins** → **Adicionar conector personalizado**.

=============================CRIAÇÃO SEM CABEÇALHO (RECOMENDADO)=========

Token na URL. É o formato que já funcionou no conector antigo; o Claude não mostra aviso de login.

1. Nome: `Automacao IOT`
2. URL do servidor MCP: `https://automation-ahs.onrender.com/mcp/SEU_MCP_TOKEN`
3. Autenticação: **Sem login**
4. Cabeçalhos de requisição: vazio
5. **Adicionar**

=============================CRIAÇÃO COM CABEÇALHO=========

URL sem token; o token vai no cabeçalho. Usar se a criação sem cabeçalho falhar.

1. Nome: `Automacao IOT`
2. URL do servidor MCP: `https://automation-ahs.onrender.com/mcp`
3. Aviso "Não foi possível verificar o servidor": **Continuar mesmo assim**
4. Autenticação: **Sem login** (ignorar "Detectado" e o aviso vermelho)
5. Cabeçalhos de requisição → adicionar:
   - Nome: `Authorization`
   - Valor: `Bearer SEU_MCP_TOKEN`
6. **Adicionar** (o botão do final, não o "Adicionar cabeçalho")

=============================FIM DA CRIAÇÃO=========

## Depois
- Celular: app Claude → Configurações → Conectores → conferir se está ligado.
- Teste: conversa nova → "liste meus dispositivos" (1ª chamada ~30 s: Render grátis acordando).

## Se der "Não foi possível adicionar o conector"
1. **Não clicar várias vezes** (gera bloqueio por excesso de tentativas).
2. F12 → **Network** → clicar em **Adicionar** → linha vermelha `remote_servers` → aba **Response**.
3. Ler o motivo:

| Response | Causa | Solução |
|---|---|---|
| `rate_limit_error` | tentativas demais | esperar (1 h ou mais) e tentar 1 vez |
| outro texto | ver a mensagem | corrigir o que ela disser |

4. Ver o que chegou no servidor: `https://automation-ahs.onrender.com/diagnostico` (senha do painel) ou Render → Logs (linhas `[conector]` e `[req]`).

| No servidor | Significado |
|---|---|
| `POST /mcp/*** -> 200` | Claude chegou, token certo |
| `POST /mcp/*** -> 401` | token errado |
| nada | o Claude nem chamou (URL errada ou bloqueio no Claude) |

## Regras
- Trocou o `MCP_TOKEN`: atualizar a URL/cabeçalho do conector e a chave dos agentes (PC e Android), se usarem o mesmo valor.
- Nunca colar o token em chat, arquivo ou git.
- Renomear o serviço no Render não muda o endereço: endereço novo = serviço novo (`name` no `render.yaml`).
