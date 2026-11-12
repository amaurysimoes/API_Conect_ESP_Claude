// Rotas HTTP da aba "Documentos Database".
//  docsHttp       : depois da senha do painel. Página /docs e /api/docs/{listar,enviar,baixar,ler,excluir}.
//  docsAgenteHttp : ANTES da senha. Só /api/docs/agente/<token>/{enviar,baixar,fim}: o agente do PC usa o token de uso único
//                   que o servidor mandou dentro de um comando assinado (ver trabalhos.js). Token inválido = 404.
// Cada função devolve false se a rota não for daqui; o servidor segue como sempre.
import { paginaDocs } from "./paginas.js";
import { timingSafeEqual } from "node:crypto";
import { EXTENSOES, enviarDocumento, listarDocumentos, baixarDocumento, lerDocumento, excluirDocumento, extDe } from "./documentos.js";
import { trabalho, concluir } from "./trabalhos.js";

const MAX = 40 * 1024 * 1024;
async function corpoBruto(req) {
  const partes = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > MAX) throw new Error(`Arquivo maior que ${MAX / 1048576} MB.`); partes.push(c); }
  return Buffer.concat(partes);
}
const nomeDe = (req) => new URL(req.url, "http://x").searchParams.get("nome") ?? "";
function enviarArquivo(res, nome, buf) {
  res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": buf.length, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}` });
  res.end(buf);
}

export async function docsHttp(req, res, caminho, { json, corpoJson }) {
  const resposta = (c, o) => { json(res, c, o); return true; };
  if (req.method === "GET" && caminho === "/docs") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(paginaDocs(EXTENSOES));
    return true;
  }
  if (!caminho.startsWith("/api/docs/") || caminho.startsWith("/api/docs/agente/")) return false;
  try {
    const q = new URL(req.url, "http://x").searchParams;
    if (req.method === "GET" && caminho === "/api/docs/listar") return resposta(200, await listarDocumentos(q.get("ext") || ""));
    if (req.method === "POST" && caminho === "/api/docs/enviar") return resposta(200, await enviarDocumento(nomeDe(req), await corpoBruto(req)));
    if (req.method === "GET" && caminho === "/api/docs/baixar") { enviarArquivo(res, nomeDe(req), await baixarDocumento(nomeDe(req))); return true; }
    if (req.method === "GET" && caminho === "/api/docs/ler") return resposta(200, await lerDocumento(nomeDe(req), 200000));
    if (req.method === "POST" && caminho === "/api/docs/excluir") return resposta(200, await excluirDocumento(String(((await corpoJson(req)) ?? {}).nome ?? "")));
  } catch (e) {
    return resposta(400, { erro: String(e.message || e) });
  }
  return false;
}

const igual = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export async function docsAgenteHttp(req, res, caminho, { json }) {
  // Menu "Upload Documentos" da bandeja: o agente se identifica com a MESMA chave que assina os comandos (AGENTE_CHAVE ou MCP_TOKEN)
  if (req.method === "POST" && caminho === "/api/docs/agente/enviar") {
    const chave = process.env.AGENTE_CHAVE || process.env.MCP_TOKEN || "";
    const bearer = (req.headers.authorization || "").match(/^bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
    if (!chave || !bearer || !igual(bearer, chave)) { json(res, 401, { erro: "chave do agente inválida" }); return true; }
    try { json(res, 200, await enviarDocumento(nomeDe(req), await corpoBruto(req))); }
    catch (e) { json(res, 400, { erro: String(e.message || e) }); }
    return true;
  }
  const m = caminho.match(/^\/api\/docs\/agente\/([0-9a-f]{48})\/(enviar|baixar|fim)$/);
  if (!m) return false;
  const [, token, acao] = m;
  const j = trabalho(token);
  if (!j || j.estado !== "pendente") { json(res, 404, { erro: "token inválido ou já usado" }); return true; }
  try {
    if (req.method === "POST" && acao === "enviar" && j.tipo === "enviar") {
      const r = await enviarDocumento(nomeDe(req), await corpoBruto(req));
      concluir(token, true, `Enviado ao banco: ${r.documento} (${r.imagens} imagem(ns) compactada(s) em WebP, ${r.tam_original} → ${r.tam_armazenado} bytes${r.substituido ? "; substituiu a versão anterior" : ""}).`);
      json(res, 200, r); return true;
    }
    if (req.method === "GET" && acao === "baixar" && j.tipo === "baixar") {
      enviarArquivo(res, j.nome, await baixarDocumento(j.nome)); return true; // o agente confirma em /fim depois de gravar
    }
    if (req.method === "POST" && acao === "fim") {
      const b = JSON.parse((await corpoBruto(req)).toString() || "{}");
      concluir(token, b.ok === true, String(b.texto ?? ""));
      json(res, 200, { ok: true }); return true;
    }
    json(res, 405, { erro: "operação inválida para este token" });
  } catch (e) {
    concluir(token, false, String(e.message || e));
    json(res, 400, { erro: String(e.message || e) });
  }
  return true;
}
