# Criar o app Android do zero (sem ajuda)

Resultado: `aplicacao_android/api_conect.apk`. Kotlin puro, **sem bibliotecas**, Android 5.0+ (minSdk 21, target 34).
PowerShell no Windows. Instruções de uso do app: `aplicacao_android/Instrucoes.md` · editar e compilar no Android Studio/VS Code: `aplicacao_android/Kotlin.md`.

## 1. Ferramentas (uma vez)
Precisa do **JDK 17 ou maior** (`java -version`; aqui o 21). Pasta para tudo: `C:\Android`.

```powershell
mkdir C:\Android\downloads, C:\Android\Sdk\cmdline-tools
# SDK de linha de comando (oficial)
Invoke-WebRequest https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip -OutFile C:\Android\downloads\cmd.zip
Expand-Archive C:\Android\downloads\cmd.zip C:\Android\downloads\cmd
Move-Item C:\Android\downloads\cmd\cmdline-tools C:\Android\Sdk\cmdline-tools\latest
# Gradle 8.7
Invoke-WebRequest https://services.gradle.org/distributions/gradle-8.7-bin.zip -OutFile C:\Android\downloads\gradle.zip
Expand-Archive C:\Android\downloads\gradle.zip C:\Android
# pacotes do SDK (aceite as licenças com "y")
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
C:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat --sdk_root=C:\Android\Sdk --licenses
C:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat --sdk_root=C:\Android\Sdk "platforms;android-34" "build-tools;34.0.0" "platform-tools"
```
Uns 1,5 GB. Não precisa do Android Studio.

## 2. Projeto (pasta `aplicacao_android`)
```
settings.gradle.kts   build.gradle.kts   gradle.properties   local.properties (sdk.dir=C:/Android/Sdk, NÃO vai pro git)
app/build.gradle.kts  (namespace com.amaury.agente, compileSdk 34, minSdk 21, targetSdk 34, só testes têm dependência)
app/src/main/AndroidManifest.xml
app/src/main/java/com/amaury/agente/*.kt
app/src/main/res/  (values, mipmap-*, drawable-*)
app/src/test/java/com/amaury/agente/AgenteTest.kt
servidor/  (módulo Node: ferramentas do Claude)
```
Versões: Gradle 8.7 · plugin Android 8.5.2 · Kotlin 1.9.24. Em `local.properties` use **barras normais** (`C:/Android/Sdk`): com `\` o caminho quebra.

## 3. O que cada arquivo faz
| Arquivo | Função |
|---|---|
| `Assinatura.kt` | assinatura HMAC-SHA256 dos comandos e AES-GCM da lista de apps; **igual ao servidor** |
| `Fila.kt` | lê os eventos do Firebase, confere assinatura e validade (60 s) |
| `BuscaApps.kt` | acha o app pelo nome ou pacote (sem acento) |
| `FirebaseRest.kt` | Firebase por `HttpURLConnection` (GET/PUT/DELETE e escuta em tempo real) |
| `Acoes.kt` | info, listar apps, abrir app, abrir site (navegador à escolha), voltar ao início |
| `AgenteService.kt` | serviço em primeiro plano: ouve comandos, grava `status` a cada 15 s e a lista de apps; liga no boot |
| `MainActivity.kt` | janelinha escura só com o ícone + pontinho de status; configuração e permissões |
| `Config.kt` | dados salvos no celular |
| `Atalhos.kt` · `AtalhosActivity.kt` · `Padroes.kt` | tela Meus atalhos: sites salvos, apps marcados e descoberta dos apps padrão do Android (cifrados no Firebase) |
| `servidor/*.js` | `listar_android`, `apps_android`, `executar_no_android` para o Claude |

Caminho no Firebase: `brokers/<broker>/android/<celular>/{status,comandos,resultado,apps}`.

## 4. Ícone
Fonte: `img/circuito-azul.svg` → `img/icone.png` (veja `CLAUDE.md`). Gerar todos os tamanhos do app com `aplicacao_desk_agente\agente_python\.venv\Scripts\python.exe img\gerar_icones.py` (usa Pillow; cria `mipmap-*`, `drawable-*/ic_stat.png` e `drawable-nodpi/icone.png`).

## 5. Compilar e testar
```powershell
cd aplicacao_android
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
C:\Android\gradle-8.7\bin\gradle.bat wrapper --gradle-version 8.7   # só 1ª vez: cria gradlew
.\gradlew.bat testDebugUnitTest assembleDebug
Copy-Item app\build\outputs\apk\debug\app-debug.apk api_conect.apk
```
- A 1ª vez baixa o compilador e as bibliotecas (alguns minutos).
- Os testes rodam no PC e conferem assinatura/criptografia com os valores gerados pelo servidor Node.
- O APK sai assinado com a chave de debug (instala em qualquer aparelho 5.0+).
- Servidor: `node aplicacao_android/servidor/teste.mjs` (na pasta `api_conect`).

## 6. Instalar no celular
Copie o `.apk` e abra, ou por cabo (depuração USB ligada): `C:\Android\Sdk\platform-tools\adb.exe install -r api_conect.apk`.

## 7. Armadilhas que já apareceram
- Android 10+ **não deixa abrir telas do segundo plano** sem "Exibir sobre outros apps": o app pede essa permissão.
- `org.json` do Android escapa a barra `/` e quebraria a assinatura: por isso o `Assinatura.kt` monta o JSON à mão.
- `java.util.Base64` só existe no Android 8+: por isso há um Base64 próprio.
- Android 11+ esconde os apps instalados: o manifesto declara `<queries>` e `QUERY_ALL_PACKAGES`.
- Android 14+: o serviço em primeiro plano precisa de tipo (`specialUse`) e da permissão correspondente.
- Se a pasta `aplicacao_android` for movida, apague `app/build` e `.gradle` e compile de novo.

## 8. Subir no git
Entram: código, `gradle/wrapper`, `api_conect.apk`, instruções. Ficam de fora (`.gitignore`): `local.properties`, `build/`, `.gradle/`.
