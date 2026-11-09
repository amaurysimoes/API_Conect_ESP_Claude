// Lugares salvos pela página /enderecos. Vão para o Firebase CIFRADOS, dentro do nó de um ESP:
//   esps/<ESP>/lugares_cifrados/<id>
// (único caminho que as regras abertas do banco liberam; o código antigo ignora esse campo, então nada muda para ele).
// O ESP que hospeda é LUGARES_ESP, ou o primeiro da lista; na leitura juntamos os de todos os ESPs.
import { randomBytes } from "node:crypto";
import { DB_URL } from "../src/firebase.js";
import { cifrar, decifrar } from "./cripto.js";

const CAMPO = "lugares_cifrados";
export const idValido = (id) => /^[a-f0-9]{12}$/.test(String(id));

async function rest(metodo, caminho, corpo) {
  const r = await fetch(`${DB_URL}/${caminho}.json`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Firebase ${metodo} /${caminho} -> ${r.status}`);
  return r.json();
}

const todosEsps = async () => (await rest("GET", "esps")) || {};

function hospedeiro(esps) {
  const nomes = Object.keys(esps).filter((n) => !n.startsWith("_")).sort();
  const escolhido = process.env.LUGARES_ESP && nomes.includes(process.env.LUGARES_ESP) ? process.env.LUGARES_ESP : nomes[0];
  if (!escolhido) throw new Error("Nenhum ESP no Firebase para guardar os endereços.");
  return escolhido;
}

export async function listarLugaresSalvos() {
  const lista = [];
  for (const e of Object.values(await todosEsps())) {
    for (const [id, valor] of Object.entries(e?.[CAMPO] || {})) {
      try { lista.push({ id, ...decifrar(valor) }); } catch { /* chave trocada ou dado estranho: ignora */ }
    }
  }
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function salvarLugar({ id, nome, endereco, cep }) {
  const esps = await todosEsps();
  const existente = id && idValido(id) ? Object.keys(esps).find((n) => esps[n]?.[CAMPO]?.[id] !== undefined) : null;
  const novoId = id && idValido(id) ? id : randomBytes(6).toString("hex");
  await rest("PUT", `esps/${existente || hospedeiro(esps)}/${CAMPO}/${novoId}`, cifrar({ nome, endereco, cep: cep || "" }));
  return novoId;
}

export async function apagarLugar(id) {
  if (!idValido(id)) throw new Error("id inválido");
  const esps = await todosEsps();
  for (const n of Object.keys(esps)) if (esps[n]?.[CAMPO]?.[id] !== undefined) await rest("DELETE", `esps/${n}/${CAMPO}/${id}`);
}
