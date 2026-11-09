// Última posição do GPS do celular, enviada pela página /gps. Fica só na memória do servidor (nunca no Firebase nem no git).
// Se o Render reiniciar ou dormir, ela some até a página /gps enviar de novo.
let ultima = null;

export function gravarPosicao({ lat, lng, precisao }) {
  ultima = { lat, lng, precisao: precisao ?? null, ts: Date.now() };
}

export const lerPosicao = () => ultima;
export const idadeMin = (p) => (p ? (Date.now() - p.ts) / 60000 : Infinity);
