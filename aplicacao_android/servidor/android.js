// Conversa com os celulares (api_conect.apk) pelo Firebase. Mesmo esquema do agente do PC, em outro caminho:
//   brokers/<broker>/android/<dispositivo>/status | comandos/<id> | resultado/<id> | apps (cifrado)
// Comandos ASSINADOS com HMAC-SHA256 (a mesma chave: AGENTE_CHAVE, ou o MCP_TOKEN se não houver).
import { randomBytes } from "node:crypto";
import { DB_URL } from "../../src/firebase.js";
import { assinar } from "../../aplicacao_desk_agente/agente/maquinas.js";
import { decifrar } from "./criptoApps.js";

const ONLINE_MS = 45000;   // o celular dá sinal de vida a cada 15 s (o Android pode atrasar um pouco)
const ESPERA_MS = 12000;
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const chave = () => process.env.AGENTE_CHAVE || process.env.MCP_TOKEN;

async function rest(metodo, caminho, corpo, consulta = "") {
  const r = await fetch(`${DB_URL}/${caminho}.json${consulta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Firebase ${metodo} /${caminho} -> ${r.status}`);
  return r.json();
}

const lista = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : null);

export async function listarAndroid() {
  const brokers = Object.keys((await rest("GET", "brokers", undefined, "?shallow=true")) || {});
  const grupos = await Promise.all(brokers.map(async (broker) => {
    const nomes = Object.keys((await rest("GET", `brokers/${broker}/android`, undefined, "?shallow=true")) || {});
    return Promise.all(nomes.map(async (dispositivo) => {
      const s = (await rest("GET", `brokers/${broker}/android/${dispositivo}/status`)) || {};
      const idade = typeof s.visto_em === "number" ? Date.now() - s.visto_em : null;
      return {
        broker, dispositivo,
        online: s.online === true && idade !== null && idade < ONLINE_MS,
        visto_ha_s: idade === null ? null : Math.round(idade / 1000),
        resumo: s.resumo ?? null,
        acoes: lista(s.acoes),
      };
    }));
  }));
  return grupos.flat().sort((a, b) => a.dispositivo.localeCompare(b.dispositivo));
}

// Lista de apps que o celular publicou (cifrada). Devolve [{n, p, s, b, v}] e a data.
export async function lerApps(alvo) {
  const k = chave();
  if (!k) throw new Error("Defina AGENTE_CHAVE (ou MCP_TOKEN) no servidor.");
  const no = await rest("GET", `brokers/${alvo.broker}/android/${alvo.dispositivo}/apps`);
  if (!no?.dados) throw new Error("O celular ainda não publicou a lista de apps. Use executar_no_android com a ação listar_apps.");
  const dados = JSON.parse(decifrar(no.dados, k));
  return { em: dados.em, apps: dados.apps ?? [] };
}

export async function enviarComando(alvo, acao, parametros = {}) {
  const k = chave();
  if (!k) throw new Error("Defina AGENTE_CHAVE (ou MCP_TOKEN) no servidor.");
  const id = randomBytes(6).toString("hex");
  const ts = Date.now();
  const base = `brokers/${alvo.broker}/android/${alvo.dispositivo}`;
  await rest("PUT", `${base}/comandos/${id}`, { acao, parametros, ts, assinatura: assinar(k, id, acao, parametros, ts) });
  const limite = Date.now() + ESPERA_MS;
  while (Date.now() < limite) {
    await dorme(700);
    const r = await rest("GET", `${base}/resultado/${id}`);
    if (r) {
      await rest("DELETE", `${base}/resultado/${id}`).catch(() => {});
      return { ok: r.ok === true, texto: String(r.texto ?? "") };
    }
  }
  return { ok: false, texto: `sem resposta em ${ESPERA_MS / 1000} s: o app pode estar fechado, sem internet ou com a chave diferente.` };
}

// Acha o celular pedido. Sem nome: o único ativo; senão devolve a pergunta para o usuário.
export async function escolher(nome) {
  const todos = await listarAndroid();
  if (!todos.length) throw new Error("Nenhum celular cadastrado. Instale e abra o api_conect.apk.");
  if (nome) {
    const m = todos.filter((x) => x.dispositivo.toLowerCase() === String(nome).toLowerCase());
    if (m.length !== 1) throw new Error(`Celular "${nome}" ${m.length ? "existe em mais de um broker" : "não encontrado"}. Celulares: ${todos.map((x) => x.dispositivo).join(", ")}.`);
    return m[0];
  }
  const ativos = todos.filter((x) => x.online);
  if (ativos.length === 1) return ativos[0];
  throw new Error(ativos.length
    ? `Há ${ativos.length} celulares ativos: ${ativos.map((x) => x.dispositivo).join(", ")}. Pergunte ao usuário: "Qual celular?".`
    : `Nenhum celular está ativo agora (${todos.map((x) => `${x.dispositivo}: sem sinal há ${x.visto_ha_s ?? "?"} s`).join("; ")}). Avise o usuário para abrir o Agente Android.`);
}
