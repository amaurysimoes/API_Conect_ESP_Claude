// Módulo "Conexao Socket-TCP/IP": CLPs/equipamentos EtherNet/IP ligados à rede RJ45 de uma máquina com o agente.
// O servidor NÃO fala com o CLP: manda comandos ASSINADOS (clp_*) à máquina, que tem o cabo na rede do CLP.
// A configuração (IP, tamanhos, pontos com nome/ação) fica em brokers/<broker>/maquinas/<maquina>/clp_config.
import { DB_URL } from "../../iot_automacao_esp/firebase.js";
import { listarMaquinas, enviarComando } from "../../aplicacao_desk_agente/agente/maquinas.js";

export const MODOS = ["alternar", "pulso", "set", "reset"];
export const PADRAO = {
  ip: "", ip_local: "", primeiro_bit: 512, ot_size: 32, to_size: 32, rpi_ms: 20, multicast: true,
  inst_cfg: 1, inst_ot: 150, inst_to: 100, pontos: {},
};
const plano = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

async function rest(metodo, caminho, corpo) {
  const r = await fetch(`${DB_URL}/${caminho}.json`, {
    method: metodo, headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Firebase ${metodo} /${caminho} -> ${r.status}`);
  return r.json();
}
const caminhoCfg = (m) => `brokers/${m.broker}/maquinas/${m.maquina}/clp_config`;

const inteiro = (v, nome, min, max, padrao) => {
  if (v === undefined || v === null || v === "") return padrao;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${nome} deve ser um número inteiro de ${min} a ${max}.`);
  return n;
};

// Confere tudo antes de gravar. Devolve a configuração limpa.
export function validarConfig(b = {}) {
  const ip = String(b.ip ?? "").trim(), ipLocal = String(b.ip_local ?? "").trim();
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  for (const [rotulo, v] of [["IP do CLP", ip], ["IP deste PC", ipLocal]]) {
    if (v && (!ipv4.test(v) || v.split(".").some((x) => Number(x) > 255))) throw new Error(`${rotulo} inválido: ${v}`);
  }
  const primeiro = inteiro(b.primeiro_bit, "Primeiro bit", 0, 1_000_000, PADRAO.primeiro_bit);
  const pontos = {};
  const lista = Array.isArray(b.pontos) ? b.pontos : Object.values(b.pontos ?? {});
  if (lista.length > 512) throw new Error("No máximo 512 pontos.");
  for (const p of lista) {
    const numero = inteiro(p.numero, "Número do bit", 0, 1_000_000);
    if (numero === undefined) continue;
    const modo = p.modo ?? "pulso";
    if (!MODOS.includes(modo)) throw new Error(`Ação inválida no bit ${numero}: ${modo}.`);
    const nome = String(p.nome ?? "").trim().slice(0, 40);
    if (/[\u0000-\u001f]/.test(nome)) throw new Error(`Nome inválido no bit ${numero}.`);
    pontos[numero] = { numero, nome, modo, pulso_ms: inteiro(p.pulso_ms, "Pulso (ms)", 10, 5000, 500) };
  }
  return {
    ip, ip_local: ipLocal, primeiro_bit: primeiro,
    ot_size: inteiro(b.ot_size, "Bytes PC→CLP", 0, 256, PADRAO.ot_size), to_size: inteiro(b.to_size, "Bytes CLP→PC", 0, 256, PADRAO.to_size),
    rpi_ms: inteiro(b.rpi_ms, "RPI (ms)", 1, 3200, PADRAO.rpi_ms), multicast: b.multicast === undefined ? PADRAO.multicast : Boolean(b.multicast),
    inst_cfg: inteiro(b.inst_cfg, "Instância de configuração", 0, 65535, PADRAO.inst_cfg),
    inst_ot: inteiro(b.inst_ot, "Instância O→T", 0, 65535, PADRAO.inst_ot), inst_to: inteiro(b.inst_to, "Instância T→O", 0, 65535, PADRAO.inst_to),
    pontos,
  };
}

export async function lerConfig(m) {
  const salvo = await rest("GET", caminhoCfg(m));
  return salvo ? { ...PADRAO, ...validarConfig(salvo) } : { ...PADRAO, pontos: {} };
}
export async function gravarConfig(m, b) {
  const cfg = validarConfig(b);
  await rest("PUT", caminhoCfg(m), cfg);
  return cfg;
}

export const temClp = (m) => Array.isArray(m.acoes) && m.acoes.includes("clp_conectar");

// Acha a máquina. Sem nome: a única ativa com "Ativar Conexao CLP: EtherNet/IP" marcado; senão devolve a pergunta/aviso.
export async function escolherMaquinaClp(nome) {
  const todas = await listarMaquinas();
  if (!todas.length) throw new Error("Nenhuma máquina cadastrada no Firebase.");
  if (nome) {
    const m = todas.filter((x) => x.maquina.toLowerCase() === String(nome).toLowerCase());
    if (m.length !== 1) throw new Error(`Máquina "${nome}" ${m.length ? "existe em mais de um broker" : "não encontrada"}. Máquinas: ${todas.map((x) => x.maquina).join(", ")}.`);
    return m[0];
  }
  const prontas = todas.filter((x) => x.online && temClp(x));
  if (prontas.length === 1) return prontas[0];
  if (prontas.length > 1) throw new Error(`Há ${prontas.length} máquinas com a conexão CLP ligada: ${prontas.map((x) => x.maquina).join(", ")}. Pergunte ao usuário: "Qual máquina?".`);
  const ativas = todas.filter((x) => x.online);
  throw new Error(ativas.length
    ? `Nenhuma máquina ativa está com "Ativar Conexao CLP: EtherNet/IP" marcado (ativas: ${ativas.map((x) => x.maquina).join(", ")}). Avise o usuário para marcar essa opção no menu do ícone do agente.`
    : `Nenhuma máquina está ativa agora (${todas.map((x) => `${x.maquina}: sem sinal há ${x.visto_ha_s ?? "?"} s`).join("; ")}). Avise o usuário para ligar o agente.`);
}

// Manda uma ação clp_* à máquina. Exige máquina ativa e com o checkbox marcado.
export async function comandoClp(m, acao, params = {}) {
  if (!m.online) throw new Error(`A máquina ${m.maquina} está offline (sem sinal há ${m.visto_ha_s ?? "?"} s).`);
  if (!temClp(m)) throw new Error(`Na máquina ${m.maquina}, marque "Ativar Conexao CLP: EtherNet/IP" no menu do ícone do agente (bandeja).`);
  return enviarComando(m, `clp_${acao}`, params);
}

export function paramsConexao(cfg) {
  const { ip, ip_local, primeiro_bit, ot_size, to_size, rpi_ms, multicast, inst_cfg, inst_ot, inst_to } = cfg;
  if (!ip) throw new Error("Falta o IP do CLP (preencha na aba Conexao Socket-TCP/IP e salve).");
  return { ip, ip_local, primeiro_bit, ot_size, to_size, rpi_ms, multicast, inst_cfg, inst_ot, inst_to };
}

// Lê o estado ao vivo: { conectado, primeiro_bit, saida:[bytes], entrada:[bytes], ... }
export async function lerEstado(m) {
  const r = await comandoClp(m, "estado");
  if (!r.ok) throw new Error(r.texto);
  const e = JSON.parse(r.texto);
  return e.conectado ? { ...e, saida: Buffer.from(e.saida, "hex"), entrada: Buffer.from(e.entrada, "hex") } : e;
}
export const bitLigado = (dados, bit, primeiro) => {
  const i = bit - primeiro;
  return i >= 0 && (i >> 3) < dados.length && (dados[i >> 3] & (1 << (i & 7))) !== 0;
};

// "bit 512", "512" ou palavras do nome ("garra") -> ponto salvo
export function acharPonto(cfg, texto) {
  const pontos = Object.values(cfg.pontos);
  const t = plano(texto);
  if (/^\d+$/.test(t)) {
    const p = pontos.find((x) => x.numero === Number(t));
    return p ?? { numero: Number(t), nome: "", modo: "pulso", pulso_ms: 500 };   // número fora da lista: pulso padrão
  }
  const com_nome = pontos.filter((p) => p.nome);
  const exato = com_nome.filter((p) => plano(p.nome) === t);
  const lista = exato.length ? exato : com_nome.filter((p) => plano(p.nome).includes(t) || t.includes(plano(p.nome)));
  if (lista.length === 1) return lista[0];
  throw new Error(lista.length
    ? `"${texto}" combina com mais de um ponto: ${lista.map((p) => `${p.numero} (${p.nome})`).join(", ")}. Pergunte ao usuário qual.`
    : `Nenhum ponto chamado "${texto}". Pontos salvos: ${com_nome.map((p) => `${p.numero} (${p.nome})`).join(", ") || "(nenhum com nome)"}.`);
}
