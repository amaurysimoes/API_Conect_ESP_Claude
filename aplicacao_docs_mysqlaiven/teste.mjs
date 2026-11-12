// Teste de ponta a ponta do módulo Documentos Database. Usa o Aiven DE VERDADE (variáveis DOCS_DB_* do .env) mas só mexe em
// documentos com nome "__teste_docs__*", que ele mesmo apaga no fim. Também liga o agente Python (acoes_docs.py) a um servidor local.
// Rodar (na pasta api_conect):  node --env-file=.env aplicacao_docs_mysqlaiven/teste.mjs
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync, unzipSync, strToU8 } from "fflate";
import sharp from "sharp";
import XLSX from "xlsx";

const { enviarDocumento, listarDocumentos, baixarDocumento, lerDocumento, buscarDocumentos, excluirDocumento } = await import("./documentos.js");
const { docsHttp, docsAgenteHttp } = await import("./http.js");
const { criarTrabalho, aguardar } = await import("./trabalhos.js");
const rodaAsync = (cmd, args, opc) => new Promise((res) => { let out = ""; const c = spawn(cmd, args, opc); c.stdout.on("data", (d) => (out += d)); c.on("close", () => res({ stdout: out })); });
let ok = 0;
const confere = (c, msg) => { assert.ok(c, msg); ok++; console.log("  ✓", msg); };

// imagem de verdade (ruído, para a compactação ter o que fazer)
const ruido = Buffer.alloc(600 * 400 * 3); for (let i = 0; i < ruido.length; i++) ruido[i] = (((i / 3) % 600) * 255 / 600 + Math.random() * 40) & 255; // degradê com ruído, como uma foto
const png = await sharp(ruido, { raw: { width: 600, height: 400, channels: 3 } }).png().toBuffer();
const xlsx = Buffer.from(zipSync({
  "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/></Types>'),
  "xl/workbook.xml": strToU8('<workbook xmlns:r="x"><sheets><sheet name="Dados" sheetId="1" r:id="rId1"/></sheets></workbook>'),
  "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
  "xl/sharedStrings.xml": strToU8("<sst><si><t>Olá mundo &amp; cia</t></si></sst>"),
  "xl/worksheets/sheet1.xml": strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42</v></c></row></sheetData></worksheet>'),
  "xl/media/image1.png": png,
}));
const docx = Buffer.from(zipSync({
  "[Content_Types].xml": strToU8("<Types/>"),
  "word/document.xml": strToU8('<w:document><w:body><w:p><w:r><w:t>Primeiro parágrafo</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Célula A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Célula B</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'),
  "word/media/image1.png": png,
}));
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["codigo", "valor"], ["XPTO-9", 7]]), "Antiga");
const xls = XLSX.write(wb, { bookType: "biff8", type: "buffer" });
const falsoDoc = Buffer.from("conteúdo qualquer de um .doc antigo".repeat(50));

const N = { x: "__teste_docs__planilha.xlsx", d: "__teste_docs__texto.docx", s: "__teste_docs__antiga.xls", o: "__teste_docs__velho.doc", a: "__teste_docs__do_agente.docx", p: "__teste_docs__arquivo.pdf", t: "__teste_docs__nota.txt", i: "__teste_docs__foto.jpg", z: "__teste_docs__estranho.zzz", m: "__teste_docs__menu.pdf" };
async function limpa() { for (const n of Object.values(N)) await excluirDocumento(n).catch(() => {}); }
await limpa();
const midia = (buf, p) => unzipSync(new Uint8Array(buf))[p];
try {
  console.log("Envio e leitura");
  let r = await enviarDocumento(N.x, xlsx);
  confere(r.imagens === 1 && r.tam_armazenado < r.tam_original, `xlsx enviado: 1 imagem compactada (${r.tam_original} → ${r.tam_armazenado} bytes)`);
  await enviarDocumento(N.d, docx); await enviarDocumento(N.s, xls); await enviarDocumento(N.o, falsoDoc);
  const todos = (await listarDocumentos("")).filter((d) => d.nome.startsWith("__teste_docs__"));
  confere(todos.length === 4 && todos.every((d) => d.completo), "listar: 4 documentos completos");
  confere((await listarDocumentos("docx")).some((d) => d.nome === N.d) && !(await listarDocumentos("docx")).some((d) => d.nome === N.x), "filtro por extensão docx");
  await assert.rejects(() => listarDocumentos("pdf!"), /inválida/); ok++;
  await assert.rejects(() => enviarDocumento("x.bat", Buffer.from("a")), /não são aceitos/); ok++;
  confere((await lerDocumento(N.x)).texto.includes("A=Olá mundo & cia | B=42"), "ler xlsx: texto e número da célula");
  confere((await lerDocumento(N.d)).texto.includes("Primeiro parágrafo") && (await lerDocumento(N.d)).texto.includes("Célula A | Célula B"), "ler docx: parágrafo e tabela");
  confere((await lerDocumento(N.s)).texto.includes("XPTO-9"), "ler xls antigo");
  const b = await buscarDocumentos("OLA MUNDO", "xlsx");
  confere(b.achados.some((a) => a.documento === N.x), "buscar sem diferenciar maiúscula/acento");

  console.log("Baixar (remonta o arquivo)");
  const x2 = await baixarDocumento(N.x);
  const m = midia(x2, "xl/media/image1.png");
  const info = await sharp(Buffer.from(m)).metadata();
  confere(info.format === "png" && info.width === 600 && info.height === 400, "xlsx baixado: imagem PNG 600x400 de volta ao arquivo");
  confere(unzipSync(new Uint8Array(x2))["xl/workbook.xml"].length > 0, "xlsx baixado: demais partes intactas");
  const d2 = await baixarDocumento(N.d);
  confere(midia(d2, "word/media/image1.png").length > 1000, "docx baixado com a imagem");
  confere((await baixarDocumento(N.o)).equals(falsoDoc) && (await baixarDocumento(N.s)).equals(xls), "doc e xls: bytes idênticos aos enviados");

  console.log("Qualquer tipo de documento");
  const pdfTexto = (t) => { const c = `BT /F1 18 Tf 20 100 Td (${t}) Tj ET`; return Buffer.from(`%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${c.length}>>stream
${c}
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R/Size 6>>
%%EOF`); };
  const pdf = pdfTexto("Ola PDF Teste Aiven");
  await enviarDocumento(N.p, pdf);
  confere((await lerDocumento(N.p)).texto.includes("Ola PDF Teste Aiven"), "pdf: guarda e a IA lê o texto");
  await enviarDocumento(N.t, Buffer.from("linha um\nárvore verde\n"));
  confere((await lerDocumento(N.t)).texto.includes("árvore verde"), "txt: lido");
  const jpg = await sharp(ruido, { raw: { width: 600, height: 400, channels: 3 } }).jpeg().toBuffer();
  await enviarDocumento(N.i, jpg);
  confere((await baixarDocumento(N.i)).equals(jpg), "jpg solto: guardado e baixado idêntico");
  await enviarDocumento(N.z, Buffer.from("qualquer coisa"));
  confere((await baixarDocumento(N.z)).toString() === "qualquer coisa", "extensão desconhecida (.zzz): aceita e baixa");
  await assert.rejects(() => lerDocumento(N.z), /leitor de texto/); ok++;
  await assert.rejects(() => enviarDocumento("virus.exe", Buffer.from("MZ")), /não são aceitos/); ok++;
  await assert.rejects(() => enviarDocumento("semextensao", Buffer.from("a")), /extensão/i); ok++;
  confere((await listarDocumentos("pdf")).some((d) => d.nome === N.p), "filtro por pdf");

  console.log("Reenvio substitui");
  r = await enviarDocumento(N.x, xlsx);
  confere(r.substituido === true && (await listarDocumentos("xlsx")).filter((d) => d.nome === N.x).length === 1, "mesmo nome: substitui, sem duplicar");

  console.log("HTTP + agente Python");
  const json = (res, c, o) => { res.writeHead(c, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  const corpoJson = async (req) => { let s = ""; for await (const c of req) s += c; return s ? JSON.parse(s) : undefined; };
  const srv = http.createServer(async (req, res) => {
    const caminho = req.url.split("?")[0];
    if (await docsAgenteHttp(req, res, caminho, { json })) return;
    if (await docsHttp(req, res, caminho, { json, corpoJson })) return;
    json(res, 404, {});
  });
  await new Promise((r) => srv.listen(4597, "127.0.0.1", r));
  const URL_ = "http://127.0.0.1:4597";
  const pagina = await (await fetch(`${URL_}/docs`)).text();
  confere(pagina.includes("Documentos Database") && pagina.includes('"xlsx"') && pagina.includes("tipos"), "página /docs com seletor de extensão");
  const lista = await (await fetch(`${URL_}/api/docs/listar?ext=xls`)).json();
  confere(lista.some((d) => d.nome === N.s), "GET /api/docs/listar?ext=xls");
  const up = await (await fetch(`${URL_}/api/docs/enviar?nome=${encodeURIComponent(N.a)}`, { method: "POST", body: docx })).json();
  confere(up.imagens === 1, "POST /api/docs/enviar (corpo bruto)");
  confere((await fetch(`${URL_}/api/docs/agente/${"0".repeat(48)}/enviar`, { method: "POST", body: "x" })).status === 404, "token falso do agente: 404");

  const py = path.resolve("aplicacao_desk_agente/agente_python/.venv/Scripts/python.exe");
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "docs-agente-"));
  const arquivo = path.join(pasta, "__teste_docs__do_agente.docx"); fs.writeFileSync(arquivo, docx);
  const PY = fs.existsSync(py) ? py : "python";
  // o agente responde na hora e transfere em thread: o processo precisa continuar vivo até o trabalho terminar (matamos depois)
  const roda = (acao, params) => spawn(PY, ["-c", `import json,sys,time;sys.path.insert(0,r'aplicacao_desk_agente/agente_python');import acoes_docs;print(acoes_docs.ACOES['${acao}'](json.loads(sys.argv[1])));time.sleep(120)`, JSON.stringify(params)], { stdio: "ignore" });
  const tokenE = criarTrabalho("enviar");
  const pe = roda("docs_enviar", { url: URL_, token: tokenE, caminho: arquivo });
  const fe = await aguardar(tokenE, 120000); pe.kill();
  confere(fe.estado === "ok" && /Enviado ao banco/.test(fe.texto), `agente envia arquivo do PC: ${fe.texto.slice(0, 60)}`);
  const tokenB = criarTrabalho("baixar", { nome: N.a });
  const pb = roda("docs_baixar", { url: URL_, token: tokenB, nome: N.a, pasta });
  const fb = await aguardar(tokenB, 120000); pb.kill();
  confere(fb.estado === "ok" && /Baixado em/.test(fb.texto), `agente baixa para a pasta: ${fb.texto.slice(0, 50)}`);
  const baixado = fs.readdirSync(pasta).filter((f) => f.endsWith(".docx")).length;
  confere(baixado === 2, "arquivo baixado fica ao lado sem sobrescrever (nome (1))");
  const ruim = spawnSync(PY, ["-c", `import sys;sys.path.insert(0,r'aplicacao_desk_agente/agente_python');import acoes_docs;\ntry:\n  acoes_docs.docs_enviar({'url':'http://x','token':'0'*48,'caminho':r'${path.join(pasta, "nao_existe.xlsx").split(String.fromCharCode(92)).join("/")}'})\nexcept Exception as e: print('ERRO',e)`], { encoding: "utf-8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  confere(/ERRO .*não encontrado/.test(ruim.stdout), "agente: arquivo inexistente → erro claro");
  // abrir no programa padrão: o teste troca acoes.abrir_arquivo por um gravador (não abre nada de verdade)
  const abre = path.join(pasta, "abriu.txt");
  const tokenO = criarTrabalho("baixar", { nome: N.p });
  const po = spawn(PY, ["-c", `import json,sys,time;sys.path.insert(0,r'aplicacao_desk_agente/agente_python');import acoes_docs;acoes_docs.acoes.abrir_arquivo=lambda p: open(r'${abre.split(String.fromCharCode(92)).join("/")}','w').write(p['caminho']);print(acoes_docs.ACOES['docs_abrir'](json.loads(sys.argv[1])));time.sleep(120)`, JSON.stringify({ url: URL_, token: tokenO, nome: N.p })], { stdio: "ignore" });
  const fo = await aguardar(tokenO, 120000); po.kill();
  confere(fo.estado === "ok" && /Aberto no programa padrão/.test(fo.texto), `agente: docs_abrir baixa e manda abrir (${fo.texto.slice(0, 40)}…)`);
  confere(fs.existsSync(abre) && fs.readFileSync(abre, "utf-8").includes("__teste_docs__arquivo"), "agente: abriu o .pdf baixado (pasta temporária)");
  const bloq = spawnSync(PY, ["-c", `import sys;sys.path.insert(0,r'aplicacao_desk_agente/agente_python');import acoes_docs
try:
  acoes_docs.docs_abrir({'url':'http://x','token':'0'*48,'nome':'x.exe'})
except Exception as e: print('ERRO',e)`], { encoding: "utf-8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  confere(/ERRO .*não são aceitos/.test(bloq.stdout), "agente: recusa abrir .exe");

  console.log("Menu Upload Documentos (chave do agente)");
  process.env.AGENTE_CHAVE = "chave-de-teste";
  const arqMenu = path.join(pasta, N.m); fs.writeFileSync(arqMenu, pdfTexto("Enviado pelo menu"));
  const viaMenu = await rodaAsync(PY, ["-c", `import sys,json;sys.path.insert(0,r'aplicacao_desk_agente/agente_python');import acoes_docs
for chave in ('errada','chave-de-teste'):
  try: print('OK',acoes_docs.enviar_direto(r'${arqMenu.split(String.fromCharCode(92)).join("/")}',{'servidor':'${URL_}','chave':chave})['documento'])
  except Exception as e: print('ERRO',e)`], { encoding: "utf-8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  confere(/ERRO .*chave do agente inválida/.test(viaMenu.stdout) && viaMenu.stdout.includes("OK __teste_docs__menu.pdf"), "menu: chave errada recusada (401), chave certa envia");
  confere((await lerDocumento(N.m)).texto.includes("Enviado pelo menu"), "documento enviado pelo menu está no banco e legível");
  srv.close();
  fs.rmSync(pasta, { recursive: true, force: true });
} finally {
  await limpa();
}
console.log(`\n${ok} verificações passaram.`);
process.exit(0);
