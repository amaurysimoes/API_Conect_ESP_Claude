// Aba "Desk-Automacao_Firebase": cards de tudo o que a máquina escolhida suporta. Modo escuro, mesmo menu das outras abas.
import { menuHtml, CSS_MENU } from "../../gps_amaury/paginas.js";
import { FAVICON } from "../../gps_amaury/favicon.js";

const CSS = `
  :root{color-scheme:dark;--fundo:#0f1115;--card:#171a21;--borda:#2a2f3a;--texto:#e6e8ee;--suave:#9aa3b2;--azul:#4c8dff;--verde:#3ddc84;--verm:#ff5c5c}
  body{font:15px system-ui,sans-serif;max-width:900px;margin:0 auto;padding:0 16px 40px;background:var(--fundo);color:var(--texto)}
  h1{font-size:20px;margin:0 0 6px} h2{font-size:15px;margin:22px 0 8px;color:var(--suave);font-weight:600}
  .sub{color:var(--suave);font-size:13px;margin:6px 0}
  .card{background:var(--card);border:1px solid var(--borda);border-radius:8px;padding:14px 16px;margin:12px 0}
  select,input{width:100%;box-sizing:border-box;padding:7px 9px;font:inherit;color:var(--texto);background:var(--fundo);border:1px solid var(--borda);border-radius:6px}
  input:focus,select:focus{outline:none;border-color:var(--azul)} ::placeholder{color:#5d6675}
  .grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}
  .mini{background:var(--card);border:1px solid var(--borda);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-height:58px}
  .mini .t{font-weight:600;font-size:14px} .mini .d{color:var(--suave);font-size:12px}
  .mini.perigo{border-color:var(--verm)} .mini.off{opacity:.38}
  .mini.clique{cursor:pointer} .mini.clique:hover{border-color:var(--azul)} .mini.perigo.clique:hover{border-color:var(--verm);background:#1d1517}
  .linha{display:flex;gap:6px;align-items:center}
  button{padding:7px 12px;font:inherit;font-size:13px;border:1px solid var(--borda);border-radius:6px;background:var(--fundo);color:var(--texto);cursor:pointer}
  button:hover{border-color:var(--azul)} button:disabled{opacity:.5;cursor:wait}
  .x{padding:3px 8px;color:var(--suave)} .x:hover{border-color:var(--verm);color:var(--texto)}
  .bolinha{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
  .ok{color:var(--verde)} .erro{color:var(--verm)}
  #res{min-height:20px;font-size:14px}
`;

export const paginaDesk = () => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Desk-Automacao_Firebase · Automacao IOT Amaury</title><style>${CSS}</style>${CSS_MENU}${FAVICON}</head><body>
${menuHtml("/desk")}
<h1>Desk-Automacao_Firebase</h1>
<p class="sub">Escolha a máquina e toque no card. Só aparecem ativos os recursos que o agente da máquina diz suportar (ícone verde na bandeja).</p>
<div class="card">
  <select id="maq" onchange="render()"></select>
  <div id="info" class="sub">Carregando…</div>
</div>
<p id="res" class="sub"></p>
<div id="tela"></div>
<script>
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let maquinas = [], acoes = [], programas = [];

async function carregar() {
  const [m, p, a] = await Promise.all(['maquinas', 'catalogo', 'acoes'].map(n => fetch('/api/desk/' + n).then(r => r.json())));
  maquinas = Array.isArray(m) ? m : []; programas = Array.isArray(p) ? p : []; acoes = Array.isArray(a) ? a : [];
  const atual = document.getElementById('maq').value;
  document.getElementById('maq').innerHTML = maquinas.map(x => '<option value="' + esc(x.maquina) + '">' + esc(x.maquina) + (x.online ? ' · ativa' : ' · offline') + '</option>').join('') || '<option>Nenhuma máquina</option>';
  if (atual) document.getElementById('maq').value = atual;
  render();
}
const atual = () => maquinas.find(m => m.maquina === document.getElementById('maq').value);
// agente que informa suas ações: só elas; agente antigo (sem lista): mostra tudo
const suporta = id => { const m = atual(); return !m || !Array.isArray(m.acoes) || m.acoes.includes(id); };

function render() {
  const x = atual();
  document.getElementById('info').innerHTML = !x ? 'Nenhuma máquina cadastrada.' :
    '<span class="bolinha" style="background:' + (x.online ? '#3ddc84' : '#ff5c5c') + '"></span>' + (x.online ? 'ativa' : 'offline (sem sinal há ' + esc(x.visto_ha_s ?? '?') + ' s)') +
    (x.resumo && x.online ? ' · CPU ' + x.resumo.cpu + '% · memória ' + x.resumo.memoria + '% · disco ' + x.resumo.disco + '% · ligada há ' + x.resumo.ligado_h + ' h' : '') +
    (x && Array.isArray(x.acoes) ? ' · ' + x.acoes.length + ' ações suportadas' : ' · agente sem lista de ações (mostrando tudo)');
  const cartao = a => {
    const off = suporta(a.id) ? '' : ' off', cls = 'mini' + (a.perigosa ? ' perigo' : '') + off;
    if (!a.campos) return '<div class="' + cls + ' clique" ' + (off ? 'title="este agente não suporta"' : 'onclick="acao(\\'' + a.id + '\\')"') + '><span class="t">' + esc(a.nome) + '</span><span class="d">' + esc(a.dica || '') + '</span></div>';
    const campos = a.campos.map(c => '<input id="f_' + a.id + '_' + c.nome + '" placeholder="' + esc(c.exemplo ? c.rotulo + ' · ex.: ' + c.exemplo : c.rotulo) + '" onkeydown="if(event.key===\\'Enter\\')formulario(\\'' + a.id + '\\')">').join('');
    return '<div class="' + cls + '"><span class="t">' + esc(a.nome) + '</span>' + campos + '<button ' + (off ? 'disabled' : 'onclick="formulario(\\'' + a.id + '\\')"') + '>' + esc(a.botao || 'Enviar') + '</button></div>';
  };
  const grupo = nome => '<h2>' + nome + '</h2><div class="grade">' + acoes.filter(a => a.grupo === nome).map(cartao).join('') + '</div>';
  const prog = programas.map(p => {
    const ab = suporta('abrir_programa'), fe = suporta('fechar_programa') && p.fecha;
    return '<div class="mini' + (ab ? ' clique' : ' off') + '" ' + (ab ? 'onclick="abrir(\\'' + p.id + '\\')"' : '') + '><div class="linha"><span class="t" style="flex:1">' + esc(p.nome) + '</span>' +
      (fe ? '<button class="x" title="Fechar ' + esc(p.nome) + '" onclick="event.stopPropagation();fechar(\\'' + p.id + '\\')">fechar</button>' : '') + '</div></div>';
  }).join('');
  document.getElementById('tela').innerHTML = grupo('Sistema') + grupo('Abrir') + '<h2>Programas (' + programas.length + ')</h2><div class="grade">' + prog + '</div>';
}

async function enviar(acao, extra) {
  const res = document.getElementById('res'); res.className = 'sub'; res.textContent = 'Enviando…';
  try {
    const r = await fetch('/api/desk/executar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquina: document.getElementById('maq').value, acao, ...extra }) });
    const d = await r.json();
    res.className = 'sub ' + (r.ok && d.ok ? 'ok' : 'erro');
    res.textContent = d.erro || (d.maquina + ': ' + d.texto);
  } catch (e) { res.className = 'sub erro'; res.textContent = 'Falhou: ' + e.message; }
}
function acao(id) {
  const a = acoes.find(x => x.id === id);
  if (a && a.perigosa) { if (!confirm(a.confirmar || 'Tem certeza?')) return; return enviar(id, { confirmado: true }); }
  return enviar(id, {});
}
function formulario(id) {
  const a = acoes.find(x => x.id === id), extra = {};
  for (const c of a.campos) { const v = document.getElementById('f_' + id + '_' + c.nome).value.trim(); if (v) extra[c.nome] = v; else if (!c.opcional) { return aviso('Preencha: ' + c.rotulo); } }
  return enviar(id, extra);
}
const aviso = t => { const r = document.getElementById('res'); r.className = 'sub erro'; r.textContent = t; };
const abrir = id => enviar('abrir_programa', { programa: id });
const fechar = id => enviar('fechar_programa', { programa: id });
carregar(); setInterval(carregar, 15000);
</script></body></html>`;
