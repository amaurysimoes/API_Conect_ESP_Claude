// Consulta Serial, 2ª parte: busca o histórico do serial no back-end da rede local (ex.: fábrica), GET http://IP:PORTA/busca?sn=<serial>.
// O servidor (Render) NÃO alcança a rede local. Dois caminhos, tentados juntos (vale o primeiro que responder):
//   1) agente do PC (Render_Agente) que está na mesma rede do back: recebe o comando ASSINADO serial_buscar, consulta e devolve por HTTPS;
//   2) o próprio navegador do celular chama o back direto (só funciona onde o navegador deixa uma página HTTPS chamar http://IP).
// IP, porta e máquina ficam CIFRADOS no Firebase (brokers/<broker>/serial_config), a mesma cópia em cada broker.
import { randomBytes } from "node:crypto";
import { DB_URL } from "../iot_automacao_esp/firebase.js";
import { cifrar, decifrar } from "../aplicacao_gps/cripto.js";
import { listarMaquinas, enviarComando } from "../aplicacao_desk_agente/agente/maquinas.js";
import { urlPublica } from "../aplicacao_docs_mysqlaiven/trabalhos.js";
import { sessao } from "./sessao.js";

export const ACAO = "serial_buscar";
const MAX_LINHAS = 20;          // linhas guardadas por tabela
const MAX_TEXTO = 400;          // tamanho máximo de cada valor

async function rest(metodo, caminho, corpo, consulta = "") {
  const r = await fetch(`${DB_URL}/${caminho}.json${consulta}`, {
    method: metodo, headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Firebase ${metodo} /${caminho} -> ${r.status}`);
  return r.json();
}
const brokers = async () => Object.keys((await rest("GET", "brokers", undefined, "?shallow=true")) || {});

// ---------- configuração (IP, porta, máquina) ----------
export function validarConfig(b = {}) {
  const ip = String(b.ip ?? "").trim();
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m || m.slice(1).some((x) => Number(x) > 255)) throw new Error(`IP inválido: ${ip || "(vazio)"}. Exemplo: 192.168.0.10`);
  const [a, c] = [Number(m[1]), Number(m[2])];
  const local = a === 10 || a === 127 || (a === 172 && c >= 16 && c <= 31) || (a === 192 && c === 168) || (a === 169 && c === 254);
  if (!local) throw new Error("Só aceito IP de rede local (10.x.x.x, 172.16-31.x.x, 192.168.x.x).");
  const porta = Number(b.porta);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) throw new Error("Porta inválida (1 a 65535).");
  return { ip, porta, maquina: String(b.maquina ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60) };
}

export async function lerConfig() {
  for (const b of await brokers()) {
    const v = await rest("GET", `brokers/${b}/serial_config`);
    if (!v) continue;
    try { return validarConfig(decifrar(v)); } catch { /* chave trocada ou registro estranho: tenta o próximo broker */ }
  }
  return null;
}

export async function gravarConfig(b) {
  const cfg = validarConfig(b);
  const lista = await brokers();
  if (!lista.length) throw new Error("Nenhum broker no Firebase: abra o agente do PC uma vez (ele cria o broker).");
  for (const br of lista) await rest("PUT", `brokers/${br}/serial_config`, cifrar(cfg));
  return cfg;
}

export const maquinasPonte = async () => (await listarMaquinas()).map((m) => ({ maquina: m.maquina, online: m.online, pronta: Array.isArray(m.acoes) && m.acoes.includes(ACAO) }));

// ---------- resultado ----------
const curto = (v) => (typeof v === "string" && v.length > MAX_TEXTO ? v.slice(0, MAX_TEXTO) + "…" : v);

// Guarda só o que a página e a IA usam (o back devolve até 100 linhas por tabela)
export function enxugar(d) {
  if (!d || typeof d !== "object") throw new Error("o back respondeu algo que não é JSON de busca");
  const results = (Array.isArray(d.results) ? d.results : []).slice(0, 60).map((r) => ({
    database: String(r?.database ?? ""), table: String(r?.table ?? ""), column: String(r?.column ?? ""),
    total_found: Number(r?.total_found ?? (Array.isArray(r?.records) ? r.records.length : 0)) || 0,
    records: (Array.isArray(r?.records) ? r.records : []).slice(0, MAX_LINHAS).map((l) =>
      l && typeof l === "object" ? Object.fromEntries(Object.entries(l).slice(0, 80).map(([k, v]) => [k, curto(v)])) : { valor: curto(l) }),
  }));
  return {
    searched_serial: curto(d.searched_serial ?? ""), padrao_identificado: curto(d.padrao_identificado ?? ""), usou_memoria: d.usou_memoria === true,
    aviso: curto(d.aviso ?? ""), status: curto(d.status ?? ""), message: curto(d.message ?? ""),
    total_tables_with_data: Number(d.total_tables_with_data ?? results.length) || 0, results,
  };
}

const agentes = new Map();   // token do agente (uso único) -> { token da sessão, sn, maquina }

function terminar(s, sn, campos) {
  if (!s.busca || s.busca.sn !== sn || s.busca.estado === "ok") return false;   // outra busca começou, ou já chegou resposta boa
  Object.assign(s.busca, campos, { fim: Date.now() });
  return true;
}

/** Começa a busca pelo(s) agente(s). Devolve na hora { ip, porta }: o navegador tenta o caminho direto com isso. */
export async function iniciarBusca(token, serial) {
  const s = sessao(token);
  if (!s) throw new Error("link expirado: abra a Consulta Serial de novo");
  const sn = String(serial ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 200);
  if (!sn) throw new Error("serial vazio");
  const cfg = await lerConfig();
  if (!cfg) throw new Error("Falta o IP e a porta do back-end: preencha na aba Consulta Serial (site) e salve.");
  s.busca = { sn, estado: "buscando", inicio: Date.now(), via: "", dados: null, erro: "", pendentes: 0, avisos: [] };
  despachar(token, s, sn, cfg);   // segue em segundo plano (não lança: erros viram avisos da busca)
  return { ip: cfg.ip, porta: cfg.porta, sn };
}

function fecharSeAcabou(s, sn) {
  if (s.busca?.sn === sn && s.busca.estado === "buscando" && s.busca.pendentes <= 0 && s.busca.despachado) {
    terminar(s, sn, { estado: "erro", erro: s.busca.avisos.join(" | ") || "nenhum caminho respondeu" });
  }
}

async function despachar(token, s, sn, cfg) {
  const b = s.busca;
  try {
    const base = urlPublica();
    if (!base) throw new Error("o servidor não sabe o próprio endereço (DOCS_URL_PUBLICA / RENDER_EXTERNAL_URL)");
    const todas = await listarMaquinas();
    let alvos = todas.filter((m) => m.online && Array.isArray(m.acoes) && m.acoes.includes(ACAO));
    if (cfg.maquina) alvos = alvos.filter((m) => m.maquina.toLowerCase() === cfg.maquina.toLowerCase());
    if (!alvos.length) {
      const ativas = todas.filter((m) => m.online).map((m) => m.maquina);
      throw new Error(cfg.maquina
        ? `a máquina ${cfg.maquina} não está ativa ou o agente dela é antigo (troque o Render_Agente)`
        : ativas.length ? `nenhum agente ativo sabe buscar serial (ativos: ${ativas.join(", ")}): troque o Render_Agente pelo novo`
          : "nenhum agente do PC está ativo na rede do back");
    }
    b.pendentes = alvos.length;
    await Promise.all(alvos.map(async (m) => {
      const tk = randomBytes(24).toString("hex");
      agentes.set(tk, { token, sn, maquina: m.maquina, exp: Date.now() + 10 * 60 * 1000 });
      const r = await enviarComando(m, ACAO, { ip: cfg.ip, porta: cfg.porta, sn, url: base, token: tk }).catch((e) => ({ ok: false, texto: String(e.message || e) }));
      if (!r.ok) { agentes.delete(tk); b.pendentes--; b.avisos.push(`${m.maquina}: ${r.texto}`); }
    }));
  } catch (e) { b.avisos.push(String(e.message || e)); } finally { b.despachado = true; fecharSeAcabou(s, sn); }
}

/** O agente devolve o que o back respondeu (ou o erro). */
export function respostaDoAgente(tk, corpo) {
  for (const [t, a] of agentes) if (a.exp < Date.now()) agentes.delete(t);
  const a = agentes.get(tk);
  if (!a) throw new Error("token do agente inválido ou expirado");
  agentes.delete(tk);
  const s = sessao(a.token);
  if (!s?.busca || s.busca.sn !== a.sn) return;
  if (corpo?.ok === true) { terminar(s, a.sn, { estado: "ok", via: `agente ${a.maquina}`, dados: enxugar(corpo.dados), erro: "" }); return; }
  s.busca.pendentes--;
  s.busca.avisos.push(`${a.maquina}: ${String(corpo?.erro ?? "falhou").slice(0, 300)}`);
  fecharSeAcabou(s, a.sn);
}

/** O navegador conseguiu chamar o back direto. */
export function respostaDoNavegador(token, serial, dados) {
  const s = sessao(token);
  if (!s?.busca || s.busca.sn !== String(serial ?? "")) throw new Error("busca não encontrada nesta sessão");
  terminar(s, s.busca.sn, { estado: "ok", via: "direto do navegador", dados: enxugar(dados), erro: "" });
}

export const estadoBusca = (token) => {
  const b = sessao(token)?.busca;
  return b ? { sn: b.sn, estado: b.estado, via: b.via, dados: b.dados, erro: b.erro, segundos: Math.round(((b.fim ?? Date.now()) - b.inicio) / 1000) } : { estado: "nenhuma" };
};

export async function aguardarBusca(token, serial, ms) {
  const inicio = Date.now(), limite = inicio + ms;
  for (;;) {
    const b = sessao(token)?.busca;
    if (b && b.sn === serial && b.estado !== "buscando") return b;
    if (Date.now() >= limite) return b && b.sn === serial ? b : null;
    if (!(b && b.sn === serial) && Date.now() - inicio > 4000) return null;   // a página não pediu a busca (sem IP/porta ou página antiga)
    await new Promise((r) => setTimeout(r, 500));
  }
}

// Texto para a IA: resumo + primeiras linhas de cada tabela
export function resumoTexto(d, limite = 6000) {
  if (!d) return "sem dados";
  if (d.status === "offline") return `O back respondeu "offline": ${d.message || "sem base nesta rede"}.`;
  if (!d.results.length) return d.message || "Nenhum registro encontrado para este serial.";
  const linhas = [`Padrão identificado: ${d.padrao_identificado || "?"} · ${d.usou_memoria ? "Cache Rápido" : "Varredura"} · ${d.total_tables_with_data} tabela(s) com dados${d.aviso ? ` · ${d.aviso}` : ""}`];
  for (const r of d.results) {
    linhas.push(`\n${r.database}.${r.table} (coluna ${r.column}): ${r.total_found} registro(s)`);
    for (const l of r.records.slice(0, 3)) linhas.push("  " + JSON.stringify(l).slice(0, 500));
    if (r.records.length > 3) linhas.push(`  … mais ${r.total_found - 3}`);
  }
  const t = linhas.join("\n");
  return t.length > limite ? t.slice(0, limite) + "\n… (resumo cortado; o histórico completo está na página)" : t;
}
