# Projetos adicionados à Automacao IOT Amaury

Cada projeto novo ganha uma seção abaixo, separada por linhas. Sempre resumido: o que é, o que criar/configurar e como usar.
Ordem: do mais antigo para o mais novo. O ESP (acionar pinos) está em `ManualNovosDispositivos.md`.

---

# Projeto maps:

**O que é:** uma ferramenta nova no conector do Claude para perguntar "qual a melhor rota para o trabalho?" e receber a rota mais rápida com o trânsito de agora, comparando as alternativas e com um link para abrir no Waze.

**Pasta:** `gps_amaury/` (código da rota; as ferramentas são registradas em `src/ferramentas.js`, no mesmo serviço do Render).

**Estado:** código pronto em `gps_amaury/` e registrado no conector (`melhor_rota`, `orientar`, `listar_lugares`); testado só com o Google simulado. Detalhes completos em `CLAUDE.md`. Serviço escolhido para testar: Google Routes API. Alternativa grátis e sem cartão: TomTom Routing.

## 1. Criar a chave de API (Google)

1. **Passo 1, criar o projeto:** abra https://console.cloud.google.com/projectcreate e entre com a sua conta Google (se pedir, aceite os termos).
2. Pode **usar um projeto que você já tem** (usado aqui: `ProjetoAmauryExpert`, selecionado no seletor do topo) ou criar um novo: em **Nome do projeto** escreva `automacao-iot-maps` e clique em **Criar**. Espere a notificação "projeto criado" (sino, no topo) e confira se o projeto aparece selecionado no seletor do topo.
3. Ative o faturamento: **Faturamento** → vincule um cartão. O Google dá um crédito mensal grátis e o uso pessoal costuma ficar dentro dele. Veja os valores atuais em https://developers.google.com/maps/billing-and-pricing/pricing
4. Ative a API: https://console.cloud.google.com/google/maps-apis → **Ativar APIs** → procure **Routes API** → **Ativar**.
5. Crie a chave: **APIs e serviços → Credenciais → Criar credenciais → Chave de API**.
6. **Restrinja a chave** (importante): clique na chave → **Restrições de API** → marque só **Routes API** → salvar.
7. **Defina um limite de gasto:** **Faturamento → Orçamentos e alertas** → crie um orçamento (ex.: R$ 20/mês) com alerta por e-mail. Sem isso, uso em excesso gera cobrança.

## 2. Onde guardar a chave

- **Nunca** no código, no GitHub nem no chat.
- No Render: `ponte-casa` → **Environment** → **Add Environment Variable** → nome `GOOGLE_MAPS_KEY`, valor = a chave.
- No PC (teste local): linha `GOOGLE_MAPS_KEY=...` no `.env` (ele já está no `.gitignore`).

## 2.1 Variáveis no Render (Environment)

| Variável | Valor |
|---|---|
| `GOOGLE_MAPS_KEY` | a chave da API do Google |
| `ORIGEM_PADRAO` | de onde você sai quando não diz (nome de um lugar salvo ou um endereço) |
| `CIDADE_PADRAO` | ex.: `Rio Claro - SP`; completa destinos sem cidade (ex.: Amazonas Shopping) |
| `LUGARES_JSON` | os lugares com nome, em uma linha: `{"Casa 1":"rua, número, bairro, cidade - UF","Trabalho":"..."}` |

## 3. Testar a API no navegador

- Documentação: https://developers.google.com/maps/documentation/routes
- Método `computeRoutes` (painel "Try this method", pede a chave): https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
- Para considerar o trânsito use `routingPreference: TRAFFIC_AWARE` e peça rotas alternativas (`computeAlternativeRoutes: true`).
- Sem chave, para ver o mesmo trânsito: https://www.google.com/maps

## 4. Usar

- Páginas (senha do painel): `/enderecos` (Nome, Endereço, CEP) e `/gps` (abrir no celular e compartilhar; tela ligada).
- Ao Claude: "melhor rota para a casa do centro", "me oriente até o Amazonas Shopping", "errei o caminho".
- Origem: o que você disser > GPS (vale 15 min) > `ORIGEM_PADRAO`.
- Render dormindo: o Claude avisa "Aguarde 10 segundos até o render responder". Para não dormir: pinger em `/saude` a cada 10 min.
- Testar sem gastar: `node gps_amaury/teste.mjs`.
- Código só em `gps_amaury/`; o resto do projeto não foi alterado. Detalhes: `CLAUDE.md`.

## 5. Checklist

- [ ] Projeto, faturamento e orçamento criados no Google Cloud
- [ ] Routes API ativada e chave restrita
- [ ] `GOOGLE_MAPS_KEY` no Render (e no `.env` local)
- [ ] Lugares salvos definidos (casa, trabalho...)
- [x] Ferramenta `melhor_rota` implementada (`gps_amaury/rotas.js`)
- [x] Páginas `/enderecos` e `/gps`, endereços cifrados, `orientar`, trânsito por trecho (código pronto, testado simulado)
- [ ] `CIDADE_PADRAO` (e `ORIGEM_PADRAO`, se quiser) no Render
- [ ] Endereços cadastrados em `/enderecos`
- [ ] Conector do Claude atualizado (ferramentas novas)
- [ ] Testada com o Google de verdade
- [ ] Conector do Claude atualizado

---

# Projeto agente:

Agente leve na bandeja do Windows: o Claude (ou a aba **Desk-Automacao_Firebase**) abre programas e vê o resumo da máquina.

- Pasta: `aplicacao_desk_agente/` · passo a passo: `aplicacao_desk_agente/Instrucoes.md`.
- Servidor (`aplicacao_desk_agente/agente`): variável `AGENTE_CHAVE` no Render.
- PC (`aplicacao_desk_agente/agente_python`): Windows `dist\Windows\Render_Agente.exe` e Linux `dist/Linux/Render_Agente`; ícone verde = conectado.
- Claude: "qual máquina está ativa?", "abre o Excel".
- Atalhos: nos cards "Abrir" use **Salvar** (nome + caminho); a IA abre pelo nome ("abre meu sistema de estoque"). Só o que está salvo a IA encontra.
- Testar: `node aplicacao_desk_agente/agente/teste.mjs`.

---

# Projeto android:

App `api_conect.apk`: o Claude vê os apps do celular e abre apps e sites nele.

- Pasta: `aplicacao_android/` · uso: `aplicacao_android/Instrucoes.md` · criar do zero: `DocumentacaoTecnica/CriacaoAppAndroid.md`.
- Instalar o APK, informar nome, broker e chave (`MCP_TOKEN`), liberar as 3 permissões.
- Toque no ícone: **Meus atalhos** (salvar sites; marcar apps, inclusive os padrão do Android). Editar o app: `aplicacao_android/Kotlin.md`.
- Claude: "quais apps eu tenho?", "abre o WhatsApp", "abre google.com no Firefox".
- Testar: `node aplicacao_android/servidor/teste.mjs` e `.\gradlew.bat testDebugUnitTest`.

---

# Próximo projeto:

_(escrever aqui quando começarmos o próximo)_
