# Gera iot_FireMQtt_agente\dist\windows\AgenteIOT.exe (rodar no Windows, na raiz do projeto ou aqui; se o .exe estiver aberto, renomeie-o antes)
$A = $PSScriptRoot            # ...\AUTOMACAO_IOT\iot_FireMQtt_agente
$R = Split-Path $A -Parent    # ...\AUTOMACAO_IOT (o agente usa o tema do programa principal: pasta app e assets)
& "$R\.venv\Scripts\python.exe" -m pip install -q pyinstaller paho-mqtt psutil
& "$R\.venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean --onefile --windowed --name AgenteIOT `
  --icon "$R\assets\icone_ia.ico" --paths "$A" --paths "$R" `
  --add-data "$R\assets\icone_ia.ico;assets" --add-data "$R\assets\icone_ia.png;assets" --add-data "$R\assets\check.png;assets" `
  --add-data "$R\assets\background_iot.jpg;assets" --add-data "$R\assets\background_iot_l.jpg;assets" `
  --hidden-import paho.mqtt.client --hidden-import psutil `
  --distpath "$A\dist\windows" --workpath "$A\build\windows" --specpath "$A\build\windows" "$A\agente.py"
