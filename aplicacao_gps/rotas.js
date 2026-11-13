// Rotas com trânsito ao vivo (Google Routes API). Chave: variável GOOGLE_MAPS_KEY (nunca no código).
// Origem: 1) a que o usuário disser, 2) o GPS do celular (página /gps, até 15 min), 3) ORIGEM_PADRAO.
// Opcionais: ORIGEM_PADRAO (nome de um lugar salvo ou endereço), CIDADE_PADRAO (ex.: "Rio Claro - SP").
import { acharLugar, nomesDosLugares, enderecoCompleto } from "./lugares.js";
import { lerPosicao, idadeMin } from "./posicao.js";

const URL_ROTAS = "https://routes.googleapis.com/directions/v2:computeRoutes";
// Só os campos usados: a cobrança do Google depende dos campos pedidos.
const CAMPOS = "routes.duration,routes.staticDuration,routes.distanceMeters,routes.description," +
  "routes.polyline.encodedPolyline,routes.travelAdvisory.speedReadingIntervals";
const CAMPOS_PASSOS = CAMPOS + ",routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters";
const GPS_VALIDO_MIN = 15;

const segundos = (s) => Number(String(s ?? "0").replace("s", "")) || 0;

export function formatarTempo(seg) {
  const min = Math.max(1, Math.round(seg / 60));
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`;
}

export const formatarDistancia = (m) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);

// ---------- trânsito por trecho ----------
export function decodificar(enc) {
  const pts = [];
  let i = 0, lat = 0, lng = 0;
  const valor = () => {
    let b, shift = 0, r = 0;
    do { b = enc.charCodeAt(i++) - 63; r |= (b & 31) << shift; shift += 5; } while (b >= 32);
    return r & 1 ? ~(r >> 1) : r >> 1;
  };
  while (i < enc.length) { lat += valor(); lng += valor(); pts.push([lat / 1e5, lng / 1e5]); }
  return pts;
}

function distM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Quanto da rota está lento ou parado, e em que faixas (como fração 0-1 do trajeto). null se o Google não mandou.
export function analisarTransito(rota) {
  const enc = rota.polyline?.encodedPolyline, intervalos = rota.travelAdvisory?.speedReadingIntervals;
  if (!enc || !intervalos) return null;
  const pts = decodificar(enc);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distM(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1] || 1;
  const at = (idx) => cum[Math.max(0, Math.min(idx, cum.length - 1))];
  let lentoM = 0, paradoM = 0;
  const faixas = [];
  for (const it of intervalos) {
    const speed = it.speed || "NORMAL";
    const ini = at(it.startPolylinePointIndex ?? 0), fim = at(it.endPolylinePointIndex ?? 0);
    if (speed === "SLOW") lentoM += fim - ini;
    else if (speed === "TRAFFIC_JAM") paradoM += fim - ini;
    else continue;
    faixas.push({ ini: ini / total, fim: fim / total, speed });
  }
  return { totalM: total, lentoM, paradoM, faixas };
}

// Para cada passo da rota: quantos metros dele estão lentos/parados.
export function transitoPorPasso(passos, faixas) {
  const soma = passos.reduce((a, p) => a + (p.distanceMeters || 0), 0) || 1;
  let ac = 0;
  return passos.map((p) => {
    const d = p.distanceMeters || 0, ini = ac / soma, fim = (ac + d) / soma;
    ac += d;
    let lentoM = 0, paradoM = 0;
    for (const f of faixas) {
      const o = Math.min(fim, f.fim) - Math.max(ini, f.ini);
      if (o > 0) { if (f.speed === "TRAFFIC_JAM") paradoM += o * soma; else lentoM += o * soma; }
    }
    return { lentoM, paradoM };
  });
}

// ---------- origem e destino ----------
async function resolverDestino(texto) {
  const lugar = await acharLugar(texto);
  if (lugar?.ambiguo) throw new Error(`"${texto}" combina com mais de um lugar salvo (${(await nomesDosLugares()).join(", ")}). Pergunte qual.`);
  if (lugar) return { nome: lugar.nome, endereco: enderecoCompleto(lugar) };
  const cidade = process.env.CIDADE_PADRAO;
  return { nome: texto, endereco: cidade && !texto.includes(",") ? `${texto}, ${cidade}` : texto };
}

async function resolverOrigem(texto) {
  if (texto) {
    const d = await resolverDestino(texto);
    return { nome: d.nome, endereco: d.endereco, waypoint: { address: d.endereco } };
  }
  const pos = lerPosicao();
  const idade = idadeMin(pos);
  if (pos && idade <= GPS_VALIDO_MIN) {
    return {
      nome: `sua posição (GPS, há ${Math.max(0, Math.round(idade))} min)`,
      endereco: `${pos.lat},${pos.lng}`,
      waypoint: { location: { latLng: { latitude: pos.lat, longitude: pos.lng } } },
      gps: true,
    };
  }
  if (process.env.ORIGEM_PADRAO) {
    const d = await resolverDestino(process.env.ORIGEM_PADRAO);
    return {
      nome: d.nome, endereco: d.endereco, waypoint: { address: d.endereco },
      aviso: pos ? `O GPS está desatualizado (${Math.round(idade)} min); usei a origem padrão.` : "Sem GPS; usei a origem padrão.",
    };
  }
  throw new Error(
    pos
      ? `O GPS está desatualizado (${Math.round(idade)} min). Peça ao usuário para abrir a página /gps no celular, ou perguntar de onde ele sai.`
      : "Não tenho o GPS do usuário. Peça para abrir a página /gps no celular (https://automation-ahs.onrender.com/gps) e tocar em compartilhar, ou pergunte de onde ele sai."
  );
}

// ---------- Google ----------
async function consultar(de, para, comPassos) {
  const chave = process.env.GOOGLE_MAPS_KEY;
  if (!chave) throw new Error("GOOGLE_MAPS_KEY não está definida no servidor.");
  const resp = await fetch(URL_ROTAS, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": chave, "X-Goog-FieldMask": comPassos ? CAMPOS_PASSOS : CAMPOS },
    body: JSON.stringify({
      origin: de.waypoint,
      destination: { address: para.endereco },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: true,
      extraComputations: ["TRAFFIC_ON_POLYLINE"],
      languageCode: "pt-BR",
      regionCode: "BR",
      units: "METRIC",
    }),
    signal: AbortSignal.timeout(12000),
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Google Routes recusou (${resp.status}): ${dados?.error?.message ?? "erro sem detalhe"}`);
  const rotas = (dados.routes ?? []).map((r) => ({
    via: r.description || "rota sem nome",
    comTransito: segundos(r.duration),
    semTransito: segundos(r.staticDuration),
    km: (r.distanceMeters ?? 0) / 1000,
    transito: analisarTransito(r),
    passos: r.legs?.[0]?.steps ?? [],
  }));
  if (!rotas.length) throw new Error(`O Google não achou rota de "${de.nome}" até "${para.nome}". Confira o endereço.`);
  return rotas.sort((a, b) => a.comTransito - b.comTransito);
}

const linhaTransito = (t) =>
  !t ? "sem dados de congestionamento"
    : t.paradoM < 50 && t.lentoM < 100 ? "trânsito livre"
      : `${t.paradoM >= 50 ? `parado em ~${formatarDistancia(t.paradoM)}` : ""}${t.paradoM >= 50 && t.lentoM >= 100 ? "; " : ""}${t.lentoM >= 100 ? `lento em ~${formatarDistancia(t.lentoM)}` : ""}`;

function links(de, para) {
  const o = de.gps ? de.endereco : de.endereco;
  return [
    `Abrir no Waze: https://waze.com/ul?q=${encodeURIComponent(para.endereco)}&navigate=yes`,
    `Abrir no Google Maps: https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(para.endereco)}`,
  ];
}

// ---------- ferramentas ----------
export async function melhorRota({ origem, destino }) {
  const de = await resolverOrigem(origem);
  const para = await resolverDestino(destino);
  const rotas = await consultar(de, para, false);
  const melhor = rotas[0];
  const linhas = rotas.map((r, i) => {
    const atraso = Math.max(0, Math.round((r.comTransito - r.semTransito) / 60));
    return `${i === 0 ? "★ MELHOR" : `alternativa ${i}`}: via ${r.via} — ${formatarTempo(r.comTransito)} com trânsito ` +
      `(${formatarTempo(r.semTransito)} sem trânsito, atraso de ${atraso} min), ${r.km.toFixed(1)} km; ${linhaTransito(r.transito)}`;
  });
  const economia = rotas.length > 1 ? Math.round((rotas[1].comTransito - melhor.comTransito) / 60) : 0;
  return [
    `De ${de.nome} para "${para.nome}", trânsito de agora:`,
    de.aviso ?? "",
    ...linhas,
    economia > 0 ? `A melhor rota economiza ${economia} min em relação à segunda.` : "",
    ...links(de, para),
  ].filter(Boolean).join("\n");
}

// Passo a passo da melhor rota, a partir de onde o usuário está agora, marcando os trechos com trânsito.
export async function orientar({ origem, destino }) {
  const de = await resolverOrigem(origem);
  const para = await resolverDestino(destino);
  const rotas = await consultar(de, para, true);
  const r = rotas[0];
  const porPasso = r.transito ? transitoPorPasso(r.passos, r.transito.faixas) : r.passos.map(() => ({ lentoM: 0, paradoM: 0 }));
  const passos = r.passos.map((p, i) => {
    const t = porPasso[i];
    const instrucao = p.navigationInstruction?.instructions || "Siga em frente";
    const aviso = t.paradoM >= 50 ? `  ⚠ PARADO em ~${formatarDistancia(t.paradoM)}`
      : t.lentoM >= 100 ? `  ⚠ lento em ~${formatarDistancia(t.lentoM)}` : "";
    return `${i + 1}. ${instrucao} (${formatarDistancia(p.distanceMeters || 0)})${aviso}`;
  });
  return [
    `Saindo de ${de.nome} até "${para.nome}": via ${r.via}, ${formatarTempo(r.comTransito)} com trânsito (${formatarTempo(r.semTransito)} sem), ${r.km.toFixed(1)} km. Trânsito: ${linhaTransito(r.transito)}.`,
    de.aviso ?? "",
    rotas.length > 1 ? `Alternativa: via ${rotas[1].via}, ${formatarTempo(rotas[1].comTransito)}.` : "",
    "Passo a passo:",
    ...passos,
    ...links(de, para),
  ].filter(Boolean).join("\n");
}

export const listarLugares = nomesDosLugares;
