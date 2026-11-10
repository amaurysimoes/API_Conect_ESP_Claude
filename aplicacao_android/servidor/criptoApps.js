// Cifra/decifra a lista de apps do celular (AES-256-GCM). Tem de bater com app/.../Assinatura.kt.
// Formato: base64url( iv[12] + texto cifrado + etiqueta[16] ). Chave = SHA-256("android|" + chave).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const chaveAes = (chave) => createHash("sha256").update(`android|${chave}`).digest();

export function cifrar(texto, chave, iv = randomBytes(12)) {
  const c = createCipheriv("aes-256-gcm", chaveAes(chave), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return Buffer.concat([iv, dados, c.getAuthTag()]).toString("base64url");
}

export function decifrar(texto, chave) {
  const b = Buffer.from(texto, "base64url");
  const d = createDecipheriv("aes-256-gcm", chaveAes(chave), b.subarray(0, 12));
  d.setAuthTag(b.subarray(b.length - 16));
  return Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]).toString("utf8");
}
