package com.amaury.agente

import java.io.BufferedReader
import java.io.IOException
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

/** Realtime Database por REST puro (HttpURLConnection): sem biblioteca, funciona desde o Android 5.0. */
class FirebaseRest(url: String) {
    private val base = url.trimEnd('/')

    /** PUT / GET / DELETE. Devolve o texto da resposta. Lança IOException se o Firebase recusar. */
    fun requisitar(metodo: String, caminho: String, corpo: String? = null, timeoutMs: Int = 8000): String {
        val c = URL("$base/${caminho.trim('/')}.json").openConnection() as HttpURLConnection
        try {
            c.requestMethod = metodo
            c.connectTimeout = timeoutMs
            c.readTimeout = timeoutMs
            c.setRequestProperty("Content-Type", "application/json")
            if (corpo != null) {
                c.doOutput = true
                c.outputStream.use { it.write(corpo.toByteArray(Charsets.UTF_8)) }
            }
            val ok = c.responseCode in 200..299
            val texto = (if (ok) c.inputStream else c.errorStream)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            if (!ok) throw IOException("Firebase $metodo /$caminho -> ${c.responseCode}")
            return texto
        } finally {
            c.disconnect()
        }
    }

    /**
     * Fica ouvindo o caminho em tempo real (SSE): o Firebase avisa na hora que chega um comando, sem ficar perguntando
     * (poupa bateria). Bloqueia até a conexão cair; quem chama reconecta. [aoConectar] roda quando o Firebase aceita.
     */
    fun ouvir(caminho: String, aoConectar: () -> Unit, aoEvento: (String, String) -> Unit, continuar: () -> Boolean) {
        val c = URL("$base/${caminho.trim('/')}.json").openConnection() as HttpURLConnection
        try {
            c.requestMethod = "GET"
            c.connectTimeout = 10_000
            c.readTimeout = 75_000          // o Firebase manda um sinal de vida a cada ~30 s
            c.setRequestProperty("Accept", "text/event-stream")
            if (c.responseCode != 200) throw IOException("Firebase SSE -> ${c.responseCode}")
            aoConectar()
            val parser = SseParser(aoEvento)
            BufferedReader(InputStreamReader(c.inputStream, Charsets.UTF_8)).use { r ->
                while (continuar()) {
                    val linha = r.readLine() ?: break
                    parser.linha(linha)
                }
            }
        } finally {
            c.disconnect()
        }
    }
}
