# Projetos adicionados à Automacao IOT Amaury

Cada projeto novo ganha uma seção abaixo, separada por linhas. Sempre resumido: o que é, o que criar/configurar e como usar.
Ordem: do mais antigo para o mais novo. O ESP (acionar pinos) está em `ManualNovosDispositivos.md`.

---

# Projeto maps:

**O que é:** uma ferramenta nova no conector do Claude para perguntar "qual a melhor rota para o trabalho?" e receber a rota mais rápida com o trânsito de agora, comparando as alternativas e com um link para abrir no Waze.

**Pasta:** `gps_amaury/` (código da rota; as ferramentas são registradas em `src/ferramentas.js`, no mesmo serviço do Render).

**Estado:** em planejamento (ainda não implementado). Serviço escolhido para testar: Google Routes API. Alternativa grátis e sem cartão: TomTom Routing.

## 1. Criar a chave de API (Google)

1. Entre em https://console.cloud.google.com com a sua conta Google.
2. Crie um projeto: seletor de projetos (topo) → **Novo projeto** → nome `automacao-iot-maps`.
3. Ative o faturamento: **Faturamento** → vincule um cartão. O Google dá um crédito mensal grátis e o uso pessoal costuma ficar dentro dele. Veja os valores atuais em https://developers.google.com/maps/billing-and-pricing/pricing
4. Ative a API: https://console.cloud.google.com/google/maps-apis → **Ativar APIs** → procure **Routes API** → **Ativar**.
5. Crie a chave: **APIs e serviços → Credenciais → Criar credenciais → Chave de API**.
6. **Restrinja a chave** (importante): clique na chave → **Restrições de API** → marque só **Routes API** → salvar.
7. **Defina um limite de gasto:** **Faturamento → Orçamentos e alertas** → crie um orçamento (ex.: R$ 20/mês) com alerta por e-mail. Sem isso, uso em excesso gera cobrança.

## 2. Onde guardar a chave

- **Nunca** no código, no GitHub nem no chat.
- No Render: `ponte-casa` → **Environment** → **Add Environment Variable** → nome `GOOGLE_MAPS_KEY`, valor = a chave.
- No PC (teste local): linha `GOOGLE_MAPS_KEY=...` no `.env` (ele já está no `.gitignore`).

## 3. Testar a API no navegador

- Documentação: https://developers.google.com/maps/documentation/routes
- Método `computeRoutes` (painel "Try this method", pede a chave): https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
- Para considerar o trânsito use `routingPreference: TRAFFIC_AWARE` e peça rotas alternativas (`computeAlternativeRoutes: true`).
- Sem chave, para ver o mesmo trânsito: https://www.google.com/maps

## 4. Como vai funcionar (plano)

- Nova ferramenta no conector: `melhor_rota(destino, origem?)`.
- O conector **não recebe o GPS do celular**. A origem vem da frase ("de casa para o trabalho") ou de **lugares salvos** com nome (ex.: casa da Cidade Nova, casa do Centro, casa da Dr. Machado). Os endereços **não** vão para o Firebase (regras abertas) nem para o git: ficam numa variável do Render (`LUGARES_JSON`) e no `.env` local. Destinos fora da lista (ex.: Amazonas Shopping) são pesquisados pelo nome.
- Resposta: tempo de cada rota com e sem trânsito, a recomendada, o atraso e um link do Waze para abrir a navegação.
- Limites: o Google não vê acidente e blitz tão bem quanto o Waze, e não prevê bem trânsito de horas à frente.

## 5. Checklist

- [ ] Projeto, faturamento e orçamento criados no Google Cloud
- [ ] Routes API ativada e chave restrita
- [ ] `GOOGLE_MAPS_KEY` no Render (e no `.env` local)
- [ ] Lugares salvos definidos (casa, trabalho...)
- [ ] Ferramenta `melhor_rota` implementada e testada
- [ ] Conector do Claude atualizado

---

# Próximo projeto:

_(escrever aqui quando começarmos o próximo)_
