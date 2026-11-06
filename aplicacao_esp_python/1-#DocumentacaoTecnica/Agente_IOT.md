# Agente IOT — passo a passo (instalar, configurar, testar, mudar)

O agente roda em cada máquina (Windows ou Linux), **observa um broker** (Firebase ou MQTT) e executa, **uma vez cada**,
as ações da **lista branca**. Código em `iot_FireMQtt_agente/`. Nunca executa comando livre vindo da rede.

## 1. Executáveis (já gerados)

| Sistema | Arquivo |
|---|---|
| Windows | `iot_FireMQtt_agente\dist\windows\AgenteIOT.exe` |
| Linux | `iot_FireMQtt_agente/dist/linux/AgenteIOT` (precisa `libxcb-cursor0`; nunca foi executado em Linux) |

Para gerar de novo: Windows `.\iot_FireMQtt_agente\build_windows.ps1`; Linux (ou WSL) `bash iot_FireMQtt_agente/build_linux.sh`.
Sem executável, com Python: `.\.venv\Scripts\python.exe iot_FireMQtt_agente\agente.py`.

## 2. Configurar (na tela do agente)

1. Abra o `AgenteIOT.exe`.
2. **Esta máquina:** o nome dela (ex.: `PC_SALA`).
3. **Qual broker observar?** marque UMA opção:
   - **Firebase (internet):** escolha o broker `fire` na lista (cadastrado pelo form *Broker Fire IOT*).
   - **MQTT (rede local):** escolha o broker `mqtt` cadastrado (preenche IP e porta) e digite o usuário e a senha do broker
     (os mesmos do form *Broker MQTT IOT*). Também dá para digitar o IP à mão.
4. **INICIAR AGENTE.** Marque "Iniciar o agente sozinho ao abrir o programa" para as próximas vezes.

A configuração fica em `%LOCALAPPDATA%\AUTOMACAO_IOT-AHS-Agente\config.json` (Linux: `~/.local/share/AUTOMACAO_IOT-AHS-Agente/`)
e o log (com rotação, 3 x 1 MB) em `agente.log` na mesma pasta.

### Programas que podem ser abertos
Só os cadastrados em `config.json`, no campo `"programas"` (nome → caminho). Padrão no Windows:
`{"bloco de notas": "notepad.exe", "calculadora": "calc.exe"}`. Para liberar outro, edite o arquivo e reinicie o agente:
`"chrome": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`.

## 3. Como mandar comandos

**MQTT (texto simples, como "escrever no broker"):** publique em `casa/<maquina>/cmd`. O resultado volta em `casa/<maquina>/result`.
```
explorer                       abre o Explorer (também: windows explorer, abrir explorer)
explorer C:\Users              abre numa pasta
programa bloco de notas        abre um programa cadastrado
url www.exemplo.com           abre o site (o https:// é colocado sozinho)
bloquear                       bloqueia a tela
info                           CPU, memória, disco, tempo ligado
desligar confirmar             desliga em 10 s  (sem "confirmar" é recusado)
reiniciar confirmar            reinicia em 10 s
```
Pela linha de comando (teste):
`.\.venv\Scripts\python.exe iot_FireMQtt_agente\enviar_comando.py mqtt --host IP --usuario iot --senha SENHA --maquina PC_SALA explorer`

**Firebase:** o comando é gravado em `brokers/<broker>/maquinas/<maquina>/comandos/<id>` com `acao`, `parametros` e `ts` (ms).
O agente confere a validade (30 s) e se o ID já foi executado; executa; grava `resultado/<id>` e **apaga** o comando (não repete).
## 4. Segurança (o que o agente recusa)
- Qualquer ação fora da lista (`format c:`, `del ...`, `executar_cmd`) → "comando não reconhecido".
- Comando com mais de 30 s ou repetido (mesmo ID) no Firebase.
- `desligar` e `reiniciar` só com confirmação (`confirmado=true` / "confirmar").
- MQTT: mensagens "retidas" antigas nunca são executadas; o broker só aceita usuário e senha.
- A senha do broker MQTT fica no `config.json` da máquina (texto simples): proteja o acesso à pasta do usuário.

## 5. Rodar sozinho na inicialização
O agente precisa da **sessão do usuário logado** (abrir o Explorer/programas exige a área de trabalho).
- **Windows (recomendado): Agendador de Tarefas** → Criar Tarefa → Disparador "Ao fazer logon" → Ação: iniciar
  `AgenteIOT.exe` (ou `AgenteIOT.exe --sem-tela` para rodar sem janela, usando a última configuração salva) → marque
  "Executar somente quando o usuário estiver conectado".
- Alternativa: coloque um atalho do `.exe` em `shell:startup`.
- NSSM/serviço do Windows roda na sessão 0 (sem área de trabalho): **não** abre o Explorer. Use só para ações sem janela.
- Linux: serviço de **usuário** (`systemctl --user`) ou "Aplicativos de inicialização" do ambiente gráfico.

## 6. Adicionar uma ação nova
Tudo em um lugar: `iot_FireMQtt_agente/agente_core/acoes.py`. Escreva uma função com `@acao("nome", "descrição")`, que recebe
`(params, ctx)` e devolve o texto do resultado (ou levanta `ErroAcao("motivo")`). Se quiser um apelido em texto simples,
acrescente em `ALIASES` (e, se a ação tiver argumento, em `ARGUMENTO`) no `nucleo.py`. Gere os executáveis de novo.

## 7. Testar sem executar nada de verdade
`AgenteIOT.exe --sem-tela --simular` (ou `python agente.py --simular`): faz tudo, menos executar a ação ("(simulado)").

## 8. Mandar comandos pela página e pelo app
- **App (desktop):** *Broker IOT → Broker Fire IOT* → clique num broker da lista "Brokers cadastrados" → escolha a máquina e o comando
  → EXECUTAR. Um clique = um comando.
- **Página** (https://amauryesp-active.web.app): aba **Brokers** → clique no broker → mesmo cardzinho.
- **Brokers MQTT (rede local):** o comando vai pelo Firebase até o app *Broker MQTT IOT* (que precisa estar ATIVO na rede: ele é o
  gateway) e de lá para o agente por MQTT. O resultado volta pelo mesmo caminho.

## 9. Planos agendados (e-mail) — Automação IOT Fire
1. No agente (canal **Firebase**), card **Contas de e-mail**: digite o Gmail e a **senha de app** (Conta Google → Segurança → Verificação em duas etapas → Senhas de app) e clique em SALVAR CONTA. Pode cadastrar várias; REMOVER CONTA apaga. As senhas ficam só no `config.json` da máquina; o Firebase recebe só os endereços.
2. Deixe o agente ligado. No programa: menu **Broker IOT → Automação IOT Fire**, escolha broker, máquina e a conta que envia, e crie o plano.
3. O agente consulta os planos a cada 15 s. Na hora marcada envia o e-mail e grava o resultado no plano (aparece na lista do programa). Atraso de até 10 min ainda envia; depois pula.
4. Código: `agente_core/agendador.py` (outras tarefas além de e-mail entram em `_executar`).

## 10. Janela escondida (bandeja)
Com o agente já configurado, ele abre escondido: só o ícone ao lado do relógio do Windows (se não achar, clique na seta ^). Clique no ícone para abrir; minimizar esconde de novo; botão direito: Abrir / Sair. O X da janela encerra o agente.

