#!/bin/bash
# Gera dist/Linux/Render_Agente (binário Linux). O PyInstaller não compila para Linux dentro do Windows:
# rode no Linux, ou no Windows pelo WSL (Ubuntu):
#   wsl -d Ubuntu-24.04 -- bash /mnt/c/Dev-AHS/api_conect/aplicacao_desk_agente/agente_python/build_linux.sh
# Compila numa cópia dentro do Linux (rápido) e devolve o binário para dist/Linux.
set -e
R="$(cd "$(dirname "$0")" && pwd)"
TMP="$HOME/build_render_agente"

# programas do sistema que o PyInstaller e a janelinha de configuração precisam (só instala o que falta, se for root)
faltam=""
python3 -c "import tkinter" 2>/dev/null || faltam="$faltam python3-tk"
command -v objdump >/dev/null || faltam="$faltam binutils"
command -v xdg-open >/dev/null || faltam="$faltam xdg-utils"
python3 -c "import venv" 2>/dev/null || faltam="$faltam python3-venv"
if [ -n "$faltam" ]; then
  if [ "$(id -u)" = "0" ]; then apt-get update -qq && apt-get install -y -qq $faltam
  else echo "Faltam pacotes:$faltam  ->  sudo apt install$faltam"; exit 1; fi
fi

rm -rf "$TMP" && mkdir -p "$TMP"
(cd "$R" && tar --exclude=.venv --exclude=dist --exclude=build --exclude=__pycache__ -cf - .) | tar -xf - -C "$TMP"
cd "$TMP"
python3 -m venv .venv-linux
./.venv-linux/bin/python -m pip install -q --upgrade pip
./.venv-linux/bin/python -m pip install -q pystray pillow psutil pyinstaller
./.venv-linux/bin/python -m PyInstaller --noconfirm --clean --onefile --name Render_Agente \
  --hidden-import pystray._xorg \
  --add-data "$TMP/icone.png:." --add-data "$TMP/icone.ico:." \
  --distpath "$TMP/dist" --workpath "$TMP/build" --specpath "$TMP/build" "$TMP/main.py"

mkdir -p "$R/dist/Linux"
cp dist/Render_Agente "$R/dist/Linux/Render_Agente"
chmod +x "$R/dist/Linux/Render_Agente"
ls -la "$R/dist/Linux/Render_Agente"
echo "LINUX_FIM"
