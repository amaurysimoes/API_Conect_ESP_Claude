.\build_windows.ps1                          # dist\windows\Automacao_IOT-ESP.exe
.\iot_FireMQtt_agente\build_windows.ps1      # iot_FireMQtt_agente\dist\windows\AgenteIOT.exe


$src = (wsl wslpath -a ($PWD.Path -replace '\\','/')).Trim()
wsl -d Ubuntu-24.04 -- bash -lc "rm -rf ~/rep_build && mkdir ~/rep_build && cd $src && tar --exclude=.venv --exclude=dist --exclude=build --exclude=__pycache__ --exclude=.pio --exclude=.venv-linux --exclude=node_modules -cf - . | tar -xf - -C ~/rep_build && cd ~/rep_build && sed -i 's/\r$//' build_linux.sh iot_FireMQtt_agente/build_linux.sh && bash build_linux.sh && bash iot_FireMQtt_agente/build_linux.sh && mkdir -p $src/dist/linux $src/iot_FireMQtt_agente/dist/linux && cp dist/linux/Automacao_IOT-ESP $src/dist/linux/ && cp iot_FireMQtt_agente/dist/linux/AgenteIOT $src/iot_FireMQtt_agente/dist/linux/"
