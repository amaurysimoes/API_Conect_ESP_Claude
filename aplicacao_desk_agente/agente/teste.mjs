// Teste de ponta a ponta SEM gastar nada e sem tocar no seu Firebase:
// Firebase falso (local) + o agente Python de verdade + o servidor assinando comandos.
// Rodar (na pasta api_conect, com o .venv do agente_python criado): node aplicacao_desk_agente/agente/teste.mjs
// Abre e fecha uma janela de console (ping) durante o teste.
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

// --- Firebase falso em memória (aceita PUT/PATCH/DELETE/GET, ?shallow=true e {".sv":"timestamp"}) ---
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
await new Promise((r) => fake.listen(4597, "127.0.0.1", r));
Object.assign(process.env, { FIREBASE_URL: "http://127.0.0.1:4597", AGENTE_CHAVE: "chave-de-teste", MCP_TOKEN: "tok", PAINEL_SENHA: "s" });

const { listarMaquinas, enviarComando, assinar } = await import("./maquinas.js");
const { executarNaMaquina } = await import("./executar.js");
const { resolverPrograma, PROGRAMAS } = await import("./catalogo.js");
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// --- catálogo ---
assert.equal(PROGRAMAS.length, 20, "20 programas");
assert.equal(resolverPrograma("abre o excel pra mim").alvo, "excel");
assert.equal(resolverPrograma("Word").alvo, "winword");
assert.equal(resolverPrograma("bloco de notas").alvo, "notepad");
assert.equal(resolverPrograma("C:\\Apps\\meu.exe").alvo, "C:\\Apps\\meu.exe");
assert.equal(resolverPrograma("notepad++").alvo, "notepad++");
console.log("OK catálogo: 20 programas e nomes livres");

// --- agente Python de verdade ---
const pasta = mkdtempSync(join(tmpdir(), "agente-"));
const cfg = join(pasta, "config.json");
writeFileSync(cfg, JSON.stringify({ firebase: "http://127.0.0.1:4597", broker: "TESTE", maquina: "PC_TESTE", chave: "chave-de-teste" }));
const agente = spawn(join(process.cwd(), "aplicacao_desk_agente/agente_python/.venv/Scripts/python.exe"), ["main.py", "--config", cfg, "--sem-bandeja"], { cwd: "aplicacao_desk_agente/agente_python", env: { ...process.env, AGENTE_MUTEX: "AgenteDeTeste" }, stdio: "ignore" });
const servidor = spawn("node", ["src/servidor.js"], { env: { ...process.env, PORTA: "4596" }, stdio: "ignore" });
try {
  let m;
  for (let i = 0; i < 20 && !m?.online; i++) { await espera(500); m = (await listarMaquinas()).find((x) => x.maquina === "PC_TESTE"); }
  assert.ok(m?.online, "agente apareceu online");
  assert.equal(typeof m.resumo.cpu, "number", "resumo com CPU");
  assert.ok(Array.isArray(m.acoes) && m.acoes.includes("desligar") && m.acoes.includes("abrir_programa"), "agente informa as ações que suporta");
  console.log(`OK agente online: ${m.maquina} · CPU ${m.resumo.cpu}% · memória ${m.resumo.memoria}%`);

  const info = await executarNaMaquina({ acao: "info" });
  assert.ok(info.ok && info.texto.includes("CPU"), "info");
  console.log("OK info:", info.texto);

  // comandos sem assinatura / com assinatura errada: o agente descarta e NÃO responde
  const base = "brokers/TESTE/maquinas/PC_TESTE";
  banco.brokers.TESTE.maquinas.PC_TESTE.comandos = {
    semAssinatura: { acao: "info", parametros: {}, ts: Date.now() },
    assinaturaErrada: { acao: "info", parametros: {}, ts: Date.now(), assinatura: "00".repeat(32) },
  };
  await espera(3500);
  const resto = banco.brokers.TESTE.maquinas.PC_TESTE;
  assert.deepEqual(Object.keys(resto.comandos ?? {}), [], "comandos inválidos removidos");
  assert.ok(!resto.resultado?.semAssinatura && !resto.resultado?.assinaturaErrada, "inválidos não respondidos");
  console.log("OK segurança: comando sem assinatura e com assinatura errada foram descartados");

  // comando velho (fora da validade), mesmo assinado
  const velho = Date.now() - 5 * 60_000;
  banco.brokers.TESTE.maquinas.PC_TESTE.comandos = { velho1: { acao: "info", parametros: {}, ts: velho, assinatura: assinar("chave-de-teste", "velho1", "info", {}, velho) } };
  await espera(3500);
  assert.match(String(banco.brokers.TESTE.maquinas.PC_TESTE.resultado?.velho1?.texto), /validade/, "comando velho recusado");
  console.log("OK segurança: comando assinado porém velho foi recusado");

  // desligar sem confirmação: o agente recusa (nada é desligado)
  const semConf = await enviarComando({ broker: "TESTE", maquina: "PC_TESTE" }, "desligar", {});
  assert.ok(!semConf.ok && semConf.texto.includes("confirmação"), "desligar sem confirmação");
  await assert.rejects(executarNaMaquina({ acao: "reiniciar" }), /confirmação/, "servidor também exige confirmação");
  console.log("OK desligar/reiniciar exigem confirmação");

  // abrir e fechar de verdade
  // "ping -t" é um programa clássico e previsível (o Bloco de Notas do Windows 11 às vezes se fecha sozinho)
  const abre = await executarNaMaquina({ acao: "abrir_programa", programa: "ping", argumentos: "-t 127.0.0.1" });
  assert.ok(abre.ok, abre.texto);
  console.log("OK abriu:", abre.texto);
  await espera(2000);
  const fecha = await executarNaMaquina({ acao: "fechar_programa", programa: "ping" });
  assert.ok(fecha.ok, fecha.texto);
  console.log("OK fechou:", fecha.texto);
  const naoExiste = await executarNaMaquina({ acao: "abrir_programa", programa: "programa_que_nao_existe_xyz" });
  assert.ok(!naoExiste.ok, "programa inexistente dá erro claro");
  console.log("OK erro claro:", naoExiste.texto);

  // servidor: aba, menu e ferramentas do Claude
  const auth = { Authorization: "Basic " + Buffer.from("u:s").toString("base64") };
  for (let i = 0; i < 20; i++) { try { await fetch("http://127.0.0.1:4596/saude"); break; } catch { await espera(300); } }
  const desk = await (await fetch("http://127.0.0.1:4596/desk", { headers: auth })).text();
  assert.ok(desk.includes("Desk-Automacao_Firebase") && desk.includes("/api/desk/") && desk.includes("'catalogo'"));
  const cat = await (await fetch("http://127.0.0.1:4596/api/desk/catalogo", { headers: auth })).json();
  assert.equal(cat.length, 20);
  const acoesCards = await (await fetch("http://127.0.0.1:4596/api/desk/acoes", { headers: auth })).json();
  assert.ok(["info", "bloquear_tela", "desligar", "reiniciar", "cancelar_desligamento", "abrir_url", "abrir_pasta", "abrir_arquivo", "abrir_programa", "fechar_programa"].every((id) => acoesCards.some((a) => a.id === id)), "cards de todas as ações");
  assert.ok(acoesCards.filter((a) => a.perigosa).map((a) => a.id).sort().join() === "desligar,reiniciar", "desligar/reiniciar marcados como perigosos");
  assert.ok(desk.includes("'acoes'") && desk.includes("confirm(") && desk.includes("suporta"), "página usa os cards, pede confirmação e respeita o que o agente suporta");
  const home = await (await fetch("http://127.0.0.1:4596/", { headers: auth })).text();
  assert.ok(home.indexOf("IOT-Automacao") < home.indexOf("Desk-Automacao_Firebase"), "aba logo depois de IOT-Automacao");
  assert.match(home, /Escreva, em cada pino/, "página de pinos original intacta");
  const mcp = (corpo) => fetch("http://127.0.0.1:4596/mcp/tok", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify(corpo) }).then((r) => r.text());
  const tools = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  for (const t of ["listar_maquinas", "executar_na_maquina", "acionar", "melhor_rota"]) assert.ok(tools.includes(`"${t}"`), t);
  const lista = await mcp({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "listar_maquinas", arguments: {} } });
  assert.ok(lista.includes("PC_TESTE") && lista.includes("ATIVA"));
  console.log("OK servidor: aba /desk, 20 programas, menu, ferramentas do Claude e as antigas");
  // ---- atalhos salvos (sites e programas do usuário) ----
  banco.brokers.OUTRO = { maquinas: { PC_OUTRO: { status: { online: false, visto_em: 1 } } } };   // 2º broker, máquina offline
  const http = (m, caminho, corpo) => fetch("http://127.0.0.1:4596" + caminho, { method: m, headers: { ...auth, "Content-Type": "application/json" }, body: corpo && JSON.stringify(corpo) });
  const salvar = async (d) => (await http("POST", "/api/desk/atalhos", { maquina: "PC_TESTE", ...d })).json();
  assert.ok((await salvar({ tipo: "site", nome: "Meu Site", alvo: "www.exemplo.com" })).ok);
  assert.ok((await salvar({ tipo: "programa", nome: "Ping Teste", alvo: "C:\\Windows\\System32\\PING.EXE", argumentos: "-t 127.0.0.1" })).ok);
  assert.ok((await salvar({ tipo: "programa", nome: "Sistema Estoque", alvo: "C:\\Projetos\\estoque_que_nao_existe.exe" })).ok);
  const refeito = await salvar({ tipo: "site", nome: "meu site", alvo: "www.exemplo.com.br" });
  assert.ok(refeito.atualizado, "mesmo nome e tipo atualiza, não duplica");
  assert.equal((await (await http("POST", "/api/desk/atalhos", { maquina: "PC_TESTE", tipo: "pasta", nome: "", alvo: "x" })).json()).erro, "Dê um nome ao atalho.");
  const salvos = await (await http("GET", "/api/desk/atalhos?maquina=PC_TESTE")).json();
  assert.equal(salvos.length, 3, "3 atalhos salvos");
  assert.equal(Object.keys(banco.brokers.OUTRO.atalhos ?? {}).length, 3, "a mesma cópia vai para todos os brokers");
  assert.equal((await (await http("GET", "/api/desk/atalhos")).json()).length, 3, "listar não depende de máquina");
  assert.ok(!JSON.stringify(banco).includes("estoque_que_nao_existe") && !JSON.stringify(banco).includes("exemplo.com"), "atalhos NÃO podem estar em texto puro no Firebase");
  console.log("OK atalhos salvos (cifrados), sem duplicar o mesmo nome");

  const ver = await (await http("POST", "/api/desk/atalhos/verificar", { maquina: "PC_TESTE" })).json();
  const idDe = (nome) => salvos.find((a) => a.nome === nome).id;
  assert.equal(ver[idDe("Ping Teste")], true); assert.equal(ver[idDe("Sistema Estoque")], false); assert.equal(ver[idDe("meu site")], null);
  console.log("OK verificar na máquina: existe / não existe ainda / site não se verifica");

  const abreAtalho = async (atalho) => (await http("POST", "/api/desk/executar", { maquina: "PC_TESTE", acao: "abrir_atalho", atalho })).json();
  const a1 = await abreAtalho("abre o ping teste");
  assert.ok(a1.ok && a1.texto.startsWith("Ping Teste:"), JSON.stringify(a1));
  await espera(1500);
  assert.ok((await executarNaMaquina({ acao: "fechar_programa", programa: "ping" })).ok);
  const a2 = await abreAtalho("sistema de estoque");
  assert.ok(!a2.ok && a2.texto.includes("ainda não existe nesta máquina"), JSON.stringify(a2));
  const a3 = await abreAtalho("coisa que nunca salvei");
  assert.ok(a3.erro && a3.erro.includes("Nenhum atalho combina") && a3.erro.includes("Ping Teste"), JSON.stringify(a3));
  console.log("OK abrir atalho pelo nome; programa que não existe: \"ainda não existe nesta máquina\"; não salvo: lista os salvos");

  const tools2 = await mcp({ jsonrpc: "2.0", id: 5, method: "tools/list" });
  assert.ok(tools2.includes('"listar_atalhos"') && tools2.includes('"abrir_atalho"'));
  const via = await mcp({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "listar_atalhos", arguments: { verificar: true } } });
  assert.ok(via.includes("Ping Teste") && via.includes("existe na máquina") && via.includes("NÃO existe ainda"), via);
  const viaAbrir = await mcp({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "abrir_atalho", arguments: { atalho: "estoque" } } });
  assert.ok(viaAbrir.includes("ainda não existe nesta máquina"), viaAbrir);
  console.log("OK Claude (MCP): listar_atalhos com verificação e abrir_atalho");

  assert.ok(desk.includes('data-a=\\"salvar\\"') || desk.includes("data-a=\"salvar\"") || desk.includes("data-a=\\'salvar\\'") || desk.includes("'salvar'") || desk.includes("data-a=\"salvar\""), "cards têm o botão Salvar");
  const apagado = await (await http("DELETE", "/api/desk/atalhos/" + idDe("Ping Teste") + "?maquina=PC_TESTE")).json();
  assert.ok(apagado.ok);
  assert.equal((await (await http("GET", "/api/desk/atalhos?maquina=PC_TESTE")).json()).length, 2);
  assert.equal(Object.keys(banco.brokers.OUTRO.atalhos ?? {}).length, 2, "apagar tira de todos os brokers");
  console.log("OK apagar atalho");
} finally {
  // no Windows o python do .venv é um lançador: mata a árvore inteira para não sobrar agente rodando
  for (const proc of [agente, servidor]) spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
  fake.close();
}
process.exit(0);
