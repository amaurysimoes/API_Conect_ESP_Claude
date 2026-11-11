// Aba "Desk-Automacao_Firebase": cards de tudo que a máquina escolhida suporta + atalhos salvos. Modo escuro, mesmo menu das outras abas.
import { menuHtml, CSS_MENU } from "../../aplicacao_gps/paginas.js";
import { FAVICON } from "../../aplicacao_gps/favicon.js";

const CSS = `
  :root{color-scheme:dark;--fundo:#0f1115;--card:#171a21;--borda:#2a2f3a;--texto:#e6e8ee;--suave:#9aa3b2;--azul:#4c8dff;--verde:#3ddc84;--verm:#ff5c5c}
  body{font:15px system-ui,sans-serif;max-width:900px;margin:0 auto;padding:0 16px 40px;background:var(--fundo);color:var(--texto)}
  h1{font-size:20px;margin:0 0 6px} h2{font-size:15px;margin:22px 0 8px;color:var(--suave);font-weight:600}
  h3{font-size:13px;margin:12px 0 6px;color:var(--suave);font-weight:600}
  .sub{color:var(--suave);font-size:13px;margin:6px 0}
  .card{background:var(--card);border:1px solid var(--borda);border-radius:8px;padding:14px 16px;margin:12px 0}
  select,input{width:100%;box-sizing:border-box;padding:7px 9px;font:inherit;color:var(--texto);background:var(--fundo);border:1px solid var(--borda);border-radius:6px}
  input:focus,select:focus{outline:none;border-color:var(--azul)} ::placeholder{color:#5d6675}
  .grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
  .mini{background:var(--card);border:1px solid var(--borda);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-height:58px}
  .mini .t{font-weight:600;font-size:14px;word-break:break-word} .mini .d{color:var(--suave);font-size:12px;word-break:break-all}
  .mini.perigo{border-color:var(--verm)} .mini.off{opacity:.38}
  .mini.clique{cursor:pointer} .mini.clique:hover{border-color:var(--azul)} .mini.perigo.clique:hover{border-color:var(--verm);background:#1d1517}
  .linha{display:flex;gap:6px;align-items:center}
  button{padding:7px 12px;font:inherit;font-size:13px;border:1px solid var(--borda);border-radius:6px;background:var(--fundo);color:var(--texto);cursor:pointer}
  button:hover{border-color:var(--azul)} button:disabled{opacity:.5;cursor:default}
  button.principal{background:#1d2a45;border-color:var(--azul)}
  .x{padding:3px 8px;color:var(--suave)} .x:hover{border-color:var(--verm);color:var(--texto)}
  .bolinha{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
  .ok{color:var(--verde)} .erro{color:var(--verm)}
  .selo{font-size:12px;font-weight:600} .selo.sim{color:var(--verde)} .selo.nao{color:var(--verm)}
  #res{min-height:20px;font-size:14px}
`;

export const paginaDesk = () => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Desk-Automacao_Firebase · Automacao IOT Amaury</title><style>${CSS}</style>${CSS_MENU}${FAVICON}</head><body>
${menuHtml("/desk")}
<h1>Desk-Automacao_Firebase</h1>
<p class="sub">Escolha a máquina e toque no card. Só ficam ativos os recursos que o agente da máquina diz suportar (ícone verde na bandeja).
Aqui você abre qualquer coisa na hora; para a <b>IA</b> encontrar os seus sites, programas, pastas e arquivos, use <b>Salvar</b>.</p>
<div class="card">
  <select id="maq"></select>
  <div id="info" class="sub">Carregando…</div>
</div>
<p id="res" class="sub"></p>
<div id="tela"></div>
<script>
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $ = id => document.getElementById(id);
const TIPOS = { site: 'Sites', programa: 'Programas', pasta: 'Pastas', arquivo: 'Arquivos' };
const ACAO_DO_TIPO = { site: 'abrir_url', programa: 'abrir_programa', pasta: 'abrir_pasta', arquivo: 'abrir_arquivo' };
let maquinas = [], acoes = [], programas = [], atalhos = [], achados = {};

const atual = () => maquinas.find(m => m.maquina === $('maq').value);
// agente que informa suas ações: só elas; agente antigo (sem lista): mostra tudo
const suporta = id => { const m = atual(); return !m || !Array.isArray(m.acoes) || m.acoes.includes(id); };

async function carregar() {
  const [m, p, a] = await Promise.all(['maquinas', 'catalogo', 'acoes'].map(n => fetch('/api/desk/' + n).then(r => r.json())));
  maquinas = Array.isArray(m) ? m : []; programas = Array.isArray(p) ? p : []; acoes = Array.isArray(a) ? a : [];
  const escolhida = $('maq').value;
  $('maq').innerHTML = maquinas.map(x => '<option value="' + esc(x.maquina) + '">' + esc(x.maquina) + (x.online ? ' · ativa' : ' · offline') + '</option>').join('') || '<option>Nenhuma máquina</option>';
  if (escolhida && maquinas.some(x => x.maquina === escolhida)) $('maq').value = escolhida;
  else { const ativa = maquinas.find(x => x.online); if (ativa) $('maq').value = ativa.maquina; }
  if (!atalhos.length && atual()) await carregarAtalhos(false);
  render();
}

async function carregarAtalhos(desenhar = true) {
  const m = atual();
  atalhos = [];
  if (m) {
    const r = await fetch('/api/desk/atalhos?maquina=' + encodeURIComponent(m.maquina));
    const d = await r.json();
    if (Array.isArray(d)) atalhos = d;
  }
  if (desenhar) render();
}

// redesenha sem perder o que o usuário está digitando
function render() {
  const guardado = {}, foco = document.activeElement;
  document.querySelectorAll('#tela input').forEach(i => { guardado[i.id] = i.value; });
  const x = atual();
  $('info').innerHTML = !x ? 'Nenhuma máquina cadastrada.' :
    '<span class="bolinha" style="background:' + (x.online ? '#3ddc84' : '#ff5c5c') + '"></span>' + (x.online ? 'ativa' : 'offline (sem sinal há ' + esc(x.visto_ha_s ?? '?') + ' s)') +
    (x.resumo && x.online ? ' · CPU ' + x.resumo.cpu + '% · memória ' + x.resumo.memoria + '% · disco ' + x.resumo.disco + '% · ligada há ' + x.resumo.ligado_h + ' h' : '') +
    (Array.isArray(x.acoes) ? ' · ' + x.acoes.length + ' ações suportadas' : ' · agente sem lista de ações (mostrando tudo)');

  const cartao = a => {
    const off = suporta(a.id) ? '' : ' off', cls = 'mini' + (a.perigosa ? ' perigo' : '') + off, dis = off ? ' disabled' : '';
    if (!a.campos) {
      return '<div class="' + cls + (off ? '' : ' clique') + '" ' + (off ? 'title="este agente não suporta"' : 'data-a="acao" data-id="' + a.id + '"') + '><span class="t">' + esc(a.nome) + '</span><span class="d">' + esc(a.dica || '') + '</span></div>';
    }
    const campos = a.campos.map(c => '<input id="f_' + a.id + '_' + c.nome + '" data-card="' + a.id + '" placeholder="' + esc(c.exemplo ? c.rotulo + ' · ex.: ' + c.exemplo : c.rotulo) + '">').join('');
    const nome = a.salvaComo ? '<input id="f_' + a.id + '_nome" data-card="' + a.id + '" placeholder="nome do atalho (para salvar)">' : '';
    const botoes = '<div class="linha"><button class="principal" data-a="abrir" data-id="' + a.id + '"' + dis + '>' + esc(a.botao || 'Enviar') + '</button>' +
      (a.salvaComo ? '<button data-a="salvar" data-id="' + a.id + '"' + dis + '>Salvar</button>' : '') + '</div>';
    return '<div class="' + cls + '"><span class="t">' + esc(a.nome) + '</span>' + campos + nome + botoes + '</div>';
  };
  const grupo = nome => '<h2>' + nome + '</h2><div class="grade">' + acoes.filter(a => a.grupo === nome).map(cartao).join('') + '</div>';

  // atalhos salvos: o que a IA encontra
  const selo = a => achados[a.id] === true ? '<span class="selo sim">✓ existe nesta máquina</span>' : achados[a.id] === false ? '<span class="selo nao">✗ ainda não existe nesta máquina</span>' : '';
  const salvos = Object.keys(TIPOS).map(tipo => {
    const lista = atalhos.filter(a => a.tipo === tipo);
    if (!lista.length) return '';
    const ok = suporta(ACAO_DO_TIPO[tipo]);
    return '<h3>' + TIPOS[tipo] + ' (' + lista.length + ')</h3><div class="grade">' + lista.map(a =>
      '<div class="mini' + (ok ? ' clique' : ' off') + '" ' + (ok ? 'data-a="atalho" data-id="' + a.id + '"' : '') + '>' +
      '<div class="linha"><span class="t" style="flex:1">' + esc(a.nome) + '</span><button class="x" title="Apagar o atalho" data-a="apagar" data-id="' + a.id + '">apagar</button></div>' +
      '<span class="d">' + esc(a.alvo) + (a.argumentos ? ' ' + esc(a.argumentos) : '') + '</span>' + selo(a) + '</div>').join('') + '</div>';
  }).join('');
  const podeVerificar = suporta('verificar_caminhos') && atalhos.some(a => a.tipo !== 'site');
  const meus = '<h2>Meus atalhos (a IA encontra estes)</h2>' +
    (atalhos.length ? salvos + '<p><button data-a="verificar"' + (podeVerificar ? '' : ' disabled') + '>Verificar nesta máquina</button> <span class="sub">confere se os programas, pastas e arquivos existem aqui</span></p>'
      : '<p class="sub">Nenhum atalho salvo ainda. Preencha um card de <b>Abrir</b> abaixo, dê um nome e toque em <b>Salvar</b>. Salve quantos sites e programas quiser.</p>');

  const prog = programas.map(p => {
    const ab = suporta('abrir_programa'), fe = suporta('fechar_programa') && p.fecha;
    return '<div class="mini' + (ab ? ' clique' : ' off') + '" ' + (ab ? 'data-a="programa" data-id="' + p.id + '"' : '') + '><div class="linha"><span class="t" style="flex:1">' + esc(p.nome) + '</span>' +
      (fe ? '<button class="x" title="Fechar ' + esc(p.nome) + '" data-a="fechar" data-id="' + p.id + '">fechar</button>' : '') + '</div></div>';
  }).join('');

  $('tela').innerHTML = meus + grupo('Sistema') + grupo('Abrir') + '<h2>Programas (' + programas.length + ')</h2><div class="grade">' + prog + '</div>';
  for (const [id, v] of Object.entries(guardado)) { const el = $(id); if (el) el.value = v; }
  if (foco && foco.id && $(foco.id) && foco.tagName === 'INPUT') { $(foco.id).focus(); }
}

async function enviar(acao, extra) {
  const res = $('res'); res.className = 'sub'; res.textContent = 'Enviando…';
  try {
    const r = await fetch('/api/desk/executar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquina: $('maq').value, acao, ...extra }) });
    const d = await r.json();
    res.className = 'sub ' + (r.ok && d.ok ? 'ok' : 'erro');
    res.textContent = d.erro || (d.maquina + ': ' + d.texto);
  } catch (e) { res.className = 'sub erro'; res.textContent = 'Falhou: ' + e.message; }
}
const aviso = (t, ok) => { const r = $('res'); r.className = 'sub ' + (ok ? 'ok' : 'erro'); r.textContent = t; };
const valor = (card, campo) => ($('f_' + card + '_' + campo) || { value: '' }).value.trim();

function abrirCard(id) {
  const a = acoes.find(x => x.id === id), extra = {};
  for (const c of a.campos) { const v = valor(id, c.nome); if (v) extra[c.nome] = v; else if (!c.opcional) return aviso('Preencha: ' + c.rotulo); }
  return enviar(id, extra);
}

async function salvarCard(id) {
  const a = acoes.find(x => x.id === id), nome = valor(id, 'nome');
  const principal = a.campos[0], extra = a.campos[1];
  if (!valor(id, principal.nome)) return aviso('Preencha: ' + principal.rotulo);
  if (!nome) return aviso('Dê um nome ao atalho (campo "nome do atalho") para salvar.');
  const r = await fetch('/api/desk/atalhos', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maquina: $('maq').value, tipo: a.salvaComo, nome, alvo: valor(id, principal.nome), argumentos: extra ? valor(id, extra.nome) : '' }) });
  const d = await r.json();
  if (!r.ok) return aviso(d.erro || 'Não consegui salvar.');
  aviso((d.atualizado ? 'Atalho atualizado: ' : 'Atalho salvo: ') + nome + '. Agora a IA encontra "' + nome + '".', true);
  for (const c of [...a.campos.map(c => c.nome), 'nome']) { const el = $('f_' + id + '_' + c); if (el) el.value = ''; }
  achados = {};
  await carregarAtalhos();
}

async function apagarAtalho(id) {
  const a = atalhos.find(x => x.id === id);
  if (!a || !confirm('Apagar o atalho "' + a.nome + '"?')) return;
  const r = await fetch('/api/desk/atalhos/' + id + '?maquina=' + encodeURIComponent($('maq').value), { method: 'DELETE' });
  if (!r.ok) return aviso((await r.json()).erro || 'Não consegui apagar.');
  aviso('Atalho apagado: ' + a.nome, true);
  await carregarAtalhos();
}

async function verificar() {
  aviso('Conferindo na máquina…', true);
  const r = await fetch('/api/desk/atalhos/verificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maquina: $('maq').value }) });
  const d = await r.json();
  if (!r.ok) return aviso(d.erro || 'Não consegui verificar.');
  achados = d;
  const faltam = atalhos.filter(a => d[a.id] === false).length;
  aviso(faltam ? faltam + ' atalho(s) ainda não existem nesta máquina.' : 'Tudo o que foi salvo existe nesta máquina.', !faltam);
  render();
}

$('tela').addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  const { a, id } = b.dataset;
  if (a === 'acao') { const c = acoes.find(x => x.id === id); if (c && c.perigosa) { if (!confirm(c.confirmar || 'Tem certeza?')) return; return enviar(id, { confirmado: true }); } return enviar(id, {}); }
  if (a === 'abrir') return abrirCard(id);
  if (a === 'salvar') return salvarCard(id);
  if (a === 'atalho') return enviar('abrir_atalho', { atalho: id });
  if (a === 'apagar') { e.stopPropagation(); return apagarAtalho(id); }
  if (a === 'verificar') return verificar();
  if (a === 'programa') return enviar('abrir_programa', { programa: id });
  if (a === 'fechar') { e.stopPropagation(); return enviar('fechar_programa', { programa: id }); }
});
$('tela').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.dataset.card) return;
  const b = document.querySelector('[data-a="abrir"][data-id="' + e.target.dataset.card + '"]');
  if (b && !b.disabled) b.click();
});
$('maq').addEventListener('change', async () => { achados = {}; await carregarAtalhos(); });
carregar(); setInterval(carregar, 15000);
</script></body></html>`;
