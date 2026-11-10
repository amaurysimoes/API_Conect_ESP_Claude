# Kotlin: ajustar o app

Kotlin 1.9, sem bibliotecas · Gradle 9.7.1 · plugin Android 8.5.2 · minSdk 21 · target 34.
Criar do zero: `DocumentacaoTecnica/CriacaoAppAndroid.md` · usar: `Instrucoes.md`.

## 1. Android Studio
1. Baixar: https://developer.android.com/studio
2. **Open** → `C:\Dev-AHS\api_conect\aplicacao_android` (não a pasta `api_conect`).
3. Esperar o Gradle sync. SDK: `C:\Android\Sdk`.
4. Celular: Depuração USB + cabo + ▶ **Run**.
5. APK: **Build → Build Bundle(s) / APK(s) → Build APK(s)** → `app\build\outputs\apk\debug\app-debug.apk`.
6. Sem celular: **Device Manager → Create device**.

## 2. Onde mexer (`app/src/main/java/com/amaury/agente/`)
| Quero | Arquivo |
|---|---|
| nova ação | `Acoes.kt` (função + nome em `SUPORTADAS`) e o `enum` em `aplicacao_android/servidor/mcpAndroid.js` |
| tela principal | `MainActivity.kt` |
| Meus atalhos | `AtalhosActivity.kt`, `Atalhos.kt`, `Padroes.kt` |
| segundo plano | `AgenteService.kt` |
| permissões | `app/src/main/AndroidManifest.xml` |
| cores e tema | `res/values/colors.xml`, `styles.xml` |
| ícone | trocar `img/icone.png` e rodar `python img/gerar_icones.py` |
| versão | `app/build.gradle.kts` (`versionCode`, `versionName`) |

`Assinatura.kt` tem de dar o mesmo resultado do servidor (`aplicacao_desk_agente/agente/maquinas.js`, `aplicacao_android/servidor/criptoApps.js`).

## 3. Compilar (qualquer editor)
```powershell
cd C:\Dev-AHS\api_conect\aplicacao_android
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
.\gradlew.bat testDebugUnitTest assembleDebug
Copy-Item app\build\outputs\apk\debug\app-debug.apk api_conect.apk
C:\Android\Sdk\platform-tools\adb.exe install -r api_conect.apk
C:\Android\Sdk\platform-tools\adb.exe logcat -s AgenteAndroid
```
Depois: atualizar os `.md` e subir no git.

## 4. VS Code
1. Extensão **Kotlin** (`fwcd.kotlin`); opcional **Gradle for Java** (`vscjava.vscode-gradle`).
2. **File → Open Folder** → `aplicacao_android`.
3. Terminal **Ctrl+'** → comandos da seção 3.

## 5. Problemas
| Sintoma | Solução |
|---|---|
| `SDK location not found` | `local.properties`: `sdk.dir=C:/Android/Sdk` (barras normais) |
| `JAVA_HOME is not set` | definir como na seção 3 |
| 1ª compilação lenta | baixa dependências; as próximas são rápidas |
| APK não instala por cima | desinstalar o antigo (outra assinatura) |
| Editor oferece "atualizar o Gradle" | já está no 9.7.1 (testado). Se quebrar: `git checkout -- aplicacao_android/gradle aplicacao_android/gradlew aplicacao_android/gradlew.bat` |
| Quebrou | `.\gradlew.bat clean` e compilar de novo |
