// Servidor web (Render ou local):
//   /          painel para escrever as palavras de cada pino      (senha: PAINEL_SENHA, usuário qualquer)
//   /mcp       MCP remoto para o Claude                           (Authorization: Bearer MCP_TOKEN)
//   /saude     resposta simples para o Render saber que está vivo
// Sem PAINEL_SENHA / MCP_TOKEN definidos, a rota correspondente fica DESLIGADA (503): nunca aberta por esquecimento.
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { criarServidorMcp } from "./ferramentas.js";
import { listarEsps, gravarPalavras } from "./firebase.js";
import { gpsHttp } from "../aplicacao_gps/http.js"; // módulo maps/GPS (pasta própria)
import { deskHttp } from "../aplicacao_desk_agente/agente/http.js"; // módulo agente/Desk (pasta própria)
import { snHttp, snPainelHttp } from "../aplicacao_consultar_sn/http.js"; // módulo Consultar Serial (pasta própria)
import { docsHttp, docsAgenteHttp } from "../aplicacao_docs_mysqlaiven/http.js"; // módulo Documentos Database (pasta própria)
import { clpHttp } from "../aplicacao_clp/servidor/http.js"; // módulo Conexao Socket-TCP/IP (pasta própria)

const NA_NUVEM = Boolean(process.env.PORT);
const PORTA = Number(process.env.PORT || process.env.PORTA || 3333);
const { MCP_TOKEN = "", PAINEL_SENHA = "" } = process.env;

const igual = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const PAGINA = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Automacao IOT Amaury</title>
<style>
  :root{color-scheme:dark;--fundo:#0f1115;--card:#171a21;--borda:#2a2f3a;--texto:#e6e8ee;--suave:#9aa3b2;--azul:#4c8dff;--verde:#3ddc84;--verm:#ff5c5c}
  body{font:15px system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;background:var(--fundo);color:var(--texto)}
  h1{font-size:20px} h2{font-size:16px;margin:24px 0 4px}
  .sub{color:var(--suave);font-size:13px;margin-bottom:8px}
  table{width:100%;border-collapse:collapse;background:var(--card);border-radius:8px;overflow:hidden}
  td,th{padding:8px 10px;border-bottom:1px solid var(--borda);text-align:left;vertical-align:middle}
  th{color:var(--suave);font-weight:600;font-size:13px}
  input{width:100%;box-sizing:border-box;padding:7px 9px;font:inherit;color:var(--texto);background:var(--fundo);border:1px solid var(--borda);border-radius:6px}
  input:focus{outline:none;border-color:var(--azul)} ::placeholder{color:#5d6675}
  button{padding:9px 18px;font:inherit;border:0;border-radius:6px;background:var(--azul);color:#fff;cursor:pointer}
  button:hover{filter:brightness(1.1)}
  .on{color:var(--verde);font-weight:600} .off{color:var(--suave)} .bolinha{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
  #msg{margin-left:12px;color:var(--verde)}
</style></head><body>
<h1>Automacao IOT Amaury</h1>
<p class="sub">Escreva, em cada pino, as palavras que você usa para falar dele, separadas por vírgula. Ex.: <b>luz frente, luz da varanda</b>. Pinos sem palavras só são acionados pelo número.</p>
<div id="lista">Carregando…</div>
<p><button onclick="salvar()">Salvar</button><span id="msg"></span></p>
<script>
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function carregar() {
  const dados = await (await fetch('/api/dados')).json();
  document.getElementById('lista').innerHTML = dados.map(e => {
    const saidas = e.pinos.filter(p => p.tipo === 'saida');
    return '<h2>' + esc(e.nome) + '</h2><div class="sub"><span class="bolinha" style="background:' + (e.online ? '#3ddc84' : '#ff5c5c') + '"></span>' +
      (e.online ? 'online' : 'offline') + ' · ' + esc(e.ip || 'sem IP') + ' · ' + esc(e.modelo || '') + '</div>' +
      '<table><tr><th>GPIO</th><th>Nome no ESP</th><th>Estado</th><th>Palavras</th></tr>' +
      saidas.map(p => '<tr><td>' + p.gpio + '</td><td>' + esc(p.nome) + '</td><td class="' + (p.estado ? 'on' : 'off') + '">' + (p.estado ? 'ligado' : 'desligado') +
        '</td><td><input data-esp="' + esc(e.nome) + '" data-gpio="' + p.gpio + '" value="' + esc((e.palavras[p.gpio] || []).join(', ')) + '" placeholder="ex.: luz frente"></td></tr>').join('') +
      '</table>';
  }).join('') || 'Nenhum ESP encontrado no Firebase.';
}
async function salvar() {
  const itens = [...document.querySelectorAll('input[data-esp]')].map(i => ({ esp: i.dataset.esp, gpio: i.dataset.gpio, texto: i.value }));
  const r = await fetch('/api/palavras', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(itens) });
  document.getElementById('msg').textContent = r.ok ? 'Salvo.' : 'Erro ao salvar.';
  setTimeout(() => document.getElementById('msg').textContent = '', 3000);
}
carregar();
</script></body></html>`;

const json = (res, codigo, obj) => {
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
};

async function corpoJson(req) {
  let s = "";
  for await (const c of req) { s += c; if (s.length > 1e6) throw new Error("corpo grande demais"); }
  return s ? JSON.parse(s) : undefined;
}

function painelAutorizado(req, res) {
  if (!PAINEL_SENHA) { json(res, 503, { erro: "PAINEL_SENHA não definida: painel desligado." }); return false; }
  const [tipo, cred] = (req.headers.authorization || "").split(" ");
  const senha = tipo === "Basic" ? Buffer.from(cred || "", "base64").toString().split(":").slice(1).join(":") : "";
  if (!igual(senha, PAINEL_SENHA)) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Automacao IOT Amaury"' });
    res.end("Senha necessária");
    return false;
  }
  return true;
}

http.createServer(async (req, res) => {
  try {
    const caminho = req.url.split("?")[0];

    if (caminho === "/saude") return json(res, 200, { ok: true });

    // Token por cabeçalho (Claude Code: --header) ou na URL /mcp/<token> (conector do claude.ai, que só aceita URL)
    if (caminho === "/mcp" || caminho.startsWith("/mcp/")) {
      if (!MCP_TOKEN) return json(res, 503, { erro: "MCP_TOKEN não definido: MCP remoto desligado." });
      const naUrl = caminho.slice(5);
      const bearer = (req.headers.authorization || "").match(/^bearer\s+(.+)$/i)?.[1]?.trim() ?? ""; // "Bearer"/"bearer": a palavra não diferencia maiúscula
      const ok = (bearer !== "" && igual(bearer, MCP_TOKEN)) || (naUrl !== "" && igual(naUrl, MCP_TOKEN));
      if (!ok) return json(res, 401, { erro: "token inválido" });
      if (req.method !== "POST") return json(res, 405, { erro: "use POST" });
      // sem estado: cada chamada cria seu servidor e transporte (funciona em qualquer instância)
      const mcp = criarServidorMcp();
      const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => { transporte.close(); mcp.close(); });
      await mcp.connect(transporte);
      return await transporte.handleRequest(req, res, await corpoJson(req));
    }

    if (await snHttp(req, res, caminho, { json })) return; // página da câmera do celular (token de uso único, antes da senha)
    if (await docsAgenteHttp(req, res, caminho, { json })) return; // agente do PC (token de uso único, antes da senha)
    if (!painelAutorizado(req, res)) return;
    if (await gpsHttp(req, res, caminho, { json, corpoJson })) return; // páginas /enderecos e /gps
    if (await deskHttp(req, res, caminho, { json, corpoJson })) return; // aba /desk
    if (await docsHttp(req, res, caminho, { json, corpoJson })) return; // aba /docs
    if (await snPainelHttp(req, res, caminho)) return; // aba /serial (Consulta Serial)
    if (await clpHttp(req, res, caminho, { json, corpoJson })) return; // aba /clp

    if (req.method === "GET" && caminho === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(PAGINA);
    }
    if (req.method === "GET" && caminho === "/api/dados") return json(res, 200, await listarEsps());
    if (req.method === "POST" && caminho === "/api/palavras") {
      const itens = await corpoJson(req);
      if (!Array.isArray(itens)) throw new Error("formato inválido");
      for (const { esp, gpio, texto } of itens) {
        if (!/^[\w-]+$/.test(esp) || !/^\d+$/.test(String(gpio))) throw new Error("esp/gpio inválido");
        await gravarPalavras(esp, gpio, texto);
      }
      return json(res, 200, { ok: true });
    }
    json(res, 404, { erro: "não encontrado" });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { erro: String(e.message || e) });
  }
}).listen(PORTA, NA_NUVEM ? "0.0.0.0" : "127.0.0.1", () => {
  console.log(`Ponte casa em http://localhost:${PORTA} | painel ${PAINEL_SENHA ? "ligado" : "DESLIGADO (sem PAINEL_SENHA)"} | mcp ${MCP_TOKEN ? "ligado" : "DESLIGADO (sem MCP_TOKEN)"}`);
});
