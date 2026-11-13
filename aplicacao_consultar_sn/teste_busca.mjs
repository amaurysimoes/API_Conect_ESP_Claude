// Teste de ponta a ponta da 2ª parte da Consulta Serial (busca do serial no back-end da rede local), sem tocar em nada real:
// Firebase falso + back-end falso (GET /busca?sn=) + o agente Python de verdade + o servidor de verdade.
// Rodar (na pasta api_conect, com o .venv do agente_python criado):  node aplicacao_consultar_sn/teste_busca.mjs
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const P = { fb: 4611, srv: 4612, back: 4613 };
const banco = {};
const carimbo = (v) => Array.isArray(v) ? v.map(carimbo) : v && typeof v === "object" ? (v[".sv"] === "timestamp" ? Date.now() : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, carimbo(x)]))) : v;
const fake = http.createServer(async (req, res) => {
  const [rota, consulta = ""] = req.url.split("?");
  const p = rota.replace(/^\/|\.json$/g, "").split("/").filter(Boolean);
  let corpo = ""; for await (const c of req) corpo += c;
  let no = banco; for (const k of p.slice(0, -1)) no = no[k] ??= {};
  const ult = p[p.length - 1];
  if (req.method === "PUT") no[ult] = carimbo(JSON.parse(corpo));
  else if (req.method === "PATCH") Object.assign(no[ult] ??= {}, carimbo(JSON.parse(corpo)));
  else if (req.method === "DELETE") delete no[ult];
  let saida = p.length ? (no[ult] ?? null) : banco;
  if (consulta.includes("shallow=true") && saida && typeof saida === "object") saida = Object.fromEntries(Object.keys(saida).map((k) => [k, true]));
  res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(saida));
});
await new Promise((r) => fake.listen(P.fb, "127.0.0.1", r));

// back-end falso: mesmo formato do GET /busca?sn= do back real
const pedidosBack = [];
const back = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  pedidosBack.push(`${req.method} ${u.pathname}`);
  const sn = u.searchParams.get("sn");
  res.setHeader("Content-Type", "application/json");
  if (u.pathname !== "/busca" || req.method !== "GET" || !sn) { res.statusCode = 400; return res.end("{}"); }
  if (sn === "NAOEXISTE") return res.end(JSON.stringify({ status: "AVISO", message: "Nenhum registro encontrado.", results: [] }));
  res.end(JSON.stringify({
    searched_serial: sn, padrao_identificado: "XCPXXXIXXXXXXXX", usou_memoria: true, aviso: "", total_tables_with_data: 1,
    results: [{ database: "SGE_MAO", table: "tb_producao", column: "serial", total_found: 45, records: Array.from({ length: 45 }, (_, i) => ({ id: i + 1, serial: sn, estagio: "TESTE FINAL", obs: "<b>x</b>" })) }],
  }));
});
await new Promise((r) => back.listen(P.back, "127.0.0.1", r));

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const py = join(process.cwd(), "aplicacao_desk_agente/agente_python/.venv/Scripts/python.exe");
const pasta = mkdtempSync(join(tmpdir(), "sn-"));
const matar = (proc) => proc && spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
const cfgAgente = join(pasta, "config.json");
writeFileSync(cfgAgente, JSON.stringify({ firebase: `http://127.0.0.1:${P.fb}`, broker: "TESTE", maquina: "PC_TESTE", chave: "chave-de-teste" }));
const env = { ...process.env, FIREBASE_URL: `http://127.0.0.1:${P.fb}`, AGENTE_CHAVE: "chave-de-teste", MCP_TOKEN: "tok", PAINEL_SENHA: "s", PORTA: String(P.srv), DOCS_URL_PUBLICA: `http://127.0.0.1:${P.srv}` };
const servidor = spawn("node", ["iot_automacao_esp/servidor.js"], { env, stdio: "ignore" });
const agente = spawn(py, ["main.py", "--config", cfgAgente, "--sem-bandeja"], { cwd: "aplicacao_desk_agente/agente_python", env: { ...process.env, AGENTE_MUTEX: "AgenteDeTesteSerial" }, stdio: "ignore" });

const U = `http://127.0.0.1:${P.srv}`;
const auth = { Authorization: "Basic " + Buffer.from("u:s").toString("base64") };
const req = (m, caminho, corpo, comSenha = true) => fetch(U + caminho, { method: m, headers: { ...(comSenha ? auth : {}), "Content-Type": "application/json" }, body: corpo && JSON.stringify(corpo) });
let idMcp = 0;
const ferramenta = async (args) => {
  const t = await fetch(`${U}/mcp/tok`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++idMcp, method: "tools/call", params: { name: "consultar_serial", arguments: args } }) }).then((r) => r.text());
  return JSON.parse(t.split("\n").find((l) => l.startsWith("data:"))?.slice(5) ?? t).result.content[0].text;
};
const historico = async (token, ms = 30000) => { const fim = Date.now() + ms; let e; do { await espera(400); e = await (await req("GET", `/api/serial/${token}/historico`, undefined, false)).json(); } while (e.estado === "buscando" && Date.now() < fim); return e; };
let ok = 0;
const confere = (c, msg) => { assert.ok(c, msg); ok++; console.log("  ✓", msg); };

try {
  for (let i = 0; i < 40; i++) { try { await fetch(U + "/saude"); break; } catch { await espera(300); } }
  let c;
  for (let i = 0; i < 60; i++) { c = await (await req("GET", "/api/serial/config")).json(); if (c.maquinas?.some((m) => m.maquina === "PC_TESTE" && m.online && m.pronta)) break; await espera(500); }
  confere(c.maquinas?.some((m) => m.maquina === "PC_TESTE" && m.pronta), "agente real online e anunciando a ação serial_buscar");
  confere(c.config === null, "sem IP/porta salvos no começo");

  console.log("Configuração (IP e porta)");
  confere((await req("GET", "/api/serial/config", undefined, false)).status === 401, "config exige a senha do painel");
  let r = await req("POST", "/api/serial/config", { ip: "8.8.8.8", porta: 4012 });
  confere(r.status === 400 && (await r.json()).erro.includes("rede local"), "IP da internet é recusado");
  r = await req("POST", "/api/serial/config", { ip: "10.0.0.5", porta: 70000 });
  confere(r.status === 400, "porta inválida é recusada");

  const aba = await (await req("GET", "/serial")).text();
  const token = aba.match(/data-token="([0-9a-f]{48})"/)[1];
  confere(aba.includes('id="cfg-ip"') && aba.includes('id="cfg-porta"') && aba.includes('id="manual-sn"') && aba.includes('id="hist"') && aba.includes("/serial/busca.js") && aba.includes('id="v"'), "aba: caixas IP/porta, serial digitado, histórico e a câmera continuam lá");
  r = await req("GET", "/serial/busca.js", undefined, false);
  confere(r.status === 200 && (await r.text()).includes("buscarSerial"), "código da busca servido (/serial/busca.js)");
  r = await req("POST", `/api/serial/${token}/buscar`, { sn: "ABC" }, false);
  confere(r.status === 400 && (await r.json()).erro.includes("IP e a porta"), "buscar sem IP/porta salvos: avisa para preencher na aba");

  r = await req("POST", "/api/serial/config", { ip: "127.0.0.1", porta: P.back, maquina: "" });
  confere(r.status === 200, "IP e porta salvos");
  const salvo = banco.brokers.TESTE.serial_config;
  confere(typeof salvo === "string" && !salvo.includes("127.0.0.1"), "no Firebase ficam cifrados");
  confere((await (await req("GET", "/api/serial/config")).json()).config.porta === P.back, "config lida de volta");

  console.log("Busca pela página (agente do PC como ponte)");
  r = await req("POST", `/api/serial/${token}/buscar`, { sn: "1CP234I56789012" }, false);
  const ini = await r.json();
  confere(r.status === 200 && ini.ip === "127.0.0.1" && ini.porta === P.back, "buscar devolve IP/porta para a tentativa direta do navegador");
  let e = await historico(token);
  confere(e.estado === "ok" && e.via === "agente PC_TESTE", `histórico chegou pelo agente (${e.segundos} s)`);
  confere(e.dados.results[0].table === "tb_producao" && e.dados.results[0].total_found === 45 && e.dados.results[0].records.length === 20 && e.dados.usou_memoria === true, "dados do back: tabela, total 45, 20 linhas guardadas, Cache Rápido");

  r = await req("POST", `/api/serial/${token}/buscar`, { sn: "NAOEXISTE" }, false);
  e = await historico(token);
  confere(e.estado === "ok" && e.dados.results.length === 0 && e.dados.message.includes("Nenhum registro"), "serial sem registro: mensagem do back");

  console.log("Ferramenta consultar_serial");
  let t = await ferramenta({ serial: "1CP234I56789012" });
  confere(t.includes("Serial: 1CP234I56789012") && t.includes("SGE_MAO.tb_producao") && t.includes("45 registro") && t.includes("Cache Rápido"), "serial ditado: a IA recebe o histórico");
  const passo1 = await ferramenta({});
  const tk = passo1.match(/\/serial\/([0-9a-f]{48})/)[1];
  await req("POST", `/api/serial/${tk}/resultado`, { texto: "1CP999I00000001", formato: "Code 128" }, false);   // o celular leu (verde)…
  await req("POST", `/api/serial/${tk}/buscar`, { sn: "1CP999I00000001" }, false);                                   // …e a página já pediu a busca
  t = await ferramenta({ token: tk, esperar_segundos: 5 });
  confere(t.includes("Código lido: 1CP999I00000001") && t.includes("Padrão: Code 128") && t.includes("Histórico no back-end (via agente PC_TESTE)") && t.includes("tb_producao"), "câmera: 'Código lido' + histórico na mesma resposta");

  console.log("Caminho direto do navegador e falhas");
  await req("POST", "/api/serial/config", { ip: "127.0.0.1", porta: 4999 });
  r = await req("POST", `/api/serial/${token}/buscar`, { sn: "SEMBACK" }, false);
  e = await historico(token);
  confere(e.estado === "erro" && e.erro.includes("não alcancei o back"), "back fora do ar: erro claro (" + e.erro.slice(0, 60) + "…)");
  r = await req("POST", `/api/serial/${token}/historico`, { sn: "SEMBACK", dados: { searched_serial: "SEMBACK", padrao_identificado: "TEXTO_PURO", usou_memoria: false, total_tables_with_data: 1, results: [{ database: "d", table: "t", column: "c", total_found: 1, records: [{ a: 1 }] }] } }, false);
  e = await (await req("GET", `/api/serial/${token}/historico`, undefined, false)).json();
  confere(r.status === 200 && e.estado === "ok" && e.via === "direto do navegador", "navegador que alcança o back direto entrega o resultado");
  r = await req("POST", `/api/serial/agente/${"0".repeat(48)}/historico`, { ok: true, dados: {} }, false);
  confere(r.status === 400, "token de agente inventado é recusado");
  await req("POST", "/api/serial/config", { ip: "127.0.0.1", porta: P.back, maquina: "OUTRA" });
  await req("POST", `/api/serial/${token}/buscar`, { sn: "X1" }, false);
  e = await historico(token);
  confere(e.estado === "erro" && e.erro.includes("OUTRA"), "máquina escolhida fora do ar: erro claro");

  confere(pedidosBack.length > 0 && pedidosBack.every((p) => p === "GET /busca"), `o back só recebeu GET /busca (${pedidosBack.length} chamadas; nada de gravação)`);
  console.log(`\n${ok} verificações passaram.`);
} finally {
  matar(agente); matar(servidor); fake.close(); back.close();
}
process.exit(0);
