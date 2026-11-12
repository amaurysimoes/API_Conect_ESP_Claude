// Extrai o texto de .xlsx, .docx (zip + XML), .xls (biblioteca xlsx) e .doc (word-extractor).
import { unzipSync, strFromU8 } from "fflate";

const ent = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");
const sem = (x) => ent(x.replace(/<[^>]+>/g, ""));
const attr = (tag, nome) => (tag.match(new RegExp(`\\b${nome}="([^"]*)"`)) ?? [])[1];
const arq = (zip, nome) => (zip[nome] ? strFromU8(zip[nome]) : "");

function colunaDe(ref) { return ref.replace(/\d+/g, ""); }

function xlsx(buf) {
  const zip = unzipSync(new Uint8Array(buf));
  const strings = [...arq(zip, "xl/sharedStrings.xml").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => sem([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const rels = Object.fromEntries([...arq(zip, "xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target")]));
  const saida = [];
  for (const m of arq(zip, "xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)) {
    const nome = ent(attr(m[0], "name") ?? "?");
    let alvo = rels[attr(m[0], "r:id")] ?? "";
    alvo = alvo.startsWith("/") ? alvo.slice(1) : "xl/" + alvo;
    const xml = arq(zip, alvo);
    const linhas = [];
    for (const r of xml.matchAll(/<row\b[^>]*?\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const cels = [];
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tipo = attr(c[1], "t");
        const v = (c[2]?.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1];
        let t = "";
        if (tipo === "inlineStr") t = sem(c[2] ?? "");
        else if (v !== undefined) t = tipo === "s" ? strings[+v] ?? "" : ent(v);
        if (t.trim()) cels.push(`${colunaDe(attr(c[1], "r") ?? "")}=${t.trim()}`);
      }
      if (cels.length) linhas.push(`L${r[1]}: ${cels.join(" | ")}`);
    }
    saida.push(`## Aba "${nome}"\n${linhas.join("\n") || "(vazia)"}`);
  }
  return saida.join("\n\n");
}

function docx(buf) {
  const zip = unzipSync(new Uint8Array(buf));
  const xml = arq(zip, "word/document.xml")
    .replace(/<w:tab\/>/g, "\t").replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>\s*<\/w:tc>/g, " | ").replace(/<\/w:tc>/g, " | ").replace(/<\/w:tr>/g, "\n").replace(/<\/w:p>/g, "\n");
  return sem(xml).replace(/ \| \n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function xls(buf) {
  const XLSX = await import("xlsx");
  const lib = XLSX.default ?? XLSX;
  const wb = lib.read(buf, { type: "buffer" });
  return wb.SheetNames.map((n) => `## Aba "${n}"\n${lib.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false })}`).join("\n\n");
}

async function doc(buf) {
  const WordExtractor = (await import("word-extractor")).default;
  return (await new WordExtractor().extract(buf)).getBody();
}

async function pdf(buf) {
  const lerPdf = (await import("pdf-parse/lib/pdf-parse.js")).default; // o "index.js" do pacote tenta abrir um PDF de teste: evitar
  return (await lerPdf(buf)).text.split(/\n{3,}/).join("\n\n").trim();
}

const SIMPLES = ["txt", "csv", "tsv", "md", "json", "xml", "html", "htm", "log", "ini", "yaml", "yml", "sql"];
const LEITORES = { xlsx, xlsm: xlsx, docx, docm: docx, xls, doc, pdf };
export const temLeitor = (ext) => ext in LEITORES || SIMPLES.includes(ext);

export async function textoDe(ext, buf) {
  if (SIMPLES.includes(ext)) return buf.toString("utf-8");
  if (LEITORES[ext]) return LEITORES[ext](buf);
  throw new Error(`Não há leitor de texto para .${ext}: use baixar_documento_para_maquina ou abrir_documento_na_maquina.`);
}
