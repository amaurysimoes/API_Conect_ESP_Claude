#pragma once
// Configuração do dispositivo. É o único arquivo que muda de um ESP para outro
// (o form "Automação FireBase" do app vai gerá-lo antes de compilar).

// ---- identidade: o ESP aparece no Firebase como esps/<NOME_DISPOSITIVO> ----
#define NOME_DISPOSITIVO "esp01"   // só letras, números, - e _
#define MODELO_DISPOSITIVO "ESP32"

// ---- Wi-Fi (rede comum WPA2/aberta) ----
#define WIFI_SSID  "MULTIWIFI"
#define WIFI_SENHA ""

// ---- Firebase Realtime Database ----
#define FIREBASE_HOST "amauryesp-active-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH ""           // vazio = regras abertas. Nunca versionar chave/secret aqui.

// ---- display OLED SSD1306 128x64 (I2C). Só mostra informações; os pinos 21/22 nunca são usados para mais nada ----
#define TEM_DISPLAY 1
#define OLED_SDA    21
#define OLED_SCL    22
#define OLED_ADDR   0x3C

// ---- pinos ----
enum TipoPino {
  SAIDA,    // acionamento ON/OFF: o ESP obedece esps/<nome>/pinos/<gpio>/estado
  ENTRADA   // switch: o ESP publica o estado do pino em esps/<nome>/pinos/<gpio>/estado
};

struct PinoCfg {
  uint8_t gpio;
  const char* nome;
  TipoPino tipo;
  bool invertido;  // SAIDA: relé que liga em nível baixo. ENTRADA: botão ligado ao GND (pull-up interno) = true
};

// Exemplo: 1 relé, 1 botão/chave. Livres para saída: 4 13 14 16 17 18 19 23 25 26 27 32 33
// (evitar 0 2 5 12 15 por causa do boot; 34-39 só servem de entrada, sem pull-up interno).
const PinoCfg PINOS[] = {
  { 26, "Rele 1",  SAIDA,   false },
  { 27, "Chave 1", ENTRADA, true  },
};

// ---- alimentação (Vcc) ----
// O ESP32 não mede a própria alimentação: ligue a tensão a medir (ex.: 5V/VIN) a um pino ADC1
// (32 a 39) por um divisor de tensão. VCC_DIVISOR = (R1+R2)/R2. Dois resistores iguais => 2.0
// (o pino nunca passa de ~3,1 V). Use 0 em VCC_PINO para desligar a medição.
#define VCC_PINO    34
#define VCC_DIVISOR 2.0f
