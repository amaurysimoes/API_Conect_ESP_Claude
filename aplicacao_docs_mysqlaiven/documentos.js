// Enviar / listar / baixar / ler / excluir documentos (.xls .xlsx .doc .docx) no MySQL do Aiven.
// Mesmo formato do app Python (tabela ia_documentacao_tecnica):
//   doc   chave=nome do arquivo, qtd=tamanho guardado, sha256, ref=nº de partes, flag=1 (ok) / 0 (enviando)
//   parte chave=nº, dados=pedaço de 8 MB do arquivo SEM as imagens (xlsx/docx são zip; as imagens png/jpeg ficam vazias no zip)
//   img   chave=caminho da imagem no zip (ex.: xl/media/image1.png), dados=WebP (qualidade 75, lado máx. 1280 px)
// .xls e .doc (binários antigos) são guardados inteiros, sem imagens separadas. Linhas 'pos' (posição das imagens na tela do app Python)
// NÃO são criadas aqui: não são necessárias para baixar o arquivo.
import { createHash } from "node:crypto";
import { unzipSync, zipSync } from "fflate";
import sharp from "sharp";
import { comBanco, T, CHUNK } from "./banco.js";
import { textoDe, temLeitor } from "./texto.js";

export const EXTENSOES = ["xls", "xlsx", "doc", "docx", "pdf"]; // as mais comuns (botões da aba); qualquer outra extensão também é aceita
// formatos que são zip com imagens dentro: as imagens png/jpeg vão para o banco em WebP
const PASTA_MIDIA = { xlsx: "xl/media/", xlsm: "xl/media/", docx: "word/media/", docm: "word/media/", pptx: "ppt/media/" };
// programas: não são documentos e a IA abriria no PC do usuário
export const BLOQUEADAS = ["exe", "bat", "cmd", "com", "scr", "msi", "ps1", "vbs", "vbe", "js", "jse", "wsf", "lnk", "reg", "jar", "dll", "sh", "appimage", "apk"];
const FORMATOS_IMG = ["png", "jpg", "jpeg"];
const MAX_ARQUIVO = 40 * 1024 * 1024; // o Render grátis tem 512 MB de memória

export const extDe = (nome) => String(nome).toLowerCase().split(".").pop();
const sha = (b) => createHash("sha256").update(b).digest();
const ehZip = (ext) => ext in PASTA_MIDIA;

export function validarNome(nome) {
  const n = String(nome ?? "").trim();
  if (!n || n.length > 190 || /[\\/:*?"<>|]/.test(n)) throw new Error("Nome de arquivo inválido (até 190 caracteres, sem \\ / : * ? \" < > |).");
  if (!n.includes(".") || !/^[a-z0-9]{1,8}$/.test(extDe(n))) throw new Error("O arquivo precisa ter extensão (ex.: .pdf, .xlsx).");
  if (BLOQUEADAS.includes(extDe(n))) throw new Error(`Programas/scripts (.${extDe(n)}) não são aceitos: só documentos.`);
  return n;
}

async function paraWebp(dados) {
  const { data, info } = await sharp(dados, { failOn: "none" }).rotate().resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  const pequena = Math.max(info.width, info.height) <= 512; // ícones/figuras pequenas: sem perda; fotos: qualidade 75
  return sharp(data).webp(pequena ? { lossless: true } : { quality: 75 }).toBuffer();
}

async function deWebp(dados, ext) {
  const img = sharp(dados);
  return ext === "png" ? img.png().toBuffer() : img.flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
}

/** Guarda o documento (substitui se já existir). Devolve um resumo. */
export async function enviarDocumento(nome, buffer) {
  nome = validarNome(nome);
  if (!buffer?.length) throw new Error("Arquivo vazio.");
  if (buffer.length > MAX_ARQUIVO) throw new Error(`Arquivo maior que ${MAX_ARQUIVO / 1048576} MB.`);
  const ext = extDe(nome);
  let esqueleto = buffer;
  const comprimidas = new Map(); // caminho no zip -> WebP
  if (ehZip(ext)) {
    let zip;
    try { zip = unzipSync(new Uint8Array(buffer)); } catch { throw new Error(`O arquivo não é um .${ext} válido.`); }
    const saida = {};
    for (const [caminho, dados] of Object.entries(zip)) {
      const fmt = caminho.toLowerCase().split(".").pop();
      if (caminho.startsWith(PASTA_MIDIA[ext]) && FORMATOS_IMG.includes(fmt) && dados.length) {
        try { comprimidas.set(caminho, await paraWebp(Buffer.from(dados))); saida[caminho] = [new Uint8Array(0), { level: 0 }]; continue; } catch { /* não decodifica: fica dentro do zip */ }
      }
      saida[caminho] = [dados, { level: 9 }];
    }
    esqueleto = Buffer.from(zipSync(saida));
  }
  const hash = sha(esqueleto);
  return comBanco(async (c) => {
    const [[ex]] = await c.query(`SELECT id FROM ${T} WHERE tipo='doc' AND doc_id=0 AND chave=?`, [nome]).then(([r]) => [r.length ? r : [null]]);
    let docId = ex?.id;
    if (docId) {
      await c.query(`UPDATE ${T} SET flag=0, qtd=?, sha256=?, ref=0 WHERE id=?`, [esqueleto.length, hash, docId]);
      await c.query(`DELETE FROM ${T} WHERE doc_id=? AND tipo='parte'`, [docId]);
    } else {
      const [r] = await c.query(`INSERT INTO ${T} (tipo, doc_id, chave, qtd, sha256, ref, flag) VALUES ('doc',0,?,?,?,0,0)`, [nome, esqueleto.length, hash]);
      docId = r.insertId;
    }
    let partes = 0;
    for (let i = 0; i < esqueleto.length; i += CHUNK, partes++) {
      await c.query(`INSERT INTO ${T} (tipo, doc_id, chave, dados) VALUES ('parte',?,?,?)`, [docId, String(partes), esqueleto.subarray(i, i + CHUNK)]);
    }
    // imagens únicas: mesma regra do app Python (imagem trocada pelo usuário é mantida; o novo original vira ponto de restauração)
    const [imgs] = await c.query(`SELECT id, chave, flag FROM ${T} WHERE doc_id=? AND tipo='img'`, [docId]);
    const existentes = new Map(imgs.map((r) => [r.chave, r]));
    for (const [caminho, webp] of comprimidas) {
      const e = existentes.get(caminho);
      if (!e) await c.query(`INSERT INTO ${T} (tipo, doc_id, chave, dados) VALUES ('img',?,?,?)`, [docId, caminho, webp]);
      else if (e.flag) await c.query(`UPDATE ${T} SET dados_orig=? WHERE id=?`, [webp, e.id]);
      else await c.query(`UPDATE ${T} SET dados=?, dados_orig=NULL WHERE id=?`, [webp, e.id]);
    }
    for (const [caminho, e] of existentes) {
      if (!comprimidas.has(caminho)) {
        await c.query(`DELETE FROM ${T} WHERE doc_id=? AND tipo='pos' AND ref=?`, [docId, e.id]);
        await c.query(`DELETE FROM ${T} WHERE id=?`, [e.id]);
      }
    }
    await c.query(`UPDATE ${T} SET flag=1, ref=? WHERE id=?`, [partes, docId]);
    const bytesImagens = [...comprimidas.values()].reduce((s, b) => s + b.length, 0);
    return { documento: nome, extensao: ext, imagens: comprimidas.size, tam_original: buffer.length, tam_armazenado: esqueleto.length + bytesImagens, substituido: !!ex };
  });
}

/** Lista documentos; ext = "xlsx" etc. (vazio = todas). */
export async function listarDocumentos(ext) {
  if (ext && !/^[a-z0-9]{1,8}$/.test(ext)) throw new Error(`Extensão inválida: ${ext}.`);
  return comBanco(async (c) => {
    const [rows] = await c.query(
      `SELECT d.chave AS nome, d.qtd, d.ref AS partes, d.flag, d.atualizado_em,
              (SELECT COUNT(*) FROM ${T} i WHERE i.doc_id=d.id AND i.tipo='img') AS imagens
         FROM ${T} d WHERE d.tipo='doc' AND d.doc_id=0 ORDER BY d.chave`);
    return rows
      .map((r) => ({ nome: r.nome, extensao: extDe(r.nome), tamanho: Number(r.qtd), imagens: Number(r.imagens), completo: r.flag === 1, atualizado_em: r.atualizado_em }))
      .filter((r) => !ext || r.extensao === ext);
  });
}

/** Remonta o arquivo original (partes + imagens convertidas de WebP). */
export async function baixarDocumento(nome, soEsqueleto = false) {
  return comBanco(async (c) => {
    const [[d]] = await c.query(`SELECT id, qtd, sha256, ref, flag FROM ${T} WHERE tipo='doc' AND doc_id=0 AND chave=?`, [nome]).then(([r]) => [r.length ? r : [null]]);
    if (!d) throw new Error(`Documento não encontrado: ${nome}`);
    if (d.flag !== 1) throw new Error("O envio deste documento não terminou. Envie o arquivo de novo.");
    const pedacos = [];
    for (let p = 0; p < d.ref; p++) {
      const [r] = await c.query(`SELECT dados FROM ${T} WHERE doc_id=? AND tipo='parte' AND chave=?`, [d.id, String(p)]);
      if (!r.length) throw new Error(`Parte ${p} sumiu do banco. Reenvie o documento.`);
      pedacos.push(r[0].dados);
    }
    const esqueleto = Buffer.concat(pedacos);
    if (!sha(esqueleto).equals(Buffer.from(d.sha256))) throw new Error("O arquivo do banco não confere com o hash gravado.");
    const ext = extDe(nome);
    if (!ehZip(ext) || soEsqueleto) return esqueleto; // soEsqueleto: o texto não precisa das imagens (o link do banco é lento)
    const [imgs] = await c.query(`SELECT chave, dados FROM ${T} WHERE doc_id=? AND tipo='img'`, [d.id]);
    const midias = new Map(imgs.map((i) => [i.chave, i.dados]));
    const zip = unzipSync(new Uint8Array(esqueleto));
    const saida = {};
    for (const [caminho, dados] of Object.entries(zip)) {
      if (midias.has(caminho)) {
        const fmt = caminho.toLowerCase().split(".").pop();
        saida[caminho] = [new Uint8Array(await deWebp(midias.get(caminho), fmt)), { level: 0 }];
      } else if (!dados.length && caminho.startsWith(PASTA_MIDIA[ext]) && !caminho.endsWith("/")) {
        throw new Error(`Imagem sem conteúdo no banco: ${caminho}. Reenvie o documento.`);
      } else saida[caminho] = [dados, { level: 6 }];
    }
    return Buffer.from(zipSync(saida));
  });
}

/** Texto do documento (planilha: linhas por aba; Word: parágrafos). */
export async function lerDocumento(nome, limite = 20000) {
  const buf = await baixarDocumento(nome, true);
  const t = await textoDe(extDe(nome), buf);
  return t.length > limite ? { texto: t.slice(0, limite), truncado: true, total: t.length } : { texto: t, truncado: false, total: t.length };
}

/** Procura um termo (sem diferenciar maiúsculas/acentos) no texto dos documentos da extensão. */
export async function buscarDocumentos(termo, ext, max = 15) {
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const alvo = norm(String(termo));
  if (!alvo) throw new Error("Falta o termo a buscar.");
  const docs = (await listarDocumentos(ext)).filter((d) => d.completo && temLeitor(d.extensao)).slice(0, max);
  const achados = [];
  for (const d of docs) {
    try {
      const linhas = (await textoDe(d.extensao, await baixarDocumento(d.nome, true))).split("\n");
      const trechos = linhas.filter((l) => norm(l).includes(alvo)).slice(0, 5).map((l) => l.slice(0, 300));
      if (trechos.length) achados.push({ documento: d.nome, trechos });
    } catch (e) { achados.push({ documento: d.nome, trechos: [`(erro ao ler: ${e.message})`] }); }
  }
  return { verificados: docs.length, achados };
}

export async function excluirDocumento(nome) {
  return comBanco(async (c) => {
    const [r] = await c.query(`SELECT id FROM ${T} WHERE tipo='doc' AND doc_id=0 AND chave=?`, [nome]);
    if (!r.length) throw new Error(`Documento não encontrado: ${nome}`);
    await c.query(`DELETE FROM ${T} WHERE doc_id=? OR id=?`, [r[0].id, r[0].id]);
    return { excluido: nome };
  });
}
