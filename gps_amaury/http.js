// Rotas HTTP do módulo maps/GPS. O servidor antigo chama gpsHttp() depois de checar a senha do painel;
// se a rota não for daqui, devolve false e o servidor segue como sempre.
import { paginaEnderecos, paginaGps, menuHtml, CSS_MENU } from "./paginas.js";
import { listarLugaresSalvos, salvarLugar, apagarLugar, idValido } from "./lugaresStore.js";
import { gravarPosicao, lerPosicao } from "./posicao.js";

const limpo = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

export async function gpsHttp(req, res, caminho, { json, corpoJson }) {
  const html = (corpo) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(corpo); return true; };
  const resposta = (codigo, obj) => { json(res, codigo, obj); return true; };

  // Página de pinos original: não editamos o código dela; só somamos o menu à resposta e deixamos o servidor seguir.
  if (req.method === "GET" && caminho === "/") {
    const fim = res.end.bind(res);
    res.end = (corpo, ...resto) =>
      fim(typeof corpo === "string" ? corpo.replace("<body>", `<body>${CSS_MENU}${menuHtml("/")}`) : corpo, ...resto);
    return false;
  }

  if (req.method === "GET" && caminho === "/enderecos") return html(paginaEnderecos());
  if (req.method === "GET" && caminho === "/gps") return html(paginaGps());

  if (caminho === "/api/lugares" || caminho.startsWith("/api/lugares/")) {
    if (req.method === "GET" && caminho === "/api/lugares") return resposta(200, await listarLugaresSalvos());
    if (req.method === "POST" && caminho === "/api/lugares") {
      const b = (await corpoJson(req)) ?? {};
      const lugar = { id: b.id, nome: limpo(b.nome, 80), endereco: limpo(b.endereco, 200), cep: limpo(b.cep, 12) };
      if (!lugar.nome || !lugar.endereco) return resposta(400, { erro: "Preencha nome e endereço." });
      return resposta(200, { ok: true, id: await salvarLugar(lugar) });
    }
    if (req.method === "DELETE") {
      const id = caminho.slice("/api/lugares/".length);
      if (!idValido(id)) return resposta(400, { erro: "id inválido" });
      await apagarLugar(id);
      return resposta(200, { ok: true });
    }
  }

  if (caminho === "/api/posicao") {
    if (req.method === "GET") return resposta(200, lerPosicao());
    if (req.method === "POST") {
      const { lat, lng, precisao } = (await corpoJson(req)) ?? {};
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return resposta(400, { erro: "posição inválida" });
      gravarPosicao({ lat, lng, precisao: Number.isFinite(precisao) ? precisao : null });
      return resposta(200, { ok: true });
    }
  }
  return false;
}
