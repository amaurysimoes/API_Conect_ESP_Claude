// Palavras de cada pino ("luz frente", "varanda"...). Ficam no Firebase (esps/<nome>/palavras/<gpio>), editadas pelo painel.
// Aqui só se monta o mapa a partir dos ESPs lidos e se procura qual pino combina com o que foi pedido.
const IGNORAR = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "na", "no", "em", "la", "casa", "minha", "meu", "um", "uma", "pra", "para"]);

// { "FIRE_AHS01": { "5": ["luz frente", "varanda"] } }
export const mapaDe = (esps) =>
  Object.fromEntries(esps.filter((e) => Object.keys(e.palavras).length).map((e) => [e.nome, e.palavras]));

// minúsculas, sem acento, só letras/números, sem palavras de ligação ("da", "de", "casa"...)
export function tokens(texto) {
  return String(texto)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !IGNORAR.has(t));
}

// Uma frase cadastrada ("luz frente") bate quando TODAS as suas palavras aparecem no que foi pedido.
// Devolve os pinos que batem; se um tem frase mais específica (mais palavras), só ele.
export function achar(mapa, descricao) {
  const pedido = new Set(tokens(descricao));
  const achados = [];
  for (const [esp, pinos] of Object.entries(mapa)) {
    for (const [gpio, frases] of Object.entries(pinos)) {
      let melhor = 0;
      for (const f of frases) {
        const t = tokens(f);
        if (t.length && t.every((x) => pedido.has(x))) melhor = Math.max(melhor, t.length);
      }
      if (melhor) achados.push({ esp, gpio: Number(gpio), pontos: melhor });
    }
  }
  achados.sort((a, b) => b.pontos - a.pontos);
  if (achados.length > 1 && achados[0].pontos > achados[1].pontos) return [achados[0]];
  return achados;
}
