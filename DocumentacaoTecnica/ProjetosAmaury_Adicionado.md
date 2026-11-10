# Projetos adicionados

Um capítulo por projeto. ESP: `ManualNovosDispositivos.md`.

---

# Projeto maps

Rota com trânsito ao vivo (Google Routes API). Pasta: `gps_amaury/`.

## Chave do Google
1. https://console.cloud.google.com/projectcreate → projeto (usado: `ProjetoAmauryExpert`).
2. **Faturamento** → vincular cartão.
3. https://console.cloud.google.com/apis/library/routes.googleapis.com → **Ativar**.
4. **APIs e serviços → Credenciais → Criar credenciais → Chave de API**.
5. Chave → **Restrições de API** → só **Routes API**.
6. **Faturamento → Orçamentos e alertas** → orçamento (ex.: R$ 20/mês).

Chave só no Render (`ponte-casa` → **Environment**) e no `.env`. Nunca no git nem no chat.

| Variável | Valor |
|---|---|
| `GOOGLE_MAPS_KEY` | a chave |
| `CIDADE_PADRAO` | ex.: `Rio Claro - SP` |
| `ORIGEM_PADRAO` | opcional: lugar salvo ou endereço |

## Usar
- `/enderecos`: Nome, Endereço, CEP. `/gps`: abrir no celular e compartilhar.
- Claude: "melhor rota para a casa do centro" · "me oriente até o Amazonas Shopping" · "errei o caminho".
- Origem: o que você disser > GPS (15 min) > `ORIGEM_PADRAO`.
- Teste: `node gps_amaury/teste.mjs`

---

# Projeto agente

Agente do PC (bandeja, Windows/Linux) + aba **Desk-Automacao_Firebase**. Pasta: `aplicacao_desk_agente/`. Passo a passo: `aplicacao_desk_agente/Instrucoes.md`.

- Windows: `agente_python\dist\Windows\Render_Agente.exe` · Linux: `agente_python/dist/Linux/Render_Agente`.
- Chave: `MCP_TOKEN` (ou `AGENTE_CHAVE`) igual no Render e no agente.
- Cards **Abrir** têm **Abrir** e **Salvar**; a IA só acha o que estiver salvo.
- Claude: "qual máquina está ativa?" · "abre o Excel" · "abre meu sistema de estoque".
- Teste: `node aplicacao_desk_agente/agente/teste.mjs`

---

# Projeto android

`api_conect.apk`. Pasta: `aplicacao_android/`. Uso: `Instrucoes.md` · criar: `DocumentacaoTecnica/CriacaoAppAndroid.md` · editar: `Kotlin.md`.

- Instalar o APK; informar nome, broker, chave (`MCP_TOKEN`); liberar as 3 permissões.
- Toque no ícone: **Meus atalhos** (sites; apps marcados, inclusive os padrão do Android).
- Claude: "quais apps eu tenho?" · "abre o WhatsApp" · "abre google.com no Firefox" · "abre o meu banco".
- Teste: `node aplicacao_android/servidor/teste.mjs` · `.\gradlew.bat testDebugUnitTest`

---

# Próximo projeto
