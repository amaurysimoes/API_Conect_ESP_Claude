// Aba "Conexao Socket-TCP/IP": liga/desliga bits de um CLP (ou outro equipamento) EtherNet/IP pela máquina com o agente.
// Modo escuro, mesmo menu das outras abas. Botão "Instruções" abre um card com tudo que precisa saber.
import { menuHtml, CSS_MENU } from "../../aplicacao_gps/paginas.js";
import { FAVICON } from "../../aplicacao_gps/favicon.js";

const CSS = `
  :root{color-scheme:dark;--fundo:#0f1115;--card:#171a21;--borda:#2a2f3a;--texto:#e6e8ee;--suave:#9aa3b2;--azul:#4c8dff;--verde:#3ddc84;--verm:#ff5c5c;--amarelo:#f5c451}
  body{font:15px system-ui,sans-serif;max-width:960px;margin:0 auto;padding:0 16px 40px;background:var(--fundo);color:var(--texto)}
  h1{font-size:20px;margin:0} h2{font-size:15px;margin:0 0 10px;color:var(--suave);font-weight:600}
  .topo{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 0}
  .sub{color:var(--suave);font-size:13px;margin:6px 0}
  .card{background:var(--card);border:1px solid var(--borda);border-radius:8px;padding:14px 16px;margin:12px 0}
  select,input{width:100%;box-sizing:border-box;padding:7px 9px;font:inherit;color:var(--texto);background:var(--fundo);border:1px solid var(--borda);border-radius:6px}
  input:focus,select:focus{outline:none;border-color:var(--azul)} ::placeholder{color:#5d6675}
  input[type=checkbox]{width:auto}
  label{display:block;font-size:12px;color:var(--suave);margin-bottom:3px}
  .campos{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
  .grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
  .mini{background:var(--fundo);border:1px solid var(--borda);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
  .mini .n{font-weight:700;font-size:16px;flex:1}
  .linha{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  button{padding:7px 12px;font:inherit;font-size:13px;border:1px solid var(--borda);border-radius:6px;background:var(--fundo);color:var(--texto);cursor:pointer}
  button:hover{border-color:var(--azul)} button:disabled{opacity:.45;cursor:default}
  button.principal{background:#1d2a45;border-color:var(--azul)}
  .x{padding:3px 8px;color:var(--suave)} .x:hover{border-color:var(--verm);color:var(--texto)}
  .led{display:inline-block;width:11px;height:11px;border-radius:50%;background:#2a2f3a;border:1px solid #3a4150}
  .led.on{background:var(--verde);border-color:var(--verde)} .led.in.on{background:var(--azul);border-color:var(--azul)}
  .bolinha{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
  .ok{color:var(--verde)} .erro{color:var(--verm)} .aviso{color:var(--amarelo)}
  #res{min-height:20px;font-size:14px}
  dialog{background:var(--card);color:var(--texto);border:1px solid var(--borda);border-radius:10px;width:calc(100% - 32px);max-width:780px;max-height:86vh;padding:0;overflow:auto}
  dialog::backdrop{background:rgba(0,0,0,.65)}
  .dlg{padding:18px 20px 22px} .dlg h3{font-size:14px;margin:18px 0 6px;color:var(--azul)} .dlg p,.dlg li{font-size:14px;line-height:1.5;margin:4px 0}
  .dlg ul,.dlg ol{margin:4px 0;padding-left:22px} .dlg code{background:var(--fundo);border:1px solid var(--borda);border-radius:4px;padding:0 5px;font-size:13px}
  .dlg .caixa{border:1px solid var(--borda);border-radius:8px;padding:10px 14px;margin:10px 0;background:var(--fundo)}
  .dlg .caixa.alerta{border-color:var(--amarelo)} .dlg .caixa.ruim{border-color:var(--verm)}
  .dlg table{border-collapse:collapse;width:100%;font-size:13px} .dlg td,.dlg th{border:1px solid var(--borda);padding:5px 8px;text-align:left;vertical-align:top}
  .dlg .fecha{position:sticky;top:0;float:right;margin:10px}
`;

const INSTRUCOES = `
<button class="fecha" id="fechar" type="button">Fechar</button>
<div class="dlg">
<h1>Instruções · Conexao Socket-TCP/IP</h1>
<p>Liga, desliga e pulsa bits de um CLP (ou robô) por <b>EtherNet/IP</b>, a partir do Render ou do Claude. O agente do PC fica na rede do CLP (cabo RJ45) e na internet (Wi-Fi); o Render manda os comandos assinados pelo Firebase.</p>

<div class="caixa alerta">
<b>Só funciona com CLP que fale EtherNet/IP.</b>
<ul>
<li><b>Delta:</b> só os modelos com EtherNet/IP funcionam. Informe o modelo para confirmar. Se o EDS dele tiver outras assemblies, é só trocar os campos (instância de configuração, O→T e T→O).</li>
<li><b>Mitsubishi FX3U:</b> não fala EtherNet/IP, nem com o módulo ENET (esse módulo usa MC/Modbus). Comprando o FX3U para testar em casa, ele não vai conectar por este caminho.</li>
<li>Para testar em casa por EtherNet/IP, o equipamento tem de ser um <b>adapter EtherNet/IP</b>.</li>
<li>O código foi testado no PC com um adapter <b>simulado</b>. Com CLP real <b>ainda não foi testado</b>: a conexão real fica por sua conta.</li>
</ul>
</div>

<h3>Como ligar</h3>
<ol>
<li>Na máquina do agente: cabo RJ45 no CLP (IP do PC na mesma faixa do CLP, ex.: <code>192.168.0.x</code>, máscara <code>255.255.255.0</code>) e Wi-Fi/internet ligados.</li>
<li>Abra o agente (<code>Render_Agente</code>). Clique com o botão direito no ícone da bandeja e marque <b>Ativar Conexao CLP: EtherNet/IP</b>. Desmarcado, o agente ignora tudo daqui.</li>
<li>Nesta aba escolha a máquina (ela deve estar <b>ativa</b> e com a conexão CLP <b>ligada</b>).</li>
<li>Preencha o <b>IP do CLP</b>, toque em <b>Identificar</b> (deve mostrar o nome do equipamento) e depois em <b>Conectar</b>.</li>
<li>Em <b>Bits</b>, adicione a faixa (ex.: 512 a 519), dê um nome a cada bit e escolha a ação. Toque em <b>Acionar</b>.</li>
<li>Pelo Claude: "liga a garra do CLP", "pulsa o bit 513", "o CLP está conectado?".</li>
</ol>

<h3>Campos</h3>
<table>
<tr><th>Campo</th><th>O que é</th></tr>
<tr><td>IP do CLP</td><td>IP do equipamento na rede RJ45 (ex.: <code>192.168.0.7</code>). Só aceita IP de rede local/privada.</td></tr>
<tr><td>IP deste PC</td><td>IP da placa de rede do PC na rede do CLP. Vazio = o agente escolhe a placa.</td></tr>
<tr><td>Primeiro bit</td><td>Número do primeiro bit da área de I/O. Padrão <code>512</code> (robô Epson). Num CLP use o endereço inicial da área configurada (ex.: <code>0</code>).</td></tr>
<tr><td>Bytes PC→CLP / CLP→PC</td><td>Têm de ser <b>iguais</b> aos bytes de entrada/saída configurados no equipamento (padrão 32 e 32). Cada byte = 8 bits.</td></tr>
<tr><td>RPI (ms)</td><td>Intervalo da troca cíclica (padrão 20). O EDS aceita 1 a 3200.</td></tr>
<tr><td>Instâncias</td><td>Configuração, O→T e T→O: padrão <code>1 / 150 / 100</code> (EDS do robô Epson). O EDS do seu CLP diz quais são os dele.</td></tr>
<tr><td>CLP→PC multicast</td><td>Padrão ligado. Se der o erro 0x0124, desmarque (ponto-a-ponto).</td></tr>
</table>
<p>Mapa: <code>índice = bit − primeiro bit</code>; <code>byte = índice ÷ 8</code>; <code>bit no byte = índice mod 8</code>. Com primeiro bit 512, o bit 512 é o byte 0, bit 0.</p>

<h3>Ações de cada bit</h3>
<ul>
<li><b>alternar</b>: liga se está desligado, desliga se está ligado.</li>
<li><b>pulso</b>: liga pelo tempo em ms (10 a 5000) e desliga. Use para portão e botões.</li>
<li><b>set</b>: liga e deixa ligado. <b>reset</b>: desliga.</li>
<li>Bolinha verde = saída que o PC mandou. Bolinha azul = o mesmo bit vindo do CLP.</li>
</ul>

<h3>Rede e firewall</h3>
<ul>
<li>No PC do agente, libere no Firewall <code>TCP 44818</code> e <code>UDP 2222</code> (redes privadas).</li>
<li>Só <b>um scanner</b> por vez no equipamento (Exclusive Owner): feche o Robo_conect, o RSLinx ou outro CLP/PC conectado.</li>
<li>A porta UDP 2222 do PC tem de estar livre.</li>
</ul>

<h3>Erros comuns</h3>
<table>
<tr><td><code>0x0106</code></td><td>Outro scanner conectado, ou a conexão anterior ainda não expirou. Espere alguns segundos.</td></tr>
<tr><td><code>0x0127 / 0x0128</code></td><td>Bytes PC→CLP / CLP→PC diferentes do configurado no equipamento (a mensagem diz o valor certo).</td></tr>
<tr><td><code>0x0124</code></td><td>Tipo CLP→PC não aceito: troque multicast por ponto-a-ponto.</td></tr>
<tr><td><code>0x0111</code></td><td>RPI não suportado: tente 10, 20 ou 50 ms.</td></tr>
<tr><td><code>0x0117 / 0x012A / 0x012B</code></td><td>Instâncias de assembly erradas: confira no EDS do CLP.</td></tr>
<tr><td>Conexão perdida</td><td>Firewall bloqueando UDP 2222, cabo solto ou equipamento parou de enviar.</td></tr>
<tr><td>Sem resposta no TCP 44818</td><td>Cabo, IP, máscara ou EtherNet/IP desligado no equipamento.</td></tr>
</table>

<h3>Limites e segurança</h3>
<div class="caixa ruim">
<ul>
<li><b>Não é dispositivo de segurança.</b> Emergência, portas e cortinas continuam na fiação de segurança do equipamento.</li>
<li><b>Não é tempo real:</b> o comando vai pela internet (Render → Firebase → agente) e leva cerca de 1 a 4 s; o estado na tela atualiza a cada 4 s.</li>
<li>Se o agente fechar, o PC desligar ou o checkbox for desmarcado, a conexão com o CLP cai.</li>
<li>O agente só obedece comandos assinados com a chave do Render, e só IPs de rede local.</li>
<li>Opcional, no <code>config.json</code> do agente: <code>"clp_faixa": [512, 767]</code> limita os bits que a rede pode tocar.</li>
<li>O banco do Firebase é aberto: não use para portão, fechadura ou alarme até haver login nele.</li>
</ul>
</div>
</div>`;

export const paginaClp = () => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conexao Socket-TCP/IP · Automacao IOT Amaury</title><style>${CSS}</style>${CSS_MENU}${FAVICON}</head><body>
${menuHtml("/clp")}
<div class="topo"><h1>Conexao Socket-TCP/IP</h1><button id="instr" type="button" class="principal">Instruções</button></div>
<p class="sub">Liga e desliga bits de um CLP (ou robô) por EtherNet/IP, pela máquina com o agente. Não é dispositivo de segurança.</p>
<dialog id="dlg">${INSTRUCOES}</dialog>

<div class="card">
  <select id="maq"></select>
  <div id="info" class="sub">Carregando…</div>
</div>
<p id="res" class="sub"></p>

<div class="card" id="cxcard">
  <h2>Conexão com o CLP</h2>
  <div class="campos" id="campos"></div>
  <p class="linha" style="margin:10px 0 0"><label style="margin:0"><input type="checkbox" id="multicast"> CLP→PC em multicast</label></p>
  <div class="linha" style="margin-top:10px">
    <button id="bident" type="button">Identificar</button>
    <button id="bconn" type="button" class="principal">Conectar</button>
    <button id="bdesc" type="button">Desconectar</button>
    <button id="bsalvar" type="button">Salvar configuração</button>
    <span id="conn" class="sub"></span>
  </div>
</div>

<div class="card" id="bitcard">
  <h2>Bits <span class="sub" style="font-weight:400">· <span class="led on"></span> saída do PC &nbsp; <span class="led in on"></span> vindo do CLP</span></h2>
  <div class="linha" style="margin-bottom:10px">
    <div style="width:110px"><label>De</label><input id="de" type="number" min="0"></div>
    <div style="width:110px"><label>Até</label><input id="ate" type="number" min="0"></div>
    <button id="badd" type="button" style="margin-top:17px">Adicionar faixa</button>
    <button id="bzero" type="button" style="margin-top:17px">Zerar todas as saídas</button>
  </div>
  <div class="grade" id="pontos"></div>
</div>

<script>
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const CAMPOS = [
  ['ip', 'IP do CLP', 'text', 'ex.: 192.168.0.7'], ['ip_local', 'IP deste PC (vazio = detecta)', 'text', 'ex.: 192.168.0.120'],
  ['primeiro_bit', 'Primeiro bit', 'number', ''], ['ot_size', 'Bytes PC→CLP', 'number', ''], ['to_size', 'Bytes CLP→PC', 'number', ''],
  ['rpi_ms', 'RPI (ms)', 'number', ''], ['inst_cfg', 'Instância de configuração', 'number', ''],
  ['inst_ot', 'Instância O→T (PC→CLP)', 'number', ''], ['inst_to', 'Instância T→O (CLP→PC)', 'number', ''],
];
const MODOS = [['pulso', 'pulso'], ['alternar', 'alternar'], ['set', 'set (liga)'], ['reset', 'reset (desliga)']];
let maquinas = [], cfg = null, est = null, maqAtual = '', ocupado = false, tSalvar = null;

const atual = () => maquinas.find(m => m.maquina === $('maq').value);
const pronta = () => { const m = atual(); return Boolean(m && m.online && m.clp); };
function aviso(t, cls) { const r = $('res'); r.className = 'sub ' + (cls || ''); r.textContent = t; }

async function api(url, opc) {
  const r = await fetch(url, opc); const d = await r.json();
  if (!r.ok) throw new Error(d.erro || 'erro');
  return d;
}
const post = (url, corpo) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });

async function carregarMaquinas() {
  const lista = await api('/api/clp/maquinas');
  maquinas = Array.isArray(lista) ? lista : [];
  const escolhida = $('maq').value;
  $('maq').innerHTML = maquinas.map(x => '<option value="' + esc(x.maquina) + '">' + esc(x.maquina) + (x.online ? (x.clp ? ' · ativa · CLP ligado' : ' · ativa') : ' · offline') + '</option>').join('') || '<option>Nenhuma máquina</option>';
  if (escolhida && maquinas.some(x => x.maquina === escolhida)) $('maq').value = escolhida;
  else { const p = maquinas.find(x => x.online && x.clp) || maquinas.find(x => x.online); if (p) $('maq').value = p.maquina; }
  if ($('maq').value !== maqAtual) await trocarMaquina();
  pintar();
}

async function trocarMaquina() {
  maqAtual = $('maq').value; est = null; cfg = null;
  if (!atual()) { desenhar(); return; }
  try { cfg = await api('/api/clp/config?maquina=' + encodeURIComponent(maqAtual)); } catch (e) { aviso(e.message, 'erro'); }
  desenhar();
  await atualizar();
}

function desenhar() {
  $('campos').innerHTML = CAMPOS.map(c => '<div><label>' + c[1] + '</label><input id="c_' + c[0] + '" type="' + c[2] + '" placeholder="' + esc(c[3]) + '" value="' + esc(cfg ? cfg[c[0]] : '') + '"></div>').join('');
  $('multicast').checked = cfg ? Boolean(cfg.multicast) : true;
  if (cfg) { $('de').value = cfg.primeiro_bit; $('ate').value = cfg.primeiro_bit + 7; }
  desenharPontos();
}

function desenharPontos() {
  const lista = cfg ? Object.values(cfg.pontos).sort((a, b) => a.numero - b.numero) : [];
  $('pontos').innerHTML = lista.map(p =>
    '<div class="mini" data-n="' + p.numero + '"><div class="linha"><span class="n">' + p.numero + '</span>' +
    '<span class="led" data-led="out" title="saída do PC"></span><span class="led in" data-led="in" title="vindo do CLP"></span>' +
    '<button type="button" class="x" data-a="remover" title="Tirar da lista">tirar</button></div>' +
    '<input data-f="nome" placeholder="nome (ex.: garra)" maxlength="40" value="' + esc(p.nome) + '">' +
    '<div class="linha"><select data-f="modo" style="flex:1">' + MODOS.map(m => '<option value="' + m[0] + '"' + (p.modo === m[0] ? ' selected' : '') + '>' + m[1] + '</option>').join('') + '</select>' +
    '<input data-f="pulso_ms" type="number" min="10" max="5000" style="width:78px" title="duração do pulso (ms)" value="' + p.pulso_ms + '"></div>' +
    '<button type="button" class="principal" data-a="acionar">Acionar</button></div>').join('') ||
    '<p class="sub">Nenhum bit na lista. Use "Adicionar faixa" (ex.: 512 a 519).</p>';
  pintar();
}

const bytes = hex => (hex.match(/../g) || []).map(h => parseInt(h, 16));
const ligado = (dados, bit, primeiro) => { const i = bit - primeiro; return i >= 0 && (i >> 3) < dados.length && (dados[i >> 3] & (1 << (i & 7))) !== 0; };

function pintar() {
  const m = atual(), conectado = Boolean(est && est.conectado);
  $('info').innerHTML = !m ? 'Nenhuma máquina cadastrada.' :
    '<span class="bolinha" style="background:' + (m.online ? '#3ddc84' : '#ff5c5c') + '"></span>' + (m.online ? 'ativa' : 'offline (sem sinal há ' + esc(m.visto_ha_s ?? '?') + ' s)') +
    (m.online && !m.clp ? ' · <span class="aviso">marque "Ativar Conexao CLP: EtherNet/IP" no menu do ícone do agente (bandeja)</span>' : '') +
    (pronta() ? ' · conexão CLP ligada no agente' : '');
  $('conn').innerHTML = !pronta() ? '' : conectado
    ? '<span class="ok">conectado a ' + esc(est.ip) + '</span> · enviados ' + est.tx + ' · recebidos ' + est.rx
    : 'desconectado' + (est && est.perdida ? ' · <span class="erro">' + esc(est.perdida) + '</span>' : '');
  for (const id of ['bident', 'bsalvar']) $(id).disabled = !m;
  $('bident').disabled = !pronta(); $('bconn').disabled = !pronta() || conectado; $('bdesc').disabled = !pronta() || !conectado; $('bzero').disabled = !conectado;
  document.querySelectorAll('#pontos .mini').forEach(el => {
    const n = Number(el.dataset.n);
    el.querySelector('[data-led=out]').classList.toggle('on', conectado && ligado(bytes(est.saida), n, est.primeiro_bit));
    el.querySelector('[data-led=in]').classList.toggle('on', conectado && ligado(bytes(est.entrada), n, est.primeiro_bit));
    el.querySelector('[data-a=acionar]').disabled = !conectado;
  });
}

function lerForm() {
  if (!cfg) return;
  for (const c of CAMPOS) { const v = $('c_' + c[0]).value.trim(); cfg[c[0]] = c[2] === 'number' ? (v === '' ? '' : Number(v)) : v; }
  cfg.multicast = $('multicast').checked;
}
async function salvar() {
  if (!cfg) return;
  clearTimeout(tSalvar); lerForm();
  cfg = await post('/api/clp/config', { maquina: maqAtual, config: { ...cfg, pontos: Object.values(cfg.pontos) } });
}
function salvarLogo() { clearTimeout(tSalvar); tSalvar = setTimeout(() => salvar().catch(e => aviso(e.message, 'erro')), 700); }

async function executar(acao, extra) { return post('/api/clp/executar', { maquina: maqAtual, acao, ...(extra || {}) }); }
async function atualizar() {
  if (ocupado || !pronta()) { if (!pronta()) { est = null; pintar(); } return; }
  ocupado = true;
  try { const r = await executar('estado'); est = r.ok ? JSON.parse(r.texto) : null; if (!r.ok) aviso(r.texto, 'erro'); }
  catch (e) { est = null; aviso(e.message, 'erro'); }
  ocupado = false; pintar();
}
async function acao(nome, extra, quando) {
  aviso(quando || 'Enviando…', '');
  try {
    if (nome === 'identificar' || nome === 'conectar') await salvar();
    const r = await executar(nome, extra);
    aviso(r.texto, r.ok ? 'ok' : 'erro');
  } catch (e) { aviso(e.message, 'erro'); }
  await atualizar();
}

$('instr').addEventListener('click', () => $('dlg').showModal());
$('dlg').addEventListener('click', e => { if (e.target === $('dlg') || e.target.id === 'fechar') $('dlg').close(); });
$('maq').addEventListener('change', trocarMaquina);
$('bident').addEventListener('click', () => acao('identificar', null, 'Perguntando ao equipamento…'));
$('bconn').addEventListener('click', () => acao('conectar', null, 'Conectando…'));
$('bdesc').addEventListener('click', () => acao('desconectar'));
$('bzero').addEventListener('click', () => acao('zerar'));
$('bsalvar').addEventListener('click', async () => { try { await salvar(); aviso('Configuração salva.', 'ok'); } catch (e) { aviso(e.message, 'erro'); } });
$('badd').addEventListener('click', () => {
  if (!cfg) return;
  const de = Number($('de').value), ate = Number($('ate').value);
  if (!Number.isInteger(de) || !Number.isInteger(ate) || de < 0 || ate < de) return aviso('Faixa inválida.', 'erro');
  if (ate - de > 255) return aviso('No máximo 256 bits por vez.', 'erro');
  for (let n = de; n <= ate; n++) if (!cfg.pontos[n]) cfg.pontos[n] = { numero: n, nome: '', modo: 'pulso', pulso_ms: 500 };
  desenharPontos(); salvarLogo(); aviso('Bits ' + de + ' a ' + ate + ' adicionados.', 'ok');
});
$('pontos').addEventListener('change', e => {
  const f = e.target.dataset.f, el = e.target.closest('.mini');
  if (!f || !el || !cfg) return;
  const p = cfg.pontos[el.dataset.n];
  p[f] = f === 'pulso_ms' ? Math.min(5000, Math.max(10, Number(e.target.value) || 500)) : e.target.value;
  salvarLogo();
});
$('pontos').addEventListener('click', e => {
  const b = e.target.closest('[data-a]'), el = e.target.closest('.mini');
  if (!b || !el || !cfg) return;
  const p = cfg.pontos[el.dataset.n];
  if (b.dataset.a === 'remover') { delete cfg.pontos[p.numero]; desenharPontos(); return salvarLogo(); }
  if (b.dataset.a === 'acionar') return acao('bit', { bit: p.numero, modo: p.modo, pulso_ms: p.pulso_ms });
});

carregarMaquinas().catch(e => aviso(e.message, 'erro'));
setInterval(() => { if (!document.hidden) carregarMaquinas().catch(() => {}); }, 15000);
setInterval(() => { if (!document.hidden) atualizar(); }, 4000);
</script></body></html>`;
