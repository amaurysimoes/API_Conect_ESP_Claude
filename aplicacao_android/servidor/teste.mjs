// Teste do lado do servidor, sem gastar nada e sem tocar no seu Firebase: Firebase falso + um "celular" simulado
// que fala o mesmo protocolo do app. Rodar (na pasta api_conect): node aplicacao_android/servidor/teste.mjs
// O que o APP faz dentro do celular (abrir apps de verdade) só se testa no aparelho; a conta da assinatura/cifra do app
// é testada no PC com: cd aplicacao_android; .\gradlew.bat testDebugUnitTest
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const banco = {};
const carimbo = (v) => Array.isArray(v) ? v.map(carimbo) : v && typeof v === "object" ? (v[".sv"] === "timestamp" ? Date.now() : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, carimbo(x)]))) : v;
const fake = http.createServer(async (req, res) => {
  const [rota, consulta = ""] = req.url.split("?");
  const p = rota.replace(/^\/|\.json$/g, "").split("/").filter(Boolean);
  let corpo = ""; for await (const c of req) corpo += c;
  let no = banco; for (const k of p.slice(0, -1)) no = no[k] ??= {};
  const ult = p[p.length - 1];
  if (req.method === "PUT") no[ult] = carimbo(JSON.parse(corpo));
  else if (req.method === "DELETE") delete no[ult];
  let saida = p.length ? (no[ult] ?? null) : banco;
  if (consulta.includes("shallow=true") && saida && typeof saida === "object") saida = Object.fromEntries(Object.keys(saida).map((k) => [k, true]));
  res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(saida));
});
await new Promise((r) => fake.listen(4595, "127.0.0.1", r));
const CHAVE = "chave-de-teste";
Object.assign(process.env, { FIREBASE_URL: "http://127.0.0.1:4595", MCP_TOKEN: CHAVE, PAINEL_SENHA: "s" });

const { listarAndroid, lerApps, enviarComando, escolher } = await import("./android.js");
const { assinar } = await import("../../aplicacao_desk_agente/agente/maquinas.js");
const { cifrar } = await import("./criptoApps.js");
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// --- "celular" simulado: publica status e apps, obedece comandos assinados (como o AgenteService.kt) ---
const base = "brokers/TESTE/android/PIXEL_TESTE";
const APPS = [
  { n: "WhatsApp", p: "com.whatsapp", s: false, b: false, v: "2.24" },
  { n: "Chrome", p: "com.android.chrome", s: false, b: true, v: "120" },
  { n: "Firefox", p: "org.mozilla.firefox", s: false, b: true, v: "121" },
  { n: "Câmera", p: "com.sec.camera", s: true, b: false, v: "1" },
];
const celular = () => banco.brokers.TESTE.android.PIXEL_TESTE;
banco.brokers = { TESTE: { android: { PIXEL_TESTE: {
  status: { online: true, tipo: "android", visto_em: Date.now(), acoes: ["info", "listar_apps", "abrir_app", "abrir_url", "voltar_inicio"],
    resumo: { modelo: "Google Pixel", android: "14 (API 34)", bateria: 80, carregando: false, tela: true, rede: "WIFI", livre_gb: 20.5 } },
  apps: { v: 1, dados: cifrar(JSON.stringify({ em: Date.now(), apps: APPS }), CHAVE) },
} } } };
let vivo = true;
const batimento = setInterval(() => { celular().status.visto_em = Date.now(); }, 1000);
const obedece = (async () => {
  while (vivo) {
    for (const [id, c] of Object.entries(celular().comandos ?? {})) {
      delete celular().comandos[id];
      if (c.assinatura !== assinar(CHAVE, id, c.acao, c.parametros, c.ts)) continue;   // não responde a quem não tem a chave
      const nome = c.parametros.app && APPS.find((a) => a.n.toLowerCase().includes(String(c.parametros.app).toLowerCase()));
      celular().resultado ??= {};
      celular().resultado[id] = c.acao === "abrir_app" ? (nome ? { ok: true, texto: `aberto: ${nome.n}` } : { ok: false, texto: "nenhum app parecido" })
        : c.acao === "abrir_url" ? { ok: true, texto: `aberto no ${c.parametros.navegador || "navegador padrão"}: ${c.parametros.url}` }
          : { ok: true, texto: c.acao };
    }
    await espera(200);
  }
})();

const servidor = spawn("node", ["src/servidor.js"], { env: { ...process.env, PORTA: "4594" }, stdio: "ignore" });
try {
  const lista = await listarAndroid();
  assert.equal(lista.length, 1); assert.ok(lista[0].online && lista[0].resumo.bateria === 80 && lista[0].acoes.includes("abrir_app"));
  console.log("OK listar: celular ativo com resumo e ações");

  const { apps } = await lerApps(lista[0]);
  assert.equal(apps.length, 4); assert.ok(apps.some((a) => a.n === "Câmera" && a.s));
  console.log("OK lista de apps decifrada (veio cifrada pelo banco aberto)");
  assert.ok(!JSON.stringify(banco).includes("WhatsApp"), "nome de app não pode estar em texto puro no Firebase");

  assert.equal((await escolher()).dispositivo, "PIXEL_TESTE");
  const r = await enviarComando(lista[0], "abrir_app", { app: "whats" });
  assert.ok(r.ok && r.texto === "aberto: WhatsApp", r.texto);
  console.log("OK comando assinado: ", r.texto);

  // pelo servidor HTTP/MCP (o que o Claude usa)
  for (let i = 0; i < 20; i++) { try { await fetch("http://127.0.0.1:4594/saude"); break; } catch { await espera(300); } }
  const mcp = (corpo) => fetch("http://127.0.0.1:4594/mcp/" + CHAVE, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify(corpo) }).then((x) => x.text());
  const tools = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  for (const t of ["listar_android", "apps_android", "executar_no_android", "listar_maquinas", "acionar", "melhor_rota"]) assert.ok(tools.includes(`"${t}"`), t);
  const chama = (nome, args) => mcp({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: nome, arguments: args } });
  const apps1 = await chama("apps_android", { busca: "fire" });
  assert.ok(apps1.includes("Firefox (org.mozilla.firefox)") && apps1.includes("[navegador]") && !apps1.includes("WhatsApp"));
  const navs = await chama("apps_android", { tipo: "navegadores" });
  assert.ok(navs.includes("Chrome") && navs.includes("Firefox") && !navs.includes("Câmera"));
  const url = await chama("executar_no_android", { acao: "abrir_url", url: "www.exemplo.com", navegador: "firefox" });
  assert.ok(url.includes("aberto no firefox: www.exemplo.com"), url);
  assert.ok((await chama("listar_android", {})).includes("PIXEL_TESTE: ATIVO"));
  console.log("OK Claude (MCP): listar, apps (busca e navegadores), abrir url no navegador escolhido");

  // celular sem sinal: o servidor avisa e não manda nada
  clearInterval(batimento); celular().status.visto_em = Date.now() - 5 * 60_000;
  const off = await chama("executar_no_android", { acao: "info", celular: "PIXEL_TESTE" });
  assert.ok(off.includes("offline"), off);
  console.log("OK celular sem sinal: avisa offline");
} finally {
  vivo = false; clearInterval(batimento);
  spawnSync("taskkill", ["/pid", String(servidor.pid), "/T", "/F"], { stdio: "ignore" });
  fake.close();
}
await obedece;
process.exit(0);
