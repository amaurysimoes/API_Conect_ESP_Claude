// Diagnóstico do conector: guarda (só na memória, últimas 120) as requisições que chegam ao servidor, com os tokens escondidos,
// para ver o que o Claude pede ao cadastrar o conector. Não altera nenhuma resposta. A lista aparece em /diagnostico (com a senha do painel)
// e cada linha também vai para os Logs do Render. Liga-se sozinho quando este módulo é importado (http.js).
import http from "node:http";

const ultimas = [];
let ligado = false;

// esconde tokens: /mcp/<token>, /serial/<token>, /api/serial/<token>/..., /api/docs/agente/<token>/...
const redigir = (url) => String(url).split("?")[0]
  .replace(/^\/mcp\/.+/, "/mcp/***")
  .replace(/([0-9a-f]{48})/g, "***");

export function ligarRegistro() {
  if (ligado) return;
  ligado = true;
  const emitOriginal = http.Server.prototype.emit;
  http.Server.prototype.emit = function (evento, req, res, ...resto) {
    if (evento === "request" && req && res && req.url !== "/saude") {
      const t0 = Date.now();
      const linha = {
        quando: new Date().toISOString(),
        metodo: req.method,
        caminho: redigir(req.url),
        ua: String(req.headers["user-agent"] ?? "").slice(0, 70),
        de: String(req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "").split(",")[0].trim(),
        accept: String(req.headers.accept ?? "").slice(0, 50),
      };
      res.once("close", () => {
        linha.status = res.writableFinished ? res.statusCode : `${res.statusCode}(interrompida)`;
        linha.ms = Date.now() - t0;
        ultimas.push(linha);
        if (ultimas.length > 120) ultimas.shift();
        console.log(`[req] ${linha.metodo} ${linha.caminho} -> ${linha.status} ${linha.ms}ms de=${linha.de} ua=${linha.ua}`);
      });
    }
    return emitOriginal.call(this, evento, req, res, ...resto);
  };
}

export const relatorio = () =>
  `Últimas ${ultimas.length} requisições (mais recente primeiro; /saude fica de fora; tokens escondidos)\n` +
  `agora: ${new Date().toISOString()}\n\n` +
  ultimas.slice().reverse().map((l) => `${l.quando}  ${String(l.metodo).padEnd(6)} ${l.caminho}  ->  ${l.status}  ${l.ms}ms\n    de=${l.de}  ua=${l.ua}  accept=${l.accept}`).join("\n");
