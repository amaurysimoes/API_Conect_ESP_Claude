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
<b>Duas formas de conectar (escolha em "Tipo de conexão"; veja "Instruções de Seleção"):</b>
<ul>
<li><b>EtherNet/IP:</b> troca blocos de I/O (assemblies). Só funciona com CLP que fale EtherNet/IP e você precisa dos números do EDS dele.</li>
<li><b>TCP/IP (Modbus TCP):</b> liga e desliga direto as <b>memórias M</b> do CLP, sem EDS. O CLP precisa ter Modbus TCP (porta 502).</li>
<li><b>Delta:</b> informe o modelo para confirmar qual das duas ele aceita. Se o EDS tiver outras assemblies, troque os campos.</li>
<li><b>Mitsubishi FX3U:</b> não fala EtherNet/IP. Com o módulo ENET ele usa o protocolo MC (MELSEC), que esta aba não tem; só serviria se o módulo tiver Modbus TCP (confira o manual do módulo).</li>
<li>Para testar em casa por EtherNet/IP, o equipamento tem de ser um <b>adapter EtherNet/IP</b>.</li>
<li>Testado no PC com equipamentos <b>simulados</b> (EtherNet/IP e Modbus TCP). Com CLP real, só a conexão EtherNet/IP do seu Delta foi tentada (recusou a instância 150: os números do EDS dele são outros).</li>
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

const INSTRUCOES_AJUSTES = `
<button class="fecha" id="fechar2" type="button">Fechar</button>
<div class="dlg">
<h1>Instruções de Ajustes Padrão</h1>
<p>São os parâmetros da conexão EtherNet/IP. <b>Todos têm de bater com o que o CLP tem configurado.</b></p>
<ul>
<li><b>Bytes CLP→PC (32):</b> quantos bytes o CLP envia ao PC. 32 bytes são 256 bits (os bits de retorno, as bolinhas azuis).</li>
<li><b>RPI (20 ms):</b> de quanto em quanto tempo o PC e o CLP trocam dados. 20 ms são 50 trocas por segundo.</li>
<li><b>Instância de configuração (1):</b> número do bloco do CLP usado só para configurar a conexão.</li>
<li><b>Instância O→T (150):</b> bloco do CLP onde o PC escreve. Daqui saem as saídas que você aciona. O→T quer dizer "Originador para Target", ou seja, PC → CLP.</li>
<li><b>Instância T→O (100):</b> bloco do CLP de onde o PC lê. É o retorno, CLP → PC.</li>
</ul>
<div class="caixa alerta"><p>Esses números (1, 150, 100 e 32 bytes) vêm do arquivo <b>EDS do robô Epson</b>. No seu CLP eles podem ser outros. O EDS dele ou o manual diz quais são. Se estiverem errados, a conexão é recusada, e a tela mostra qual valor ajustar.</p></div>

<h3>Botões de valores padrão</h3>
<table>
<tr><th>Botão</th><th>O que coloca</th></tr>
<tr><td><b>Valores Padrão Robô</b></td><td>Os valores do robô Epson (EDS <code>EPSN0901</code>): primeiro bit <code>512</code>, bytes <code>32 / 32</code>, RPI <code>20</code>, instâncias <code>1 / 150 / 100</code>, CLP→PC em multicast <b>ligado</b>.</td></tr>
<tr><td><b>Valores Padrão CLP (Universal)</b></td><td>Ponto de partida mais aceito: primeiro bit <code>0</code>, bytes <code>8 / 8</code>, RPI <code>50</code>, instâncias <code>1 / 150 / 100</code>, CLP→PC em ponto-a-ponto (multicast <b>desligado</b>).</td></tr>
</table>
<div class="caixa alerta"><p><b>Não existe um padrão universal de verdade:</b> cada CLP define os dele no EDS. Os "universais" são só um ponto de partida seguro (mais lento e sem multicast). Se a conexão for recusada, a mensagem de erro diz qual valor trocar.</p></div>
<h3>TCP/IP (Modbus TCP): campos</h3>
<ul>
<li><b>Porta Modbus TCP (502):</b> porta do CLP para Modbus TCP.</li>
<li><b>ID da unidade (1):</b> endereço Modbus do CLP (também chamado de station ou slave). Quase sempre 1.</li>
<li><b>Endereço base da memória M (2048):</b> o endereço Modbus onde está a memória M0. Endereço da memória = base + número. <b>Delta DVP:</b> M0 = <code>0800H</code> = <code>2048</code>. M1536 em diante ficam em outro trecho do mapa (<code>B000H</code> = 45056): use base <code>43520</code> para essas. <b>Delta AS (AS300):</b> o AS332P aceita 8192 bobinas a partir do endereço <code>0</code> (M0–M8191), então use base <code>0</code>. Isso foi deduzido lendo o CLP, não do manual: confirme com uma memória sua que você sabe se está ligada (veja abaixo).</li>
<li><b>Primeira memória M / Quantidade:</b> a faixa que a tela lê para mostrar o estado (ex.: M0 e 64 memórias = M0 a M63).</li>
</ul>
<p><b>Valores Padrão TCP/IP (Delta DVP)</b> coloca <code>502 / 1 / 2048 / M0 / 64</code>. <b>Valores Padrão TCP/IP (Delta AS)</b> coloca <code>502 / 1 / 0 / M0 / 64</code>.</p>
<div class="caixa alerta"><p><b>Como conferir o endereço base sem acionar nada:</b> conecte e olhe a bolinha de uma memória que você <b>sabe</b> estar ligada no CLP (ou desligada). Se a bolinha bate com o CLP, o base está certo. Se não bate, troque o base.</p></div>
<p>Depois de tocar num botão, os valores já ficam salvos. O <b>Primeiro bit</b> muda junto: os bits da lista têm de estar dentro da nova faixa.</p>
</div>`;

const INSTRUCOES_SELECAO = `
<button class="fecha" id="fechar3" type="button">Fechar</button>
<div class="dlg">
<h1>Instruções de Seleção</h1>
<p>Escolha em <b>Tipo de conexão</b> como o PC vai falar com o CLP. Os dois funcionam pela rede (cabo RJ45), mas de formas diferentes.</p>
<table>
<tr><th></th><th>EtherNet/IP</th><th>TCP/IP (Modbus TCP)</th></tr>
<tr><td><b>O que acessa</b></td><td>A <b>área de I/O</b> do CLP (blocos de bytes, as "assemblies").</td><td>Direto as <b>memórias M</b> (bobinas) do CLP.</td></tr>
<tr><td><b>Precisa de</b></td><td>CLP como adapter EtherNet/IP, EDS (instâncias e bytes) e os bits ligados no programa do CLP.</td><td>Modbus TCP habilitado no CLP (porta 502) e o endereço Modbus da memória M0.</td></tr>
<tr><td><b>Troca de dados</b></td><td>Cíclica, a cada RPI (ex.: 50 ms), com conexão mantida.</td><td>Sob demanda: lê e escreve quando você aciona.</td></tr>
<tr><td><b>Registradores (D)</b></td><td>Não.</td><td>Não: só memórias de bit (M).</td></tr>
<tr><td><b>Ações</b></td><td>alternar, pulso, set, reset, zerar todas.</td><td>alternar, pulso, set, reset (sem "zerar todas": não apaga as memórias do CLP).</td></tr>
</table>

<h3>Qual escolher</h3>
<ul>
<li><b>Seu CLP usa memórias M</b> (como o Delta): escolha <b>TCP/IP</b>.</li>
<li>Seu CLP é um equipamento EtherNet/IP com EDS (robô, módulo de I/O): escolha <b>EtherNet/IP</b>.</li>
<li>Deu <code>0x012A</code> / <code>0x0117</code> (instância inválida) no EtherNet/IP: as instâncias não batem com o EDS. Confira o EDS ou use <b>TCP/IP</b>.</li>
<li>Não sabe qual o CLP aceita? Use <b>Identificar</b>: no TCP/IP ele diz se o CLP respondeu em Modbus TCP e lê a primeira memória.</li>
</ul>

<h3>Passo a passo do TCP/IP</h3>
<ol>
<li>No CLP, habilite o Modbus TCP na porta Ethernet (porta 502) e anote o endereço Modbus de M0 no manual.</li>
<li>Em <b>Tipo de conexão</b>, escolha <b>TCP/IP (memórias M, Modbus TCP)</b>.</li>
<li>Toque em <b>Valores Padrão TCP/IP (Delta DVP)</b> ou <b>(Delta AS)</b> (ou preencha os campos), coloque o <b>IP do CLP</b> e toque em <b>Identificar</b>.</li>
<li>Toque em <b>Conectar</b>, adicione a faixa (ex.: 0 a 7), dê o <b>Nome da Memoria</b> e escolha a ação.</li>
<li>Teste primeiro numa memória que <b>não</b> controle nada importante.</li>
</ol>

<div class="caixa alerta"><p><b>Endereço base errado:</b> o CLP responde "endereço de memória inexistente". Confira o campo <b>Endereço base da memória M</b>. Memória errada = você liga outra coisa: confirme no manual antes de acionar.</p></div>
<div class="caixa ruim"><p><b>Não é dispositivo de segurança.</b> Não use para portão, fechadura, alarme ou emergência. O comando passa pela internet e leva 1 a 4 s.</p></div>
</div>`;

export const paginaClp = () => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conexao Socket-TCP/IP · Automacao IOT Amaury</title><style>${CSS}</style>${CSS_MENU}${FAVICON}</head><body>
${menuHtml("/clp")}
<div class="topo"><h1>Conexao Socket-TCP/IP</h1><button id="instr" type="button" class="principal">Instruções</button></div>
<p class="sub">Liga e desliga bits (EtherNet/IP) ou memórias M (TCP/IP) de um CLP, pela máquina com o agente. Não é dispositivo de segurança.</p>
<dialog id="dlg">${INSTRUCOES}</dialog>
<dialog id="dlg2">${INSTRUCOES_AJUSTES}</dialog>
<dialog id="dlg3">${INSTRUCOES_SELECAO}</dialog>
<style>#pontos.tcp [data-led=in]{display:none}</style>

<div class="card">
  <select id="maq"></select>
  <div id="info" class="sub">Carregando…</div>
</div>
<p id="res" class="sub"></p>

<div class="card" id="cxcard">
  <h2>Conexão com o CLP</h2>
  <div class="linha" style="margin-bottom:10px;align-items:flex-end">
    <div style="flex:1;min-width:250px"><label>Tipo de conexão</label>
      <select id="protocolo">
        <option value="tcp_ip">TCP/IP (memórias M, Modbus TCP)</option>
        <option value="ethernet_ip">EtherNet/IP (área de I/O do CLP)</option>
      </select></div>
    <button id="sel_info" type="button">Instruções de Seleção</button>
  </div>
  <div class="campos" id="campos"></div>
  <p class="linha" id="linha_multicast" style="margin:10px 0 0"><label style="margin:0"><input type="checkbox" id="multicast"> CLP→PC em multicast</label></p>
  <div class="linha" style="margin-top:10px">
    <button id="pad_robo" type="button">Valores Padrão Robô</button>
    <button id="pad_clp" type="button">Valores Padrão CLP (Universal)</button>
    <button id="pad_tcp" type="button">Valores Padrão TCP/IP (Delta DVP)</button>
    <button id="pad_tcp_as" type="button">Valores Padrão TCP/IP (Delta AS)</button>
    <button id="pad_info" type="button">Instruções de Ajustes Padrão</button>
  </div>
  <div class="linha" style="margin-top:10px">
    <button id="bident" type="button">Identificar</button>
    <button id="bconn" type="button" class="principal">Conectar</button>
    <button id="bdesc" type="button">Desconectar</button>
    <button id="bsalvar" type="button">Salvar configuração</button>
    <span id="conn" class="sub"></span>
  </div>
</div>

<div class="card" id="bitcard">
  <h2><span id="tit_bits">Bits</span> <span class="sub" style="font-weight:400" id="legenda"></span></h2>
  <div class="linha" style="margin-bottom:10px">
    <div style="width:110px"><label>De</label><input id="de" type="number" min="0"></div>
    <div style="width:110px"><label>Até</label><input id="ate" type="number" min="0"></div>
    <button id="badd" type="button" style="margin-top:17px" title="Acrescenta as memórias de De até Até à lista">Adicionar faixa</button>
    <button id="bupd" type="button" class="principal" style="margin-top:17px" title="Deixa na lista SÓ as memórias de De até Até">Atualizar faixa</button>
    <button id="bzero" type="button" style="margin-top:17px">Zerar todas as saídas</button>
  </div>
  <div class="grade" id="pontos"></div>
</div>

<script>
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const CAMPOS_EIP = [
  ['ip', 'IP do CLP', 'text', 'ex.: 192.168.0.7'], ['ip_local', 'IP deste PC (vazio = detecta)', 'text', 'ex.: 192.168.0.120'],
  ['primeiro_bit', 'Primeiro bit', 'number', ''], ['ot_size', 'Bytes PC→CLP', 'number', ''], ['to_size', 'Bytes CLP→PC', 'number', ''],
  ['rpi_ms', 'RPI (ms)', 'number', ''], ['inst_cfg', 'Instância de configuração', 'number', ''],
  ['inst_ot', 'Instância O→T (PC→CLP)', 'number', ''], ['inst_to', 'Instância T→O (CLP→PC)', 'number', ''],
];
const CAMPOS_TCP = [
  ['ip', 'IP do CLP', 'text', 'ex.: 192.168.0.10'], ['ip_local', 'IP deste PC (vazio = detecta)', 'text', 'ex.: 192.168.0.112'],
  ['porta', 'Porta Modbus TCP', 'number', ''], ['unidade', 'ID da unidade (Modbus)', 'number', ''],
  ['base_m', 'Endereço base da memória M (Delta DVP: 2048 · Delta AS: 0)', 'number', ''],
  ['primeiro_bit', 'Primeira memória M (número)', 'number', ''], ['qtd_m', 'Quantidade de memórias lidas', 'number', ''],
];
const MODOS = [['pulso', 'pulso'], ['alternar', 'alternar'], ['set', 'set (liga)'], ['reset', 'reset (desliga)']];
let maquinas = [], cfg = null, est = null, maqAtual = '', ocupado = false, tSalvar = null;

const atual = () => maquinas.find(m => m.maquina === $('maq').value);
const pronta = () => { const m = atual(); return Boolean(m && m.online && m.clp); };
const tcp = () => Boolean(cfg && cfg.protocolo === 'tcp_ip');
const campos = () => tcp() ? CAMPOS_TCP : CAMPOS_EIP;
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
  const t = tcp();
  $('protocolo').value = cfg ? cfg.protocolo : 'tcp_ip';
  $('campos').innerHTML = campos().map(c => '<div><label>' + c[1] + '</label><input id="c_' + c[0] + '" type="' + c[2] + '" placeholder="' + esc(c[3]) + '" value="' + esc(cfg ? cfg[c[0]] : '') + '"></div>').join('');
  $('multicast').checked = cfg ? Boolean(cfg.multicast) : true;
  $('linha_multicast').style.display = t ? 'none' : '';
  $('pad_robo').style.display = t ? 'none' : ''; $('pad_clp').style.display = t ? 'none' : ''; $('pad_tcp').style.display = t ? '' : 'none'; $('pad_tcp_as').style.display = t ? '' : 'none';
  $('bzero').style.display = t ? 'none' : '';
  $('tit_bits').textContent = t ? 'Memórias (M)' : 'Bits';
  $('legenda').innerHTML = t ? '· <span class="led on"></span> memória ligada no CLP' : '· <span class="led on"></span> saída do PC &nbsp; <span class="led in on"></span> vindo do CLP';
  if (cfg) { $('de').value = cfg.primeiro_bit; $('ate').value = cfg.primeiro_bit + 7; }
  desenharPontos();
}

function desenharPontos() {
  const lista = cfg ? Object.values(cfg.pontos).sort((a, b) => a.numero - b.numero) : [];
  $('pontos').className = 'grade' + (tcp() ? ' tcp' : '');
  $('pontos').innerHTML = lista.map(p =>
    '<div class="mini" data-n="' + p.numero + '"><div class="linha"><span class="n">' + (tcp() ? 'M' : '') + p.numero + '</span>' +
    '<span class="led" data-led="out" title="' + (tcp() ? 'memória ligada no CLP' : 'saída do PC') + '"></span><span class="led in" data-led="in" title="vindo do CLP"></span>' +
    '<button type="button" class="x" data-a="remover" title="Tirar da lista">tirar</button></div>' +
    '<input data-f="nome" placeholder="Nome da Memoria" maxlength="40" value="' + esc(p.nome) + '">' +
    '<div class="linha"><select data-f="modo" style="flex:1">' + MODOS.map(m => '<option value="' + m[0] + '"' + (p.modo === m[0] ? ' selected' : '') + '>' + m[1] + '</option>').join('') + '</select>' +
    '<input data-f="pulso_ms" type="number" min="10" max="5000" style="width:78px" title="duração do pulso (ms)" value="' + p.pulso_ms + '"></div>' +
    '<button type="button" class="principal" data-a="acionar">Acionar</button></div>').join('') ||
    '<p class="sub">' + (tcp() ? 'Nenhuma memória na lista. Use "Adicionar faixa" (ex.: 0 a 7).' : 'Nenhum bit na lista. Use "Adicionar faixa" (ex.: 512 a 519).') + '</p>';
  pintar();
}

const bytes = hex => (hex.match(/../g) || []).map(h => parseInt(h, 16));
const ligado = (dados, bit, primeiro) => { const i = bit - primeiro; return i >= 0 && (i >> 3) < dados.length && (dados[i >> 3] & (1 << (i & 7))) !== 0; };

function pintar() {
  const m = atual(), conectado = Boolean(est && est.conectado), estTcp = Boolean(est && est.protocolo === 'tcp_ip');
  $('info').innerHTML = !m ? 'Nenhuma máquina cadastrada.' :
    '<span class="bolinha" style="background:' + (m.online ? '#3ddc84' : '#ff5c5c') + '"></span>' + (m.online ? 'ativa' : 'offline (sem sinal há ' + esc(m.visto_ha_s ?? '?') + ' s)') +
    (m.online && !m.clp ? ' · <span class="aviso">marque "Ativar Conexao CLP: EtherNet/IP" no menu do ícone do agente (bandeja)</span>' : '') +
    (pronta() ? ' · conexão CLP ligada no agente' : '');
  $('conn').innerHTML = !pronta() ? '' : conectado
    ? '<span class="ok">conectado a ' + esc(est.ip) + ' por ' + (estTcp ? 'TCP/IP' : 'EtherNet/IP') + '</span>' + (estTcp ? '' : ' · enviados ' + est.tx + ' · recebidos ' + est.rx) +
      (estTcp !== tcp() ? ' · <span class="aviso">o tipo escolhido na tela é outro: toque em Conectar para trocar</span>' : '')
    : 'desconectado' + (est && est.perdida ? ' · <span class="erro">' + esc(est.perdida) + '</span>' : '');
  for (const id of ['bident', 'bsalvar']) $(id).disabled = !m;
  $('bident').disabled = !pronta(); $('bconn').disabled = !pronta() || conectado; $('bdesc').disabled = !pronta() || !conectado; $('bzero').disabled = !conectado || estTcp;
  document.querySelectorAll('#pontos .mini').forEach(el => {
    const n = Number(el.dataset.n);
    el.querySelector('[data-led=out]').classList.toggle('on', conectado && (estTcp ? ligado(bytes(est.memorias), n, est.primeiro_bit) : ligado(bytes(est.saida), n, est.primeiro_bit)));
    el.querySelector('[data-led=in]').classList.toggle('on', conectado && !estTcp && ligado(bytes(est.entrada), n, est.primeiro_bit));
    el.querySelector('[data-a=acionar]').disabled = !pronta();
  });
}

function lerForm() {
  if (!cfg) return;
  for (const c of campos()) { const el = $('c_' + c[0]); if (!el) continue; const v = el.value.trim(); cfg[c[0]] = c[2] === 'number' ? (v === '' ? '' : Number(v)) : v; }
  if (!tcp()) cfg.multicast = $('multicast').checked;
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

// Acionar: se ainda não estiver conectado (ou conectado por outro tipo), conecta sozinho com a configuração salva e aciona.
async function acionar(p) {
  aviso('Enviando…', '');
  try {
    if (!(est && est.conectado && (est.protocolo === 'tcp_ip') === tcp())) {
      await salvar();
      aviso('Conectando ao CLP…', '');
      const c = await executar('conectar');
      if (!c.ok) { aviso(c.texto, 'erro'); return atualizar(); }
    }
    const r = await executar('bit', { bit: p.numero, modo: p.modo, pulso_ms: p.pulso_ms });
    aviso(r.texto, r.ok ? 'ok' : 'erro');
  } catch (e) { aviso(e.message, 'erro'); }
  await atualizar();
}

// valores padrão: robô Epson (EDS EPSN0901), ponto de partida para CLPs EtherNet/IP em geral, e Delta DVP por TCP/IP
const PADROES = {
  robo: { primeiro_bit: 512, ot_size: 32, to_size: 32, rpi_ms: 20, inst_cfg: 1, inst_ot: 150, inst_to: 100, multicast: true },
  clp: { primeiro_bit: 0, ot_size: 8, to_size: 8, rpi_ms: 50, inst_cfg: 1, inst_ot: 150, inst_to: 100, multicast: false },
  tcp: { porta: 502, unidade: 1, base_m: 2048, primeiro_bit: 0, qtd_m: 64 },
  tcp_as: { porta: 502, unidade: 1, base_m: 0, primeiro_bit: 0, qtd_m: 64 },
};
const NOMES_PADRAO = { robo: 'Valores Padrão Robô', clp: 'Valores Padrão CLP (Universal)', tcp: 'Valores Padrão TCP/IP (Delta DVP)', tcp_as: 'Valores Padrão TCP/IP (Delta AS)' };
function aplicarPadrao(tipo) {
  if (!cfg) return aviso('Escolha uma máquina primeiro.', 'erro');
  const v = PADROES[tipo];
  for (const k of Object.keys(v)) { if (k !== 'multicast' && $('c_' + k)) $('c_' + k).value = v[k]; }
  if ('multicast' in v) $('multicast').checked = v.multicast;
  $('de').value = v.primeiro_bit; $('ate').value = v.primeiro_bit + 7;
  lerForm(); salvarLogo();
  aviso(NOMES_PADRAO[tipo] + ' aplicados e salvos. Se o CLP estiver conectado, desconecte e conecte de novo.', 'ok');
}
function fecharAoClicar(id, botao) { $(id).addEventListener('click', e => { if (e.target === $(id) || e.target.id === botao) $(id).close(); }); }
$('pad_robo').addEventListener('click', () => aplicarPadrao('robo'));
$('pad_clp').addEventListener('click', () => aplicarPadrao('clp'));
$('pad_tcp').addEventListener('click', () => aplicarPadrao('tcp'));
$('pad_tcp_as').addEventListener('click', () => aplicarPadrao('tcp_as'));
$('pad_info').addEventListener('click', () => $('dlg2').showModal());
$('sel_info').addEventListener('click', () => $('dlg3').showModal());
fecharAoClicar('dlg2', 'fechar2'); fecharAoClicar('dlg3', 'fechar3'); fecharAoClicar('dlg', 'fechar');
$('instr').addEventListener('click', () => $('dlg').showModal());
$('protocolo').addEventListener('change', () => {
  if (!cfg) return;
  lerForm(); cfg.protocolo = $('protocolo').value; est = null;
  desenhar(); salvarLogo();
  aviso('Tipo de conexão: ' + (tcp() ? 'TCP/IP (memórias M, Modbus TCP)' : 'EtherNet/IP') + '. Confira os campos e toque em Conectar.', 'ok');
  atualizar();
});
$('maq').addEventListener('change', trocarMaquina);
$('bident').addEventListener('click', () => acao('identificar', null, 'Perguntando ao equipamento…'));
$('bconn').addEventListener('click', () => acao('conectar', null, 'Conectando…'));
$('bdesc').addEventListener('click', () => acao('desconectar'));
$('bzero').addEventListener('click', () => acao('zerar'));
$('bsalvar').addEventListener('click', async () => { try { await salvar(); aviso('Configuração salva.', 'ok'); } catch (e) { aviso(e.message, 'erro'); } });
// No TCP/IP o estado (bolinhas) é lido na faixa "primeira memória + quantidade": mantém essa faixa cobrindo tudo o que está na lista
function sincronizarLeitura() {
  if (!cfg || !tcp()) return;
  const nums = Object.keys(cfg.pontos).map(Number);
  if (!nums.length) return;
  const menor = Math.min(...nums), maior = Math.max(...nums);
  cfg.primeiro_bit = menor; cfg.qtd_m = Math.min(2000, maior - menor + 1);
  if ($('c_primeiro_bit')) $('c_primeiro_bit').value = cfg.primeiro_bit;
  if ($('c_qtd_m')) $('c_qtd_m').value = cfg.qtd_m;
}
async function salvarEAtualizar() {
  try { await salvar(); } catch (e) { return aviso(e.message, 'erro'); }
  await atualizar();
}
function lerFaixa() {
  const de = Number($('de').value), ate = Number($('ate').value);
  if (!Number.isInteger(de) || !Number.isInteger(ate) || de < 0 || ate < de) { aviso('Faixa inválida.', 'erro'); return null; }
  if (ate - de > 255) { aviso('No máximo 256 por vez.', 'erro'); return null; }
  return { de, ate };
}
const novoPonto = n => ({ numero: n, nome: '', modo: 'pulso', pulso_ms: 500 });
$('badd').addEventListener('click', () => {
  if (!cfg) return;
  const f = lerFaixa(); if (!f) return;
  for (let n = f.de; n <= f.ate; n++) if (!cfg.pontos[n]) cfg.pontos[n] = novoPonto(n);
  sincronizarLeitura(); desenharPontos(); salvarEAtualizar();
  aviso((tcp() ? 'Memórias ' : 'Bits ') + f.de + ' a ' + f.ate + ' adicionadas.', 'ok');
});
// Atualizar faixa: a lista passa a ter SÓ De..Até (nomes e ações das que já existiam são mantidos)
$('bupd').addEventListener('click', () => {
  if (!cfg) return;
  const f = lerFaixa(); if (!f) return;
  const sai = Object.values(cfg.pontos).filter(p => p.numero < f.de || p.numero > f.ate);
  const comNome = sai.filter(p => p.nome).length;
  if (comNome && !confirm('Isso tira da lista ' + sai.length + ' ' + (tcp() ? 'memórias' : 'bits') + ', ' + comNome + ' com nome. Continuar?')) return;
  const novos = {};
  for (let n = f.de; n <= f.ate; n++) novos[n] = cfg.pontos[n] || novoPonto(n);
  cfg.pontos = novos;
  sincronizarLeitura(); desenharPontos(); salvarEAtualizar();
  aviso('Lista atualizada: ' + (tcp() ? 'memórias ' : 'bits ') + f.de + ' a ' + f.ate + '.', 'ok');
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
  if (b.dataset.a === 'remover') { delete cfg.pontos[p.numero]; sincronizarLeitura(); desenharPontos(); return salvarLogo(); }
  if (b.dataset.a === 'acionar') return acionar(p);
});

carregarMaquinas().catch(e => aviso(e.message, 'erro'));
setInterval(() => { if (!document.hidden) carregarMaquinas().catch(() => {}); }, 15000);
setInterval(() => { if (!document.hidden) atualizar(); }, 4000);
</script></body></html>`;
