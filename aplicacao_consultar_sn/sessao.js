// Sessões de leitura de serial: cada "Consultar Serial" gera um token de uso único (vale 10 min, só na memória).
// A página no celular grava o resultado; a ferramenta do Claude lê.
import { randomBytes } from "node:crypto";

const VALE_MS = 10 * 60 * 1000;
const sessoes = new Map();
let ultima = null;

export function criarSessao() {
  for (const [t, s] of sessoes) if (s.exp < Date.now()) sessoes.delete(t);
  const token = randomBytes(24).toString("hex");
  sessoes.set(token, { exp: Date.now() + VALE_MS, leituras: [] });
  ultima = token;
  return token;
}

export const sessao = (token) => { const s = sessoes.get(token); return s && s.exp > Date.now() ? s : null; };
export const ultimaSessao = () => (ultima && sessao(ultima) ? ultima : null);

export function gravarLeitura(token, texto, formato) {
  const s = sessao(token);
  if (!s) throw new Error("link expirado: peça 'Consultar Serial' de novo");
  const t = String(texto ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, 1000);
  if (!t.trim()) throw new Error("leitura vazia");
  s.leituras.push({ texto: t, formato: String(formato ?? "").slice(0, 40), em: Date.now() });
  return s.leituras.length;
}

/** Espera uma leitura mais nova que 'depois' (ms). Devolve a leitura ou null. */
export async function aguardarLeitura(token, ms, depois = 0) {
  const limite = Date.now() + ms;
  do {
    const s = sessao(token);
    if (!s) return null;
    const l = s.leituras.at(-1);
    if (l && l.em > depois) return l;
    if (Date.now() >= limite) break;
    await new Promise((r) => setTimeout(r, 600));
  } while (Date.now() < limite);
  return null;
}
