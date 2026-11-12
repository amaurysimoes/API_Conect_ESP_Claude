# Criar o app Android

Resultado: `aplicacao_android/api_conect.apk`. Uso: `aplicacao_android/Instrucoes.md`.

## Buildar
**Windows**
```powershell
cd C:\Dev-AHS\api_conect\aplicacao_android
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
.\gradlew.bat testDebugUnitTest assembleDebug
Copy-Item app\build\outputs\apk\debug\app-debug.apk api_conect.apk
```

**Linux**
```bash
cd ~/Dev_AHS/api_conect/aplicacao_android
./gradlew testDebugUnitTest assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk api_conect.apk
```

## SDK (uma vez por máquina, precisa de JDK 17+)
**Windows**
```powershell
mkdir C:\Android\downloads, C:\Android\Sdk\cmdline-tools
Invoke-WebRequest https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip -OutFile C:\Android\downloads\cmd.zip
Expand-Archive C:\Android\downloads\cmd.zip C:\Android\downloads\cmd
Move-Item C:\Android\downloads\cmd\cmdline-tools C:\Android\Sdk\cmdline-tools\latest
C:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat --sdk_root=C:\Android\Sdk --licenses
C:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat --sdk_root=C:\Android\Sdk "platforms;android-34" "build-tools;34.0.0" "platform-tools"
```
`aplicacao_android\local.properties`: `sdk.dir=C:/Android/Sdk`

**Linux**
```bash
mkdir -p ~/Android/Sdk/cmdline-tools && cd /tmp
curl -Lo clt.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -q clt.zip -d ~/Android/Sdk/cmdline-tools && mv ~/Android/Sdk/cmdline-tools/cmdline-tools ~/Android/Sdk/cmdline-tools/latest
yes | ~/Android/Sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=$HOME/Android/Sdk --licenses
~/Android/Sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=$HOME/Android/Sdk "platforms;android-34" "build-tools;34.0.0" "platform-tools"
echo "sdk.dir=$HOME/Android/Sdk" > ~/Dev_AHS/api_conect/aplicacao_android/local.properties
```

## Instalar no celular
`adb install -r api_conect.apk` (ou copie o `.apk` para o celular e abra).

## Cuidados
- Cada máquina assina com uma chave diferente: APK de outra máquina exige **desinstalar o app antigo** antes.
- `local.properties`, `build/` e `.gradle/` ficam fora do git.
- Ícones: `python img/gerar_icones.py` (precisa do Pillow).
