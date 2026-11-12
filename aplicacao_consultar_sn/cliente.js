// Código que roda NO CELULAR (página /serial/<token>): câmera ao vivo, leitura de todos os padrões de código de barras e QR,
// moldura vermelha até ler e verde (com o nome do padrão) quando detecta; lê sozinho ao confirmar 2 leituras iguais.
// Motor único para iPhone e Android: zxing-wasm (ZXing-C++ em WebAssembly), servido pelo próprio servidor.
(function () {
  'use strict';
  var Z = window.ZXingWASM;   // zxing-wasm (ZXing-C++): lê todos os padrões, devolve os 4 cantos do código
  var token = document.body.dataset.token || location.pathname.split('/')[2];
  var $ = function (id) { return document.getElementById(id); };
  var video = $('v'), tela = $('o'), ctx = tela.getContext('2d');
  var NOMES = {
    QRCode: 'QR Code', MicroQRCode: 'Micro QR', RMQRCode: 'rMQR', DataMatrix: 'Data Matrix', Aztec: 'Aztec', PDF417: 'PDF417', MaxiCode: 'MaxiCode',
    Code128: 'Code 128', Code39: 'Code 39', Code93: 'Code 93', Codabar: 'Codabar', ITF: 'ITF (2 de 5)',
    EAN13: 'EAN-13 / UPC-A', EAN8: 'EAN-8', UPCA: 'UPC-A', UPCE: 'UPC-E', DataBar: 'GS1 DataBar', DataBarExpanded: 'GS1 DataBar Expandido',
    DataBarLimited: 'GS1 DataBar Limitado', DXFilmEdge: 'DX Film Edge'
  };
  var nome = function (f) { return NOMES[f] || String(f); };

  var canvasZx = document.createElement('canvas');
  var stream = null, faixa = null, ativo = false, ultimo = '', repeticoes = 0, ultimoQuando = 0, ocupado = false;

  // ---------- leitura ----------
  function prepararMotores() {
    if (!Z) return;
    Z.setZXingModuleOverrides({ locateFile: function (p) { return /\.wasm$/.test(p) ? '/serial/zxing_reader.wasm' : p; } });
  }

  // fonte: <video> ou <img>; reduz para no máximo 1280 px de largura e devolve { texto, formato, pontos } ou null
  function ler(fonte, w, h) {
    var esc = Math.min(1, 1280 / w);
    canvasZx.width = Math.round(w * esc); canvasZx.height = Math.round(h * esc);
    var c = canvasZx.getContext('2d', { willReadFrequently: true });
    c.drawImage(fonte, 0, 0, canvasZx.width, canvasZx.height);
    var img = c.getImageData(0, 0, canvasZx.width, canvasZx.height);
    return Z.readBarcodes(img, { tryHarder: true, maxNumberOfSymbols: 1, formats: [] }).then(function (rs) {
      if (!rs || !rs.length || !rs[0].text) return null;
      var p = rs[0].position;
      return { texto: rs[0].text, formato: rs[0].format, pontos: [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft].map(function (q) { return { x: q.x / esc, y: q.y / esc }; }) };
    }).catch(function () { return null; });
  }

  function detectar() { return ler(video, video.videoWidth, video.videoHeight); }

  // ---------- desenho ----------
  function ajustarTela() {
    var r = video.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    tela.style.width = r.width + 'px'; tela.style.height = r.height + 'px';
    tela.width = Math.round(r.width * d); tela.height = Math.round(r.height * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  function paraTela(p) {   // coordenada do vídeo -> tela (object-fit: cover)
    var cw = tela.clientWidth, ch = tela.clientHeight, vw = video.videoWidth || 1, vh = video.videoHeight || 1;
    var s = Math.max(cw / vw, ch / vh);
    return { x: (cw - vw * s) / 2 + p.x * s, y: (ch - vh * s) / 2 + p.y * s };
  }
  function desenhar(achado) {
    var cw = tela.clientWidth, ch = tela.clientHeight;
    ctx.clearRect(0, 0, cw, ch);
    ctx.lineJoin = 'round'; ctx.lineWidth = 5;
    if (!achado || !achado.pontos.length) {
      var w = cw * 0.82, h = Math.min(ch * 0.4, w * 0.7), x = (cw - w) / 2, y = (ch - h) / 2;
      ctx.strokeStyle = '#ef4444'; ctx.strokeRect(x, y, w, h);
      return;
    }
    var pts = achado.pontos.map(paraTela);
    ctx.strokeStyle = '#22c55e'; ctx.fillStyle = 'rgba(34,197,94,.18)';
    ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.closePath(); ctx.fill(); ctx.stroke();
    var rotulo = nome(achado.formato), topo = Math.min.apply(null, pts.map(function (p) { return p.y; })), esq = Math.min.apply(null, pts.map(function (p) { return p.x; }));
    ctx.font = '600 15px system-ui,sans-serif';
    var tw = ctx.measureText(rotulo).width + 16, ty = Math.max(4, topo - 30);
    ctx.fillStyle = '#22c55e'; ctx.fillRect(Math.max(4, esq), ty, tw, 26);
    ctx.fillStyle = '#06210f'; ctx.fillText(rotulo, Math.max(4, esq) + 8, ty + 18);
  }

  // ---------- fluxo ----------
  function status(txt, cor) { var e = $('estado'); e.textContent = txt; e.style.color = cor || ''; }

  function confirmar(achado) {
    ativo = false;
    try { if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(120); } catch (e) { /* sem vibração */ }
    desenhar(achado);
    $('lido').textContent = achado.texto;
    $('padrao').textContent = nome(achado.formato);
    $('envio').textContent = 'Enviando para a IA…'; $('envio').className = '';
    $('painel').classList.add('on');
    fetch('/api/serial/' + token + '/resultado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: achado.texto, formato: nome(achado.formato) }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.erro || 'erro ' + r.status); }); })
      .then(function () { $('envio').textContent = '✓ Enviado para a IA'; $('envio').className = 'ok'; })
      .catch(function (e) { $('envio').textContent = '✗ Não enviou: ' + e.message; $('envio').className = 'erro'; });
  }

  function laco() {
    if (!ativo) return;
    if (ocupado || video.readyState < 2) { setTimeout(laco, 80); return; }
    ocupado = true;
    detectar().then(function (a) {
      ocupado = false;
      if (!ativo) return;
      desenhar(a);
      if (a && a.texto) {
        status('Padrão: ' + nome(a.formato), '#22c55e');
        var agora = Date.now();
        if (a.texto === ultimo && agora - ultimoQuando < 1500) repeticoes++; else repeticoes = 1;
        ultimo = a.texto; ultimoQuando = agora;
        if (repeticoes >= 2) { confirmar(a); return; }          // 2 leituras iguais seguidas = confirmado
      } else { status('Aponte a câmera para o código', ''); repeticoes = 0; }
      setTimeout(laco, 60);
    }).catch(function () { ocupado = false; setTimeout(laco, 150); });
  }

  function recomecar() {
    $('painel').classList.remove('on');
    ultimo = ''; repeticoes = 0; ativo = true; desenhar(null); laco();
  }

  function iniciarCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status('Este navegador não deixa usar a câmera aqui. Use o botão Foto.', '#ef4444'); return;
    }
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then(function (s) {
        stream = s; video.srcObject = s; faixa = s.getVideoTracks()[0];
        var cap = faixa.getCapabilities ? faixa.getCapabilities() : {};
        if (cap.torch) $('lanterna').style.display = '';
        if (cap.focusMode && cap.focusMode.indexOf('continuous') >= 0) faixa.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
        return video.play();
      })
      .then(function () { ajustarTela(); ativo = true; desenhar(null); laco(); })
      .catch(function (e) {
        status('Sem acesso à câmera (' + (e && e.name || 'erro') + '). Permita a câmera para este site e recarregue, ou use o botão Foto.', '#ef4444');
      });
  }

  // ---------- botões ----------
  $('agora').onclick = function () {   // tenta ler o quadro atual com o ZXing (mais esforço) e confirma na hora
    if (!video.videoWidth) { status('A câmera ainda não abriu.', '#ef4444'); return; }
    ler(video, video.videoWidth, video.videoHeight).then(function (r) {
      if (r && r.texto) confirmar(r); else status('Nada legível neste quadro. Aproxime, firme e tente de novo.', '#f59e0b');
    });
  };
  $('foto').onchange = function (ev) {   // plano B: tira/escolhe uma foto e lê nela
    var f = ev.target.files && ev.target.files[0]; if (!f) return;
    var img = new Image();
    img.onload = function () {
      ler(img, img.naturalWidth, img.naturalHeight).then(function (r) {
        URL.revokeObjectURL(img.src);
        if (r && r.texto) confirmar({ texto: r.texto, formato: r.formato, pontos: [] });
        else status('Não achei código nessa foto. Chegue mais perto e deixe o código nítido.', '#f59e0b');
      });
    };
    img.src = URL.createObjectURL(f); ev.target.value = '';
  };
  $('lanterna').onclick = function () {
    var on = $('lanterna').dataset.on !== '1';
    faixa.applyConstraints({ advanced: [{ torch: on }] }).then(function () { $('lanterna').dataset.on = on ? '1' : '0'; $('lanterna').textContent = on ? '🔦 Desligar' : '🔦 Lanterna'; }).catch(function () {});
  };
  $('outro').onclick = recomecar;
  $('copiar').onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText($('lido').textContent).then(function () { $('copiar').textContent = 'Copiado ✓'; setTimeout(function () { $('copiar').textContent = 'Copiar'; }, 1500); }); };
  window.addEventListener('resize', ajustarTela);
  document.addEventListener('visibilitychange', function () { if (document.hidden) ativo = false; else if (!$('painel').classList.contains('on') && stream) { ativo = true; laco(); } });

  prepararMotores();
  if (!Z) status('Falta a biblioteca de leitura. Recarregue a página.', '#ef4444');
  iniciarCamera();
})();
