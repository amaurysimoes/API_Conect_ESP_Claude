# Agente leve — instruções

Programa escondido na bandeja do Windows. **Ícone verde = conectado ao Firebase; vermelho = sem conexão.**
Envia um resumo da máquina (CPU, memória, disco) e obedece só comandos **assinados** pela ponte.

- `aplicacao_desk_agente/agente/` → lado do servidor (Render): aba **Desk-Automacao_Firebase** e ferramentas do Claude.
- `aplicacao_desk_agente/agente_python/` → o programa que roda na máquina.

## 1. Chave
**Mais simples:** use o `MCP_TOKEN` que já está no Render. Não crie nada novo; na janelinha do agente (passo 2) cole esse mesmo valor.

**Chave separada (opcional):** crie `AGENTE_CHAVE` no Render (Environment) com um valor longo
(`-join ((48..57)+(97..122) | Get-Random -Count 40 | % {[char]$_})`) e use esse valor no agente.

Nunca cole a chave em chat nem no git.

## 2. Instalar na máquina
**Com o .exe:** abra `agente_python\dist\Render_Agente.exe`. Uma janelinha pede:
nome da máquina (ex.: `DEV_ENG`), broker (`AMAURY_01`) e a chave (o `MCP_TOKEN`). Salvar e iniciar. (Janela em modo escuro.)

**Com Python:**
```powershell
cd agente\agente_python
.\.venv\Scripts\python.exe main.py
```
(sem `.venv`: `python -m venv .venv` e `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`)

Feche o `AgenteIOT` antigo nessa máquina (os dois usam o mesmo caminho do Firebase).

## 3. Iniciar com o Windows
`Render_Agente.exe --iniciar-com-windows` (desfazer: `--nao-iniciar-com-windows`).

## 4. Usar
- **Site:** aba **Desk-Automacao_Firebase** → escolha a máquina → toque no card. Cards de **Sistema** (informações, bloquear, desligar*, reiniciar*, cancelar), de **Abrir** (site, pasta, arquivo, qualquer programa, fechar programa) e os 20 programas, cada um com botão "fechar". Só ficam ativos os cards que o agente da máquina suporta.
- **Claude:** "qual máquina está ativa?", "abre o Excel na DEV_ENG", "fecha o Word", "bloqueia a tela".
  Desligar/reiniciar: o Claude pergunta antes.

## 4.1 Atalhos salvos (para a IA encontrar)
Na aba Desk, os cards **Abrir site / pasta / arquivo / qualquer programa** têm dois botões:
- **Abrir:** abre na hora (sem salvar).
- **Salvar:** preencha o campo, dê um **nome do atalho** e toque em Salvar. Salve quantos sites e programas quiser.

Os salvos aparecem em **Meus atalhos** (toque para abrir; **Verificar nesta máquina** mostra ✓ existe / ✗ ainda não existe).
No Claude: "abre meu sistema de estoque", "quais são minhas aplicações?", "minhas aplicações estão instaladas aqui?".
- Programa ou pasta que não existe na máquina: a resposta diz **"ainda não existe nesta máquina"**.
- **Pela IA, o que é seu só é encontrado se estiver salvo.** Programas conhecidos (Word, Excel, Chrome...) a IA abre pelo nome.
- Os atalhos ficam cifrados no Firebase. Precisa do `Render_Agente.exe` novo para verificar caminhos.

## 5. Ações
`info`, `abrir_programa` (qualquer programa: nome ou caminho), `abrir_url`, `abrir_pasta`, `abrir_arquivo`,
`fechar_programa`, `bloquear_tela`, `desligar`*, `reiniciar`*, `cancelar_desligamento` (*só com confirmação).
O que for aberto **vem para a frente** e ganha o foco (o resultado diz "na frente").

## 6. Segurança
- Só obedece comando com assinatura HMAC-SHA256 da `AGENTE_CHAVE`. Quem só conhece a URL do banco não consegue mandar nada.
- Comando com mais de 60 s ou com ID repetido é descartado. O relógio do PC precisa estar certo.
- Processos do sistema não são fechados.

## 7. Arquivos
- Configuração: `%LOCALAPPDATA%\AutomacaoIOTAmaury-Agente\config.json` · log: `agente.log` na mesma pasta.
- Gerar o .exe: `.\build_windows.ps1` (em `agente_python`) → `dist\Render_Agente.exe`.
- Testar sem gastar nada: `node aplicacao_desk_agente/agente/teste.mjs` (na pasta `api_conect`; abre e fecha o Bloco de Notas).

## 8. Problemas
| Sintoma | Causa |
|---|---|
| Ícone vermelho | sem internet ou Firebase fora |
| Site diz "offline" | agente fechado, ou sem sinal há mais de 30 s |
| "sem resposta" | chave do agente diferente da do Render (`AGENTE_CHAVE`, ou `MCP_TOKEN` se não houver) |
| "fora da validade" | relógio do PC errado |
| "não consegui abrir" | programa não instalado ou nome errado |
| Render demora ~30 s | plano grátis dorme; só esperar |
