// Rotas da busca do serial no back-end (2ª parte da Consulta Serial). Chamadas por http.js (1 linha em cada função).
// buscaHttp: ANTES da senha (quem chama tem o token da sessão ou o token de uso único do agente):
//   GET  /serial/busca.js                         código do navegador
//   POST /api/serial/<token>/buscar   { sn }      começa a busca (agente do PC) e devolve { ip, porta } para a tentativa direta
//   GET  /api/serial/<token>/historico            { estado: buscando|ok|erro|nenhuma, via, dados, erro }
//   POST /api/serial/<token>/historico { sn, dados }   o navegador chamou o back direto e manda o resultado (a IA também recebe)
//   POST /api/serial/agente/<token>/historico { ok, dados | erro }   resposta do agente
// buscaPainelHttp: DEPOIS da senha:  GET/POST /api/serial/config  (IP, porta, máquina; lista de máquinas)
import fs from "node:fs";
import { iniciarBusca, estadoBusca, respostaDoAgente, respostaDoNavegador, lerConfig, gravarConfig, maquinasPonte } from "./busca.js";

const json = (res, codigo, obj) => { res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); return true; };
async function corpo(req, max) {
  let s = "";
  for await (const c of req) { s += c; if (s.length > max) throw new Error("corpo grande demais"); }
  return JSON.parse(s || "{}");
}
const tentar = async (res, fn) => { try { return json(res, 200, await fn()); } catch (e) { return json(res, 400, { erro: String(e.message || e) }); } };
let cliente;

export async function buscaHttp(req, res, caminho) {
  if (req.method === "GET" && caminho === "/serial/busca.js") {
    cliente ??= fs.readFileSync(new URL("./busca_cliente.js", import.meta.url));
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" });
    res.end(cliente);
    return true;
  }
  let m = caminho.match(/^\/api\/serial\/agente\/([0-9a-f]{48})\/historico$/);
  if (req.method === "POST" && m) return tentar(res, async () => { respostaDoAgente(m[1], await corpo(req, 12e6)); return { ok: true }; });
  m = caminho.match(/^\/api\/serial\/([0-9a-f]{48})\/(buscar|historico)$/);
  if (!m) return false;
  if (req.method === "POST" && m[2] === "buscar") return tentar(res, async () => iniciarBusca(m[1], (await corpo(req, 5000)).sn));
  if (req.method === "GET" && m[2] === "historico") return json(res, 200, estadoBusca(m[1]));
  if (req.method === "POST" && m[2] === "historico") return tentar(res, async () => { const b = await corpo(req, 12e6); respostaDoNavegador(m[1], b.sn, b.dados); return { ok: true }; });
  return false;
}

export async function buscaPainelHttp(req, res, caminho) {
  if (caminho !== "/api/serial/config") return false;
  if (req.method === "GET") return tentar(res, async () => ({ config: await lerConfig(), maquinas: await maquinasPonte() }));
  if (req.method === "POST") return tentar(res, async () => ({ ok: true, config: await gravarConfig(await corpo(req, 5000)) }));
  return false;
}
