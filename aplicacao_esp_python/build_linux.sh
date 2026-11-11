#!/usr/bin/env bash
# Gera dist/linux/Automacao_IOT-ESP (rodar no Linux ou WSL; PyInstaller não faz build cruzado)
set -e
cd "$(dirname "$0")"
R="$(pwd)"
python3 -m venv .venv-linux
. .venv-linux/bin/activate
pip install -q -r requirements.txt pyinstaller
pyinstaller --noconfirm --clean --onefile --windowed --name Automacao_IOT-ESP \
  --icon "$R/assets/icone_ia.png" --add-data "$R/assets/icone_ia.ico:assets" --add-data "$R/assets/icone_ia.png:assets" --add-data "$R/assets/check.png:assets" --add-data "$R/assets/background_iot.jpg:assets" --add-data "$R/assets/background_iot_l.jpg:assets" \
  --add-data "$R/firmware/Repetidor/platformio.ini:firmware/Repetidor" \
  --add-data "$R/firmware/Repetidor/include:firmware/Repetidor/include" \
  --add-data "$R/firmware/Repetidor/src:firmware/Repetidor/src" \
  --add-data "$R/firmware/Automacao/platformio.ini:firmware/Automacao" \
  --add-data "$R/firmware/Automacao/src:firmware/Automacao/src" \
  --distpath "$R/dist/linux" --workpath "$R/build/linux" --specpath "$R/build/linux" main.py
echo "Pronto: dist/linux/Automacao_IOT-ESP"
echo "Acesso à serial: sudo usermod -aG dialout \$USER (e relogar)"
