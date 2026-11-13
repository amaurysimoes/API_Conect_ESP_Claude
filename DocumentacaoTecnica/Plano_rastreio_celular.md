# Plano — Rastreio do próprio celular (segurança / sequestro)

Status: **plano**, nada feito ainda. Base: rastrear um aparelho do usuário (ou de quem instalou sabendo), não vigiar terceiros.

## Objetivo
Em caso de sequestro/roubo, o celular da vítima envia a própria posição enquanto estiver ligado e deixa salva a última posição se for desligado. Dados para a vítima, contatos de confiança e a polícia.

## Regra
- Só o próprio aparelho, com quem usa ciente (tela inicial avisa que está rastreando). Sem captura oculta de aparelhos de terceiros, sem gravar áudio do ambiente.
- Dados cifrados (AES-256-GCM, igual ao resto do projeto). Entregues à polícia; não expor publicamente.

## App
- Novo módulo Android: `aplicacao_rastreio/` (Kotlin, igual ao `aplicacao_android`). iPhone fora (usar o SOS nativo do iOS).
- Build igual ao `aplicacao_android` (ver `CriacaoAppAndroid.md`).

## Dados (do próprio aparelho)
| Dado | Fonte | Pista |
|---|---|---|
| GPS (lat, lon, precisão, velocidade) | `LocationManager` | posição |
| Torre de celular | `TelephonyManager` | região aproximada sem GPS |
| Bateria, hora, rede ligada | sistema | quando/por que parou |

## Modos
1. **Rotina (sempre):** a cada 5 min guarda/enviar a posição. Garante o último ponto se desligarem de surpresa.
2. **Pânico:** gatilho discreto → envio imediato da posição, repetindo a cada 15–30 s enquanto houver bateria/sinal, e aviso aos contatos.
3. **Sem internet:** fila local; envia ao voltar; tenta SMS com a posição.

## Gatilho do pânico (discreto)
- Apertar o botão de ligar 5 vezes, atalho escondido, ou acionamento remoto por um contato pela aba no Render.

## Envio
- Firebase: `brokers/<broker>/rastreio/<celular>/{status,eventos,comandos}` (caminho `brokers` já aberto), cifrado.
- Aba no Render: mapa + histórico do aparelho; aviso aos contatos de confiança.
- Ferramenta do conector: "onde está o celular X?".

## A decidir amanhã
- Confirmar que fica só no próprio aparelho/consentido.
- SOS nativo do Android/iPhone já cobre parte: avaliar se vale só orientar a ativar.
- LGPD: quem vê os dados, por quanto tempo guarda.
