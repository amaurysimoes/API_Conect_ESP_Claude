#!/usr/bin/env bash
# Gera iot_FireMQtt_agente/dist/linux/AgenteIOT (rodar no Linux ou WSL, na pasta iot_FireMQtt_agente; PyInstaller não faz build cruzado)
set -e
cd "$(dirname "$0")"
A="$(pwd)"
R="$(dirname "$A")"
python3 -m venv "$A/.venv-linux"
. "$A/.venv-linux/bin/activate"
pip install -q -r "$A/requirements.txt" pyinstaller
pyinstaller --noconfirm --clean --onefile --windowed --name AgenteIOT \
  --icon "$R/assets/icone_ia.png" --paths "$A" --paths "$R" \
  --add-data "$R/assets/icone_ia.ico:assets" --add-data "$R/assets/icone_ia.png:assets" --add-data "$R/assets/check.png:assets" \
  --add-data "$R/assets/background_iot.jpg:assets" --add-data "$R/assets/background_iot_l.jpg:assets" \
  --hidden-import paho.mqtt.client --hidden-import psutil \
  --distpath "$A/dist/linux" --workpath "$A/build/linux" --specpath "$A/build/linux" "$A/agente.py"
echo "Pronto: iot_FireMQtt_agente/dist/linux/AgenteIOT"
echo "Precisa de libxcb-cursor0 (Qt). Para bloquear tela/desligar no Linux: loginctl e systemctl."
