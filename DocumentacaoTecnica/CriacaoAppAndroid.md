# Criar o app Android (resumo)

Resultado: `aplicacao_android/api_conect.apk` · Kotlin, sem bibliotecas, Android 5.0+. Uso: `aplicacao_android/Instrucoes.md` · editar: `aplicacao_android/Kotlin.md`.

## 1. Ferramentas (uma vez)
Precisa de JDK 17+.
```powershell
mkdir C:\Android\downloads, C:\Android\Sdk\cmdline-tools
Invoke-WebRequest https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip -OutFile C:\Android\downloads\cmd.zip
Expand-Archive C:\Android\downloads\cmd.zip C:\Android\downloads\cmd
Move-Item C:\Android\downloads\cmd\cmdline-tools C:\Android\Sdk\cmdline-tools\latest
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
C:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat --sdk_root=C:\Android\Sdk --licenses
C:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat --sdk_root=C:\Android\Sdk "platforms;android-34" "build-tools;34.0.0" "platform-tools"
```
Crie `aplicacao_android\local.properties` com `sdk.dir=C:/Android/Sdk` (barras normais; fora do git).

## 2. Compilar e testar
```powershell
cd C:\Dev-AHS\api_conect\aplicacao_android
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
.\gradlew.bat testDebugUnitTest assembleDebug
Copy-Item app\build\outputs\apk\debug\app-debug.apk api_conect.apk
```
Servidor (na pasta `api_conect`): `node aplicacao_android/servidor/teste.mjs`

## 3. Ícones
```powershell
aplicacao_desk_agente\agente_python\.venv\Scripts\python.exe img\gerar_icones.py
```

## 4. Instalar no celular
```powershell
C:\Android\Sdk\platform-tools\adb.exe install -r api_conect.apk
```
(ou copie o `.apk` para o celular e abra)

## 5. Cuidados
- Android 10+: abrir apps em segundo plano exige "Exibir sobre outros apps".
- `Assinatura.kt` tem de dar o mesmo resultado do servidor (`maquinas.js`, `criptoApps.js`).
- Pasta movida: apague `app/build` e `.gradle` e compile de novo.
- No git entram código, `gradle/wrapper` e o `.apk`; ficam fora `local.properties`, `build/` e `.gradle/`.






# Acima temos este processo de buildar o app androi, estou deixando aqui bem destacado:
cd C:\Dev-AHS\api_conect\aplicacao_android
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
.\gradlew.bat testDebugUnitTest assembleDebug
Copy-Item app\build\outputs\apk\debug\app-debug.apk api_conect.apk

