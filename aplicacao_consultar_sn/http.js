// Rotas do módulo Consultar Serial. snHttp roda ANTES da senha do painel (o celular só tem o link com token de uso único):
//   GET  /serial/<token>               página da câmera (token inválido/expirado = página "link expirado")
//   GET  /serial/zxing.js, /serial/zxing_reader.wasm, /serial/cliente.js   código do navegador (públicos; não têm segredo)
//   POST /api/serial/<token>/resultado  { texto, formato }  grava a leitura
// Devolve false se a rota não for daqui; o servidor segue como sempre.
import fs from "node:fs";
import { paginaSerial, paginaExpirada } from "./pagina.js";
import { sessao, gravarLeitura, criarSessao } from "./sessao.js";

const ZXING = new URL("../node_modules/zxing-wasm/dist/iife/reader/index.js", import.meta.url);        // leitor (ZXing-C++ em WebAssembly)
const ZXING_WASM = new URL("../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", import.meta.url);
const CLIENTE = new URL("./cliente.js", import.meta.url);
const arquivos = new Map();
const js = (res, url, tipo = "text/javascript; charset=utf-8") => {
  if (!arquivos.has(url.href)) arquivos.set(url.href, fs.readFileSync(url));
  res.writeHead(200, { "Content-Type": tipo, "Cache-Control": "public, max-age=300" });
  res.end(arquivos.get(url.href));
  return true;
};

// Aba "Consulta Serial" do site (DEPOIS da senha do painel): abre a câmera na própria página; cada abertura cria uma sessão
export async function snPainelHttp(req, res, caminho) {
  if (req.method === "GET" && caminho === "/serial") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Permissions-Policy": "camera=(self)" });
    res.end(paginaSerial(criarSessao(), true));
    return true;
  }
  return false;
}

export async function snHttp(req, res, caminho, { json }) {
  // Descoberta de login OAuth (o Claude pergunta antes de cadastrar o conector). Este servidor NÃO usa OAuth (usa o token na URL):
  // o correto é 404. Sem isto cairia na senha do painel (401) e o Claude não consegue "determinar como o servidor faz login".
  if (caminho.startsWith("/.well-known/") || ["/register", "/authorize", "/token"].includes(caminho)) {
    console.log(`[conector] sondagem de login ${req.method} ${caminho} (${String(req.headers["user-agent"] ?? "").slice(0, 60)}) -> 404`);
    json(res, 404, { erro: "este servidor não usa OAuth: o token vai na URL (/mcp/<token>)" });
    return true;
  }
  if (req.method === "GET" && caminho === "/serial/zxing.js") return js(res, ZXING);
  if (req.method === "GET" && caminho === "/serial/zxing_reader.wasm") return js(res, ZXING_WASM, "application/wasm");
  if (req.method === "GET" && caminho === "/serial/cliente.js") return js(res, CLIENTE);

  let m = caminho.match(/^\/serial\/([0-9a-f]{48})$/);
  if (req.method === "GET" && m) {
    const ok = !!sessao(m[1]);
    res.writeHead(ok ? 200 : 410, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Permissions-Policy": "camera=(self)" });
    res.end(ok ? paginaSerial(m[1]) : paginaExpirada());
    return true;
  }
  m = caminho.match(/^\/api\/serial\/([0-9a-f]{48})\/resultado$/);
  if (req.method === "POST" && m) {
    try {
      let s = "";
      for await (const c of req) { s += c; if (s.length > 20000) throw new Error("corpo grande demais"); }
      const b = JSON.parse(s || "{}");
      json(res, 200, { ok: true, n: gravarLeitura(m[1], b.texto, b.formato) });
    } catch (e) { json(res, 400, { erro: String(e.message || e) }); }
    return true;
  }
  return false;
}
