// Conversa com as máquinas (agentes) pelo Firebase: lista quem está ativo e manda comandos ASSINADOS.
//   brokers/<broker>/maquinas/<maquina>/status | comandos/<id> | resultado/<id>   (mesmo caminho do agente antigo)
// Assinatura: HMAC-SHA256(AGENTE_CHAVE, "<id>\n<acao>\n<parametros em JSON ordenado>\n<ts>") — o agente confere igual.
import { createHmac, randomBytes } from "node:crypto";
import { DB_URL } from "../../src/firebase.js";

const ONLINE_MS = 30000;      // o agente dá sinal de vida a cada 10 s
const ESPERA_MS = 12000;      // quanto esperamos o resultado de um comando
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

async function rest(metodo, caminho, corpo, consulta = "") {
  const r = await fetch(`${DB_URL}/${caminho}.json${consulta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Firebase ${metodo} /${caminho} -> ${r.status}`);
  return r.json();
}

// JSON com as chaves ordenadas (igual ao json.dumps(sort_keys=True, separators=(",", ":")) do Python)
const ordenado = (v) =>
  Array.isArray(v) ? `[${v.map(ordenado).join(",")}]`
    : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${ordenado(v[k])}`).join(",")}}`
      : JSON.stringify(v);

export const mensagem = (id, acao, parametros, ts) => `${id}\n${acao}\n${ordenado(parametros ?? {})}\n${ts}`;
export const assinar = (chave, id, acao, parametros, ts) => createHmac("sha256", chave).update(mensagem(id, acao, parametros, ts)).digest("hex");

export async function listarMaquinas() {
  const brokers = Object.keys((await rest("GET", "brokers", undefined, "?shallow=true")) || {});
  const grupos = await Promise.all(brokers.map(async (broker) => {
    const nomes = Object.keys((await rest("GET", `brokers/${broker}/maquinas`, undefined, "?shallow=true")) || {});
    return Promise.all(nomes.map(async (maquina) => {
      const s = (await rest("GET", `brokers/${broker}/maquinas/${maquina}/status`)) || {};
      const idade = typeof s.visto_em === "number" ? Date.now() - s.visto_em : null;
      return {
        broker, maquina,
        online: s.online === true && idade !== null && idade < ONLINE_MS,
        visto_ha_s: idade === null ? null : Math.round(idade / 1000),
        resumo: s.resumo ?? null,
        acoes: Array.isArray(s.acoes) ? s.acoes : s.acoes && typeof s.acoes === "object" ? Object.values(s.acoes) : null, // o que o agente diz suportar (agentes antigos não informam)
      };
    }));
  }));
  return grupos.flat().sort((a, b) => a.maquina.localeCompare(b.maquina));
}

// Manda um comando assinado e espera o resultado. Devolve { ok, texto }.
export async function enviarComando(alvo, acao, parametros = {}) {
  const chave = process.env.AGENTE_CHAVE || process.env.MCP_TOKEN; // sem AGENTE_CHAVE, assina com o MCP_TOKEN
  if (!chave) throw new Error("Defina AGENTE_CHAVE (ou MCP_TOKEN) no servidor.");
  const id = randomBytes(6).toString("hex");
  const ts = Date.now();
  const base = `brokers/${alvo.broker}/maquinas/${alvo.maquina}`;
  await rest("PUT", `${base}/comandos/${id}`, { acao, parametros, ts, assinatura: assinar(chave, id, acao, parametros, ts) });
  const limite = Date.now() + ESPERA_MS;
  while (Date.now() < limite) {
    await dorme(700);
    const r = await rest("GET", `${base}/resultado/${id}`);
    if (r) {
      await rest("DELETE", `${base}/resultado/${id}`).catch(() => {});
      return { ok: r.ok === true, texto: String(r.texto ?? "") };
    }
  }
  return { ok: false, texto: `sem resposta em ${ESPERA_MS / 1000} s: o agente pode estar travado ou com a chave diferente.` };
}
