// Regra única para "fazer algo numa máquina": usada pelo Claude (MCP) e pela aba Desk-Automacao_Firebase.
import { listarMaquinas, enviarComando } from "./maquinas.js";
import { resolverPrograma } from "./catalogo.js";
import { listarAtalhos, acharAtalho, comandoDe } from "./atalhos.js";

export const ACOES = ["info", "abrir_programa", "abrir_url", "abrir_pasta", "abrir_arquivo", "fechar_programa",
  "bloquear_tela", "desligar", "reiniciar", "cancelar_desligamento", "abrir_atalho"];

// Acha a máquina pedida. Sem nome: se só uma está ativa usa ela; senão devolve a pergunta para o usuário.
export async function escolher(maquina) {
  const todas = await listarMaquinas();
  if (!todas.length) throw new Error("Nenhuma máquina cadastrada no Firebase.");
  if (maquina) {
    const m = todas.filter((x) => x.maquina.toLowerCase() === String(maquina).toLowerCase());
    if (m.length !== 1) throw new Error(`Máquina "${maquina}" ${m.length ? "existe em mais de um broker" : "não encontrada"}. Máquinas: ${todas.map((x) => x.maquina).join(", ")}.`);
    return m[0];
  }
  const ativas = todas.filter((x) => x.online);
  if (ativas.length === 1) return ativas[0];
  throw new Error(ativas.length
    ? `Há ${ativas.length} máquinas ativas: ${ativas.map((x) => x.maquina).join(", ")}. Pergunte ao usuário: "Qual máquina?".`
    : `Nenhuma máquina está ativa agora (${todas.map((x) => `${x.maquina}: sem sinal há ${x.visto_ha_s ?? "?"} s`).join("; ")}). Avise o usuário para ligar o agente.`);
}

export async function executarNaMaquina({ maquina, acao, programa, argumentos, url, caminho, confirmado, atalho }) {
  if (!ACOES.includes(acao)) throw new Error(`Ação desconhecida: ${acao}. Use: ${ACOES.join(", ")}.`);
  if ((acao === "desligar" || acao === "reiniciar") && confirmado !== true) {
    throw new Error(`"${acao}" exige confirmação: pergunte ao usuário se tem certeza e repita com confirmado=true.`);
  }
  const alvo = await escolher(maquina);
  if (!alvo.online) throw new Error(`A máquina ${alvo.maquina} está offline (sem sinal há ${alvo.visto_ha_s ?? "?"} s). Avise o usuário.`);

  // Atalho salvo: vira a ação certa (site, programa, pasta ou arquivo). O agente diz se o caminho não existe nessa máquina.
  if (acao === "abrir_atalho") {
    const a = acharAtalho(await listarAtalhos(), atalho);
    const c = comandoDe(a);
    const r = await enviarComando(alvo, c.acao, c.params);
    return { maquina: alvo.maquina, ok: r.ok, texto: r.ok ? `${a.nome}: ${r.texto}` : `${a.nome}: ${r.texto}` };
  }

  const p = {};
  if (acao === "abrir_programa" || acao === "fechar_programa") {
    if (!programa) throw new Error("Diga qual programa (nome ou caminho).");
    const r = resolverPrograma(programa);
    if (acao === "abrir_programa") { p.programa = r.alvo; if (argumentos) p.argumentos = argumentos; }
    else p.programa = r.processo ?? r.alvo;
  }
  if (acao === "abrir_url") { if (!url) throw new Error("Diga o endereço (url)."); p.url = url; }
  if (acao === "abrir_pasta" || acao === "abrir_arquivo") { if (!caminho) throw new Error("Diga o caminho."); p.caminho = caminho; }
  if (acao === "desligar" || acao === "reiniciar") p.confirmado = true;

  const r = await enviarComando(alvo, acao, p);
  return { maquina: alvo.maquina, ...r };
}
