#pragma once
// Dashboard do repetidor: página servida pelo próprio ESP32 (porta 80) + JSON com todos os dados.
// Incluído pelo repetidor.cpp DEPOIS das variáveis globais dele (usa ativo, redeSsid, apSsid etc.).
//   http://<IP do AP>/     no Wi-Fi do repetidor (192.168.4.1, ou 192.168.77.1 se a rede de origem usar 192.168.4.x)
//   http://<IP da rede>/   na rede de origem (o IP aparece no display e no log do app)
//   /status                os mesmos dados em JSON
#include <WebServer.h>
#include <esp_system.h>

WebServer servidor(80);
bool servidorLigado = false;

const char DASHBOARD_HTML[] PROGMEM = R"HTML(<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Repetidor ESP32 - AHS</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Segoe UI,system-ui,sans-serif;font-size:14px;background:#121212;color:#f2f2f7}
header{display:flex;align-items:center;gap:12px;padding:12px 18px;background:#1c1c1e;border-bottom:1px solid #2c2c2e}
header b{font-size:17px;margin-right:auto}
.pill{padding:4px 12px;border-radius:999px;font-weight:bold;font-size:12px}
.on{background:#34c759;color:#06210f}.off{background:#ff3b30;color:#fff}.warn{background:#ff9f0a;color:#2a1800}
main{max-width:980px;margin:0 auto;padding:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.card{background:#1c1c1e;border:1px solid #2c2c2e;border-radius:14px;padding:16px}
.card h2{margin:0 0 10px;font-size:15px;color:#0a84ff}
.big{font-size:38px;font-weight:bold;line-height:1}
.row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #2c2c2e}
.row:last-child{border-bottom:none}.row span:first-child{color:#8e8e93}.row span:last-child{text-align:right;word-break:break-all}
table{width:100%;border-collapse:collapse;font-size:13px}th{color:#8e8e93;text-align:left;font-weight:normal}
td,th{padding:5px 4px;border-bottom:1px solid #2c2c2e}
.wide{grid-column:1/-1}.muted{color:#8e8e93;font-size:12px}
</style></head><body>
<header><b>Repetidor ESP32 - AHS</b><span id="estado" class="pill off">...</span><span id="hora" class="muted"></span></header>
<main>
<div class="card"><h2>Clientes no repetidor</h2><div class="big"><span id="nc">-</span> <span class="muted">de <span id="mc">-</span></span></div>
<p class="muted">Conectados agora no Wi-Fi do repetidor (atualiza a cada 2 s).</p></div>
<div class="card"><h2>Internet</h2>
<div class="row"><span>DNS</span><span id="dns">-</span></div>
<div class="row"><span>Conexão (TCP)</span><span id="tcp">-</span></div>
<div class="row"><span>NAT (ponte)</span><span id="nat">-</span></div>
<div class="row"><span>Último teste</span><span id="teste">-</span></div></div>
<div class="card"><h2>Rede de origem</h2>
<div class="row"><span>Rede</span><span id="rede">-</span></div>
<div class="row"><span>Situação</span><span id="conectado">-</span></div>
<div class="row"><span>IP</span><span id="ip">-</span></div>
<div class="row"><span>Gateway</span><span id="gw">-</span></div>
<div class="row"><span>DNS</span><span id="dnsip">-</span></div>
<div class="row"><span>Máscara</span><span id="mask">-</span></div>
<div class="row"><span>Sinal</span><span id="rssi">-</span></div>
<div class="row"><span>Canal</span><span id="canal">-</span></div>
<div class="row"><span>Ponto de acesso (BSSID)</span><span id="bssid">-</span></div>
<div class="row"><span>Potência de transmissão</span><span id="tx">-</span></div></div>
<div class="card"><h2>Wi-Fi do repetidor</h2>
<div class="row"><span>Nome</span><span id="apssid">-</span></div>
<div class="row"><span>Segurança</span><span id="apsec">-</span></div>
<div class="row"><span>IP do repetidor</span><span id="apip">-</span></div>
<div class="row"><span>MAC do repetidor</span><span id="apmac">-</span></div></div>
<div class="card wide"><h2>Aparelhos conectados</h2>
<table><thead><tr><th>MAC</th><th>IP</th><th>Sinal</th></tr></thead><tbody id="lista"></tbody></table>
<p class="muted" id="semcli"></p></div>
<div class="card"><h2>Tempo</h2>
<div class="row"><span>Repetindo há</span><span id="ativoh">-</span></div>
<div class="row"><span>ESP ligado há</span><span id="up">-</span></div>
<div class="row"><span>Quedas da rede de origem</span><span id="quedas">-</span></div>
<div class="row"><span>Último motivo de queda</span><span id="motivo">-</span></div>
<div class="row"><span>Último reinício</span><span id="reset">-</span></div></div>
<div class="card"><h2>Sistema</h2>
<div class="row"><span>Chip</span><span id="chip">-</span></div>
<div class="row"><span>CPU</span><span id="cpu">-</span></div>
<div class="row"><span>Temperatura interna</span><span id="temp">-</span></div>
<div class="row"><span>Memória livre</span><span id="heap">-</span></div>
<div class="row"><span>Menor memória livre</span><span id="heapmin">-</span></div>
<div class="row"><span>Flash</span><span id="flash">-</span></div>
<div class="row"><span>Firmware</span><span id="sketch">-</span></div>
<div class="row"><span>SDK</span><span id="sdk">-</span></div>
<div class="row"><span>MAC do ESP</span><span id="mac">-</span></div></div>
</main>
<script>
const $=id=>document.getElementById(id);
const t=s=>{s=+s;const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return (d?d+'d ':'')+(h?h+'h ':'')+m+'min '+(s%60)+'s'};
const ok=v=>v<0?'não testado':v?'ok':'FALHOU';
async function atualizar(){
 try{
  const d=await (await fetch('/status',{cache:'no-store'})).json();
  const e=$('estado');
  e.textContent=d.ativo?(d.conectado?'REPETIDOR ATIVO':'SEM SINAL'):'PARADO';
  e.className='pill '+(d.ativo?(d.conectado?'on':'warn'):'off');
  $('hora').textContent='atualizado '+new Date().toLocaleTimeString();
  $('nc').textContent=d.clientes.length; $('mc').textContent=d.max_clientes;
  $('dns').textContent=ok(d.dns_ok); $('tcp').textContent=ok(d.tcp_ok); $('nat').textContent=d.nat||'-';
  $('teste').textContent=d.teste_s<0?'-':'há '+t(d.teste_s);
  $('rede').textContent=d.rede||'-'; $('conectado').textContent=d.conectado?'conectado':'sem conexão';
  $('ip').textContent=d.ip||'-'; $('gw').textContent=d.gateway||'-'; $('dnsip').textContent=d.dns||'-'; $('mask').textContent=d.mascara||'-';
  $('rssi').textContent=d.conectado?d.rssi+' dBm':'-'; $('canal').textContent=d.canal||'-'; $('bssid').textContent=d.bssid||'-'; $('tx').textContent=d.tx+' dBm';
  $('apssid').textContent=d.ap_ssid||'-'; $('apsec').textContent=d.ap_aberto?'ABERTO (sem senha)':'WPA2 com senha';
  $('apip').textContent=d.ap_ip||'-'; $('apmac').textContent=d.ap_mac||'-';
  $('lista').innerHTML=d.clientes.map(c=>'<tr><td>'+c.mac+'</td><td>'+(c.ip||'-')+'</td><td>'+c.rssi+' dBm</td></tr>').join('');
  $('semcli').textContent=d.clientes.length?'':'Nenhum aparelho conectado.';
  $('ativoh').textContent=d.ativo?t(d.ativo_s):'-'; $('up').textContent=t(d.uptime_s); $('quedas').textContent=d.quedas; $('motivo').textContent=d.motivo||'-'; $('reset').textContent=d.reset;
  $('chip').textContent=d.chip+' rev '+d.rev+' ('+d.cores+' núcleos)'; $('cpu').textContent=d.cpu+' MHz';
  $('temp').textContent=d.temp.toFixed(1)+' °C'; $('heap').textContent=(d.heap/1024).toFixed(0)+' KB de '+(d.heap_total/1024).toFixed(0)+' KB';
  $('heapmin').textContent=(d.heap_min/1024).toFixed(0)+' KB'; $('flash').textContent=d.flash_mb+' MB'; $('sketch').textContent=(d.sketch/1024).toFixed(0)+' KB';
  $('sdk').textContent=d.sdk; $('mac').textContent=d.mac;
 }catch(x){const e=$('estado');e.textContent='SEM RESPOSTA';e.className='pill off'}
}
atualizar();setInterval(atualizar,2000);
</script></body></html>)HTML";

// Texto seguro dentro de uma string JSON.
String jsonEsc(const String& s) {
  String o;
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '"' || c == 92) { o += (char)92; o += c; }
    else if (c == '\n' || c == '\r' || c == '\t') o += ' ';
    else o += c;
  }
  return o;
}

String macTexto(const uint8_t* m) {
  char b[18];
  snprintf(b, sizeof(b), "%02X:%02X:%02X:%02X:%02X:%02X", m[0], m[1], m[2], m[3], m[4], m[5]);
  return String(b);
}

const char* motivoReinicio() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON:   return "ligado na energia";
    case ESP_RST_EXT:       return "botão EN / reset externo";
    case ESP_RST_SW:        return "reinício por software";
    case ESP_RST_PANIC:     return "travou (panic)";
    case ESP_RST_INT_WDT:
    case ESP_RST_TASK_WDT:
    case ESP_RST_WDT:       return "travou (watchdog)";
    case ESP_RST_DEEPSLEEP: return "saiu do sono profundo";
    case ESP_RST_BROWNOUT:  return "queda de tensão (brownout)";
    default:                return "desconhecido";
  }
}

String statusJson() {
  bool conectado = WiFi.status() == WL_CONNECTED;
  String j;
  j.reserve(1800);
  j += "{\"ativo\":" + String(ativo ? "true" : "false");
  j += ",\"conectado\":" + String(conectado ? "true" : "false");
  j += ",\"rede\":\"" + jsonEsc(redeSsid) + "\"";
  j += ",\"ip\":\"" + (conectado ? WiFi.localIP().toString() : String("")) + "\"";
  j += ",\"gateway\":\"" + (conectado ? WiFi.gatewayIP().toString() : String("")) + "\"";
  j += ",\"dns\":\"" + (conectado ? WiFi.dnsIP().toString() : String("")) + "\"";
  j += ",\"mascara\":\"" + (conectado ? WiFi.subnetMask().toString() : String("")) + "\"";
  j += ",\"bssid\":\"" + (conectado ? WiFi.BSSIDstr() : String("")) + "\"";
  j += ",\"canal\":" + String(conectado ? WiFi.channel() : 0);
  j += ",\"rssi\":" + String(conectado ? WiFi.RSSI() : 0);
  j += ",\"tx\":" + String((float)WiFi.getTxPower() / 4.0f, 1);
  j += ",\"ap_ssid\":\"" + jsonEsc(apSsid) + "\"";
  j += ",\"ap_aberto\":" + String(apAberto ? "true" : "false");
  j += ",\"ap_ip\":\"" + (ativo ? WiFi.softAPIP().toString() : String("")) + "\"";
  j += ",\"ap_mac\":\"" + WiFi.softAPmacAddress() + "\"";
  j += ",\"max_clientes\":" + String(MAX_CLIENTES);

  j += ",\"clientes\":[";
  wifi_sta_list_t lista;
  memset(&lista, 0, sizeof(lista));
  if (ativo && esp_wifi_ap_get_sta_list(&lista) == ESP_OK) {
    esp_netif_t* apNetif = esp_netif_get_handle_from_ifkey("WIFI_AP_DEF");
    for (int i = 0; i < lista.num; i++) {
      if (i) j += ",";
      String ip = "";
      if (apNetif) {  // IP que o DHCP do repetidor deu a este aparelho (procura pelo MAC)
        esp_netif_pair_mac_ip_t par;
        memset(&par, 0, sizeof(par));
        memcpy(par.mac, lista.sta[i].mac, 6);
        if (esp_netif_dhcps_get_clients_by_mac(apNetif, 1, &par) == ESP_OK && par.ip.addr) ip = IPAddress(par.ip.addr).toString();
      }
      j += "{\"mac\":\"" + macTexto(lista.sta[i].mac) + "\",\"ip\":\"" + ip + "\",\"rssi\":" + String(lista.sta[i].rssi) + "}";
    }
  }
  j += "]";

  j += ",\"dns_ok\":" + String(internetDns);
  j += ",\"tcp_ok\":" + String(internetTcp);
  j += ",\"teste_s\":" + String(internetTestadoMs ? (long)((millis() - internetTestadoMs) / 1000) : -1L);
  j += ",\"nat\":\"" + jsonEsc(natTexto) + "\"";
  j += ",\"quedas\":" + String(quedasTotal);
  j += ",\"motivo\":\"" + jsonEsc(quedasTotal ? String(descricaoMotivo(ultimoMotivo)) : String("")) + "\"";
  j += ",\"ativo_s\":" + String(ativo && ativoDesdeMs ? (long)((millis() - ativoDesdeMs) / 1000) : 0L);
  j += ",\"uptime_s\":" + String((long)(millis() / 1000));
  j += ",\"reset\":\"" + String(motivoReinicio()) + "\"";
  j += ",\"chip\":\"" + String(ESP.getChipModel()) + "\"";
  j += ",\"rev\":" + String(ESP.getChipRevision());
  j += ",\"cores\":" + String(ESP.getChipCores());
  j += ",\"cpu\":" + String(ESP.getCpuFreqMHz());
  j += ",\"flash_mb\":" + String(ESP.getFlashChipSize() / (1024 * 1024));
  j += ",\"heap\":" + String(ESP.getFreeHeap());
  j += ",\"heap_min\":" + String(ESP.getMinFreeHeap());
  j += ",\"heap_total\":" + String(ESP.getHeapSize());
  j += ",\"sketch\":" + String(ESP.getSketchSize());
  j += ",\"sdk\":\"" + jsonEsc(String(ESP.getSdkVersion())) + "\"";
  j += ",\"mac\":\"" + WiFi.macAddress() + "\"";
  j += ",\"temp\":" + String(temperatureRead(), 1);
  j += "}";
  return j;
}

// Liga o servidor na primeira vez que o repetidor fica ativo (a pilha de rede já está de pé).
void iniciarDashboard() {
  if (servidorLigado) return;
  servidor.on("/", HTTP_GET, []() { servidor.send_P(200, "text/html; charset=utf-8", DASHBOARD_HTML); });
  servidor.on("/status", HTTP_GET, []() {
    servidor.sendHeader("Cache-Control", "no-store");
    servidor.send(200, "application/json", statusJson());
  });
  servidor.onNotFound([]() { servidor.send(404, "text/plain", "Nao encontrado"); });
  servidor.begin();
  servidorLigado = true;
}
