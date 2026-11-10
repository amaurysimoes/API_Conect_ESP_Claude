# Agente Android — instruções de uso

App escuro e pequeno: uma janela só com o ícone. **Pontinho verde = conectado, laranja = ligando, vermelho = sem conexão.**
Fica em segundo plano, avisa a IA o que há no celular e obedece só comandos **assinados**.
Funciona do **Android 5.0 em diante**. Fase de testes.

- `Agente_Android.apk` → o app (esta pasta).
- `app/` → código do app · `servidor/` → ferramentas do Claude (Render).

## 1. Instalar
1. Passe o `Agente_Android.apk` para o celular (cabo, nuvem, e-mail).
2. Abra o arquivo. Se pedir, permita **instalar apps de fontes desconhecidas** para o app que você usou para abrir.
3. Instale e abra **Agente Android**.

(Por cabo: `adb install -r Agente_Android.apk`; o `adb` está em `C:\Android\Sdk\platform-tools`.)

## 2. Configurar (só na primeira vez)
Janelinha escura pede:
- **Nome do celular:** só letras, números, `-` e `_` (ex.: `Pixel_Amaury`).
- **Broker:** `AMAURY_01`.
- **Chave:** o `MCP_TOKEN` do Render (a mesma do agente do PC). Não cole em chat nem no git.

Depois o app pede 3 permissões, uma de cada vez:
1. **Notificações** (Android 13+): só a notificação mínima do serviço.
2. **Exibir sobre outros apps:** é o que deixa a IA **abrir apps e sites** com o app em segundo plano.
3. **Sem restrição de bateria:** evita o Android matar o agente.

Trocar os dados depois: **toque longo** no ícone.

## 3. Usar (no Claude)
- "Meu celular está ativo?" · "Quais apps eu tenho?" · "Tenho o Spotify?" · "Quais navegadores tenho?"
- "Abre o WhatsApp no celular" · "Abre o site google.com no Firefox" · "Volta para a tela inicial"
- Com mais de um celular, o Claude pergunta "Qual celular?".

## 4. Ações
`info`, `listar_apps` (atualiza a lista), `abrir_app` (pelo nome ou pacote), `abrir_url` (com navegador à escolha), `voltar_inicio`.
A lista de apps vai **cifrada** para o Firebase (o banco é aberto): só o servidor lê.

## 5. Problemas
| Sintoma | Causa |
|---|---|
| Pontinho vermelho | sem internet, ou chave/broker errados (toque longo no ícone) |
| Claude diz "offline" | app fechado à força ou o fabricante limitou a bateria (Xiaomi/Samsung/Huawei: libere o app em "Bateria" e "Início automático") |
| "falta a permissão Exibir sobre outros apps" | permitir em Configurações → Apps → Agente Android |
| "sem resposta" | chave diferente da do Render |
| "fora da validade" | relógio do celular errado |
| Render demora ~30 s | plano grátis dorme; só esperar |

## 6. Limites desta fase
- **Ainda não foi testado em aparelho de verdade** (só no PC: assinatura, criptografia e leitura dos comandos conferem com o servidor). Se algo falhar no celular, me diga o modelo e a versão do Android.
- Não fecha apps, não bloqueia a tela e não usa Android sem a permissão de sobrepor (limite do Android).

## 7. Refazer o app
Passo a passo completo: `DocumentacaoTecnica/CriacaoAppAndroid.md`.
