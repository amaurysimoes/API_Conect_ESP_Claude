// Página do celular para ler o serial (abre em /serial/<token>). Escura, tela cheia, feita para iPhone e Android.
import { FAVICON } from "../aplicacao_gps/favicon.js";
import { menuHtml, CSS_MENU } from "../aplicacao_gps/paginas.js";

const CSS = `
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  :root{--fundo:#0f1115;--card:#171a21;--borda:#2a2f3a;--texto:#e6e8ee;--suave:#9aa3b2;--azul:#4c8dff;--verde:#3ddc84;--verm:#ff5c5c}
  html{background:var(--fundo)}
  html,body{margin:0;height:100%;color:var(--texto);font:15px system-ui,-apple-system,sans-serif}
  /* link do celular: câmera em tela cheia */
  body{display:flex;flex-direction:column;overflow:hidden;background:var(--fundo)}
  body:not(.aba) nav{flex:none;margin:0 !important;padding:8px 10px !important}
  #cena{position:relative;flex:1;min-height:0;background:#000}
  /* aba do site: igual às outras (fundo com a imagem, menu, câmera dentro de um quadro) */
  body.aba{display:block;height:auto;min-height:100%;overflow:auto;background:transparent;max-width:960px;margin:0 auto;padding:0 16px 24px}
  body.aba #topo b{display:none}
  body.aba h1{font-size:20px;margin:0} body.aba .sub{color:var(--suave);font-size:13px;margin:6px 0 12px}
  body.aba #cena{flex:none;width:100%;max-width:560px;height:min(60vh,460px);min-height:340px;border:1px solid var(--borda);border-radius:8px;overflow:hidden;margin:12px 0}
  video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  canvas#o{position:absolute;left:0;top:0;pointer-events:none}
  #topo{position:absolute;left:0;right:0;top:0;padding:calc(env(safe-area-inset-top) + 10px) 14px 10px;background:linear-gradient(#000c,#0000);z-index:3}
  #topo b{font-size:16px} #estado{margin-top:4px;font-size:14px;min-height:20px}
  #barra{position:absolute;left:0;right:0;bottom:0;padding:12px 14px calc(env(safe-area-inset-bottom) + 14px);display:flex;gap:10px;justify-content:center;flex-wrap:wrap;background:linear-gradient(#0000,#000d);z-index:3}
  button,label.bt{font:600 15px system-ui,sans-serif;color:#e6e8ee;background:#171a21;border:1px solid #2a2f3a;border-radius:10px;padding:12px 16px;cursor:pointer}
  button.prim{background:#1d2a45;border-color:#4c8dff}
  input[type=file]{display:none}
  #painel{position:absolute;inset:0;background:#0f1115f2;z-index:5;display:none;flex-direction:column;justify-content:center;gap:12px;padding:22px}
  #painel.on{display:flex}
  #painel .tit{color:#9aa3b2;font-size:13px;margin:0} #lido{font:700 24px ui-monospace,Consolas,monospace;word-break:break-all;user-select:all;-webkit-user-select:all;background:#171a21;border:2px solid #22c55e;border-radius:12px;padding:16px}
  #padrao{color:#22c55e;font-weight:600} .ok{color:#22c55e} .erro{color:#ef4444}
  .linha{display:flex;gap:10px;flex-wrap:wrap}
`;

export const paginaSerial = (token, comMenu = false) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Consulta Serial · Automacao IOT Amaury</title><style>${CSS}</style>${comMenu ? CSS_MENU : ""}${FAVICON}</head><body data-token="${token}"${comMenu ? ' class="aba"' : ""}>
${comMenu ? menuHtml("/serial") + '<h1>Consulta Serial</h1><div class="sub">Aponte a câmera para o código de barras ou QR: lê sozinho. Moldura vermelha = procurando, verde = detectou.</div>' : ""}
<div id="cena">
  <video id="v" playsinline muted autoplay></video>
  <canvas id="o"></canvas>
  <div id="topo"><b>Consulta Serial</b><div id="estado">Abrindo a câmera…</div></div>
  <div id="barra">
    <button class="prim" id="agora" type="button">Escanear agora</button>
    <label class="bt">Foto<input id="foto" type="file" accept="image/*" capture="environment"></label>
    <button id="lanterna" type="button" style="display:none">🔦 Lanterna</button>
  </div>
  <div id="painel">
    <p class="tit">Código lido</p>
    <div id="lido"></div>
    <div>Padrão: <span id="padrao"></span></div>
    <div id="envio"></div>
    <div class="linha"><button class="prim" id="outro" type="button">Ler outro</button><button id="copiar" type="button">Copiar</button></div>
  </div>
</div>
<script src="/serial/zxing.js"></script>
<script src="/serial/cliente.js"></script>
</body></html>`;

export const paginaExpirada = () => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Link expirado</title><style>body{background:#0f1115;color:#e6e8ee;font:16px system-ui;padding:28px}</style></head>
<body><h2>Link expirado</h2><p>Peça "Consultar Serial" de novo à IA para gerar outro link (vale 10 minutos).</p></body></html>`;
