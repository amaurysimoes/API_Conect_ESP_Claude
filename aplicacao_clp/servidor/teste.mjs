// Teste de ponta a ponta SEM gastar nada e sem tocar no seu Firebase nem em CLP real:
// Firebase falso (local) + o agente Python de verdade + equipamento EtherNet/IP SIMULADO + o servidor.
// Rodar (na pasta api_conect, com o .venv do agente_python criado): node aplicacao_clp/servidor/teste.mjs
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  else if (req.method === "PATCH") Object.assign(no[ult] ??= {}, carimbo(JSON.parse(corpo)));
  else if (req.method === "DELETE") delete no[ult];
  let saida = p.length ? (no[ult] ?? null) : banco;
  if (consulta.includes("shallow=true") && saida && typeof saida === "object") saida = Object.fromEntries(Object.keys(saida).map((k) => [k, true]));
  res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(saida));
});
await new Promise((r) => fake.listen(4587, "127.0.0.1", r));
Object.assign(process.env, { FIREBASE_URL: "http://127.0.0.1:4587", AGENTE_CHAVE: "chave-de-teste", MCP_TOKEN: "tok", PAINEL_SENHA: "s" });

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const py = join(process.cwd(), "aplicacao_desk_agente/agente_python/.venv/Scripts/python.exe");
const pasta = mkdtempSync(join(tmpdir(), "clp-"));
const matar = (proc) => proc && spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
const iniciarAgente = (clp) => {
  const cfg = join(pasta, `config-${clp}.json`);
  writeFileSync(cfg, JSON.stringify({ firebase: "http://127.0.0.1:4587", broker: "TESTE", maquina: "PC_TESTE", chave: "chave-de-teste", clp_ativo: clp }));
  return spawn(py, ["main.py", "--config", cfg, "--sem-bandeja"], { cwd: "aplicacao_desk_agente/agente_python", env: { ...process.env, AGENTE_MUTEX: "AgenteDeTesteClp" }, stdio: "ignore" });
};
const adaptador = spawn(py, ["clp_adaptador_falso.py", "44818", "24819"], { cwd: "aplicacao_desk_agente/agente_python", stdio: "ignore" });
const modbus = spawn(py, ["clp_modbus_falso.py", "25020"], { cwd: "aplicacao_desk_agente/agente_python", stdio: "ignore" });
const servidor = spawn("node", ["iot_automacao_esp/servidor.js"], { env: { ...process.env, PORTA: "4586" }, stdio: "ignore" });
let agente = iniciarAgente(false);

const auth = { Authorization: "Basic " + Buffer.from("u:s").toString("base64") };
const URL = "http://127.0.0.1:4586";
const req = (m, caminho, corpo) => fetch(URL + caminho, { method: m, headers: { ...auth, "Content-Type": "application/json" }, body: corpo && JSON.stringify(corpo) });
const exec = async (acao, extra) => (await req("POST", "/api/clp/executar", { maquina: "PC_TESTE", acao, ...extra })).json();
const mcp = (corpo) => fetch(URL + "/mcp/tok", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify(corpo) }).then((r) => r.text());
let idMcp = 0;
const ferramenta = (name, args) => mcp({ jsonrpc: "2.0", id: ++idMcp, method: "tools/call", params: { name, arguments: args } });
const maquinas = async () => (await (await req("GET", "/api/clp/maquinas")).json());
const esperarMaquina = async (cond) => { let m; for (let i = 0; i < 40; i++) { await espera(500); m = (await maquinas()).find((x) => x.maquina === "PC_TESTE"); if (m && cond(m)) return m; } return m; };

try {
  for (let i = 0; i < 30; i++) { try { await fetch(URL + "/saude"); break; } catch { await espera(300); } }

  // ---- 1) checkbox DESLIGADO no agente ----
  let m = await esperarMaquina((x) => x.online);
  assert.ok(m?.online && m.clp === false, "agente online, mas sem a conexão CLP ligada: " + JSON.stringify(m));
  const bloqueado = await exec("estado");
  assert.ok(bloqueado.erro?.includes("Ativar Conexao CLP: EtherNet/IP"), "sem o checkbox, a aba recusa e explica: " + JSON.stringify(bloqueado));
  const viaClaude = await ferramenta("listar_clp", {});
  assert.ok(viaClaude.includes("Ativar Conexao CLP") && viaClaude.includes("isError\":true"), "o Claude também recebe o aviso: " + viaClaude);
  console.log('OK checkbox desligado: nada de CLP é anunciado, aba e Claude explicam como ligar');

  // ---- 2) checkbox LIGADO ----
  matar(agente); await espera(500); agente = iniciarAgente(true);
  m = await esperarMaquina((x) => x.online && x.clp);
  assert.ok(m?.clp, "agente com o checkbox ligado anuncia as ações clp_*");
  console.log("OK checkbox ligado: máquina anuncia a conexão CLP");

  // ---- aba, menu e instruções ----
  const pag = await (await req("GET", "/clp")).text();
  for (const trecho of ["Conexao Socket-TCP/IP", "Instruções", "id=\"dlg\"", "Duas formas de conectar", "Delta", "Mitsubishi FX3U", "protocolo MC (MELSEC)", "adapter EtherNet/IP", "Ativar Conexao CLP: EtherNet/IP", "TCP 44818", "UDP 2222", "Valores Padrão Robô", "Valores Padrão CLP (Universal)", "Instruções de Ajustes Padrão", "Bytes CLP→PC (32)", "Não existe um padrão universal de verdade", "Instruções de Seleção", "TCP/IP (memórias M, Modbus TCP)", "Valores Padrão TCP/IP (Delta DVP)", "Valores Padrão TCP/IP (Delta AS)", "Endereço base da memória M", "Tipo de conexão"]) {
    assert.ok(pag.includes(trecho), "a página/instruções têm: " + trecho);
  }
  const home = await (await req("GET", "/")).text();
  assert.ok(home.indexOf("IOT-Automacao") < home.indexOf("Conexao Socket-TCP/IP") && home.indexOf("Conexao Socket-TCP/IP") < home.indexOf("Desk-Automacao_Firebase"), "aba logo depois de IOT-Automacao");
  assert.match(home, /Escreva, em cada pino/, "página de pinos original intacta");
  // tema claro/escuro e fundos (iguais aos do programa Automacao_IOT-ESP)
  for (const [nome, html] of [["/clp", pag], ["/", home]]) {
    assert.ok(html.includes('id="tema"') && html.includes("data-tema") && html.includes("sessionStorage") && html.includes("background_iot_l.jpg") && html.includes("☀  Light"), "botão Light/Dark e fundos em " + nome);
  }
  const fundoEscuro = await req("GET", "/img/background_iot.jpg");
  assert.equal(fundoEscuro.status, 200); assert.equal(fundoEscuro.headers.get("content-type"), "image/jpeg");
  assert.ok((await fundoEscuro.arrayBuffer()).byteLength > 100000, "fundo escuro é a imagem inteira");
  assert.equal((await req("GET", "/img/background_iot_l.jpg")).status, 200, "fundo claro");
  assert.equal((await fetch(URL + "/img/background_iot.jpg")).status, 401, "imagem também exige a senha");
  assert.notEqual((await req("GET", "/img/qualquer.jpg")).status, 200, "só os dois fundos são servidos");
  console.log("OK tema: botão Light/Dark, fundos dark e light servidos só com senha");
  console.log("OK aba /clp com botão Instruções e card; menu na ordem certa; página antiga intacta");

  // ---- configuração ----
  const ruim = await req("POST", "/api/clp/config", { maquina: "PC_TESTE", config: { ip: "999.1.1.1" } });
  assert.equal(ruim.status, 400);
  const ruim2 = await req("POST", "/api/clp/config", { maquina: "PC_TESTE", config: { ip: "127.0.0.1", pontos: [{ numero: 512, modo: "voar" }] } });
  assert.equal(ruim2.status, 400, "ação inválida recusada");
  const pontos = [
    { numero: 512, nome: "Garra", modo: "set", pulso_ms: 500 }, { numero: 513, nome: "Garra aberta", modo: "pulso", pulso_ms: 400 },
    { numero: 514, nome: "Esteira", modo: "alternar" }, { numero: 515, nome: "", modo: "pulso" },
  ];
  const salvo = await (await req("POST", "/api/clp/config", { maquina: "PC_TESTE", config: { ip: "127.0.0.1", multicast: false, primeiro_bit: 512, pontos } })).json();
  assert.equal(salvo.ip, "127.0.0.1"); assert.equal(Object.keys(salvo.pontos).length, 4);
  const lido = await (await req("GET", "/api/clp/config?maquina=PC_TESTE")).json();
  assert.equal(lido.pontos[514].nome, "Esteira"); assert.equal(lido.ot_size, 32); assert.equal(lido.inst_ot, 150);
  console.log("OK configuração: valida, grava no Firebase e relê com os padrões do EDS");

  // ---- identificar / conectar / bits pela aba ----
  const ident = await exec("identificar");
  assert.ok(ident.ok && ident.texto.includes("SIMULADOR EtherNet/IP"), JSON.stringify(ident));
  const sem = await exec("bit", { bit: 512, modo: "set" });
  assert.ok(!sem.ok && sem.texto.includes("não conectado"), "bit sem conexão: " + JSON.stringify(sem));
  const conn = await exec("conectar");
  assert.ok(conn.ok && conn.texto.includes("Conectado a 127.0.0.1"), JSON.stringify(conn));
  await espera(600);
  let est = JSON.parse((await exec("estado")).texto);
  assert.ok(est.conectado && est.rx > 5, "I/O cíclico ativo");
  assert.ok(Buffer.from(est.entrada, "hex")[1] & 0x08, "bit 523 (que o equipamento liga sozinho) vem na entrada");
  const set = await exec("bit", { bit: 512, modo: "set" });
  assert.ok(set.ok && set.texto.includes("ON"), JSON.stringify(set));
  await espera(400);
  est = JSON.parse((await exec("estado")).texto);
  assert.ok(Buffer.from(est.saida, "hex")[0] & 1 && Buffer.from(est.entrada, "hex")[0] & 1, "set 512: saída e eco do equipamento");
  const foraIp = await req("POST", "/api/clp/executar", { maquina: "PC_TESTE", acao: "bit", bit: 512, modo: "voar" });
  assert.equal(foraIp.status, 400);
  console.log("OK pela aba: identificar, conectar, estado ao vivo, set de bit e erro claro sem conexão");

  // ---- ferramentas do Claude ----
  const tools = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  for (const t of ["listar_clp", "conectar_clp", "acionar_clp", "acionar", "melhor_rota", "listar_maquinas", "executar_na_maquina", "listar_atalhos"]) assert.ok(tools.includes(`"${t}"`), t);
  const lista = await ferramenta("listar_clp", {});
  assert.ok(lista.includes("CONECTADO") && lista.includes("Garra") && lista.includes("Esteira") && lista.includes("NÃO é dispositivo de segurança"), lista);
  const ambiguo = await ferramenta("acionar_clp", { ponto: "gar" });
  assert.ok(ambiguo.includes("combina com mais de um ponto") && ambiguo.includes("513"), "nome parecido: o Claude é mandado perguntar: " + ambiguo);
  const exato = await ferramenta("acionar_clp", { ponto: "Esteira" });
  assert.ok(exato.includes("ON (alternar)") && exato.includes("Esteira") && !exato.includes("isError\":true"), exato);
  const reset = await ferramenta("acionar_clp", { ponto: "512", acao: "reset" });
  assert.ok(reset.includes("OFF (reset)"), reset);
  const pulso = await ferramenta("acionar_clp", { ponto: "garra aberta", pulso_ms: 300 });
  assert.ok(pulso.includes("pulso de 300 ms"), pulso);
  const nada = await ferramenta("acionar_clp", { ponto: "foguete" });
  assert.ok(nada.includes("Nenhum ponto chamado") && nada.includes("Esteira"), nada);
  const fora = await ferramenta("acionar_clp", { ponto: "9999" });
  assert.ok(fora.includes("fora da área"), fora);
  console.log("OK Claude: listar_clp, nome repetido pergunta, acionar por nome e número, pulso, nome inexistente e bit fora da área");

  const desc = await ferramenta("conectar_clp", { acao: "desconectar" });
  assert.ok(desc.includes("Desconectado"), desc);
  const auto = await ferramenta("acionar_clp", { ponto: "esteira", acao: "set" });
  assert.ok(auto.includes("conectou ao CLP primeiro") && auto.includes("ON (set)"), "conecta sozinho se preciso: " + auto);
  console.log("OK Claude conecta sozinho quando o CLP não está conectado");

  const zera = await exec("zerar");
  assert.ok(zera.ok, JSON.stringify(zera));
  const fim = await exec("desconectar");
  assert.ok(fim.ok);
  assert.ok(!JSON.stringify(banco).includes("chave-de-teste"), "a chave nunca vai para o Firebase");
  console.log("OK zerar saídas e desconectar");
  // ---- TCP/IP (Modbus TCP) nas memórias M ----
  const { comandoClp: comandoDireto } = await import("./clp.js");
  await assert.rejects(comandoDireto({ maquina: "VELHO", broker: "B", online: true, acoes: ["clp_conectar", "clp_estado"] }, "conectar", { protocolo: "tcp_ip", ip: "127.0.0.1" }),
    /versão antiga e não tem a conexão TCP\/IP/, "agente antigo: aviso claro em vez do erro enganoso do EtherNet/IP");
  const ruimProto = await req("POST", "/api/clp/config", { maquina: "PC_TESTE", config: { ip: "127.0.0.1", protocolo: "ftp" } });
  assert.equal(ruimProto.status, 400, "tipo de conexão inválido recusado");
  const cfgTcp = await (await req("POST", "/api/clp/config", { maquina: "PC_TESTE", config: {
    protocolo: "tcp_ip", ip: "127.0.0.1", porta: 25020, unidade: 1, base_m: 2048, primeiro_bit: 0, qtd_m: 64,
    pontos: [{ numero: 3, nome: "Aciona Sensor1", modo: "set" }, { numero: 5, nome: "Esteira M", modo: "alternar" }, { numero: 7, nome: "Luz", modo: "pulso", pulso_ms: 300 }, { numero: 20, nome: "Ja ligada", modo: "reset" }] } })).json();
  assert.equal(cfgTcp.protocolo, "tcp_ip"); assert.equal(cfgTcp.base_m, 2048); assert.equal(cfgTcp.qtd_m, 64);
  const idTcp = await exec("identificar");
  assert.ok(idTcp.ok && idTcp.texto.includes("Modbus TCP") && idTcp.texto.includes("M0 = OFF"), JSON.stringify(idTcp));
  const cTcp = await exec("conectar");
  assert.ok(cTcp.ok && cTcp.texto.includes("Conectado por TCP/IP"), JSON.stringify(cTcp));
  let eTcp = JSON.parse((await exec("estado")).texto);
  assert.ok(eTcp.conectado && eTcp.protocolo === "tcp_ip" && eTcp.quantidade === 64, "estado TCP/IP: " + JSON.stringify(eTcp));
  assert.ok(Buffer.from(eTcp.memorias, "hex")[2] & 0x10, "M20 (já ligada no CLP) aparece ligada");
  const set3 = await exec("bit", { bit: 3, modo: "set" });
  assert.ok(set3.ok && set3.texto.includes("M3 = ON"), JSON.stringify(set3));
  eTcp = JSON.parse((await exec("estado")).texto);
  assert.ok(Buffer.from(eTcp.memorias, "hex")[0] & 0x08, "M3 ligada lida de volta do CLP");
  const zTcp = await exec("zerar");
  assert.ok(!zTcp.ok && zTcp.texto.includes("zerar todas"), "zerar não existe no TCP/IP: " + JSON.stringify(zTcp));
  const listaTcp = await ferramenta("listar_clp", {});
  assert.ok(listaTcp.includes("TCP/IP (Modbus TCP)") && listaTcp.includes("CONECTADO") && listaTcp.includes("memória M3") && listaTcp.includes("LIGADA") && listaTcp.includes("Esteira M"), listaTcp);
  const viaClaudeTcp = await ferramenta("acionar_clp", { ponto: "esteira m" });
  assert.ok(viaClaudeTcp.includes("M5 = ON (alternar)") && !viaClaudeTcp.includes("isError\":true"), viaClaudeTcp);
  const pulsoTcp = await ferramenta("acionar_clp", { ponto: "luz" });
  assert.ok(pulsoTcp.includes("M7: pulso de 300 ms"), pulsoTcp);
  const foraTcp = await ferramenta("acionar_clp", { ponto: "5000", acao: "set" });
  assert.ok(foraTcp.includes("endereço de memória inexistente"), foraTcp);
  await exec("desconectar");
  const autoTcp = await ferramenta("acionar_clp", { ponto: "aciona sensor1" });
  assert.ok(autoTcp.includes("conectou ao CLP primeiro") && autoTcp.includes("M3 = ON (set)"), autoTcp);
  assert.ok((await exec("desconectar")).ok);
  console.log("OK TCP/IP (Modbus TCP): config, identificar, conectar, estado das memórias, set/alternar/pulso, zerar recusado, Claude liga memória e conecta sozinho");

} finally {
  for (const proc of [agente, adaptador, modbus, servidor]) matar(proc);
  fake.close();
}
process.exit(0);
