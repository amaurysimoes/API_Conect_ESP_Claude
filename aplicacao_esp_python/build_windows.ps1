# Gera dist\windows\AUTOMACAO_IOT-AHS.exe (rodar no Windows; se o .exe estiver aberto, renomeie-o antes)
$R = $PSScriptRoot
& "$R\.venv\Scripts\python.exe" -m pip install -q pyinstaller
& "$R\.venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean --onefile --windowed --name AUTOMACAO_IOT-AHS --collect-all amqtt --copy-metadata amqtt --collect-submodules passlib `
  --icon "$R\assets\icone_ia.ico" --add-data "$R\assets\icone_ia.ico;assets" --add-data "$R\assets\icone_ia.png;assets" --add-data "$R\assets\check.png;assets" --add-data "$R\assets\background_iot.jpg;assets" --add-data "$R\assets\background_iot_l.jpg;assets" `
  --add-data "$R\firmware\Repetidor\platformio.ini;firmware\Repetidor" `
  --add-data "$R\firmware\Repetidor\include;firmware\Repetidor\include" `
  --add-data "$R\firmware\Repetidor\src;firmware\Repetidor\src" `
  --add-data "$R\firmware\Automacao\platformio.ini;firmware\Automacao" `
  --add-data "$R\firmware\Automacao\src;firmware\Automacao\src" `
  --distpath "$R\dist\windows" --workpath "$R\build\windows" --specpath "$R\build\windows" "$R\main.py"
