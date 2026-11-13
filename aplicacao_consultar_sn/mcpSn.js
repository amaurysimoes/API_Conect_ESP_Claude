// Ferramenta do Claude: Consultar Serial. instalarSn(server) é chamado UMA vez em iot_automacao_esp/ferramentas.js.
// Fluxo: 1) sem 'token' gera o link da câmera e devolve NA HORA (a IA mostra o link ao usuário);
//        2) com 'token' espera a leitura e devolve o código lido (sem token gera sempre um link novo).
import { z } from "zod";
import { InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { criarSessao, sessao, aguardarLeitura } from "./sessao.js";
import { urlPublica } from "../aplicacao_docs_mysqlaiven/trabalhos.js";

const texto = (t, erro = false) => ({ content: [{ type: "text", text: t }], isError: erro });

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
        "Responda ao usuário assim: 'Código lido: <código>'.",
      inputSchema: {
        token: z.string().optional().describe("token do link gerado no passo 1; sem ele gera um link novo"),
        esperar_segundos: z.number().int().min(0).max(60).optional().describe("no passo 2, quanto esperar a leitura (padrão 45)"),
      },
    },
    async ({ token, esperar_segundos }) => {
      try {
        const base = urlPublica();
        if (!base) return texto("O servidor não sabe o próprio endereço: defina DOCS_URL_PUBLICA (no Render o RENDER_EXTERNAL_URL já vem pronto).", true);
        const id = token;
        if (!id || !sessao(id)) {
          if (token) return texto("Esse link expirou (vale 10 minutos). Chame consultar_serial sem parâmetros para gerar outro.", true);
          const t = criarSessao();
          return texto(`Link da câmera (vale 10 min; abra no celular e permita a câmera):\n${base}/serial/${t}\n\nPeça ao usuário para abrir o link e apontar a câmera para o código; a leitura é automática. Depois chame consultar_serial de novo (token: ${t}) para pegar o código.`);
        }
        const l = await aguardarLeitura(id, (esperar_segundos ?? 45) * 1000);
        if (!l) return texto(`Ainda não foi lido nenhum código neste link. Peça ao usuário para abrir ${base}/serial/${id} e apontar a câmera; depois chame consultar_serial de novo (token: ${id}).`);
        return texto(`Código lido: ${l.texto}\nPadrão: ${l.formato || "não informado"}`);
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );
}
