// Aba "Desk-Automacao_Firebase": escolhe a máquina e abre programas nela. Modo escuro, mesmo menu das outras abas.
import { menuHtml, CSS_MENU } from "../../gps_amaury/paginas.js";

const CSS = `
  :root{color-scheme:dark;--fundo:#0f1115;--card:#171a21;--borda:#2a2f3a;--texto:#e6e8ee;--suave:#9aa3b2;--azul:#4c8dff;--verde:#3ddc84;--verm:#ff5c5c}
  body{font:15px system-ui,sans-serif;max-width:760px;margin:0 auto;padding:0 16px 40px;background:var(--fundo);color:var(--texto)}
  h1{font-size:20px;margin:0 0 6px} h2{font-size:16px;margin:22px 0 8px}
  .sub{color:var(--suave);font-size:13px;margin:6px 0}
  .card{background:var(--card);border:1px solid var(--borda);border-radius:8px;padding:14px 16px;margin:12px 0}
  select{width:100%;padding:8px 10px;font:inherit;color:var(--texto);background:var(--fundo);border:1px solid var(--borda);border-radius:6px}
  button{padding:9px 14px;font:inherit;border:1px solid var(--borda);border-radius:6px;background:var(--card);color:var(--texto);cursor:pointer}
  button:hover{border-color:var(--azul)} button:disabled{opacity:.5;cursor:wait}
  .grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
  .bolinha{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
  .ok{color:var(--verde)} .erro{color:var(--verm)}
`;

export const paginaDesk = () => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Desk-Automacao_Firebase · Automacao IOT Amaury</title><style>${CSS}</style>${CSS_MENU}</head><body>
${menuHtml("/desk")}
<h1>Desk-Automacao_Firebase</h1>
<p class="sub">Escolha a máquina e toque no programa para abrir nela. O agente da máquina precisa estar ligado (ícone verde na bandeja).</p>
<div class="card">
  <select id="maq" onchange="mostrar()"></select>
  <div id="info" class="sub">Carregando…</div>
  <button onclick="enviar('info')">Informações</button> <button onclick="enviar('bloquear_tela')">Bloquear tela</button>
</div>
<h2>Programas</h2>
<div id="grade" class="grade"></div>
<p id="res" class="sub"></p>
<script>
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let maquinas = [];
async function carregar() {
  const [m, c] = await Promise.all([fetch('/api/desk/maquinas').then(r => r.json()), fetch('/api/desk/catalogo').then(r => r.json())]);
  maquinas = Array.isArray(m) ? m : [];
  document.getElementById('maq').innerHTML = maquinas.map(x => '<option value="' + esc(x.maquina) + '">' + esc(x.maquina) + (x.online ? ' · ativa' : ' · offline') + '</option>').join('') || '<option>Nenhuma máquina</option>';
  document.getElementById('grade').innerHTML = c.map(p => '<button onclick="abrir(\\'' + p.id + '\\', this)">' + esc(p.nome) + '</button>').join('');
  mostrar();
}
function mostrar() {
  const x = maquinas.find(m => m.maquina === document.getElementById('maq').value);
  document.getElementById('info').innerHTML = !x ? 'Nenhuma máquina cadastrada.' :
    '<span class="bolinha" style="background:' + (x.online ? '#3ddc84' : '#ff5c5c') + '"></span>' + (x.online ? 'ativa' : 'offline (sem sinal há ' + esc(x.visto_ha_s ?? '?') + ' s)') +
    (x.resumo && x.online ? ' · CPU ' + x.resumo.cpu + '% · memória ' + x.resumo.memoria + '% · disco ' + x.resumo.disco + '% · ligada há ' + x.resumo.ligado_h + ' h' : '');
}
async function enviar(acao, extra, botao) {
  const res = document.getElementById('res'); res.className = 'sub'; res.textContent = 'Enviando…';
  if (botao) botao.disabled = true;
  try {
    const r = await fetch('/api/desk/executar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquina: document.getElementById('maq').value, acao, ...extra }) });
    const d = await r.json();
    res.className = 'sub ' + (r.ok && d.ok ? 'ok' : 'erro');
    res.textContent = d.erro || (d.maquina + ': ' + d.texto);
  } catch (e) { res.className = 'sub erro'; res.textContent = 'Falhou: ' + e.message; }
  if (botao) botao.disabled = false;
}
const abrir = (id, botao) => enviar('abrir_programa', { programa: id }, botao);
carregar();
</script></body></html>`;
