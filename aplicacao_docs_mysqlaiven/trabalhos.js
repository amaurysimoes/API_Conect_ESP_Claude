// Trabalhos em andamento entre o servidor e o agente do PC (enviar/baixar documento). Ficam só na memória (vale 15 min):
// o token é a "senha de uso único" que o servidor manda, ASSINADA, dentro do comando para o agente.
import { randomBytes } from "node:crypto";

const VALE_MS = 15 * 60 * 1000;
const trabalhos = new Map();

export function criarTrabalho(tipo, dados = {}) {
  for (const [t, j] of trabalhos) if (j.exp < Date.now()) trabalhos.delete(t);
  const token = randomBytes(24).toString("hex");
  trabalhos.set(token, { tipo, ...dados, estado: "pendente", texto: "", exp: Date.now() + VALE_MS });
  return token;
}
export const trabalho = (token) => { const j = trabalhos.get(token); return j && j.exp > Date.now() ? j : null; };
export function concluir(token, ok, texto) {
  const j = trabalho(token);
  if (j && j.estado === "pendente") { j.estado = ok ? "ok" : "erro"; j.texto = texto; }
}
export function descartar(token) { trabalhos.delete(token); }

/** Espera o trabalho terminar (até ms). Devolve { estado, texto }. */
export async function aguardar(token, ms = 100000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    const j = trabalho(token);
    if (!j) return { estado: "erro", texto: "trabalho expirou" };
    if (j.estado !== "pendente") return { estado: j.estado, texto: j.texto };
    await new Promise((r) => setTimeout(r, 700));
  }
  return { estado: "pendente", texto: "" };
}

export const urlPublica = () => (process.env.DOCS_URL_PUBLICA || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
