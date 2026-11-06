// Repetidor Wi-Fi ESP32 controlado pelo app desktop via serial.
// Protocolo (linhas, campos separados por TAB):
// Memória: a última configuração que ficou repetindo é gravada na flash (NVS). Se o ESP for desligado e ligado,
// ele volta sozinho a repetir a mesma rede (mesmo ligado numa fonte externa, sem PC). A configuração só é trocada
// quando o usuário ativa OUTRA rede pelo app com sucesso; o STOP (parar de propósito) impede a volta automática.
//   PC  -> ESP: PING | SCAN | START ssid tipo(COMUM|EAP) usuario senha senhaRepetidor | STOP
//   ESP -> PC : PONG | NET ssid rssi canal seguro(0 aberta, 1 senha, 2 corporativa) | SCAN_END | OK ... | ERR msg | STOPPED | STAT rssi clientes | LOG msg
#include <Arduino.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <esp_netif.h>
#include <Preferences.h>
#include "esp_eap_client.h"
#include "dhcpserver/dhcpserver.h"
#include "repetidor_config.h"

#if TEM_DISPLAY
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
#endif

const char* const TITULO = "REPETIDOR ESP32 - AHS";
const unsigned long TIMEOUT_CONEXAO_MS = 20000;
const unsigned long TIMEOUT_EAP_MS = 40000;  // EAP faz handshake com servidor RADIUS: demora mais
const unsigned long INTERVALO_STATUS_MS = 2000;
const unsigned long RECONECTAR_APOS_MS = 10000;  // sem sinal por mais que isso: força nova tentativa
const int MAX_CLIENTES = 8;
const unsigned long LED_PISCA_MS = 500;  // LED azul: meio segundo aceso, meio segundo apagado
const unsigned long RETOMAR_TENTAR_MS = 15000;  // após ligar: tenta de novo até a rede de origem aparecer

Preferences prefs;
bool retomar = false;  // ligou com repetidor salvo: retomar sozinho (cancelado por qualquer comando do app)
unsigned long proximaRetomadaMs = 0;
struct ConfigSalva { String ssid, usuario, senha, senhaAp; bool eap = false; } salva;

bool ativo = false;
String redeSsid, redeIp, apSsid;
// dados para o dashboard (dashboard.h)
bool apAberto = false;
int internetDns = -1, internetTcp = -1;  // -1 = ainda não testado, 0 = falhou, 1 = ok
unsigned long internetTestadoMs = 0;
String natTexto;
unsigned long quedasTotal = 0;           // quedas da rede de origem desde que o ESP ligou
unsigned long ativoDesdeMs = 0;
String linha;
unsigned long ultimoStatusMs = 0;
unsigned long semSinalDesdeMs = 0;  // 0 = conectado
volatile uint8_t ultimoMotivo = 0;        // motivo da última queda da rede de origem
volatile unsigned long ultimaQuedaMs = 0;
uint8_t melhorBssid[6];
int melhorCanal = 0;

// ---------- memória (flash) ----------
void salvarConfig(const String& ssid, bool eap, const String& usuario, const String& senha, const String& senhaAp) {
  prefs.begin("repetidor", false);
  prefs.putString("ssid", ssid);
  prefs.putBool("eap", eap);
  prefs.putString("user", usuario);
  prefs.putString("pass", senha);
  prefs.putString("apass", senhaAp);
  prefs.putBool("auto", true);
  prefs.end();
}

// false = o usuário mandou PARAR de propósito: continua parado depois de desligar e ligar.
// Escanear ou tentar outra rede que não conecta NÃO mexe na configuração salva: ela só é trocada quando uma nova
// rede é ativada com sucesso.
void salvarAuto(bool ligado) {
  prefs.begin("repetidor", false);
  prefs.putBool("auto", ligado);
  prefs.end();
}

void carregarConfig() {
  prefs.begin("repetidor", true);
  salva.ssid = prefs.getString("ssid", "");
  salva.eap = prefs.getBool("eap", false);
  salva.usuario = prefs.getString("user", "");
  salva.senha = prefs.getString("pass", "");
  salva.senhaAp = prefs.getString("apass", "");
  retomar = prefs.getBool("auto", false) && salva.ssid.length() > 0;
  prefs.end();
}

// ---------- LED azul ----------
// Pisca enquanto o repetidor está ativo E conectado na rede de origem; apagado em qualquer outra situação
// (parado, conectando, sem sinal). Sem delay: roda a cada volta do loop.
void atualizarLed() {
#if LED_AZUL
  static unsigned long ultimaTrocaMs = 0;
  static bool aceso = false;
  bool conectado = ativo && WiFi.status() == WL_CONNECTED;
  if (!conectado) {
    if (aceso) { aceso = false; digitalWrite(LED_AZUL, LOW); }
    return;
  }
  if (millis() - ultimaTrocaMs >= LED_PISCA_MS) {
    ultimaTrocaMs = millis();
    aceso = !aceso;
    digitalWrite(LED_AZUL, aceso ? HIGH : LOW);
  }
#endif
}

// ---------- display ----------
void tela(const String& l1, const String& l2 = "", const String& l3 = "", const String& l4 = "", const String& l5 = "") {
#if TEM_DISPLAY
  const String* ls[] = { &l1, &l2, &l3, &l4, &l5 };
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.print(l1);
  display.drawLine(0, 11, 127, 11, SSD1306_WHITE);
  for (int i = 1; i < 5; i++) {
    display.setCursor(0, 17 + (i - 1) * 12);
    display.print(*ls[i]);
  }
  display.display();
#endif
}

String cortar(const String& s, size_t max = 21) {
  return s.length() > max ? s.substring(0, max) : s;
}

void telaRepetidor() {
  tela("REPETIDOR ATIVO",
       cortar("Rede: " + redeSsid),
       cortar("IP: " + redeIp),
       String(WiFi.RSSI()) + "dBm CH" + String(WiFi.channel()) + " Cli:" + String(WiFi.softAPgetStationNum()),
       cortar("AP:" + apSsid));
}

// ---------- protocolo ----------
// TAB e quebra de linha separam campos/linhas do protocolo: nunca podem aparecer dentro de um valor.
String limpar(String s) {
  s.replace('\t', ' ');
  s.replace('\r', ' ');
  s.replace('\n', ' ');
  return s;
}

void enviar(const String& cmd, const String& a = "", const String& b = "", const String& c = "", const String& d = "", const String& e = "") {
  String s = cmd;
  const String* campos[] = { &a, &b, &c, &d, &e };
  int ultimo = -1;
  for (int i = 0; i < 5; i++) if (campos[i]->length()) ultimo = i;
  for (int i = 0; i <= ultimo; i++) s += "\t" + limpar(*campos[i]);
  Serial.println(s);
}

int dividir(const String& s, String* out, int max) {
  int n = 0, ini = 0;
  while (n < max) {
    int p = s.indexOf('\t', ini);
    if (p < 0) { out[n++] = s.substring(ini); break; }
    out[n++] = s.substring(ini, p);
    ini = p + 1;
  }
  return n;
}

// ---------- Wi-Fi ----------
const char* tipoSeguranca(wifi_auth_mode_t t) {
  if (t == WIFI_AUTH_OPEN) return "0";
  if (t == WIFI_AUTH_WPA2_ENTERPRISE || t == WIFI_AUTH_WPA3_ENTERPRISE || t == WIFI_AUTH_WPA2_WPA3_ENTERPRISE) return "2";
  return "1";
}

const char* descricaoMotivo(uint8_t m) {
  switch (m) {
    case 2:   return "AUTH_EXPIRE";
    case 3:   return "AUTH_LEAVE (o AP derrubou o cliente)";
    case 4:   return "ASSOC_EXPIRE";
    case 6:   return "NOT_AUTHED";
    case 7:   return "NOT_ASSOCED";
    case 8:   return "ASSOC_LEAVE";
    case 13:  return "MIC_FAILURE";
    case 15:  return "4WAY_HANDSHAKE_TIMEOUT (senha errada?)";
    case 17:  return "IE_IN_4WAY_DIFFERS";
    case 23:  return "802_1X_AUTH_FAILED (usuário/senha da rede corporativa recusados)";
    case 200: return "BEACON_TIMEOUT (sinal fraco)";
    case 201: return "NO_AP_FOUND (rede não encontrada em 2,4 GHz)";
    case 202: return "AUTH_FAIL (rejeitado pelo AP)";
    case 203: return "ASSOC_FAIL (associação recusada)";
    case 204: return "HANDSHAKE_TIMEOUT (senha errada?)";
    case 205: return "CONNECTION_FAIL";
    default:  return "motivo desconhecido";
  }
}

void aoEventoWiFi(WiFiEvent_t evento, WiFiEventInfo_t info) {
  if (evento == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    ultimoMotivo = info.wifi_sta_disconnected.reason;
    ultimaQuedaMs = millis();
    quedasTotal++;
  }
}

#include "dashboard.h"  // página servida pelo ESP + JSON (usa as variáveis globais acima)

// Escolhe o ponto de acesso de sinal mais forte da rede (a mesma rede costuma ter vários, em canais diferentes).
bool acharMelhorPontoDeAcesso(const String& ssid) {
  int total = WiFi.scanNetworks();
  int melhor = -1;
  for (int i = 0; i < total; i++) {
    if (WiFi.SSID(i) == ssid && (melhor < 0 || WiFi.RSSI(i) > WiFi.RSSI(melhor))) melhor = i;
  }
  if (melhor >= 0) {
    memcpy(melhorBssid, WiFi.BSSID(melhor), 6);
    melhorCanal = WiFi.channel(melhor);
    enviar("LOG", "Melhor ponto de acesso: " + WiFi.BSSIDstr(melhor) + " canal " + String(melhorCanal) +
                  ", " + String(WiFi.RSSI(melhor)) + " dBm");
  }
  WiFi.scanDelete();
  return melhor >= 0;
}

// (Re)inicia a conexão. Redes corporativas costumam recusar a 1ª tentativa, então isto é chamado de novo.
void iniciarConexao(const String& ssid, bool eap, const String& usuario, const String& senha) {
  WiFi.disconnect(false, true);
  delay(100);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  if (eap) {
    esp_eap_client_clear_identity();
    esp_eap_client_clear_username();
    esp_eap_client_clear_password();
    esp_eap_client_set_identity((const uint8_t*)usuario.c_str(), usuario.length());
    esp_eap_client_set_username((const uint8_t*)usuario.c_str(), usuario.length());
    esp_eap_client_set_password((const uint8_t*)senha.c_str(), senha.length());
    esp_wifi_sta_enterprise_enable();
    WiFi.begin(ssid.c_str(), nullptr, melhorCanal, melhorBssid);
  } else {
    esp_wifi_sta_enterprise_disable();
    WiFi.begin(ssid.c_str(), senha.length() ? senha.c_str() : nullptr, melhorCanal, melhorBssid);
  }
}

void parar();  // definida abaixo

void escanear() {
  if (ativo) {  // escanear troca de canal e derrubaria os clientes: para o repetidor antes, automaticamente
    parar();
    enviar("STOPPED");
    enviar("LOG", "Repetidor parado automaticamente para escanear as redes.");
  }
  tela("ESCANEANDO", "Procurando redes", "Wi-Fi...");
  WiFi.mode(WIFI_STA);
  int total = WiFi.scanNetworks();
  if (total < 0) total = 0;  // falha do scan vem como número negativo
  for (int i = 0; i < total; i++) {
    if (WiFi.SSID(i).length() == 0) continue;  // rede oculta
    enviar("NET", WiFi.SSID(i), String(WiFi.RSSI(i)), String(WiFi.channel(i)),
           tipoSeguranca(WiFi.encryptionType(i)));
  }
  WiFi.scanDelete();
  enviar("SCAN_END");
  if (!ativo) tela(TITULO, "Redes: " + String(total), "", "Aguardando app...");
}

void parar() {
  esp_netif_t* ap = esp_netif_get_handle_from_ifkey("WIFI_AP_DEF");
  if (ap) esp_netif_napt_disable(ap);
  WiFi.softAPdisconnect(true);
  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_STA);
  ativo = false;
  ativoDesdeMs = 0;
}

void ajustarDnsDosClientes(esp_netif_t* ap) {
  IPAddress dns = WiFi.dnsIP();
  if (dns == IPAddress(0, 0, 0, 0)) dns = IPAddress(8, 8, 8, 8);
  esp_netif_dns_info_t info = {};
  info.ip.type = ESP_IPADDR_TYPE_V4;
  info.ip.u_addr.ip4.addr = (uint32_t)dns;
  uint8_t oferecerDns = OFFER_DNS;
  esp_netif_dhcps_stop(ap);
  esp_netif_set_dns_info(ap, ESP_NETIF_DNS_MAIN, &info);
  esp_netif_dhcps_option(ap, ESP_NETIF_OP_SET, ESP_NETIF_DOMAIN_NAME_SERVER, &oferecerDns, sizeof(oferecerDns));
  esp_netif_dhcps_start(ap);
}

// Liga (ou religa, após a rede de origem cair e voltar) a ponte: rota, DNS dos clientes e NAT.
esp_err_t ligarPonte() {
  esp_netif_t* ap = esp_netif_get_handle_from_ifkey("WIFI_AP_DEF");
  esp_netif_t* staNetif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
  // O tráfego dos clientes precisa sair pela rede de origem: a rota padrão tem de ser a STA, não o AP.
  esp_netif_set_default_netif(staNetif);
  ajustarDnsDosClientes(ap);
  return esp_netif_napt_enable(ap);
}

// Diz se a própria rede de origem entrega internet (separa "problema na rede" de "problema no repetidor").
void testarInternet() {
  IPAddress ip;
  bool dns = WiFi.hostByName("google.com", ip);
  WiFiClient c;
  bool tcp = c.connect(IPAddress(1, 1, 1, 1), 53, 3000);
  c.stop();
  internetDns = dns ? 1 : 0;
  internetTcp = tcp ? 1 : 0;
  internetTestadoMs = millis();
  enviar("LOG", String("Internet na rede de origem: DNS ") + (dns ? "ok" : "FALHOU") +
                ", TCP " + (tcp ? "ok" : "FALHOU") +
                (dns || tcp ? "" : " (a rede pode exigir portal/login ou bloquear o ESP)"));
}

// Informa ao app que o repetidor está ativo (ao ativar e também quando o app reconecta com o ESP já repetindo).
void enviarOk() {
  enviar("OK", redeSsid, redeIp, String(WiFi.RSSI()), String(WiFi.channel()), apSsid);
}

// retomada = true quando é o ESP religando sozinho com a configuração salva (não mexe na flash).
void iniciar(const String& ssid, bool eap, const String& usuario, const String& senha, const String& senhaAp,
             bool retomada = false) {
  parar();
  tela("CONECTANDO", cortar(ssid), "Aguarde...");
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  // Vários pontos de acesso com o mesmo nome: conecta no de sinal mais forte, não no primeiro achado.
  WiFi.setScanMethod(WIFI_ALL_CHANNEL_SCAN);
  WiFi.setSortMethod(WIFI_CONNECT_AP_BY_SIGNAL);

  if (eap && usuario.length() == 0) {
    tela("FALHA", "Falta o usuario", "da rede EAP.");
    enviar("ERR", "Rede corporativa (EAP): informe o usuário.");
    return;
  }
  enviar("LOG", String("Conectando em '") + ssid + "' (" + (eap ? "corporativa EAP, usuário " + usuario : String("comum")) + ")");
  if (!acharMelhorPontoDeAcesso(ssid)) {
    tela("FALHA", cortar(ssid), "Nao encontrada.");
    enviar("ERR", "Rede '" + ssid + "' não encontrada (o ESP32 só enxerga redes de 2,4 GHz).");
    return;
  }

  ultimaQuedaMs = 0;
  ultimoMotivo = 0;
  iniciarConexao(ssid, eap, usuario, senha);
  unsigned long timeoutMs = eap ? TIMEOUT_EAP_MS : TIMEOUT_CONEXAO_MS;
  unsigned long inicio = millis();
  unsigned long ultimoBegin = inicio;
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < timeoutMs) {
    delay(250);
    // O AP recusou/derrubou: tenta de novo (padrão de redes corporativas), sem esperar o timeout inteiro.
    if (ultimaQuedaMs > ultimoBegin && millis() - ultimoBegin > 4000) {
      enviar("LOG", String("Queda: ") + descricaoMotivo(ultimoMotivo) + ". Tentando de novo...");
      iniciarConexao(ssid, eap, usuario, senha);
      ultimoBegin = millis();
    }
  }
  if (WiFi.status() != WL_CONNECTED) {
    String motivo = ultimoMotivo ? String(descricaoMotivo(ultimoMotivo)) : String("sem resposta do ponto de acesso");
    parar();
    tela("FALHA", cortar(ssid), "Nao conectou.", cortar(motivo));
    enviar("ERR", "Não conectou em '" + ssid + "': " + motivo);
    return;
  }

  // O rádio é único: o AP precisa estar no mesmo canal da rede de origem.
  apSsid = cortar(ssid, 32 - 8) + " + REPET";  // mantém o sufixo dentro do limite de 32 caracteres
  int canal = WiFi.channel();
  IPAddress sta = WiFi.localIP();
  WiFi.mode(WIFI_AP_STA);
  bool aberto = senhaAp.length() < 8;
  // Se a rede de origem já usa 192.168.4.x, o AP (padrão 192.168.4.1) colidiria e nada seria roteado.
  bool colide = sta[0] == 192 && sta[1] == 168 && sta[2] == 4;
  IPAddress apIp = colide ? IPAddress(192, 168, 77, 1) : IPAddress(192, 168, 4, 1);
  WiFi.softAPConfig(apIp, apIp, IPAddress(255, 255, 255, 0));
  if (!WiFi.softAP(apSsid.c_str(), aberto ? nullptr : senhaAp.c_str(), canal, 0, MAX_CLIENTES)) {
    parar();
    tela("FALHA", "Nao criou o AP");
    enviar("ERR", "Não foi possível criar o Wi-Fi do repetidor.");
    return;
  }
  esp_err_t nat = ligarPonte();

  redeSsid = ssid;
  redeIp = WiFi.localIP().toString();
  ativo = true;
  ativoDesdeMs = millis();
  apAberto = aberto;
  natTexto = nat == ESP_OK ? "ligado" : String(esp_err_to_name(nat));
  iniciarDashboard();
  semSinalDesdeMs = 0;
  if (aberto) enviar("LOG", "Atenção: senha do repetidor com menos de 8 caracteres, o Wi-Fi do repetidor ficou ABERTO.");
  if (!retomada) salvarConfig(ssid, eap, usuario, senha, senhaAp);  // sobrevive a desligar o ESP
  enviarOk();
  telaRepetidor();

  enviar("LOG", String("NAT: ") + (nat == ESP_OK ? "ligado" : esp_err_to_name(nat)) +
                " | AP " + apIp.toString() + " | origem " + sta.toString() +
                " gw " + WiFi.gatewayIP().toString() + " dns " + WiFi.dnsIP().toString());
  enviar("LOG", "Dashboard: http://" + apIp.toString() + "/ (no Wi-Fi do repetidor) ou http://" + redeIp + "/ (na rede de origem)");
  testarInternet();  // demora alguns segundos; por isso vem depois do OK
}

void tratarComando(const String& texto) {
  String f[6];
  dividir(texto, f, 6);
  if (f[0] == "START" || f[0] == "STOP") retomar = false;  // o usuário assumiu o controle pelo app
  if (f[0] == "PING") {
    enviar("PONG");
    if (ativo) enviarOk();  // o app pode ter sido reaberto com o ESP ainda repetindo: sincroniza o estado
  } else if (f[0] == "SCAN") {
    if (retomar) {  // o escaneamento automático do app ao conectar não pode apagar a configuração salva
      enviar("ERR", "Retomando a última rede ('" + salva.ssid + "'). Aguarde ou mande PARAR para cancelar.");
      return;
    }
    escanear();
  } else if (f[0] == "START") {
    iniciar(f[1], f[2] == "EAP", f[3], f[4], f[5]);
  } else if (f[0] == "STOP") {
    salvarAuto(false);  // parado de propósito: continua parado depois de desligar e ligar
    parar();
    enviar("STOPPED");
    tela(TITULO, "Parado", "", "Aguardando app...");
  }
}

void setup() {
  Serial.begin(115200);
  // O repetidor não aciona nada. O GPIO 5, porém, sai de fábrica com um pull-up interno ligado (pino de boot) e um
  // LED ligado nele ao GND acende de leve. Segurar o pino em nível baixo (saída desligada) apaga o LED de vez.
  pinMode(5, OUTPUT);
  digitalWrite(5, LOW);
#if LED_AZUL
  pinMode(LED_AZUL, OUTPUT);
  digitalWrite(LED_AZUL, LOW);
#endif
#if TEM_DISPLAY
  Wire.begin(OLED_SDA, OLED_SCL);
  display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
#endif
  WiFi.onEvent(aoEventoWiFi);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  carregarConfig();
  if (retomar) tela("RETOMANDO", cortar(salva.ssid), "Aguarde...");
  else tela(TITULO, "", "", "Aguardando app...");
}

void loop() {
  atualizarLed();
  if (servidorLigado) servidor.handleClient();
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      linha.trim();
      if (linha.length()) tratarComando(linha);
      linha = "";
    } else if (linha.length() < 400) {
      linha += c;
    }
  }

  // Ligou com um repetidor salvo: volta sozinho; se a rede ainda não apareceu (ex.: roteador religando), insiste.
  if (retomar && !ativo && millis() >= proximaRetomadaMs) {
    iniciar(salva.ssid, salva.eap, salva.usuario, salva.senha, salva.senhaAp, true);
    proximaRetomadaMs = millis() + RETOMAR_TENTAR_MS;
    if (ativo) retomar = false;
  }

  if (ativo && millis() - ultimoStatusMs >= INTERVALO_STATUS_MS) {
    ultimoStatusMs = millis();
    if (WiFi.status() != WL_CONNECTED) {
      if (semSinalDesdeMs == 0) {
        semSinalDesdeMs = millis();
        enviar("LOG", "Rede de origem caiu, reconectando...");
      }
      tela("SEM SINAL", cortar(redeSsid), "Reconectando...");
      // O auto-reconnect do Wi-Fi cuida da volta; só força depois de um tempo, para não reiniciar a tentativa a toda hora.
      if (millis() - semSinalDesdeMs > RECONECTAR_APOS_MS) {
        WiFi.reconnect();
        semSinalDesdeMs = millis();
      }
    } else {
      if (semSinalDesdeMs != 0) {  // voltou: refaz rota/DNS/NAT, que podem ter mudado
        semSinalDesdeMs = 0;
        redeIp = WiFi.localIP().toString();
        ligarPonte();
        enviar("LOG", "Rede de origem voltou: " + redeIp);
      }
      telaRepetidor();
      enviar("STAT", String(WiFi.RSSI()), String(WiFi.softAPgetStationNum()));
    }
  }
  delay(5);
}
