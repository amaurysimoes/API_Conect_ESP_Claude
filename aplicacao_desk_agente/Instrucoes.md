# Agente do PC

Bandeja: **verde = conectado, vermelho = sem conexão**. Envia CPU/memória/disco e obedece só comandos assinados.

- `agente/` → servidor (aba Desk + ferramentas do Claude).
- `agente_python/` → programa da máquina.

## 1. Chave
Use o `MCP_TOKEN` do Render. Opcional: `AGENTE_CHAVE` no Render com
`-join ((48..57)+(97..122) | Get-Random -Count 40 | % {[char]$_})` (o agente usa o mesmo valor).
Nunca no chat nem no git.

## 2. Instalar
- Windows: abrir `agente_python\dist\Windows\Render_Agente.exe`.
- Linux: `chmod +x Render_Agente && ./Render_Agente` (`xdg-utils` para abrir sites e pastas).
- Janelinha: nome da máquina (`DEV_ENG`), broker (`AMAURY_01`), chave. Salvar.
- Fechar o `AgenteIOT` antigo (mesmo caminho do Firebase).

Com Python:
```powershell
cd aplicacao_desk_agente\agente_python
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe main.py
```

## 3. Iniciar com o sistema
```powershell
Render_Agente.exe --iniciar-com-windows
Render_Agente.exe --nao-iniciar-com-windows
```
No Linux cria `~/.config/autostart`. Mudou o `.exe` de lugar: rode de novo.

## 4. Usar
- Site: aba **Desk-Automacao_Firebase** → máquina → card. Só ficam ativos os cards que o agente suporta.
- Claude: "qual máquina está ativa?" · "abre o Excel na DEV_ENG" · "fecha o Word" · "bloqueia a tela". Desligar e reiniciar: o Claude pergunta antes.

## 5. Atalhos salvos
- Cards **Abrir site / pasta / arquivo / programa**: **Abrir** (na hora) ou **Salvar** (campo + nome do atalho).
- Salvos em **Meus atalhos**; **Verificar nesta máquina** → ✓ existe / ✗ ainda não existe.
- Claude: "abre meu sistema de estoque" · "quais são minhas aplicações?".
- Pela IA só se acha o que está salvo. Word, Excel, Chrome etc. abrem pelo nome.
- Valem para todas as máquinas. Não vê as ferramentas novas? Remova e adicione o conector no claude.ai.

## 6. Ações
`info`, `abrir_programa`, `abrir_url`, `abrir_pasta`, `abrir_arquivo`, `fechar_programa`, `bloquear_tela`, `desligar`*, `reiniciar`*, `cancelar_desligamento`, `verificar_caminhos` (*pede confirmação).
Windows: o que abre vem para a frente. Linux: sem isso; programas do Windows não existem ("ainda não existe nesta máquina").

## 7. Conexão CLP (EtherNet/IP)
- Clique direito no ícone da bandeja → marcar **Ativar Conexao CLP: EtherNet/IP**. Desmarcado, o agente ignora comandos de CLP e fecha a conexão.
- O PC precisa estar no cabo RJ45 do CLP (mesma faixa de IP) e na internet (Wi-Fi).
- Firewall do PC: liberar `TCP 44818` e `UDP 2222`.
- Usar: aba **Conexao Socket-TCP/IP** → botão **Instruções**. Detalhes: `DocumentacaoTecnica/ProjetosAmaury_Adicionado.md` (Projeto CLP).
- Opcional no `config.json`: `"clp_faixa": [512, 767]` limita os bits que a rede pode acionar.
- Só funciona com CLP que fale EtherNet/IP. FX3U não fala.
- Teste (CLP simulado): `.venv\Scripts\python.exe teste_clp.py` em `agente_python`.

## 8. Segurança
- Só comandos com assinatura HMAC-SHA256; comando com mais de 60 s ou ID repetido é descartado (relógio do PC certo).
- Processos do sistema não são fechados.
- CLP: só IP de rede local/privada.

## 9. Gerar os executáveis
```powershell
cd aplicacao_desk_agente\agente_python
.\build_windows.ps1                                    # dist\Windows\Render_Agente.exe
wsl -d Ubuntu-22.04 -u root -- bash /mnt/c/Dev-AHS/api_conect/aplicacao_desk_agente/agente_python/build_linux.sh   # dist/Linux/Render_Agente
```
- Feche o agente antes se ele roda de `dist\Windows`.
- Linux exige glibc 2.35+ (Ubuntu 22.04+, Debian 12+, Mint 21+, Fedora 36+). Mais antigo: compile numa distro mais antiga.
- Ubuntu 22.04 no WSL: `wsl --install -d Ubuntu-22.04 --no-launch`.
- Mais detalhes: `agente_python/DocumentacaoTecnica/BuildarExecutaveis.md`.

## 10. Arquivos
- Config: `%LOCALAPPDATA%\AutomacaoIOTAmaury-Agente\config.json` (Linux: `~/.local/share/AutomacaoIOTAmaury-Agente/`) · log `agente.log`.
- Testes (sem tocar no Firebase): `node aplicacao_desk_agente/agente/teste.mjs` · `node aplicacao_clp/servidor/teste.mjs` · `teste_linux.py` (ver topo do arquivo).

## 11. Problemas
| Sintoma | Causa |
|---|---|
| Ícone vermelho | sem internet ou Firebase fora |
| Site diz "offline" | agente fechado ou sem sinal há 30 s |
| "sem resposta" | chave diferente da do Render |
| "fora da validade" | relógio do PC errado |
| "não consegui abrir" | programa não instalado ou nome errado |
| Render demora ~30 s | plano grátis acordando |
| Aba CLP: "marque Ativar Conexao CLP" | checkbox desmarcado na bandeja |
| CLP: erro `0x0106` | outro scanner conectado ao CLP; esperar alguns segundos |
