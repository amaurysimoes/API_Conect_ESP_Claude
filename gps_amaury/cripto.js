// Cifra os endereços antes de ir ao Firebase (as regras do banco são abertas: sem isso qualquer um leria suas casas).
// AES-256-GCM. Chave: LUGARES_CHAVE (recomendado) ou, se não existir, MCP_TOKEN.
// Trocar essa chave deixa os endereços já salvos ilegíveis: cadastre de novo.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

let cache;
function chave() {
  const base = process.env.LUGARES_CHAVE || process.env.MCP_TOKEN;
  if (!base) throw new Error("Defina LUGARES_CHAVE (ou MCP_TOKEN) para guardar endereços.");
  if (cache?.base !== base) cache = { base, key: scryptSync(base, "ponte-casa-lugares", 32) };
  return cache.key;
}

export function cifrar(obj) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), dados]).toString("base64url");
}

export function decifrar(texto) {
  const b = Buffer.from(texto, "base64url");
  const d = createDecipheriv("aes-256-gcm", chave(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
}
