// Rotas HTTP da aba Desk-Automacao_Firebase. O servidor chama deskHttp() depois de checar a senha do painel;
// se a rota não for daqui, devolve false e o servidor segue como sempre.
import { paginaDesk } from "./paginas.js";
import { listarMaquinas } from "./maquinas.js";
import { executarNaMaquina } from "./executar.js";
import { PROGRAMAS, ACOES_CARDS } from "./catalogo.js";
import { listarAtalhos, salvarAtalho, apagarAtalho, verificarNaMaquina, validar } from "./atalhos.js";

const plano = (t) => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

async function maquinaDe(nome) {
  const todas = await listarMaquinas();
  const m = todas.filter((x) => x.maquina.toLowerCase() === String(nome ?? "").toLowerCase());
  if (m.length !== 1) throw new Error(`Escolha uma máquina${todas.length ? ` (${todas.map((x) => x.maquina).join(", ")})` : ""}.`);
  return m[0];
}

export async function deskHttp(req, res, caminho, { json, corpoJson }) {
  const resposta = (codigo, obj) => { json(res, codigo, obj); return true; };
  const consulta = new URL(req.url, "http://x").searchParams;

  if (req.method === "GET" && caminho === "/desk") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(paginaDesk());
    return true;
  }
  if (req.method === "GET" && caminho === "/api/desk/maquinas") return resposta(200, await listarMaquinas());
  if (req.method === "GET" && caminho === "/api/desk/catalogo") return resposta(200, PROGRAMAS.map(({ id, nome, processo }) => ({ id, nome, fecha: Boolean(processo) })));
  if (req.method === "GET" && caminho === "/api/desk/acoes") return resposta(200, ACOES_CARDS);
  if (req.method === "POST" && caminho === "/api/desk/executar") {
    try {
      return resposta(200, await executarNaMaquina((await corpoJson(req)) ?? {}));
    } catch (e) {
      return resposta(400, { erro: String(e.message || e) });
    }
  }

  // ---- atalhos salvos (sites, programas, pastas e arquivos do usuário) ----
  if (caminho === "/api/desk/atalhos" || caminho.startsWith("/api/desk/atalhos/")) {
    try {
      if (req.method === "GET" && caminho === "/api/desk/atalhos") {
        return resposta(200, await listarAtalhos());
      }
      if (req.method === "POST" && caminho === "/api/desk/atalhos") {
        const b = (await corpoJson(req)) ?? {};
        const novo = validar(b);                                   // confere tudo antes de gravar
        const existente = (await listarAtalhos()).find((a) => a.tipo === novo.tipo && plano(a.nome) === plano(novo.nome));
        const id = await salvarAtalho({ ...b, id: existente?.id });   // mesmo nome e tipo: atualiza, não duplica
        return resposta(200, { ok: true, id, atualizado: Boolean(existente) });
      }
      if (req.method === "POST" && caminho === "/api/desk/atalhos/verificar") {
        const m = await maquinaDe(((await corpoJson(req)) ?? {}).maquina);
        if (!m.online) throw new Error(`A máquina ${m.maquina} está offline (sem sinal há ${m.visto_ha_s ?? "?"} s).`);
        return resposta(200, await verificarNaMaquina(m, await listarAtalhos()));
      }
      if (req.method === "DELETE") {
        await apagarAtalho(caminho.slice("/api/desk/atalhos/".length));
        return resposta(200, { ok: true });
      }
    } catch (e) {
      return resposta(400, { erro: String(e.message || e) });
    }
  }
  return false;
}
