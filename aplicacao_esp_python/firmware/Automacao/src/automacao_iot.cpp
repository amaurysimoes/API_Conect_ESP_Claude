// Automação IOT ESP32: o ESP aparece no Firebase como esps/<NOME_DISPOSITIVO> e obedece/informa seus pinos.
//   esps/<nome>/modelo                      texto
//   esps/<nome>/pinos/<gpio>/nome|tipo      cadastro do pino (tipo: saida | entrada)
//   esps/<nome>/pinos/<gpio>/estado         SAIDA: a página escreve, o ESP aciona o pino
//                                           ENTRADA (switch): o ESP escreve o estado lido
//                                           SAIDA + pulso=true (a página escreve): liga por PULSO_MS e desliga sozinho
//   esps/<nome>/ip                          IP do ESP na rede
//   esps/<nome>/vcc                         tensão de alimentação medida (volts)
//   esps/<nome>/visto_em                    horário do servidor do último contato (heartbeat)
// Tudo que muda de um ESP para outro (nome, Wi-Fi, pinos, Vcc) fica em automacao_config.h.
// O display OLED só mostra informações (nunca é usado para outra coisa).
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "automacao_config.h"

#if TEM_DISPLAY
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
#endif

const unsigned long INTERVALO_SAIDAS_MS = 1000;     // consulta dos comandos no Firebase
const unsigned long INTERVALO_HEARTBEAT_MS = 10000;  // Vcc + visto_em
const unsigned long INTERVALO_REGISTRO_MS = 5000;    // nova tentativa de cadastro
const unsigned long REDE_TENTAR_MS = 15000;
const unsigned long DEBOUNCE_MS = 30;
const unsigned long SEM_RESPOSTA_REINICIA_MS = 90000;  // 90 s sem nenhuma resposta do Firebase: reinicia
const unsigned long PULSO_MS = 1000;                // duração do botão "Pulso" da página
const int N_PINOS = sizeof(PINOS) / sizeof(PINOS[0]);

WiFiClientSecure cliente;
HTTPClient http;

bool pinoAtivo[N_PINOS];       // false = pino reservado/inválido, ignorado
bool estadoLogico[N_PINOS];    // ligado/desligado (já considerando "invertido")
bool candidato[N_PINOS];       // ENTRADA: leitura em estabilização
unsigned long candidatoDesde[N_PINOS];
bool envioPendente[N_PINOS];   // mudou e ainda não foi para o Firebase (vale para entrada e para saída em pulso)
unsigned long pulsoFimMs[N_PINOS];  // SAIDA em pulso: quando desliga (0 = sem pulso)
bool limparPulso[N_PINOS];     // SAIDA: falta zerar o campo "pulso" no Firebase

bool registrado = false;
String ultimaAcao;                  // última linha do display: só o pino acionado agora pelo site/Firebase (ex.: "GPIO 5: ON")
int ultimoCodigo = 0;               // último código HTTP (negativo = falha de conexão)
unsigned long ultimoOkMs = 0;       // última requisição ao Firebase que deu certo
bool firebaseOk = false;
float vccVolts = -1;
unsigned long ultimoRegistroMs = 0, ultimasSaidasMs = 0, ultimoHeartbeatMs = 0, ultimaRedeMs = 0, ultimaTelaMs = 0;

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

void atualizarTela() {
  String wifi = WiFi.status() == WL_CONNECTED ? "WiFi " + String(WiFi.RSSI()) + "dBm" : "WiFi sem rede";
  String fb = !registrado ? "Firebase conectando" : (firebaseOk ? "Firebase OK" : "Firebase ERRO " + String(ultimoCodigo));
  String vcc = vccVolts >= 0 ? "Vcc: " + String(vccVolts, 2) + "V" : "Vcc: --";
  tela(cortar(NOME_DISPOSITIVO), cortar(wifi), cortar(fb), cortar(vcc), cortar(ultimaAcao));
}

// ---------- pinos ----------
// Qualquer GPIO que existe no ESP32 serve para ON/OFF, pulso ou switch, exceto os reservados:
//   serial USB (1,3) e flash (6-11): sempre;  display (OLED_SDA/OLED_SCL = 21,22): só se TEM_DISPLAY = 1.
// Placa SEM display (TEM_DISPLAY 0): 21 e 22 ficam livres como pinos comuns.
bool pinoExiste(uint8_t g) {
  return g <= 19 || (g >= 21 && g <= 23) || (g >= 25 && g <= 27) || (g >= 32 && g <= 39);
}

bool pinoReservado(uint8_t g) {
  if (g == 1 || g == 3 || (g >= 6 && g <= 11)) return true;
#if TEM_DISPLAY
  if (g == OLED_SDA || g == OLED_SCL) return true;  // o display é intocável
#endif
  return false;
}

bool pinoValido(const PinoCfg& p) {
  if (!pinoExiste(p.gpio) || pinoReservado(p.gpio)) return false;
  if (p.tipo == SAIDA && p.gpio >= 34) return false;  // 34-39 só entrada
  return true;
}

void aplicarSaida(int i, bool ligado) {
  estadoLogico[i] = ligado;
  digitalWrite(PINOS[i].gpio, (ligado != PINOS[i].invertido) ? HIGH : LOW);
}

bool lerEntrada(int i) {
  return (digitalRead(PINOS[i].gpio) == HIGH) != PINOS[i].invertido;
}

void iniciarPinos() {
  for (int i = 0; i < N_PINOS; i++) {
    const PinoCfg& p = PINOS[i];
    pinoAtivo[i] = pinoValido(p);
    estadoLogico[i] = candidato[i] = false;
    envioPendente[i] = false;
    pulsoFimMs[i] = 0;
    limparPulso[i] = false;
    if (!pinoAtivo[i]) {
      Serial.printf("Pino %u (%s) ignorado: reservado ou inválido para o tipo\n", p.gpio, p.nome);
      continue;
    }
    if (p.tipo == SAIDA) {
      pinMode(p.gpio, OUTPUT);  // no core 3.x o pino precisa estar configurado antes do digitalWrite
      aplicarSaida(i, false);  // começa desligado
    } else {
      // 34-39 não têm pull-up interno: precisam de resistor externo
      pinMode(p.gpio, p.gpio >= 34 ? INPUT : (p.invertido ? INPUT_PULLUP : INPUT_PULLDOWN));
      estadoLogico[i] = candidato[i] = lerEntrada(i);
      candidatoDesde[i] = millis();
    }
  }
}

// Lê as entradas (switch) com debounce; marca para enviar ao Firebase quando mudam.
void lerEntradas() {
  for (int i = 0; i < N_PINOS; i++) {
    if (!pinoAtivo[i] || PINOS[i].tipo != ENTRADA) continue;
    bool v = lerEntrada(i);
    if (v != candidato[i]) {
      candidato[i] = v;
      candidatoDesde[i] = millis();
    } else if (v != estadoLogico[i] && millis() - candidatoDesde[i] >= DEBOUNCE_MS) {
      estadoLogico[i] = v;
      envioPendente[i] = true;
      Serial.printf("Entrada %u -> %s\n", PINOS[i].gpio, v ? "ON" : "OFF");
    }
  }
}

float lerVcc() {
#if VCC_PINO
  uint32_t soma = 0;
  for (int i = 0; i < 16; i++) soma += analogReadMilliVolts(VCC_PINO);
  return (soma / 16.0f) * VCC_DIVISOR / 1000.0f;
#else
  return -1;
#endif
}

// ---------- Firebase (REST) ----------
String urlDe(const String& caminho) {
  String u = String("https://") + FIREBASE_HOST + "/esps/" + NOME_DISPOSITIVO;
  if (caminho.length()) u += "/" + caminho;
  u += ".json";
  if (String(FIREBASE_AUTH).length()) u += String("?auth=") + FIREBASE_AUTH;
  return u;
}

bool requisitar(const char* metodo, const String& caminho, const String& corpo, String* resposta = nullptr) {
  if (WiFi.status() != WL_CONNECTED) { firebaseOk = false; return false; }
  if (!http.begin(cliente, urlDe(caminho))) { firebaseOk = false; return false; }
  http.setReuse(false);  // uma conexão nova por requisição: conexão guardada que o servidor fechou causava falhas
  http.setTimeout(6000);
  http.addHeader("Content-Type", "application/json");
  int codigo = String(metodo) == "GET" ? http.GET() : http.sendRequest(metodo, corpo);
  if (codigo >= 200 && codigo < 300 && resposta) *resposta = http.getString();
  http.end();
  ultimoCodigo = codigo;
  firebaseOk = codigo >= 200 && codigo < 300;
  if (firebaseOk) ultimoOkMs = millis();
  else Serial.printf("Firebase %s /%s -> %d (%s)\n", metodo, caminho.c_str(), codigo, HTTPClient::errorToString(codigo).c_str());
  return firebaseOk;
}

// Cadastra o dispositivo e os pinos sem apagar o "estado" que a página já tenha gravado nas saídas.
bool registrarDispositivo() {
  JsonDocument doc;
  doc["modelo"] = MODELO_DISPOSITIVO;
  doc["ip"] = WiFi.localIP().toString();
  doc["visto_em"][".sv"] = "timestamp";
  for (int i = 0; i < N_PINOS; i++) {
    if (!pinoAtivo[i]) continue;
    String base = "pinos/" + String(PINOS[i].gpio);
    doc[base + "/nome"] = PINOS[i].nome;
    doc[base + "/tipo"] = PINOS[i].tipo == SAIDA ? "saida" : "entrada";
    if (PINOS[i].tipo == ENTRADA) doc[base + "/estado"] = estadoLogico[i];
  }
  String corpo;
  serializeJson(doc, corpo);
  return requisitar("PATCH", "", corpo);
}

// Lê o "estado" de cada SAÍDA no Firebase e aciona o pino. Sem valor no Firebase = desligado.
void lerSaidas() {
  String resp;
  if (!requisitar("GET", "pinos", "", &resp)) return;
  JsonDocument doc;
  if (deserializeJson(doc, resp)) return;  // resposta inválida: mantém como está
  for (int i = 0; i < N_PINOS; i++) {
    if (!pinoAtivo[i] || PINOS[i].tipo != SAIDA) continue;
    if (pulsoFimMs[i] || limparPulso[i] || envioPendente[i]) continue;  // pulso em andamento ou estado local ainda não enviado
    // Com chaves numéricas seguidas (0, 2, 4, 5...) o Firebase devolve "pinos" como ARRAY [..] e não como objeto {..}
    JsonVariant no;
    if (doc.is<JsonArray>()) no = doc[(int)PINOS[i].gpio];
    else no = doc[String(PINOS[i].gpio)];
    if (no["pulso"].is<bool>() && no["pulso"].as<bool>()) {  // botão "Pulso": liga por PULSO_MS e desliga sozinho
      aplicarSaida(i, true);
      ultimaAcao = "GPIO " + String(PINOS[i].gpio) + ": PULSO";
      pulsoFimMs[i] = millis() + PULSO_MS;
      if (pulsoFimMs[i] == 0) pulsoFimMs[i] = 1;
      envioPendente[i] = limparPulso[i] = true;
      Serial.printf("Saída %u (%s) -> PULSO\n", PINOS[i].gpio, PINOS[i].nome);
      atualizarTela();
      continue;
    }
    JsonVariant v = no["estado"];
    bool quer = v.is<bool>() ? v.as<bool>() : false;
    if (quer != estadoLogico[i]) {
      aplicarSaida(i, quer);
      ultimaAcao = "GPIO " + String(PINOS[i].gpio) + (quer ? ": ON" : ": OFF");
      Serial.printf("Saída %u (%s) -> %s\n", PINOS[i].gpio, PINOS[i].nome, quer ? "ON" : "OFF");
      atualizarTela();
    }
  }
}

// Fim dos pulsos: desliga a saída e avisa o Firebase.
void tratarPulsos() {
  for (int i = 0; i < N_PINOS; i++) {
    if (pulsoFimMs[i] && (long)(millis() - pulsoFimMs[i]) >= 0) {
      pulsoFimMs[i] = 0;
      aplicarSaida(i, false);
      ultimaAcao = "GPIO " + String(PINOS[i].gpio) + ": OFF";
      envioPendente[i] = true;
    }
  }
}

// Publica no Firebase o estado dos pinos que mudaram aqui (switches e saídas em pulso).
void enviarPendentes() {
  for (int i = 0; i < N_PINOS; i++) {
    if (!envioPendente[i]) continue;
    JsonDocument doc;
    doc["estado"] = estadoLogico[i];
    if (limparPulso[i]) doc["pulso"] = false;
    String corpo;
    serializeJson(doc, corpo);
    if (requisitar("PATCH", "pinos/" + String(PINOS[i].gpio), corpo)) envioPendente[i] = limparPulso[i] = false;
    else return;  // sem conexão: tenta de novo no próximo ciclo
  }
}

void heartbeat() {
  vccVolts = lerVcc();
  JsonDocument doc;
  doc["ip"] = WiFi.localIP().toString();
  if (vccVolts >= 0) doc["vcc"] = roundf(vccVolts * 100) / 100;
  doc["visto_em"][".sv"] = "timestamp";
  String corpo;
  serializeJson(doc, corpo);
  requisitar("PATCH", "", corpo);
}

// ---------- principal ----------
void conectarWiFi() {
  WiFi.begin(WIFI_SSID, String(WIFI_SENHA).length() ? WIFI_SENHA : nullptr);
  ultimaRedeMs = millis();
}

void setup() {
  Serial.begin(115200);
#if TEM_DISPLAY
  Wire.begin(OLED_SDA, OLED_SCL);
  display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
#endif
  iniciarPinos();
#if VCC_PINO
  pinMode(VCC_PINO, INPUT);
  // atenuação padrão do ESP32 = 11 dB (até ~3,1 V no pino): não precisa configurar
#endif
  tela(cortar(NOME_DISPOSITIVO), "Iniciando...");
  cliente.setInsecure();  // sem validar o certificado: dispensa guardar a CA no ESP (a regra do banco é que protege)
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  conectarWiFi();
}

void loop() {
  unsigned long agora = millis();
  lerEntradas();
  tratarPulsos();

  if (WiFi.status() != WL_CONNECTED) {
    registrado = false;  // ao voltar, cadastra de novo
    if (agora - ultimaRedeMs >= REDE_TENTAR_MS) { WiFi.disconnect(); conectarWiFi(); }
  } else if (!registrado) {
    if (agora - ultimoRegistroMs >= INTERVALO_REGISTRO_MS || ultimoRegistroMs == 0) {
      ultimoRegistroMs = agora ? agora : 1;
      registrado = registrarDispositivo();
      if (registrado) { ultimasSaidasMs = 0; ultimoHeartbeatMs = agora; heartbeat(); }
    }
  } else {
    enviarPendentes();
    if (agora - ultimasSaidasMs >= INTERVALO_SAIDAS_MS) { ultimasSaidasMs = agora; lerSaidas(); }
    if (agora - ultimoHeartbeatMs >= INTERVALO_HEARTBEAT_MS) { ultimoHeartbeatMs = agora; heartbeat(); }
  }

  // Rede/Firebase sem resposta por muito tempo (travou?): reinicia sozinho. A configuração é fixa no firmware.
  // millis() novo de propósito: 'agora' é de antes das requisições (que demoram) e daria diferença negativa => reinício falso
  if (registrado && ultimoOkMs && millis() - ultimoOkMs > SEM_RESPOSTA_REINICIA_MS) {
    Serial.println("Sem resposta do Firebase há muito tempo: reiniciando.");
    delay(100);
    ESP.restart();
  }

  if (agora - ultimaTelaMs >= 1000) { ultimaTelaMs = agora; atualizarTela(); }
  delay(5);
}
