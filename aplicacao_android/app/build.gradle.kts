plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.amaury.agente"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.amaury.agente"
        minSdk = 21          // Android 5.0 em diante: cobre praticamente todos os aparelhos em uso
        targetSdk = 34
        versionCode = 1
        versionName = "0.1-teste"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions { jvmTarget = "1.8" }

    testOptions { unitTests.isReturnDefaultValues = true }
}

dependencies {
    // Nenhuma biblioteca no app (só o Android): fica leve e compatível. Só os testes no PC usam estas duas.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20231013")
}
