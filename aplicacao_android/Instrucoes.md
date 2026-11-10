# Agente Android

Janela escura só com o ícone. **Pontinho: verde = conectado, laranja = ligando, vermelho = sem conexão.**
Roda em segundo plano, informa os apps ao Claude e obedece só comandos assinados. Android 5.0+. Fase de testes.

- `api_conect.apk` → o app · `app/` → código · `servidor/` → ferramentas do Claude.

## 1. Instalar
1. Passar o `api_conect.apk` para o celular (cabo, nuvem, e-mail).
2. Abrir o arquivo; permitir **fontes desconhecidas** se pedir.
3. Abrir **Agente Android**.

Versão de 10/11/2026 13:41 (assinada com outra chave): **desinstalar o app antigo antes** e configurar de novo.
Por cabo: `C:\Android\Sdk\platform-tools\adb.exe install -r api_conect.apk`

## 2. Configurar
Janelinha escura:
- **Nome do celular:** letras, números, `-`, `_` (ex.: `Pixel_Amaury`).
- **Broker:** `AMAURY_01`.
- **Chave:** `MCP_TOKEN` do Render. Nunca no chat nem no git.

Permissões (uma por vez):
1. **Notificações** (Android 13+).
2. **Exibir sobre outros apps** (abrir apps e sites em segundo plano).
3. **Sem restrição de bateria**.

- O que faltar é pedido a cada abertura do app; a IA avisa "BLOQUEIO: falta a permissão ...".
- Com a tela apagada o app mantém CPU e Wi-Fi acordados.
- Tela travada com PIN/senha: nenhum app abre por cima.
- **Toque no ícone:** Meus atalhos. **Toque longo:** nome, broker e chave.

## 3. Meus atalhos
- **Sites:** nome + endereço → **Salvar site** (quantos quiser; mesmo nome troca o endereço).
- **Apps marcados:** **Marcar os apps padrão do Android** (navegador, câmera, telefone, mensagens, configurações, contatos, galeria, relógio, agenda, e-mail, mapas, calculadora) e **Escolher outros apps…**.
- Pela IA só se acha o que está salvo. Apps comuns abrem pelo nome; em nomes parecidos, o marcado ganha.
- Tudo vai cifrado para o Firebase.

## 4. Claude
- "Meu celular está ativo?" · "Quais apps eu tenho?" · "Tenho o Spotify?" · "Quais navegadores tenho?"
- "Abre o WhatsApp" · "Abre google.com no Firefox" · "Volta para a tela inicial"
- "Quais sites eu salvei?" · "Abre o meu banco" · "Quais são meus apps marcados?"
- Vários celulares: o Claude pergunta "Qual celular?".

Ações: `info`, `listar_apps`, `abrir_app`, `abrir_url`, `voltar_inicio`, `listar_atalhos`, `abrir_atalho`.

## 5. Problemas
| Sintoma | Causa |
|---|---|
| Pontinho vermelho | sem internet, ou chave/broker errados |
| Claude diz "offline" | app fechado ou bateria limitada (Xiaomi/Samsung/Huawei: liberar em "Bateria" e "Início automático") |
| "falta a permissão Exibir sobre outros apps" | Configurações → Apps → Agente Android |
| "sem resposta" | chave diferente da do Render |
| "fora da validade" | relógio do celular errado |
| Render demora ~30 s | plano grátis acordando |

## 6. Limites
- Não testado em aparelho real: só no PC (assinatura, criptografia e comandos conferem com o servidor).
- Não fecha apps nem bloqueia a tela.

## 7. Refazer e ajustar
`DocumentacaoTecnica/CriacaoAppAndroid.md` · `Kotlin.md`
