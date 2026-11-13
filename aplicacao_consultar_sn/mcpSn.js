// Ferramenta do Claude: Consultar Serial. instalarSn(server) é chamado UMA vez em iot_automacao_esp/ferramentas.js.
// Fluxo: 1) sem 'token' gera o link da câmera e devolve NA HORA (a IA mostra o link ao usuário);
//        2) com 'token' espera a leitura e devolve o código lido (sem token gera sempre um link novo).
import { z } from "zod";
import { InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { criarSessao, sessao, aguardarLeitura } from "./sessao.js";
import { urlPublica } from "../aplicacao_docs_mysqlaiven/trabalhos.js";

import { aguardarBusca, iniciarBusca, resumoTexto } from "./busca.js";

const texto = (t, erro = false) => ({ content: [{ type: "text", text: t }], isError: erro });
// histórico do back-end (2ª parte) em texto para a IA
const textoBusca = (b, token) => !b ? "\n\nHistórico no back-end: a busca não foi iniciada (falta IP/porta na aba Consulta Serial ou a página não pediu)."
  : b.estado === "ok" ? `\n\nHistórico no back-end (via ${b.via}):\n${resumoTexto(b.dados)}`
    : b.estado === "erro" ? `\n\nHistórico no back-end: não consegui buscar (${b.erro}).`
      : `\n\nHistórico no back-end: a busca ainda está em andamento (varredura pode demorar). Chame consultar_serial de novo (token: ${token}) para pegar o resultado.`;

// Diagnóstico (só anota nos Logs do Render, não muda nenhuma resposta): o que o Claude manda e que etapas do cadastro ele faz
function anotarEtapas(server) {
  try {
    const baixo = server.server;
    baixo.setRequestHandler(InitializeRequestSchema, async (req) => {
      const p = req.params ?? {};
      console.log(`[conector] initialize: protocolo=${p.protocolVersion} cliente=${JSON.stringify(p.clientInfo)} capacidades=${Object.keys(p.capabilities ?? {}).join(",") || "-"}`);
      return baixo._oninitialize(req);
    });
    baixo.oninitialized = () => console.log("[conector] notifications/initialized recebido (o Claude confirmou a inicialização)");
    baixo.onerror = (e) => console.log(`[conector] erro do protocolo: ${e?.message ?? e}`);
    for (const metodo of ["tools/list", "tools/call", "resources/list", "prompts/list"]) {
      const f = baixo._requestHandlers?.get(metodo);
      if (f) baixo._requestHandlers.set(metodo, (req, extra) => { console.log(`[conector] ${metodo}${req.params?.name ? " " + req.params.name : ""}`); return f(req, extra); });
    }
  } catch (e) { console.log(`[conector] não consegui instrumentar: ${e.message}`); }
}

export function instalarSn(server) {
  console.log(`[conector] requisição MCP atendida ${new Date().toISOString()}`);   // aparece nos Logs do Render a cada chamada do Claude
  anotarEtapas(server);
  server.registerTool(
    "consultar_serial",
    {
      description:
        "Consultar Serial: lê o número de série de um produto pela CÂMERA DO CELULAR (código de barras de qualquer padrão, QR Code, Data Matrix, etc.). " +
        "PASSO 1 (sem parâmetros): gera um link; MOSTRE o link ao usuário e peça para abrir no celular e apontar a câmera (a leitura é automática: moldura vermelha, vira verde ao ler). Não espere nada nesse passo. " +
        "PASSO 2 (quando o usuário disser que escaneou, ou 'qual foi o código?'): chame de novo com o 'token' do passo 1; a resposta traz o código lido e o padrão. Sem token SEMPRE gera um link novo. " +
        "Responda ao usuário assim: 'Código lido: <código>'. " +
        "Ao ler, a página já busca o HISTÓRICO do serial no back-end da rede local (IP/porta salvos na aba Consulta Serial); o passo 2 traz esse histórico junto: resuma para o usuário. " +
        "Se o usuário DITAR/digitar o serial (sem câmera), passe 'serial': busca o histórico direto, sem link.",
      inputSchema: {
        serial: z.string().optional().describe("serial informado pelo usuário (sem câmera): busca o histórico no back-end"),
        token: z.string().optional().describe("token do link gerado no passo 1; sem ele gera um link novo"),
        esperar_segundos: z.number().int().min(0).max(60).optional().describe("no passo 2, quanto esperar a leitura (padrão 45)"),
      },
    },
    async ({ token, esperar_segundos, serial }) => {
      try {
        if (serial && !token) {   // serial ditado: sessão própria, busca pelo agente e espera
          const t = criarSessao();
          const { sn } = await iniciarBusca(t, serial);
          return texto(`Serial: ${sn}${textoBusca(await aguardarBusca(t, sn, 50000), t)}`);
        }
        const base = urlPublica();
        if (!base) return texto("O servidor não sabe o próprio endereço: defina DOCS_URL_PUBLICA (no Render o RENDER_EXTERNAL_URL já vem pronto).", true);
        const id = token;
        if (!id || !sessao(id)) {
          if (token) return texto("Esse link expirou (vale 10 minutos). Chame consultar_serial sem parâmetros para gerar outro.", true);
          const t = criarSessao();
          return texto(`Link da câmera (vale 10 min; abra no celular e permita a câmera):\n${base}/serial/${t}\n\nPeça ao usuário para abrir o link e apontar a câmera para o código; a leitura é automática. Depois chame consultar_serial de novo (token: ${t}) para pegar o código.`);
        }
        const t0 = Date.now();
        const l = await aguardarLeitura(id, (esperar_segundos ?? 45) * 1000);
        if (!l) return texto(`Ainda não foi lido nenhum código neste link. Peça ao usuário para abrir ${base}/serial/${id} e apontar a câmera; depois chame consultar_serial de novo (token: ${id}).`);
        // 2ª parte: a página já pediu a busca no back-end ao ficar verde; junta o histórico à resposta (até ~50 s no total)
        let b = await aguardarBusca(id, l.texto, Math.max(4000, 50000 - (Date.now() - t0)));
        if (!b) {   // a página fechou antes de pedir a busca: a própria ferramenta pede
          try { await iniciarBusca(id, l.texto); b = await aguardarBusca(id, l.texto, Math.max(4000, 50000 - (Date.now() - t0))); }
          catch (e) { return texto(`Código lido: ${l.texto}\nPadrão: ${l.formato || "não informado"}\n\nHistórico no back-end: ${e.message || e}`); }
        }
        return texto(`Código lido: ${l.texto}\nPadrão: ${l.formato || "não informado"}${textoBusca(b, id)}`);
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );
}
