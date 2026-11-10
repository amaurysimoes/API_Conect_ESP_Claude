// Rotas HTTP da aba Desk-Automacao_Firebase. O servidor chama deskHttp() depois de checar a senha do painel;
// se a rota não for daqui, devolve false e o servidor segue como sempre.
import { paginaDesk } from "./paginas.js";
import { listarMaquinas } from "./maquinas.js";
import { executarNaMaquina } from "./executar.js";
import { PROGRAMAS, ACOES_CARDS } from "./catalogo.js";

export async function deskHttp(req, res, caminho, { json, corpoJson }) {
  const resposta = (codigo, obj) => { json(res, codigo, obj); return true; };

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
  return false;
}
