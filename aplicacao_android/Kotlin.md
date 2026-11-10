# Kotlin: desenvolver e ajustar o app Android

O app é **Kotlin** (1.9), sem bibliotecas de terceiros. Gradle 8.7 · plugin Android 8.5.2 · minSdk 21 (Android 5.0) · target 34.
Criar do zero: `DocumentacaoTecnica/CriacaoAppAndroid.md` · usar o app: `Instrucoes.md`.

## 1. Android Studio (editor oficial)
1. Baixe em **https://developer.android.com/studio** e instale (aceite o padrão).
2. **Open** → escolha a pasta `C:\Dev-AHS\api_conect\aplicacao_android` (não a pasta `api_conect`).
3. Espere o *Gradle sync* (a 1ª vez baixa bastante). Se pedir o SDK, aponte para `C:\Android\Sdk`.
4. **Rodar no celular:** ative *Depuração USB* no celular, ligue o cabo e toque em ▶ **Run**.
5. **Gerar o APK:** menu **Build → Build Bundle(s) / APK(s) → Build APK(s)** → *locate*. Saída: `app\build\outputs\apk\debug\app-debug.apk`.
6. Para testar sem celular: **Device Manager → Create device** (emulador; precisa de virtualização ligada na BIOS).

## 2. Onde mexer
| Quero... | Arquivo (`app/src/main/java/com/amaury/agente/`) |
|---|---|
| nova ação do celular (abrir, ler algo) | `Acoes.kt` (função + nome em `SUPORTADAS`) |
| mudar a tela principal (ícone, pontinho) | `MainActivity.kt` |
| tela Meus atalhos (sites e apps marcados) | `AtalhosActivity.kt`, `Atalhos.kt`, `Padroes.kt` |
| serviço em segundo plano | `AgenteService.kt` |
| permissões | `AndroidManifest.xml` (em `app/src/main/`) |
| cores e tema escuro | `res/values/colors.xml`, `styles.xml` |
| ícone | troque `img/icone.png` e rode `python img/gerar_icones.py` |
| versão do app | `app/build.gradle.kts` (`versionCode` e `versionName`) |

**Não mude** a conta da assinatura e da criptografia em `Assinatura.kt` sem mudar igual no servidor (`aplicacao_desk_agente/agente/maquinas.js` e `aplicacao_android/servidor/criptoApps.js`): o celular deixaria de obedecer.

## 3. Ciclo de ajuste (qualquer editor)
1. Edite o `.kt`.
2. Se criou uma ação nova: some o nome no `enum` de `aplicacao_android/servidor/mcpAndroid.js` e no servidor.
3. Teste no PC (sem celular):
   ```powershell
   cd C:\Dev-AHS\api_conect\aplicacao_android
   $env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
   .\gradlew.bat testDebugUnitTest
   ```
4. Compile: `.\gradlew.bat assembleDebug` e copie o resultado:
   `Copy-Item app\build\outputs\apk\debug\app-debug.apk api_conect.apk`
5. Instale por cabo: `C:\Android\Sdk\platform-tools\adb.exe install -r api_conect.apk`
6. Veja o que o app registra: `C:\Android\Sdk\platform-tools\adb.exe logcat -s AgenteAndroid`
7. Atualize os `.md` e suba no git.

## 4. VS Code (básico)
1. Instale o VS Code e a extensão **Kotlin** (`fwcd.kotlin`). Opcional: **Gradle for Java** (`vscjava.vscode-gradle`).
2. **File → Open Folder** → `aplicacao_android`.
3. Edite os `.kt` (a extensão dá cores e erros básicos; não é tão completa quanto o Android Studio).
4. Abra o terminal (**Ctrl + '**) e rode os comandos do passo 3 acima (`gradlew.bat testDebugUnitTest assembleDebug`).
5. O APK sai em `app\build\outputs\apk\debug\`; copie para `api_conect.apk` e instale com `adb`.

Se o VS Code não achar o JDK: `$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'` no terminal.

## 5. Problemas comuns
| Sintoma | O que fazer |
|---|---|
| `SDK location not found` | crie `local.properties` com `sdk.dir=C:/Android/Sdk` (barras normais) |
| `JAVA_HOME is not set` | defina como no passo 4 |
| 1ª compilação demora | baixa o compilador e as bibliotecas; as próximas são rápidas |
| APK não instala por cima | desinstale o antigo no celular (assinatura de debug diferente em outro PC) |
| Mudei algo e quebrou | `.\gradlew.bat clean` e compile de novo; os testes dizem onde |
