// Lugares salvos com nome ("Casa 1", "Trabalho"...) -> endereço.
// Fontes: página /enderecos (cifrado no Firebase) e, opcionalmente, a variável LUGARES_JSON do Render:
//   {"Casa 1":"Rua A, 100, Bairro, Cidade - UF"}
import { tokens } from "../iot_automacao_esp/mapa.js";
import { listarLugaresSalvos } from "./lugaresStore.js";

export async function lerLugares() {
  const lista = [];
  try {
    const o = JSON.parse(process.env.LUGARES_JSON || "{}");
    for (const [nome, endereco] of Object.entries(o)) if (typeof endereco === "string") lista.push({ nome, endereco, cep: "" });
  } catch { /* JSON inválido: ignora */ }
  try { lista.push(...(await listarLugaresSalvos())); } catch (e) { console.error("lugares salvos:", e.message); }
  return lista;
}

export const nomesDosLugares = async () => (await lerLugares()).map((l) => l.nome);

// Endereço pronto para o Google: rua + CEP (o CEP já identifica a cidade); sem CEP e sem vírgula, completa com CIDADE_PADRAO.
export function enderecoCompleto(l) {
  const base = [l.endereco, l.cep].filter(Boolean).join(", ");
  const cidade = process.env.CIDADE_PADRAO;
  return !l.cep && cidade && !l.endereco.includes(",") ? `${base}, ${cidade}` : base;
}

// "a casa 1" -> lugar "Casa 1". null se não achar; { ambiguo: true } se bater com mais de um igual.
export async function acharLugar(texto) {
  const pedido = new Set(tokens(texto));
  let melhor = null, pontos = 0, empate = false;
  for (const l of await lerLugares()) {
    const t = tokens(l.nome);
    if (!t.length || !t.every((x) => pedido.has(x))) continue;
    if (t.length > pontos) { melhor = l; pontos = t.length; empate = false; }
    else if (t.length === pontos) empate = true;
  }
  return empate ? { ambiguo: true } : melhor;
}
