# Agente leve — instruções

Programa escondido na bandeja do Windows. **Ícone verde = conectado ao Firebase; vermelho = sem conexão.**
Envia um resumo da máquina (CPU, memória, disco) e obedece só comandos **assinados** pela ponte.

- `agente/agente/` → lado do servidor (Render): aba **Desk-Automacao_Firebase** e ferramentas do Claude.
- `agente/agente_python/` → o programa que roda na máquina.

## 1. Chave (uma vez)
1. Gere uma chave longa (PowerShell):
   `-join ((48..57)+(97..122) | Get-Random -Count 40 | % {[char]$_})`
2. Render → `ponte-casa` → **Environment** → `AGENTE_CHAVE` = a chave → Salvar.
3. Guarde a mesma chave: o agente pede na primeira vez. Não cole em chat nem no git.

## 2. Instalar na máquina
**Com o .exe:** abra `agente_python\dist\AgenteLeve.exe`. Uma janelinha pede:
nome da máquina (ex.: `DEV_ENG`), broker (`AMAURY_01`) e a chave. Salvar e iniciar.

**Com Python:**
```powershell
cd agente\agente_python
.\.venv\Scripts\python.exe main.py
```
(sem `.venv`: `python -m venv .venv` e `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`)

Feche o `AgenteIOT` antigo nessa máquina (os dois usam o mesmo caminho do Firebase).

## 3. Iniciar com o Windows
`AgenteLeve.exe --iniciar-com-windows` (desfazer: `--nao-iniciar-com-windows`).

## 4. Usar
- **Site:** aba **Desk-Automacao_Firebase** → escolha a máquina → toque no programa (20 atalhos).
- **Claude:** "qual máquina está ativa?", "abre o Excel na DEV_ENG", "fecha o Word", "bloqueia a tela".
  Desligar/reiniciar: o Claude pergunta antes.

## 5. Ações
`info`, `abrir_programa` (qualquer programa: nome ou caminho), `abrir_url`, `abrir_pasta`, `abrir_arquivo`,
`fechar_programa`, `bloquear_tela`, `desligar`*, `reiniciar`*, `cancelar_desligamento` (*só com confirmação).

## 6. Segurança
- Só obedece comando com assinatura HMAC-SHA256 da `AGENTE_CHAVE`. Quem só conhece a URL do banco não consegue mandar nada.
- Comando com mais de 60 s ou com ID repetido é descartado. O relógio do PC precisa estar certo.
- Processos do sistema não são fechados.

## 7. Arquivos
- Configuração: `%LOCALAPPDATA%\AutomacaoIOTAmaury-Agente\config.json` · log: `agente.log` na mesma pasta.
- Gerar o .exe: `.\build_windows.ps1` (em `agente_python`) → `dist\AgenteLeve.exe`.
- Testar sem gastar nada: `node agente/agente/teste.mjs` (na pasta `api_conect`; abre e fecha o Bloco de Notas).

## 8. Problemas
| Sintoma | Causa |
|---|---|
| Ícone vermelho | sem internet ou Firebase fora |
| Site diz "offline" | agente fechado, ou sem sinal há mais de 30 s |
| "sem resposta" | chave diferente entre o Render e o agente |
| "fora da validade" | relógio do PC errado |
| "não consegui abrir" | programa não instalado ou nome errado |
| Render demora ~30 s | plano grátis dorme; só esperar |
