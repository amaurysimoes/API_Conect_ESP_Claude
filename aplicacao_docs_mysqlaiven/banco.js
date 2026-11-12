// Conexão com o MySQL do Aiven (mesma tabela do app Python AIVEN_DATABASE: ia_documentacao_tecnica).
// Variáveis (Render > Environment; local no .env): DOCS_DB_HOST, DOCS_DB_PORT, DOCS_DB_USER, DOCS_DB_PASSWORD, DOCS_DB_NAME.
// O certificado público do Aiven (ca.pem) fica nesta pasta; DOCS_DB_CA (texto PEM) é opcional e tem prioridade.
import mysql from "mysql2/promise";
import fs from "node:fs";

export const T = "ia_documentacao_tecnica";
export const CHUNK = 8 * 1024 * 1024; // max_allowed_packet do Aiven é 64 MB: o arquivo vai em partes de 8 MB

export const configurado = () => ["HOST", "PORT", "USER", "PASSWORD", "NAME"].every((k) => process.env[`DOCS_DB_${k}`]);

const SCHEMA = `CREATE TABLE IF NOT EXISTS ${T} (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo ENUM('doc','parte','img','pos','cel','col','mrg','mov') NOT NULL,
  doc_id INT UNSIGNED NOT NULL DEFAULT 0,
  chave VARCHAR(200) NOT NULL,
  ref INT UNSIGNED NULL, qtd BIGINT UNSIGNED NULL, flag TINYINT UNSIGNED NOT NULL DEFAULT 0,
  sha256 BINARY(32) NULL, texto TEXT NULL, dados MEDIUMBLOB NULL, dados_orig MEDIUMBLOB NULL,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_doc_tipo_chave (doc_id, tipo, chave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`;

function ca() {
  if (process.env.DOCS_DB_CA) return process.env.DOCS_DB_CA.replace(/\\n/g, "\n");
  return fs.readFileSync(new URL("./ca.pem", import.meta.url));
}

let esquemaOk = false;
/** Abre uma conexão, roda fn(conn) e fecha (o Render grátis dorme: sem pool de longa vida). */
export async function comBanco(fn) {
  if (!configurado()) throw new Error("Banco do Aiven não configurado: faltam as variáveis DOCS_DB_HOST, DOCS_DB_PORT, DOCS_DB_USER, DOCS_DB_PASSWORD e DOCS_DB_NAME no Render.");
  const e = process.env;
  const conn = await mysql.createConnection({
    host: e.DOCS_DB_HOST, port: Number(e.DOCS_DB_PORT), user: e.DOCS_DB_USER, password: e.DOCS_DB_PASSWORD,
    database: e.DOCS_DB_NAME, ssl: { ca: ca() }, connectTimeout: 15000, maxPreparedStatements: 50,
  });
  try {
    if (!esquemaOk) { await conn.query(SCHEMA); esquemaOk = true; }
    return await fn(conn);
  } finally { await conn.end().catch(() => {}); }
}
