// Atalhos salvos: sites, programas, pastas e arquivos que o usuário escolhe (nome + caminho), para abrir pela aba Desk
// (valem para TODAS as máquinas: a mesma cópia é gravada em todos os brokers e a leitura junta tudo, sem repetir)
// ou pedindo ao Claude ("abre meu sistema de estoque"). Ficam no Firebase CIFRADOS (o banco é aberto):
//   brokers/<broker>/atalhos/<id> = texto cifrado de { tipo, nome, alvo, argumentos, palavras }
// Cifra: a mesma do módulo de endereços (LUGARES_CHAVE ou MCP_TOKEN). Registro adulterado não decifra e é ignorado.
import { randomBytes } from "node:crypto";
import { DB_URL } from "../../src/firebase.js";
import { cifrar, decifrar } from "../../gps_amaury/cripto.js";
import { tokens } from "../../src/mapa.js";
import { enviarComando } from "./maquinas.js";

export const TIPOS = ["site", "programa", "pasta", "arquivo"];
export const idValido = (id) => /^[a-f0-9]{12}$/.test(String(id));
const pasta = (broker) => `brokers/${broker}/atalhos`;

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

const brokersNomes = async () => Object.keys((await rest("GET", "brokers", undefined, "?shallow=true")) || {});

const limpo = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

// Confere e limpa o que veio da página.
export function validar(b) {
  const tipo = String(b?.tipo ?? "");
  if (!TIPOS.includes(tipo)) throw new Error(`Tipo inválido. Use: ${TIPOS.join(", ")}.`);
  const nome = limpo(b.nome, 60), alvo = limpo(b.alvo, 500);
  if (!nome) throw new Error("Dê um nome ao atalho.");
  if (!alvo) throw new Error(tipo === "site" ? "Informe o endereço do site." : "Informe o caminho.");
  const palavras = String(b.palavras ?? "").split(",").map((x) => limpo(x, 40)).filter(Boolean).slice(0, 10);
  const argumentos = tipo === "programa" ? limpo(b.argumentos, 300) : "";
  return { tipo, nome, alvo, argumentos, palavras };
}

export async function listarAtalhos() {
  const unicos = new Map();                       // o mesmo id em vários brokers vira um só
  for (const broker of await brokersNomes()) {
    for (const [id, valor] of Object.entries((await rest("GET", pasta(broker))) || {})) {
      if (unicos.has(id)) continue;
      try { unicos.set(id, { id, ...decifrar(valor) }); } catch { /* chave trocada ou registro estranho: ignora */ }
    }
  }
  const lista = [...unicos.values()];
  return lista.sort((a, b) => TIPOS.indexOf(a.tipo) - TIPOS.indexOf(b.tipo) || a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function salvarAtalho(dados) {
  const a = validar(dados);
  const id = dados?.id && idValido(dados.id) ? dados.id : randomBytes(6).toString("hex");
  for (const broker of await brokersNomes()) await rest("PUT", `${pasta(broker)}/${id}`, cifrar(a));
  return id;
}

export async function apagarAtalho(id) {
  if (!idValido(id)) throw new Error("id inválido");
  for (const broker of await brokersNomes()) await rest("DELETE", `${pasta(broker)}/${id}`);
}

const plano = (t) => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// Acha o atalho pelo id, pelo nome ou pelas palavras ("abre meu sistema de estoque"). Vários iguais: pede para escolher.
export function acharAtalho(lista, consulta) {
  const q = String(consulta ?? "").trim();
  if (!q) throw new Error("Diga qual atalho.");
  const porId = lista.find((a) => a.id === q);
  if (porId) return porId;
  const pedido = new Set(tokens(q)), textoPlano = plano(q);
  const pontos = lista.map((a) => {
    let melhor = 0;
    for (const frase of [a.nome, ...(a.palavras ?? [])]) {
      const t = tokens(frase);
      if (t.length && t.every((x) => pedido.has(x))) melhor = Math.max(melhor, 10 + t.length);              // nome completo dito
      else if (t.length && pedido.size && [...pedido].every((x) => t.includes(x))) melhor = Math.max(melhor, pedido.size); // parte do nome ("estoque")
      else if (!t.length || plano(frase) === textoPlano) melhor = Math.max(melhor, 1);
    }
    return { a, melhor };
  }).filter((x) => x.melhor > 0).sort((x, y) => y.melhor - x.melhor);
  if (!pontos.length) {
    throw new Error(`Nenhum atalho combina com "${q}". ${lista.length ? `Atalhos salvos: ${lista.map((a) => a.nome).join(", ")}.` : "Não há atalhos salvos (cadastre na aba Desk-Automacao_Firebase)."}`);
  }
  if (pontos.length > 1 && pontos[0].melhor === pontos[1].melhor) {
    throw new Error(`"${q}" combina com mais de um atalho (${pontos.filter((x) => x.melhor === pontos[0].melhor).map((x) => x.a.nome).join(", ")}). Pergunte qual.`);
  }
  return pontos[0].a;
}

// Que ação do agente abre cada tipo de atalho.
export function comandoDe(a) {
  if (a.tipo === "site") return { acao: "abrir_url", params: { url: a.alvo } };
  if (a.tipo === "programa") return { acao: "abrir_programa", params: { programa: a.alvo, ...(a.argumentos ? { argumentos: a.argumentos } : {}) } };
  if (a.tipo === "pasta") return { acao: "abrir_pasta", params: { caminho: a.alvo } };
  return { acao: "abrir_arquivo", params: { caminho: a.alvo } };
}

// Pergunta ao agente da máquina quais caminhos existem lá. Devolve { [atalho.id]: true | false | null (site: não se verifica) }.
export async function verificarNaMaquina(alvoMaquina, lista) {
  const itens = lista.filter((a) => a.tipo !== "site");
  const saida = Object.fromEntries(lista.map((a) => [a.id, null]));
  if (!itens.length) return saida;
  const r = await enviarComando(alvoMaquina, "verificar_caminhos", { caminhos: itens.map((a) => a.alvo) });
  if (!r.ok) {
    throw new Error(/desconhecida/.test(r.texto) ? "O agente desta máquina é antigo e não sabe verificar caminhos: abra o Render_Agente.exe novo." : r.texto);
  }
  const { existe = [] } = JSON.parse(r.texto);
  for (const a of itens) saida[a.id] = existe.includes(a.alvo);
  return saida;
}
