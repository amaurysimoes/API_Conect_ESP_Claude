// Ferramentas do módulo maps/GPS para o conector do Claude. instalarGps(server) é chamado UMA vez em src/ferramentas.js:
//  1) adiciona a todas as ferramentas (inclusive as antigas) a dica do Render dormindo e o aviso de "acabou de acordar";
//  2) registra melhor_rota, orientar e listar_lugares. Não muda nenhuma ferramenta que já existia.
import { z } from "zod";
import { melhorRota, orientar, listarLugares } from "./rotas.js";

const DICA_RENDER =
  "Se esta ferramenta falhar, der erro de conexão ou demorar, é o servidor grátis do Render acordando: " +
  "diga ao usuário exatamente \"Aguarde 10 segundos até o render responder\" e tente de novo, sem pedir desculpas longas.";
const avisoAcordou = () => (process.uptime() < 90 ? "ℹ️ O servidor (Render grátis) acabou de acordar; a primeira resposta demora um pouco. " : "");
const texto = (t, erro = false) => ({ content: [{ type: "text", text: t }], isError: erro });
const seguro = (fn) => async (args) => {
  try { return texto(await fn(args)); } catch (e) { return texto(String(e.message || e), true); }
};

export function instalarGps(server) {
  const registrar = server.registerTool.bind(server);
  server.registerTool = (nome, cfg, fn) =>
    registrar(nome, { ...cfg, description: `${cfg.description} ${DICA_RENDER}` }, async (...args) => {
      const r = await fn(...args);
      const aviso = avisoAcordou();
      if (aviso && r?.content?.[0]?.type === "text") r.content[0].text = aviso + r.content[0].text;
      return r;
    });

  const schemaRota = {
    destino: z.string().describe("para onde ir, ex.: 'casa do Centro', 'Trabalho' ou 'Amazonas Shopping'"),
    origem: z.string().optional().describe("de onde sai, só se o usuário disser; senão usa o GPS do celular"),
  };

  server.registerTool(
    "melhor_rota",
    {
      description:
        "Compara as rotas de carro com o trânsito de agora (Google) e diz qual é a melhor, quanto atrasa cada uma e onde há trecho lento ou parado. " +
        "'destino' pode ser um lugar salvo (ex.: 'casa do Centro', 'Trabalho') ou qualquer lugar pelo nome (ex.: 'Amazonas Shopping'). " +
        "A origem é o GPS do celular (o usuário precisa ter a página /gps aberta); se a resposta disser que não tem GPS, peça para abrir a página ou perguntar de onde ele sai. " +
        "Responda curto: por onde ir, tempo, quanto economiza e onde há trânsito. Ofereça o link do Waze.",
      inputSchema: schemaRota,
    },
    seguro(melhorRota)
  );

  server.registerTool(
    "orientar",
    {
      description:
        "Passo a passo detalhado (vire à direita/esquerda, nome da rua, distância) da melhor rota a partir de ONDE O USUÁRIO ESTÁ AGORA (GPS), marcando os trechos com trânsito lento ou parado. " +
        "Use quando o usuário pedir para ser guiado ou disser que errou o caminho: chame de novo, pois ele recalcula da posição atual e a primeira instrução já diz como voltar à rota. " +
        "Leia os passos de forma natural, em ordem, começando pelos próximos; avise dos trechos com ⚠.",
      inputSchema: schemaRota,
    },
    seguro(orientar)
  );

  server.registerTool(
    "listar_lugares",
    { description: "Lista os nomes dos lugares salvos (ex.: casas) que podem ser usados como origem ou destino em melhor_rota. Não mostra endereços." },
    async () => texto(JSON.stringify(await listarLugares()))
  );
}
