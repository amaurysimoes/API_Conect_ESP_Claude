// Acesso ao Firebase Realtime Database por REST (o mesmo caminho que o firmware do ESP usa).
// ESP: esps/<nome>/pinos/<gpio>/estado (true liga) e /pulso (true liga por ~1 s).
export const DB_URL = (process.env.FIREBASE_URL || "https://amauryesp-active-default-rtdb.firebaseio.com").replace(/\/$/, "");
const ONLINE_MS = 30000; // o ESP dá sinal de vida a cada 10 s

async function req(metodo, caminho, corpo) {
  const r = await fetch(`${DB_URL}/${caminho.replace(/^\/|\/$/g, "")}.json`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Firebase ${metodo} /${caminho} -> ${r.status} ${await r.text()}`);
  return r.json();
}

// O Firebase devolve "pinos" como array quando as chaves são números seguidos (0, 2, 4...) e como objeto quando não são.
function pinosComoLista(pinos) {
  const pares = Array.isArray(pinos) ? pinos.map((p, i) => [i, p]) : Object.entries(pinos || {});
  return pares
    .filter(([, p]) => p && typeof p === "object")
    .map(([gpio, p]) => ({
      gpio: Number(gpio),
      nome: p.nome ?? `Pino ${gpio}`,
      tipo: p.tipo ?? "saida",
      estado: p.estado === true,
    }))
    .sort((a, b) => a.gpio - b.gpio);
}

// "palavras": esps/<nome>/palavras/<gpio> = "luz frente, varanda" -> { "5": ["luz frente", "varanda"] }
function palavrasComoObjeto(pal) {
  const pares = Array.isArray(pal) ? pal.map((v, i) => [i, v]) : Object.entries(pal || {});
  return Object.fromEntries(
    pares
      .filter(([, v]) => typeof v === "string" && v.trim())
      .map(([g, v]) => [g, v.split(",").map((x) => x.trim()).filter(Boolean)])
  );
}

export async function listarEsps() {
  const todos = (await req("GET", "esps")) || {};
  const agora = Date.now();
  return Object.entries(todos).map(([nome, e]) => ({
    nome,
    ip: e.ip ?? null,
    modelo: e.modelo ?? null,
    online: typeof e.visto_em === "number" && agora - e.visto_em < ONLINE_MS,
    visto_ha_s: typeof e.visto_em === "number" ? Math.round((agora - e.visto_em) / 1000) : null,
    pinos: pinosComoLista(e.pinos),
    palavras: palavrasComoObjeto(e.palavras),
  }));
}

// Guarda (ou apaga, se vazio) as palavras de um pino. Fica no próprio ESP, único caminho que as regras do banco liberam.
export async function gravarPalavras(esp, gpio, texto) {
  const caminho = `esps/${esp}/palavras/${gpio}`;
  const limpo = String(texto || "").trim();
  return limpo ? req("PUT", caminho, limpo) : req("DELETE", caminho);
}

// acao: "ligar" | "desligar" | "pulso"
export async function acionar(esp, gpio, acao) {
  const caminho = `esps/${esp}/pinos/${gpio}`;
  if (acao === "pulso") return req("PATCH", caminho, { pulso: true });
  return req("PATCH", caminho, { estado: acao === "ligar" });
}
