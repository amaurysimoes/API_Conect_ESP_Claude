// Aba "Documentos Database": escolhe o tipo (.xls .xlsx .doc .docx), lista os arquivos guardados no Aiven,
// envia, baixa, lê o texto e exclui. Modo escuro; mesmas variáveis CSS das outras abas (o botão Light/Dark funciona).
import { menuHtml, CSS_MENU } from "../aplicacao_gps/paginas.js";
import { FAVICON } from "../aplicacao_gps/favicon.js";

const CSS = `
  :root{color-scheme:dark;--fundo:#0f1115;--card:#171a21;--borda:#2a2f3a;--texto:#e6e8ee;--suave:#9aa3b2;--azul:#4c8dff;--verde:#3ddc84;--verm:#ff5c5c;--amarelo:#f5c451}
  body{font:15px system-ui,sans-serif;max-width:960px;margin:0 auto;padding:0 16px 40px;background:var(--fundo);color:var(--texto)}
  h1{font-size:20px;margin:0} .sub{color:var(--suave);font-size:13px;margin:6px 0}
  .card{background:var(--card);border:1px solid var(--borda);border-radius:8px;padding:14px 16px;margin:12px 0}
  .linha{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  button,label.arq{padding:7px 14px;font:inherit;font-size:13px;border:1px solid var(--borda);border-radius:6px;background:var(--fundo);color:var(--texto);cursor:pointer}
  button:hover,label.arq:hover{border-color:var(--azul)} button:disabled{opacity:.45;cursor:default}
  button.on{background:#1d2a45;border-color:var(--azul);color:var(--texto);font-weight:600}
  button.perigo:hover{border-color:var(--verm)}
  input[type=file]{display:none}
  table{border-collapse:collapse;width:100%;font-size:14px} th,td{border-bottom:1px solid var(--borda);padding:7px 8px;text-align:left}
  th{color:var(--suave);font-weight:600;font-size:12px} td.num{text-align:right;white-space:nowrap}
  .ok{color:var(--verde)} .erro{color:var(--verm)} .aviso{color:var(--amarelo)}
  #aviso{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);max-width:90vw;padding:10px 16px;border-radius:8px;border:1px solid var(--borda);background:var(--card);display:none;z-index:9}
  dialog{background:var(--card);color:var(--texto);border:1px solid var(--borda);border-radius:10px;width:calc(100% - 32px);max-width:900px;max-height:86vh;padding:16px;overflow:auto}
  dialog::backdrop{background:rgba(0,0,0,.65)} pre{white-space:pre-wrap;word-break:break-word;font:13px Consolas,monospace;margin:10px 0 0}
`;

export const paginaDocs = (extensoes) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Documentos Database · Automacao IOT Amaury</title><style>${CSS}</style>${CSS_MENU}${FAVICON}</head><body>
${menuHtml("/docs")}
<h1>Documentos Database</h1>
<div class="sub">Arquivos guardados no MySQL do Aiven (imagens compactadas em WebP). A IA também lê estes arquivos pelo conector.</div>
<div class="card">
  <div class="linha" id="tipos"><span class="sub">Tipo:</span></div>
  <div class="linha" style="margin-top:10px">
    <label class="arq" id="rotuloArq">Enviar arquivo <input type="file" id="arq" multiple></label>
    <span class="sub" id="dica"></span>
  </div>
</div>
<div class="card"><table><thead><tr><th>Arquivo</th><th>Tipo</th><th class="num">Tamanho</th><th class="num">Imagens</th><th>Atualizado</th><th></th></tr></thead><tbody id="lista"><tr><td colspan="6" class="sub">Carregando… (se o servidor estava dormindo, leva uns 30 s)</td></tr></tbody></table></div>
<div id="aviso"></div>
<dialog id="dlg"><div class="linha"><b id="dlgTitulo" style="flex:1"></b><button id="dlgFecha">Fechar</button></div><pre id="dlgTexto"></pre></dialog>
<script>
const EXT = ${JSON.stringify(extensoes)}; // botões fixos; tipos novos aparecem sozinhos depois do primeiro envio
let ext = '';
const vistas = new Set();
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const tam = n => n < 1024 ? n + ' B' : n < 1048576 ? (n/1024).toFixed(1) + ' KB' : (n/1048576).toFixed(1) + ' MB';
function aviso(txt, erro) { const e = document.getElementById('aviso'); e.textContent = txt; e.className = erro ? 'erro' : 'ok'; e.style.display = 'block'; clearTimeout(aviso.t); aviso.t = setTimeout(() => e.style.display = 'none', erro ? 9000 : 4000); }
async function api(url, opc) { const r = await fetch(url, opc); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || ('Erro ' + r.status)); return j; }

function desenharTipos() {
  const c = document.getElementById('tipos');
  c.innerHTML = '<span class="sub">Tipo:</span>' + ['', ...EXT, ...[...vistas].filter(e => !EXT.includes(e)).sort()].map(e => '<button data-e="' + e + '" class="' + (e === ext ? 'on' : '') + '">' + (e ? '.' + e : 'Todos') + '</button>').join('');
  c.querySelectorAll('button').forEach(b => b.onclick = () => { ext = b.dataset.e; desenharTipos(); carregar(); });
  document.getElementById('arq').accept = ext ? '.' + ext : '';
  document.getElementById('dica').textContent = ext ? 'Envia arquivos .' + ext : 'Qualquer documento (planilha, Word, PDF, imagem…); programas e scripts não.';
}
async function carregar() {
  const t = document.getElementById('lista');
  try {
    const docs = await api('/api/docs/listar' + (ext ? '?ext=' + ext : ''));
    if (!ext) { const antes = vistas.size; docs.forEach(d => vistas.add(d.extensao)); if (vistas.size !== antes) desenharTipos(); }
    t.innerHTML = docs.length ? docs.map(d => '<tr><td>' + esc(d.nome) + (d.completo ? '' : ' <span class="aviso">(envio incompleto)</span>') + '</td><td>.' + esc(d.extensao) + '</td><td class="num">' + tam(d.tamanho) + '</td><td class="num">' + d.imagens + '</td><td>' + esc(String(d.atualizado_em || '').replace('T', ' ').slice(0, 16)) + '</td><td class="num"><button data-a="ler" data-n="' + esc(d.nome) + '">Ler</button> <button data-a="baixar" data-n="' + esc(d.nome) + '">Baixar</button> <button class="perigo" data-a="excluir" data-n="' + esc(d.nome) + '">Excluir</button></td></tr>').join('') : '<tr><td colspan="6" class="sub">Nenhum arquivo ' + (ext ? 'do tipo .' + ext : '') + ' no banco.</td></tr>';
    t.querySelectorAll('button').forEach(b => b.onclick = () => acao(b, b.dataset.a, b.dataset.n));
  } catch (e) { t.innerHTML = '<tr><td colspan="6" class="erro">' + esc(e.message) + '</td></tr>'; }
}
async function acao(btn, a, nome) {
  btn.disabled = true; const antes = btn.textContent; btn.textContent = '…';
  try {
    if (a === 'ler') {
      const r = await api('/api/docs/ler?nome=' + encodeURIComponent(nome));
      document.getElementById('dlgTitulo').textContent = nome + (r.truncado ? ' (mostrando o começo)' : '');
      document.getElementById('dlgTexto').textContent = r.texto || '(sem texto)';
      document.getElementById('dlg').showModal();
    } else if (a === 'baixar') {
      aviso('Montando o arquivo… (planilhas com muitas imagens podem levar vários segundos)');
      const r = await fetch('/api/docs/baixar?nome=' + encodeURIComponent(nome));
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Erro ' + r.status);
      const u = URL.createObjectURL(await r.blob()); const l = document.createElement('a'); l.href = u; l.download = nome; l.click(); URL.revokeObjectURL(u);
      aviso('✓ Baixado: ' + nome);
    } else if (a === 'excluir') {
      if (!confirm('Excluir "' + nome + '" do banco?')) return;
      await api('/api/docs/excluir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }) });
      aviso('✓ Excluído: ' + nome); carregar();
    }
  } catch (e) { aviso('✗ ' + e.message, true); } finally { btn.disabled = false; btn.textContent = antes; }
}
document.getElementById('dlgFecha').onclick = () => document.getElementById('dlg').close();
document.getElementById('arq').onchange = async ev => {
  const rotulo = document.getElementById('rotuloArq').firstChild;
  for (const f of ev.target.files) {
    try {
      aviso('Enviando ' + f.name + '… (compactando as imagens; pode levar um tempo)');
      const r = await api('/api/docs/enviar?nome=' + encodeURIComponent(f.name), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
      aviso('✓ ' + r.documento + ': ' + r.imagens + ' imagem(ns), ' + tam(r.tam_original) + ' → ' + tam(r.tam_armazenado));
    } catch (e) { aviso('✗ ' + f.name + ': ' + e.message, true); }
  }
  ev.target.value = ''; carregar();
};
desenharTipos(); carregar();
</script></body></html>`;
