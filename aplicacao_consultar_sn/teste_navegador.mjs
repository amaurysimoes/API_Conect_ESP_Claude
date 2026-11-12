// Teste da página da câmera no Chromium de verdade com CÂMERA SIMULADA (vídeo MJPEG com um código de barras / QR):
// confere moldura vermelha sem código, leitura automática, padrão mostrado, painel e envio ao servidor.
// Precisa do Chromium do Playwright já baixado e do pacote (sem gravar no package.json):  npm i --no-save playwright-core
// Rodar (na pasta api_conect):  node aplicacao_consultar_sn/teste_navegador.mjs   (o Chromium é achado em %USERPROFILE%\AppData\Local\ms-playwright)
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import bwipjs from "bwip-js";
import { chromium } from "playwright-core";

const RAIZ = new URL("..", import.meta.url).pathname.slice(1).replace(/\/$/, "");
process.env.DOCS_URL_PUBLICA = "http://127.0.0.1:4601";
const { snHttp, snPainelHttp } = await import("file:///" + RAIZ + "/aplicacao_consultar_sn/http.js");
const { criarSessao, aguardarLeitura } = await import("file:///" + RAIZ + "/aplicacao_consultar_sn/sessao.js");

const json = (res, c, o) => { res.writeHead(c, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
const srv = http.createServer(async (req, res) => {
  const caminho = req.url.split("?")[0];
  if (await snHttp(req, res, caminho, { json })) return;
  if (await snPainelHttp(req, res, caminho)) return;
  json(res, 404, {});
});
await new Promise((r) => srv.listen(4601, "127.0.0.1", r));

async function video(bcid, texto, extra = {}) {
  const codigo = await bwipjs.toBuffer({ bcid, text: texto, scale: 5, paddingwidth: 14, paddingheight: 14, backgroundcolor: "FFFFFF", ...extra });
  const quadro = await sharp({ create: { width: 1280, height: 720, channels: 3, background: "#777777" } })
    .composite([{ input: await sharp(codigo).resize({ width: 700, height: 420, fit: "inside" }).toBuffer(), gravity: "center" }]).jpeg({ quality: 92 }).toBuffer();
  const arq = path.join(os.tmpdir(), `fake_${bcid}.mjpeg`);
  fs.writeFileSync(arq, Buffer.concat(Array(40).fill(quadro)));
  return arq;
}
const vazio = path.join(os.tmpdir(), "fake_vazio.mjpeg");
fs.writeFileSync(vazio, Buffer.concat(Array(40).fill(await sharp({ create: { width: 1280, height: 720, channels: 3, background: "#777777" } }).jpeg().toBuffer())));

const PW = process.env.USERPROFILE + "/AppData/Local/ms-playwright";
const pasta = fs.readdirSync(PW).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
const EXE = `${PW}/${pasta}/chrome-win64/chrome.exe`;
let falhas = 0;
const confere = (c, m) => { if (c) console.log("  ✓", m); else { console.log("  ✗", m); falhas++; } };

async function rodar(bcid, texto, formatoEsperado, extra, modoAba) {
  const arqVideo = texto === null ? vazio : await video(bcid, texto, extra);
  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${arqVideo}`, "--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, permissions: ["camera"] });
  const page = await ctx.newPage();
  const erros = []; page.on("pageerror", (e) => erros.push(e.message)); page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) erros.push(m.text()); });   // 404 = imagem de fundo do menu (outro módulo, fora deste teste)
  let token;
  if (modoAba) { await page.goto("http://127.0.0.1:4601/serial"); token = await page.evaluate(() => document.body.dataset.token); }
  else { token = criarSessao(); await page.goto(`http://127.0.0.1:4601/serial/${token}`); }
  if (texto === null) {
    await page.waitForTimeout(4000);
    const estado = await page.textContent("#estado");
    const pintou = await page.evaluate(() => { const c = document.getElementById("o"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let verm = 0, verde = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 200) { if (d[i] > 200 && d[i + 1] < 90) verm++; if (d[i + 1] > 150 && d[i] < 90) verde++; } } return { verm, verde }; });
    confere(/Aponte/.test(estado) && pintou.verm > 500 && pintou.verde === 0, `sem código: moldura VERMELHA (${pintou.verm} px) e nenhum verde; "${estado}"`);
    confere(erros.length === 0, "sem erros no console" + (erros.length ? ": " + erros.join(" | ") : ""));
  } else {
    const l = await aguardarLeitura(token, 25000);
    confere(!!l && l.texto === texto, `${bcid}: leitura automática chegou ao servidor ("${l?.texto}")`);
    confere(l && l.formato === formatoEsperado, `padrão mostrado: ${l?.formato}`);
    const painel = await page.evaluate(() => ({ on: document.getElementById("painel").classList.contains("on"), lido: document.getElementById("lido").textContent, padrao: document.getElementById("padrao").textContent, envio: document.getElementById("envio").textContent }));
    confere(painel.on && painel.lido === texto && /Enviado/.test(painel.envio), `painel "Código lido: ${painel.lido}" · ${painel.padrao} · ${painel.envio}`);
    confere(erros.length === 0, "sem erros no console" + (erros.length ? ": " + erros.join(" | ") : ""));
    if (bcid === "code128") await page.screenshot({ path: path.join(os.tmpdir(), "serial_tela.png") });
  }
  await browser.close();
}

console.log("Sem código na câmera"); await rodar("x", null);
console.log("Code 128 (link)"); await rodar("code128", "SN2024AB123456", "Code 128");
console.log("QR Code (aba com menu)"); await rodar("qrcode", "SN:ABC-9988-XYZ", "QR Code", {}, true);
console.log("Data Matrix"); await rodar("datamatrix", "SN0099887766", "Data Matrix");
console.log("EAN-13"); await rodar("ean13", "7891234567895", "EAN-13 / UPC-A");
srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo no navegador (câmera simulada).");
process.exit(falhas ? 1 : 0);
