#pragma once

// 1 = ESP32 com display OLED SSD1306 128x64 (I2C); 0 = sem display.
#define TEM_DISPLAY 1

#define OLED_SDA    21
#define OLED_SCL    22
#define OLED_ADDR   0x3C

// LED azul da placa (na maioria das placas ESP32 é o GPIO 2). Pisca enquanto o repetidor está conectado na rede.
// 0 desliga o recurso.
#define LED_AZUL    2
