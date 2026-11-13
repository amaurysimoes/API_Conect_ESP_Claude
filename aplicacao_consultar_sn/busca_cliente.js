// Roda no navegador (aba /serial e link /serial/<token>): ao ler o código (moldura verde) busca o histórico do serial no back-end
// da rede local. Dois caminhos ao mesmo tempo: o agente do PC (pelo servidor) e a chamada direta http://IP:PORTA/busca?sn=.
// Na aba também cuida das caixas IP / Porta / Máquina e da busca digitada.
(function () {
  'use strict';
  var token = document.body.dataset.token;
  var $ = function (id) { return document.getElementById(id); };
  var hist = $('hist'), vez = 0;
  var esc = function (v) { return String(v === null || v === undefined ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var pede = function (metodo, url, corpo) {
    return fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.erro || 'erro ' + r.status); return j; }); });
  };

  function mostrar(html) { hist.innerHTML = html + '<p><button type="button" id="hist-fechar">Fechar</button></p>'; hist.classList.add('on'); $('hist-fechar').onclick = limpar; }
  function limpar() { vez++; hist.classList.remove('on'); hist.innerHTML = ''; }

  function tabela(r) {
    var linhas = r.records || [];
    if (!linhas.length) return '';
    var cols = Object.keys(linhas[0]);
    return '<div class="rolar"><table><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr>' +
      linhas.map(function (l) { return '<tr>' + cols.map(function (c) { var v = l[c]; return '<td>' + esc(v !== null && typeof v === 'object' ? JSON.stringify(v) : v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>' +
      (r.total_found > linhas.length ? '<div class="suave">mostrando ' + linhas.length + ' de ' + r.total_found + '</div>' : '');
  }

  function desenhar(sn, e) {
    var d = e.dados || {}, rs = d.results || [];
    var topo = '<h2>Histórico do serial <span class="mono">' + esc(sn) + '</span></h2><div class="suave">via ' + esc(e.via) + ' · ' + e.segundos + ' s</div>';
    if (d.status === 'offline') return mostrar(topo + '<p class="erro">O back respondeu offline: ' + esc(d.message || 'sem base nesta rede') + '</p>');
    if (!rs.length) return mostrar(topo + '<p class="aviso">' + esc(d.message || 'Nenhum registro encontrado para este serial.') + '</p>');
    mostrar(topo + '<p>Padrão: <b>' + esc(d.padrao_identificado || '?') + '</b> · <span class="selo">' + (d.usou_memoria ? 'Cache Rápido' : 'Varredura') + '</span> · ' + d.total_tables_with_data + ' tabela(s) com dados' +
      (d.aviso ? '<br><span class="suave">' + esc(d.aviso) + '</span>' : '') + '</p>' +
      rs.map(function (r) { return '<h3>' + esc(r.database) + '.' + esc(r.table) + ' <span class="suave">coluna ' + esc(r.column) + ' · ' + r.total_found + ' registro(s)</span></h3>' + tabela(r); }).join(''));
  }

  // tentativa direta do navegador (só passa onde o navegador deixa página HTTPS chamar http://IP da rede local)
  function direto(sn, ip, porta, minha) {
    var ctl = window.AbortController ? new AbortController() : null;
    setTimeout(function () { if (ctl) ctl.abort(); }, 170000);
    fetch('http://' + ip + ':' + porta + '/busca?sn=' + encodeURIComponent(sn), ctl ? { signal: ctl.signal } : {})
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (dados) { if (minha === vez) return pede('POST', '/api/serial/' + token + '/historico', { sn: sn, dados: dados }); })
      .catch(function () { /* bloqueado pelo navegador ou fora da rede: vale o agente */ });
  }

  function buscar(sn) {
    sn = String(sn || '').trim();
    if (!sn) return;
    var minha = ++vez, t0 = Date.now(), link = '';
    var andamento = function () { hist.innerHTML = '<h2>Histórico do serial <span class="mono">' + esc(sn) + '</span></h2><p>Buscando no back-end… ' + Math.round((Date.now() - t0) / 1000) + ' s</p>'; hist.classList.add('on'); };
    andamento();
    pede('POST', '/api/serial/' + token + '/buscar', { sn: sn }).then(function (c) {
      if (minha !== vez) return;
      link = 'http://' + c.ip + ':' + c.porta + '/busca?sn=' + encodeURIComponent(sn);
      direto(sn, c.ip, c.porta, minha);
      (function consultar() {
        if (minha !== vez) return;
        pede('GET', '/api/serial/' + token + '/historico').then(function (e) {
          if (minha !== vez) return;
          if (e.estado === 'ok') return desenhar(sn, e);
          if (e.estado === 'erro' && Date.now() - t0 > 8000) {   // dá uns segundos para a tentativa direta
            return mostrar('<h2>Histórico do serial <span class="mono">' + esc(sn) + '</span></h2><p class="erro">Não consegui buscar: ' + esc(e.erro) + '</p>' +
              '<p class="suave">Se este aparelho está na mesma rede do back, abra direto: <a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(link) + '</a></p>');
          }
          if (Date.now() - t0 > 240000) return mostrar('<p class="erro">O back não respondeu em 4 minutos.</p>');
          andamento(); setTimeout(consultar, 1500);
        }).catch(function () { setTimeout(consultar, 2500); });
      })();
    }).catch(function (e) { if (minha === vez) mostrar('<p class="erro">' + esc(e.message) + '</p>'); });
  }

  window.buscarSerial = buscar;       // chamado pelo cliente.js quando a leitura é confirmada (verde)
  window.limparBusca = limpar;        // "Ler outro"

  // ---------- só na aba do site: IP / porta / máquina e busca digitada ----------
  if (!$('cfg')) return;
  var msg = function (t, cls) { $('cfg-msg').textContent = t; $('cfg-msg').className = cls || 'suave'; };
  pede('GET', '/api/serial/config').then(function (r) {
    var c = r.config || {};
    $('cfg-ip').value = c.ip || ''; $('cfg-porta').value = c.porta || 4012;
    $('cfg-maq').innerHTML = '<option value="">Automático (qualquer agente ativo)</option>' + (r.maquinas || []).map(function (m) {
      return '<option value="' + esc(m.maquina) + '"' + (m.maquina === c.maquina ? ' selected' : '') + '>' + esc(m.maquina) + (m.online ? (m.pronta ? ' · ativa' : ' · agente antigo') : ' · offline') + '</option>';
    }).join('');
    msg(c.ip ? 'Back-end salvo: ' + c.ip + ':' + c.porta : 'Informe o IP e a porta do back-end e salve.');
  }).catch(function (e) { msg(e.message, 'erro'); });
  $('cfg-salvar').onclick = function () {
    msg('Salvando…');
    pede('POST', '/api/serial/config', { ip: $('cfg-ip').value, porta: Number($('cfg-porta').value), maquina: $('cfg-maq').value })
      .then(function (r) { msg('✓ Salvo: ' + r.config.ip + ':' + r.config.porta, 'ok'); })
      .catch(function (e) { msg('✗ ' + e.message, 'erro'); });
  };
  $('manual').onsubmit = function (ev) { ev.preventDefault(); buscar($('manual-sn').value); };
})();
