// Lugares salvos com nome: "Cidade Nova", "Centro", "Dr. Machado"... -> endereço.
// Ficam na variável LUGARES_JSON do Render (e do .env local). NUNCA no Firebase (regras abertas) nem no git.
// Exemplo: LUGARES_JSON={"Cidade Nova":"Rua A, 100, Cidade Nova, Rio Claro - SP","Centro":"Rua B, 200, Centro, Rio Claro - SP"}
import { tokens } from "../src/mapa.js";

export function lerLugares() {
  try {
    const o = JSON.parse(process.env.LUGARES_JSON || "{}");
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

export const nomesDosLugares = () => Object.keys(lerLugares());

// Acha o lugar salvo cujo nome aparece no texto ("casa da Cidade Nova" -> "Cidade Nova"). Devolve null se não achar.
export function acharLugar(texto) {
  const pedido = new Set(tokens(texto));
  let melhor = null, pontos = 0, empate = false;
  for (const [nome, endereco] of Object.entries(lerLugares())) {
    const t = tokens(nome);
    if (!t.length || !t.every((x) => pedido.has(x))) continue;
    if (t.length > pontos) { melhor = { nome, endereco }; pontos = t.length; empate = false; }
    else if (t.length === pontos) empate = true;
  }
  return empate ? { ambiguo: true } : melhor;
}
