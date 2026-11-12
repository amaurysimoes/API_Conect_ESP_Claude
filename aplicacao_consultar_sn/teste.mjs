// Teste do módulo Consultar Serial (sem câmera, sem Render, sem custo):
//  1) a biblioteca ZXing (a mesma que vai ao celular) lê imagens geradas de VÁRIOS padrões (barras, QR, Data Matrix...);
//  2) rotas HTTP (página da câmera, link de uso único, aba /serial, gravação da leitura);
//  3) a ferramenta consultar_serial do Claude (passo 1 gera o link, passo 2 devolve "Código lido").
// O que só se confere no celular de verdade: permissão da câmera, foco, moldura vermelha/verde (veja o CLAUDE.md).
// Rodar (na pasta api_conect):  node aplicacao_consultar_sn/teste.mjs
import http from "node:http";
import assert from "node:assert/strict";
import sharp from "sharp";
import bwipjs from "bwip-js";

process.env.DOCS_URL_PUBLICA = "http://127.0.0.1:4599";
const { snHttp, snPainelHttp } = await import("./http.js");
const { instalarSn } = await import("./mcpSn.js");
let ok = 0;
const confere = (c, msg) => { assert.ok(c, msg); ok++; console.log("  ✓", msg); };

console.log("Leitura de vários padrões (zxing-wasm, o mesmo motor que vai ao celular)");
import { readBarcodes } from "zxing-wasm/reader";
async function ler(png) {
  const { data, info } = await sharp(png).flatten({ background: "#ffffff" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rs = await readBarcodes({ data: new Uint8ClampedArray(data), width: info.width, height: info.height, colorSpace: "srgb" }, { tryHarder: true, maxNumberOfSymbols: 1, formats: [] });
  return rs.length ? { texto: rs[0].text, formato: rs[0].format, posicao: rs[0].position } : { texto: null };
}
const casos = [
  ["code128", "SN2024AB123456", "Code128"], ["code39", "ABC-123456", "Code39"], ["code93", "SERIAL93", "Code93", { includecheck: true }],
  ["ean13", "7891234567895", "EAN13"], ["ean8", "40170725", "EAN8"], ["upca", "036000291452", "EAN13", {}, "0036000291452"],
  ["interleaved2of5", "12345670", "ITF"], ["rationalizedCodabar", "A123456B", "Codabar"],
  ["qrcode", "SN:ABC-9988-XYZ", "QRCode"], ["datamatrix", "SN0099887766", "DataMatrix"],
  ["azteccode", "AZ-554433", "Aztec"], ["pdf417", "PDF417-SERIAL-77", "PDF417"],
];
for (const [bcid, texto, esperado, extra = {}, lido = texto] of casos) {
  const png = await bwipjs.toBuffer({ bcid, text: texto, scale: 4, includetext: false, paddingwidth: 12, paddingheight: 12, backgroundcolor: "FFFFFF", ...extra });
  const r = await ler(png);
  confere(r.texto === lido && r.formato === esperado && r.posicao?.topLeft && r.posicao?.bottomRight, `${esperado}: leu "${lido}", identificou o padrão e deu os cantos`);
}
// foto "ruim": código reduzido, com ruído e levemente girado
const png = await bwipjs.toBuffer({ bcid: "code128", text: "SN-RUIDO-2026", scale: 3, includetext: false, paddingwidth: 20, paddingheight: 20, backgroundcolor: "FFFFFF" });
const ruim = await sharp(png).rotate(3, { background: "#ffffff" }).blur(0.8).linear(0.8, 20).png().toBuffer();
confere((await ler(ruim)).texto === "SN-RUIDO-2026", "Code 128 girado 3° e desfocado ainda é lido");

console.log("Rotas HTTP");
const json = (res, c, o) => { res.writeHead(c, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
const srv = http.createServer(async (req, res) => {
  const caminho = req.url.split("?")[0];
  if (await snHttp(req, res, caminho, { json })) return;       // antes da senha
  if (await snPainelHttp(req, res, caminho)) return;           // aba (a senha fica no servidor.js)
  json(res, 404, {});
});
await new Promise((r) => srv.listen(4599, "127.0.0.1", r));
const U = "http://127.0.0.1:4599";
const tools = {};
instalarSn({ registerTool: (nome, _def, fn) => { tools[nome] = fn; } });
const texto = async (args) => (await tools.consultar_serial(args)).content[0].text;

let r = await fetch(`${U}/serial/zxing.js`);
confere(r.status === 200 && (await r.text()).includes("readBarcodes"), "biblioteca de leitura servida (/serial/zxing.js)");
r = await fetch(`${U}/serial/zxing_reader.wasm`);
confere(r.status === 200 && r.headers.get("content-type") === "application/wasm" && (await r.arrayBuffer()).byteLength > 500000, "motor WebAssembly servido (application/wasm)");
r = await fetch(`${U}/serial/cliente.js`);
const cliente = await r.text();
confere(r.status === 200 && cliente.includes("readBarcodes") && cliente.includes("#ef4444") && cliente.includes("#22c55e"), "cliente.js servido (vermelho/verde, leitura por zxing-wasm)");
r = await fetch(`${U}/serial/${"0".repeat(48)}`);
confere(r.status === 410 && (await r.text()).includes("Link expirado"), "token falso: página 'link expirado' (410)");

console.log("Ferramenta consultar_serial");
const passo1 = await texto({});
const token = passo1.match(/\/serial\/([0-9a-f]{48})/)?.[1];
confere(!!token && passo1.includes(`${U}/serial/${token}`), "passo 1: devolve o link com token (sem esperar)");
r = await fetch(`${U}/serial/${token}`);
const pagina = await r.text();
confere(r.status === 200 && pagina.includes('id="v"') && pagina.includes("/serial/zxing.js") && pagina.includes(`data-token="${token}"`) && !pagina.includes("<nav>"), "link: página da câmera em tela cheia (sem menu)");
confere((await texto({ token, esperar_segundos: 0 })).includes("Ainda não foi lido"), "passo 2 antes de escanear: avisa que ainda não leu");
r = await fetch(`${U}/api/serial/${token}/resultado`, { method: "POST", body: JSON.stringify({ texto: "SN2024AB123456", formato: "Code 128" }) });
confere(r.status === 200, "celular grava a leitura (POST)");
const passo2 = await texto({ token, esperar_segundos: 2 });
confere(passo2.startsWith("Código lido: SN2024AB123456") && passo2.includes("Padrão: Code 128"), `passo 2: "${passo2.split("\n")[0]}"`);
r = await fetch(`${U}/api/serial/${token}/resultado`, { method: "POST", body: JSON.stringify({ texto: "   ", formato: "x" }) });
confere(r.status === 400, "leitura vazia é recusada");
r = await fetch(`${U}/api/serial/${"1".repeat(48)}/resultado`, { method: "POST", body: JSON.stringify({ texto: "X" }) });
confere(r.status === 400, "gravar em link inexistente é recusado");
confere((await texto({ token: "f".repeat(48) })).includes("expirou"), "token inexistente no passo 2: avisa que expirou");
const outro = (await texto({})).match(/\/serial\/([0-9a-f]{48})/)?.[1];
confere(outro && outro !== token, "nova consulta sem token gera link novo");

console.log("Aba Consulta Serial");
r = await fetch(`${U}/serial`);
const aba = await r.text();
confere(r.status === 200 && aba.includes("<nav>") && aba.includes("Consulta Serial") && aba.includes("Documentos Database") && /data-token="[0-9a-f]{48}"/.test(aba), "aba /serial: câmera com o menu do site e sessão própria");
const tokenAba = aba.match(/data-token="([0-9a-f]{48})"/)[1];
r = await fetch(`${U}/api/serial/${tokenAba}/resultado`, { method: "POST", body: JSON.stringify({ texto: "QR-ABA-1", formato: "QR Code" }) });
confere(r.status === 200 && (await texto({ token: tokenAba, esperar_segundos: 1 })).includes("QR-ABA-1"), "leitura feita na aba também chega à IA");

srv.close();
console.log(`\n${ok} verificações passaram.`);
process.exit(0);
