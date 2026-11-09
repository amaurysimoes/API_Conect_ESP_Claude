// Melhor rota com trânsito ao vivo (Google Routes API). Chave: variável GOOGLE_MAPS_KEY (nunca no código).
// Variáveis opcionais: ORIGEM_PADRAO (nome de um lugar salvo ou um endereço), CIDADE_PADRAO (ex.: "Rio Claro - SP"),
// usada para completar destinos sem cidade (ex.: "Amazonas Shopping").
import { acharLugar, nomesDosLugares } from "./lugares.js";

const URL_ROTAS = "https://routes.googleapis.com/directions/v2:computeRoutes";
// Só os campos usados: a cobrança depende dos campos pedidos.
const CAMPOS = "routes.duration,routes.staticDuration,routes.distanceMeters,routes.description,routes.routeLabels";

const segundos = (s) => Number(String(s ?? "0").replace("s", "")) || 0;

export function formatarTempo(seg) {
  const min = Math.max(1, Math.round(seg / 60));
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`;
}

// "casa da Cidade Nova" -> endereço salvo. Texto livre -> o próprio texto (+ cidade padrão, se não tiver vírgula).
function resolver(texto, completarCidade) {
  const lugar = acharLugar(texto);
  if (lugar?.ambiguo) throw new Error(`"${texto}" combina com mais de um lugar salvo (${nomesDosLugares().join(", ")}). Pergunte qual.`);
  if (lugar) return { nome: lugar.nome, endereco: lugar.endereco };
  const cidade = process.env.CIDADE_PADRAO;
  const endereco = completarCidade && cidade && !texto.includes(",") ? `${texto}, ${cidade}` : texto;
  return { nome: texto, endereco };
}

export async function melhorRota({ origem, destino }) {
  const chave = process.env.GOOGLE_MAPS_KEY;
  if (!chave) throw new Error("GOOGLE_MAPS_KEY não está definida no servidor.");
  const textoOrigem = origem || process.env.ORIGEM_PADRAO;
  if (!textoOrigem) throw new Error("Não sei de onde você sai. Pergunte ao usuário a origem (ex.: 'saindo da casa do Centro').");

  const de = resolver(textoOrigem, true);
  const para = resolver(destino, true);

  const resp = await fetch(URL_ROTAS, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": chave, "X-Goog-FieldMask": CAMPOS },
    body: JSON.stringify({
      origin: { address: de.endereco },
      destination: { address: para.endereco },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: true,
      languageCode: "pt-BR",
      regionCode: "BR",
      units: "METRIC",
    }),
    signal: AbortSignal.timeout(10000),
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Google Routes recusou (${resp.status}): ${dados?.error?.message ?? "erro sem detalhe"}`);

  const rotas = (dados.routes ?? []).map((r) => ({
    via: r.description || "rota sem nome",
    comTransito: segundos(r.duration),
    semTransito: segundos(r.staticDuration),
    km: (r.distanceMeters ?? 0) / 1000,
  }));
  if (!rotas.length) throw new Error(`O Google não achou rota entre "${de.nome}" e "${para.nome}". Confira os nomes ou o endereço.`);

  rotas.sort((a, b) => a.comTransito - b.comTransito);
  const melhor = rotas[0];
  const linhas = rotas.map((r, i) => {
    const atraso = Math.max(0, Math.round((r.comTransito - r.semTransito) / 60));
    return `${i === 0 ? "★ MELHOR" : `alternativa ${i}`}: via ${r.via} — ${formatarTempo(r.comTransito)} com trânsito` +
      ` (${formatarTempo(r.semTransito)} sem trânsito, atraso de ${atraso} min), ${r.km.toFixed(1)} km`;
  });
  const economia = rotas.length > 1 ? Math.round((rotas[1].comTransito - melhor.comTransito) / 60) : 0;

  return [
    `De "${de.nome}" para "${para.nome}", trânsito de agora:`,
    ...linhas,
    economia > 0 ? `A melhor rota economiza ${economia} min em relação à segunda.` : "",
    `Abrir no Waze: https://waze.com/ul?q=${encodeURIComponent(para.endereco)}&navigate=yes`,
    `Abrir no Google Maps: https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${encodeURIComponent(de.endereco)}&destination=${encodeURIComponent(para.endereco)}`,
  ].filter(Boolean).join("\n");
}

export const listarLugares = () => nomesDosLugares();
