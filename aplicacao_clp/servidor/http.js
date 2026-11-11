// Rotas HTTP da aba "Conexao Socket-TCP/IP". O servidor chama clpHttp() depois de checar a senha do painel;
// se a rota não for daqui, devolve false e o servidor segue como sempre.
import { paginaClp } from "./paginas.js";
import { listarMaquinas } from "../../aplicacao_desk_agente/agente/maquinas.js";
import { lerConfig, gravarConfig, comandoClp, paramsConexao, paramsEstado, temClp, MODOS } from "./clp.js";

const ACOES = ["identificar", "conectar", "desconectar", "estado", "bit", "zerar"];

async function maquinaDe(nome) {
  const todas = await listarMaquinas();
  const m = todas.filter((x) => x.maquina.toLowerCase() === String(nome ?? "").toLowerCase());
  if (m.length !== 1) throw new Error(`Escolha uma máquina${todas.length ? ` (${todas.map((x) => x.maquina).join(", ")})` : ""}.`);
  return m[0];
}

export async function clpHttp(req, res, caminho, { json, corpoJson }) {
  const resposta = (codigo, obj) => { json(res, codigo, obj); return true; };
  const consulta = new URL(req.url, "http://x").searchParams;

  if (req.method === "GET" && caminho === "/clp") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(paginaClp());
    return true;
  }
  if (!caminho.startsWith("/api/clp/")) return false;

  try {
    if (req.method === "GET" && caminho === "/api/clp/maquinas") {
      return resposta(200, (await listarMaquinas()).map((m) => ({ maquina: m.maquina, broker: m.broker, online: m.online, visto_ha_s: m.visto_ha_s, clp: temClp(m) })));
    }
    if (req.method === "GET" && caminho === "/api/clp/config") {
      return resposta(200, await lerConfig(await maquinaDe(consulta.get("maquina"))));
    }
    if (req.method === "POST" && caminho === "/api/clp/config") {
      const b = (await corpoJson(req)) ?? {};
      return resposta(200, await gravarConfig(await maquinaDe(b.maquina), b.config ?? {}));
    }
    if (req.method === "POST" && caminho === "/api/clp/executar") {
      const b = (await corpoJson(req)) ?? {};
      if (!ACOES.includes(b.acao)) throw new Error(`Ação desconhecida: ${b.acao}. Use: ${ACOES.join(", ")}.`);
      const m = await maquinaDe(b.maquina);
      let params = {};
      let cfgBit = null;
      if (b.acao === "bit") cfgBit = await lerConfig(m);
      if (b.acao === "identificar" || b.acao === "conectar" || b.acao === "estado") {
        const cfg = await lerConfig(m);
        if (b.acao === "conectar") params = paramsConexao(cfg);
        else if (b.acao === "identificar") params = cfg.protocolo === "tcp_ip" ? paramsConexao(cfg) : { ip: String(cfg.ip) };
        else params = paramsEstado(cfg);
      }
      if (b.acao === "bit") {
        if (!Number.isInteger(b.bit)) throw new Error("Falta o número do bit.");
        if (b.modo !== undefined && !MODOS.includes(b.modo)) throw new Error(`Ação inválida: ${b.modo}.`);
        params = { bit: b.bit, modo: b.modo ?? "alternar", ...(b.pulso_ms ? { pulso_ms: Number(b.pulso_ms) } : {}) };
      }
      const r = await comandoClp(m, b.acao, params);
      // TCP/IP: mostra o endereço Modbus realmente usado (endereço base errado = outra memória do CLP)
      if (r.ok && cfgBit && cfgBit.protocolo === "tcp_ip") r.texto += ` (bobina Modbus ${cfgBit.base_m + b.bit}, base ${cfgBit.base_m})`;
      return resposta(200, { maquina: m.maquina, ...r });
    }
  } catch (e) {
    return resposta(400, { erro: String(e.message || e) });
  }
  return false;
}
