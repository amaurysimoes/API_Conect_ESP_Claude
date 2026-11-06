# Configurar o envio de e-mail planejado (Automação IOT Fire)

## Passo 1: senha de app do Gmail
1. Entre na conta Gmail que vai enviar.
2. Abra https://myaccount.google.com/security e ative a **Verificação em duas etapas** (sem ela a senha de app não aparece).
3. Abra https://myaccount.google.com/apppasswords
4. Nome: `AgenteIOT` → **Criar**.
5. Copie a senha de 16 letras (aparece uma vez só; os espaços não importam).

## Passo 2: cadastrar a conta no agente
1. Abra o **AgenteIOT** (`iot_FireMQtt_agente\dist\windows\AgenteIOT.exe`).
2. Dê o nome da máquina e marque o canal **Firebase (internet)**; escolha o broker.
3. No card **Contas de e-mail**: digite o Gmail e a senha de app → **SALVAR CONTA**.
   (Várias contas podem ser cadastradas; **REMOVER CONTA** apaga.)
4. Clique em **INICIAR AGENTE** e deixe-o ligado.

## Passo 3: criar o plano
1. No programa: menu **Broker IOT → Automação IOT Fire**.
2. Escolha o **Broker** e a **Máquina** (● = online).
3. Escolha a **conta** que envia.
4. Preencha: nome do plano, Repetir (uma vez / todo dia / dias da semana), data e hora, destinatários (separe por vírgula), título e texto.
5. **SALVAR PLANO**.

## Passo 4: conferir
- A lista mostra o plano e, depois da hora, o resultado: **OK** ou o erro.
- Teste: crie um plano para daqui a 2 minutos.

## Regras
- O agente precisa estar ligado na hora marcada.
- Atraso de até 10 min ainda envia; depois, o horário é pulado.
- Clique num plano para editar; **ATIVAR / DESATIVAR** e **APAGAR PLANO** ficam acima do formulário.
- A senha fica só no `config.json` da máquina do agente, nunca no Firebase.

## Erros comuns
- **Conta não cadastrada neste agente**: salve a conta no card Contas de e-mail e inicie o agente.
- **Authentication failed**: senha de app errada; gere outra.
- **Lista de contas vazia no programa**: agente desligado ou canal não é Firebase.
