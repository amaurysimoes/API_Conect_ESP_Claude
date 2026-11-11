// Teste sem gastar nada: Firebase falso (local) + Google simulado. Rodar: node aplicacao_gps/teste.mjs
import http from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

// --- Firebase falso em memória ---
const banco = { esps: { FIRE_AHS01: { ip: "10.0.0.1", modelo: "CH340", visto_em: Date.now(), pinos: { "5": { nome: "Pino 5", tipo: "saida", estado: false } } } } };
const caminhoDe = (u) => u.split("?")[0].replace(/^\/|\.json$/g, "").split("/").filter(Boolean);
const fake = http.createServer(async (req, res) => {
  const p = caminhoDe(req.url); let corpo = ""; for await (const c of req) corpo += c;
  let no = banco; for (const k of p.slice(0, -1)) no = no[k] ??= {};
  const ult = p[p.length - 1];
  if (req.method === "PUT") no[ult] = JSON.parse(corpo);
  else if (req.method === "PATCH") Object.assign(no[ult] ??= {}, JSON.parse(corpo));
  else if (req.method === "DELETE") delete no[ult];
  res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(p.length ? (no[ult] ?? null) : banco));
});
await new Promise((r) => fake.listen(4599, "127.0.0.1", r));
Object.assign(process.env, { FIREBASE_URL: "http://127.0.0.1:4599", MCP_TOKEN: "tok", PAINEL_SENHA: "s", GOOGLE_MAPS_KEY: "x", CIDADE_PADRAO: "Rio Claro - SP" });

// --- servidor real como processo filho ---
const filho = spawn("node", ["iot_automacao_esp/servidor.js"], { env: { ...process.env, PORTA: "4598" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const B = "http://127.0.0.1:4598", auth = { Authorization: "Basic " + Buffer.from("u:s").toString("base64") };
const j = (m, p, b) => fetch(B + p, { method: m, headers: { ...auth, "Content-Type": "application/json" }, body: b && JSON.stringify(b) });
try {
  for (const p of ["/", "/enderecos", "/gps"]) assert.equal((await j("GET", p)).status, 200, p);
  assert.equal((await fetch(B + "/enderecos")).status, 401, "sem senha");
  // o que já existia continua igual
  const home = await (await j("GET", "/")).text();
  assert.match(home, /Escreva, em cada pino/, "página de pinos original intacta");
  assert.ok(home.includes("<nav>") && home.includes(">IOT-Automacao<") && home.includes('href="/gps"'), "menu somado na página original");
  assert.equal((await (await j("GET", "/api/dados")).json()).map((e) => e.nome).join(), "FIRE_AHS01", "lista de ESPs original");
  const r = await (await j("POST", "/api/lugares", { nome: "Casa Teste", endereco: "Rua Exemplo 100", cep: "00000-000" })).json();
  assert.ok(r.id);
  assert.ok(!JSON.stringify(banco).includes("Exemplo"), "endereço NÃO pode estar em texto puro no Firebase");
  assert.ok(Object.keys(banco.esps.FIRE_AHS01.lugares_cifrados).length === 1, "guardado dentro do nó do ESP");
  assert.equal((await (await j("GET", "/api/dados")).json()).length, 1, "nenhum ESP fantasma na lista");
  const lista = await (await j("GET", "/api/lugares")).json();
  assert.equal(lista[0].endereco, "Rua Exemplo 100");
  assert.equal((await j("POST", "/api/posicao", { lat: "x", lng: 1 })).status, 400);
  assert.equal((await j("POST", "/api/posicao", { lat: -22.4, lng: -47.56, precisao: 12 })).status, 200);
  const mcp = await (await fetch(B + "/mcp/tok", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "listar_lugares", arguments: {} } }) })).text();
  assert.ok(mcp.includes("Casa Teste") && mcp.includes("acabou de acordar"), "MCP lista o lugar e avisa que acordou");
  const tools = await (await fetch(B + "/mcp/tok", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) })).text();
  assert.ok(tools.includes("Aguarde 10 segundos até o render responder") && tools.includes('"orientar"'), "descrição com aviso do Render e ferramenta orientar");
  const chama = async (nome, args) => (await (await fetch(B + "/mcp/tok", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: nome, arguments: args } }) })).text());
  assert.ok((await chama("acionar", { acao: "ligar", esp: "FIRE_AHS01", pino: 5 })).includes("gravado"), "acionar antigo responde");
  assert.equal(banco.esps.FIRE_AHS01.pinos["5"].estado, true, "acionar antigo gravou estado true no pino 5");
  assert.ok((await chama("listar_dispositivos", {})).includes("FIRE_AHS01"), "listar_dispositivos antigo responde");
  assert.equal((await j("DELETE", "/api/lugares/" + r.id)).status, 200);
  assert.equal(Object.keys(banco.esps.FIRE_AHS01.lugares_cifrados ?? {}).length, 0, "excluir apaga");
  console.log("OK servidor: páginas, senha, endereços cifrados, GPS, MCP");
} finally { filho.kill(); }

// --- rotas (Google simulado) ---
const enc = (pts) => { let la = 0, ln = 0, o = ""; const e = (v) => { v = v < 0 ? ~(v << 1) : v << 1; while (v >= 32) { o += String.fromCharCode((32 | (v & 31)) + 63); v >>= 5; } o += String.fromCharCode(v + 63); };
  for (const [a, b] of pts) { const A = Math.round(a * 1e5), L = Math.round(b * 1e5); e(A - la); e(L - ln); la = A; ln = L; } return o; };
const pts = [[-22.40, -47.56], [-22.41, -47.56], [-22.42, -47.56], [-22.43, -47.56]];
let enviado;
const fetchReal = globalThis.fetch;
globalThis.fetch = async (u, o) => String(u).includes("routes.googleapis.com")
  ? ((enviado = JSON.parse(o.body)), { ok: true, json: async () => ({ routes: [
      { description: "Av. Brasil", duration: "1500s", staticDuration: "900s", distanceMeters: 3300, polyline: { encodedPolyline: enc(pts) },
        travelAdvisory: { speedReadingIntervals: [{ endPolylinePointIndex: 1, speed: "NORMAL" }, { startPolylinePointIndex: 1, endPolylinePointIndex: 2, speed: "TRAFFIC_JAM" }, { startPolylinePointIndex: 2, endPolylinePointIndex: 3, speed: "SLOW" }] },
        legs: [{ steps: [{ distanceMeters: 1100, navigationInstruction: { instructions: "Siga na Rua A" } }, { distanceMeters: 1100, navigationInstruction: { instructions: "Vire à direita na Av. Brasil" } }, { distanceMeters: 1100, navigationInstruction: { instructions: "Vire à esquerda na Rua C" } }] }] },
      { description: "Rua Z", duration: "1700s", staticDuration: "1600s", distanceMeters: 4000 }] }) })
  : fetchReal(u, o);
const { gravarPosicao } = await import("./posicao.js");
const { salvarLugar } = await import("./lugaresStore.js");
const { melhorRota, orientar } = await import("./rotas.js");
await salvarLugar({ nome: "Casa Teste", endereco: "Rua Exemplo 100", cep: "00000-000" });
await assert.rejects(melhorRota({ destino: "casa teste" }), /GPS/, "sem GPS nem origem padrão: pede o GPS");
gravarPosicao({ lat: -22.4, lng: -47.56, precisao: 10 });
const txt = await orientar({ destino: "a casa teste" });
assert.ok(enviado.origin.location, "origem = GPS");
assert.ok(enviado.destination.address.includes("00000-000"), "destino = lugar salvo com CEP");
assert.match(txt, /2\. Vire à direita na Av\. Brasil.*PARADO/, "passo 2 parado");
assert.match(txt, /3\. Vire à esquerda na Rua C.*lento/, "passo 3 lento");
assert.match(txt, /1\. Siga na Rua A \(\d+ m\)\n|1\. Siga na Rua A \([\d.]+ km\)\n/, "passo 1 sem aviso");
const cmp = await melhorRota({ destino: "Amazonas Shopping" });
assert.ok(enviado.destination.address === "Amazonas Shopping, Rio Claro - SP", "destino livre recebe a cidade padrão");
assert.match(cmp, /★ MELHOR: via Av\. Brasil/);
console.log("OK rotas: GPS como origem, CEP, trânsito por passo, comparação");
console.log("\n" + txt);
fake.close(); process.exit(0);
