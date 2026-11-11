// Páginas do painel (HTML simples, sempre em modo escuro). Todas atrás da senha do painel.
import { FAVICON } from "./favicon.js";

const CSS = `
  :root{color-scheme:dark;--fundo:#0f1115;--card:#171a21;--borda:#2a2f3a;--texto:#e6e8ee;--suave:#9aa3b2;--azul:#4c8dff;--verde:#3ddc84;--verm:#ff5c5c}
  body{font:15px system-ui,sans-serif;max-width:760px;margin:0 auto;padding:0 16px 40px;background:var(--fundo);color:var(--texto)}
  h1{font-size:20px;margin:0 0 6px} h2{font-size:16px;margin:24px 0 4px}
  .sub{color:var(--suave);font-size:13px;margin-bottom:8px}
  table{width:100%;border-collapse:collapse;background:var(--card);border-radius:8px;overflow:hidden}
  td,th{padding:8px 10px;border-bottom:1px solid var(--borda);text-align:left;vertical-align:middle}
  th{color:var(--suave);font-weight:600;font-size:13px}
  label{display:block;color:var(--suave);font-size:13px;margin:10px 0 4px}
  input{width:100%;box-sizing:border-box;padding:8px 10px;font:inherit;color:var(--texto);background:var(--fundo);border:1px solid var(--borda);border-radius:6px}
  input:focus{outline:none;border-color:var(--azul)} ::placeholder{color:#5d6675}
  button{padding:9px 18px;font:inherit;border:0;border-radius:6px;background:var(--azul);color:#fff;cursor:pointer}
  button.perigo{background:transparent;color:var(--verm);border:1px solid var(--borda);padding:5px 10px}
  button.sec{background:var(--card);border:1px solid var(--borda);color:var(--texto);padding:5px 10px}
  button:hover{filter:brightness(1.1)}
  .card{background:var(--card);border:1px solid var(--borda);border-radius:8px;padding:14px 16px;margin:12px 0}
  .on{color:var(--verde);font-weight:600} .off{color:var(--suave)} .bolinha{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
  .msg{margin-left:12px;color:var(--verde)} .erro{color:var(--verm)}
  .linha{display:flex;gap:10px} .linha>div{flex:1}
`;

// "/" é a página de pinos original (o menu é injetado nela por aplicacao_gps/http.js, sem editar o código antigo)
const LINKS = [["/", "IOT-Automacao"], ["/clp", "Conexao Socket-TCP/IP"], ["/desk", "Desk-Automacao_Firebase"], ["/enderecos", "GPS-Rotas"], ["/gps", "GPS"]];
// Marca d'água: img/circuito-cinza.svg (vetor: nunca desfoca), bem clarinha, fixa atrás de todo o conteúdo de todas as abas.
const MARCA = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='16 16 88 88' fill='none'>" +
  "<path d='M32 42 H42 L58 26 H88 M32 60 H46 L58 48 H82 M32 78 H46 L64 60 H88 M44 94 H64 L74 84 H82' stroke='#6B7280' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/>" +
  "<g stroke='#6B7280' stroke-width='3.5'><circle cx='26' cy='42' r='5'/><circle cx='26' cy='78' r='5'/><circle cx='88' cy='48' r='5'/><circle cx='88' cy='84' r='5'/></g>" +
  "<g fill='#6B7280'><circle cx='26' cy='60' r='6'/><circle cx='38' cy='94' r='6'/><circle cx='94' cy='26' r='6'/><circle cx='94' cy='60' r='6'/></g></svg>";
const MARCA_URI = "data:image/svg+xml," + encodeURIComponent(MARCA);
export const CSS_MENU = `<style>
  body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.07;background:url("${MARCA_URI}") center / min(72vmin,680px) no-repeat}
  nav{display:flex;gap:6px;padding:14px 0;border-bottom:1px solid var(--borda);margin-bottom:18px;font:15px system-ui,sans-serif}
  nav a{padding:7px 14px;border-radius:6px;color:var(--suave);text-decoration:none} nav a.on{background:var(--card);color:var(--texto);border:1px solid var(--borda)}
</style>`;
export const menuHtml = (ativo) => `<nav>${LINKS.map(([h, t]) => `<a href="${h}"${h === ativo ? ' class="on"' : ""}>${t}</a>`).join("")}</nav>`;

const pagina = (titulo, ativo, corpo, script) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo} · Automacao IOT Amaury</title><style>${CSS}</style>${CSS_MENU}${FAVICON}</head><body>
${menuHtml(ativo)}
${corpo}
<script>
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const aviso = (id, txt, erro) => { const e = document.getElementById(id); e.textContent = txt; e.className = 'msg' + (erro ? ' erro' : ''); setTimeout(() => e.textContent = '', 4000); };
${script}
</script></body></html>`;

export const paginaEnderecos = () => pagina("GPS-Rotas", "/enderecos", `
<h1>GPS-Rotas</h1>
<p class="sub">Lugares com nome para pedir rotas ao Claude: "qual a melhor rota para a <b>casa 1</b>?". Ficam <b>cifrados</b> no Firebase: só este servidor consegue ler.</p>
<div class="card">
  <input type="hidden" id="id">
  <label>Nome</label><input id="nome" placeholder="Nome da Casa" maxlength="80">
  <label>Endereço (rua, número, complemento)</label><input id="endereco" placeholder="Informar o Endereço" maxlength="200">
  <label>CEP</label><input id="cep" placeholder="Insira o CEP" maxlength="12">
  <p><button onclick="salvar()">Salvar endereço</button> <button class="sec" onclick="limpar()">Limpar</button><span id="msg" class="msg"></span></p>
</div>
<h2>Salvos</h2>
<div id="lista">Carregando…</div>`, `
let lugares = [];
async function carregar() {
  const r = await fetch('/api/lugares');
  if (!r.ok) { document.getElementById('lista').innerHTML = '<span class="erro">' + esc((await r.json()).erro) + '</span>'; return; }
  lugares = await r.json();
  document.getElementById('lista').innerHTML = lugares.length ? '<table><tr><th>Nome</th><th>Endereço</th><th>CEP</th><th></th></tr>' +
    lugares.map((l, i) => '<tr><td>' + esc(l.nome) + '</td><td>' + esc(l.endereco) + '</td><td>' + esc(l.cep) + '</td><td>' +
      '<button class="sec" onclick="editar(' + i + ')">Editar</button> <button class="perigo" onclick="apagar(' + i + ')">Excluir</button></td></tr>').join('') + '</table>'
    : 'Nenhum endereço salvo ainda.';
}
function limpar() { for (const c of ['id', 'nome', 'endereco', 'cep']) document.getElementById(c).value = ''; }
function editar(i) { const l = lugares[i]; for (const c of ['id', 'nome', 'endereco', 'cep']) document.getElementById(c).value = l[c] || ''; window.scrollTo(0, 0); }
async function salvar() {
  const corpo = Object.fromEntries(['id', 'nome', 'endereco', 'cep'].map(c => [c, document.getElementById(c).value.trim()]));
  if (!corpo.nome || !corpo.endereco) return aviso('msg', 'Preencha nome e endereço.', true);
  const r = await fetch('/api/lugares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  if (r.ok) { limpar(); carregar(); }
  aviso('msg', r.ok ? 'Salvo.' : (await r.json()).erro, !r.ok);
}
async function apagar(i) {
  if (!confirm('Excluir "' + lugares[i].nome + '"?')) return;
  await fetch('/api/lugares/' + lugares[i].id, { method: 'DELETE' });
  carregar();
}
carregar();`);

export const paginaGps = () => pagina("GPS", "/gps", `
<h1>GPS</h1>
<p class="sub">Abra esta página <b>no celular</b> e toque em compartilhar. Enquanto ela estiver aberta e visível, o Claude sabe onde você está para traçar a rota e te orientar.</p>
<div class="card">
  <button id="botao" onclick="alternar()">Compartilhar minha localização</button>
  <p id="estado" class="sub">Parado.</p>
</div>
<p class="sub">Dicas: mantenha a tela ligada e esta página aberta. Se o navegador pausar em segundo plano, a posição para de atualizar (o Claude avisa quando ela está velha, depois de 15 min). A posição fica só na memória do servidor, não é gravada em lugar nenhum.</p>`, `
let watch = null, ultimoEnvio = 0, wake = null;
function alternar() {
  if (watch !== null) { navigator.geolocation.clearWatch(watch); watch = null; if (wake) wake.release().catch(() => {}); document.getElementById('botao').textContent = 'Compartilhar minha localização'; document.getElementById('estado').textContent = 'Parado.'; return; }
  if (!navigator.geolocation) return document.getElementById('estado').textContent = 'Este navegador não tem GPS.';
  document.getElementById('botao').textContent = 'Parar de compartilhar';
  document.getElementById('estado').textContent = 'Pedindo permissão…';
  if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => wake = w).catch(() => {});
  watch = navigator.geolocation.watchPosition(async p => {
    if (Date.now() - ultimoEnvio < 5000) return;
    ultimoEnvio = Date.now();
    const r = await fetch('/api/posicao', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy }) });
    document.getElementById('estado').textContent = (r.ok ? 'Enviado às ' : 'Falhou às ') + new Date().toLocaleTimeString('pt-BR') + ' · precisão ~' + Math.round(p.coords.accuracy) + ' m';
  }, e => { document.getElementById('estado').textContent = 'Erro: ' + e.message + ' (permita a localização no navegador).'; },
  { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}`);
