package com.amaury.agente

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Roda no PC (sem celular): confere que o app calcula a assinatura e a criptografia IGUAL ao servidor Node.
 * Os valores esperados foram gerados pelo código do servidor (aplicacao_android/servidor e aplicacao_desk_agente/agente).
 */
class AssinaturaTest {
    private val params: Map<String, Any?> =
        mapOf("url" to "https://exemplo.com/a?x=1&y=ç\"\\", "navegador" to "chrome", "confirmado" to true, "vazio" to "")
    private val txt = "{\"em\":1,\"apps\":[{\"n\":\"Câmera\",\"p\":\"com.x/y\"}]}"
    private val cifradoDoNode = "AAECAwQFBgcICQoLq94Iwe8048YSdoGGo74Z-nVRjS9Iy5rdtZ5QrZYVVdr6ej4bVuLh-H0DbtF4j0oebZzgN8QwQG1PK0mCMZhH"

    @Test fun mensagemIgualAoServidor() {
        val esperado = "abc123\nabrir_url\n{\"confirmado\":true,\"navegador\":\"chrome\",\"url\":\"https://exemplo.com/a?x=1&y=ç\\\"\\\\\",\"vazio\":\"\"}\n1794254458195"
        assertEquals(esperado, Assinatura.mensagem("abc123", "abrir_url", params, 1794254458195L))
    }

    @Test fun assinaturaIgualAoServidor() {
        assertEquals(
            "e651f873add371516a62f1aa548831e434b843124dd72b782d27d38a075c9c66",
            Assinatura.assinar("chave-de-teste", "abc123", "abrir_url", params, 1794254458195L),
        )
    }

    @Test fun cifraIgualAoServidorComOMesmoIv() {
        assertEquals(cifradoDoNode, Assinatura.cifrar(txt, "chave-de-teste", ByteArray(12) { it.toByte() }))
    }

    @Test fun decifraOQueOServidorCifrou() {
        assertEquals(txt, Assinatura.decifrar(cifradoDoNode, "chave-de-teste"))
    }

    @Test(expected = Exception::class) fun chaveErradaNaoDecifra() {
        Assinatura.decifrar(cifradoDoNode, "outra-chave")
    }

    @Test fun base64DeTodosOsTamanhos() {
        for (n in 0..40) {
            val b = ByteArray(n) { (it * 37 + 11).toByte() }
            assertTrue("tamanho $n", b.contentEquals(Base64Url.decodificar(Base64Url.codificar(b))))
        }
    }

    @Test fun jsonEscapaComoOJavaScript() {
        assertEquals("\"a\\tb\\n\\u0001/\"", Assinatura.json("a\tb\n\u0001/"))
        assertEquals("{\"a\":1,\"b\":[true,null]}", Assinatura.json(mapOf("b" to listOf(true, null), "a" to 1)))
    }
}

class FilaTest {
    private val chave = "chave-de-teste"

    private fun comando(id: String, acao: String, ts: Long, params: Map<String, Any?>, assinatura: String? = null): JSONObject {
        val p = JSONObject(); params.forEach { (k, v) -> p.put(k, v) }
        return JSONObject().put("acao", acao).put("parametros", p).put("ts", ts)
            .put("assinatura", assinatura ?: Assinatura.assinar(chave, id, acao, params, ts))
    }

    @Test fun lePrimeiroEventoDoFirebaseComVariosComandos() {
        val dados = "{\"path\":\"/\",\"data\":{\"a1\":{\"acao\":\"info\"},\"b2\":{\"acao\":\"listar_apps\"}}}"
        assertEquals(listOf("a1", "b2"), Fila.comandos("put", dados).map { it.first })
    }

    @Test fun leComandoNovoEIgnoraRemocaoESinalDeVida() {
        assertEquals(listOf("x9"), Fila.comandos("put", "{\"path\":\"/x9\",\"data\":{\"acao\":\"info\"}}").map { it.first })
        assertTrue(Fila.comandos("put", "{\"path\":\"/x9\",\"data\":null}").isEmpty())
        assertTrue(Fila.comandos("put", "{\"path\":\"/\",\"data\":null}").isEmpty())
        assertTrue(Fila.comandos("keep-alive", "null").isEmpty())
        assertTrue(Fila.comandos("put", "{\"path\":\"/x9/acao\",\"data\":\"info\"}").isEmpty())
    }

    @Test fun validaAssinaturaEValidade() {
        val agora = 1_800_000_000_000L
        val ok = comando("id1", "abrir_url", agora - 5_000, mapOf("url" to "https://a.com/x"))
        assertEquals(Validade.OK, Fila.validar(chave, "id1", ok, agora))
        assertEquals(Validade.EXPIRADO, Fila.validar(chave, "id1", ok, agora + 120_000))
        assertEquals(Validade.ASSINATURA_INVALIDA, Fila.validar("outra", "id1", ok, agora))
        assertEquals(Validade.ASSINATURA_INVALIDA, Fila.validar(chave, "id2", ok, agora))           // id trocado
        val adulterado = comando("id1", "abrir_url", agora, mapOf("url" to "https://a.com/x"), assinatura = ok.getString("assinatura"))
        assertEquals(Validade.ASSINATURA_INVALIDA, Fila.validar(chave, "id1", adulterado, agora))   // ts trocado
        assertEquals(Validade.ASSINATURA_INVALIDA, Fila.validar(chave, "id1", JSONObject().put("acao", "info"), agora))
    }
}

class SseTest {
    @Test fun juntaLinhasEmEventos() {
        val eventos = mutableListOf<Pair<String, String>>()
        val p = SseParser { e, d -> eventos.add(e to d) }
        listOf("event: put", "data: {\"path\":\"/\",\"data\":null}", "", ": comentario", "event: keep-alive", "data: null", "", "event: patch", "data: {\"a\":1}", "").forEach(p::linha)
        assertEquals(listOf("put" to "{\"path\":\"/\",\"data\":null}", "keep-alive" to "null", "patch" to "{\"a\":1}"), eventos)
    }
}

class BuscaAppsTest {
    private val apps = listOf(
        AppInfo("WhatsApp", "com.whatsapp", false, false, "2"),
        AppInfo("Chrome", "com.android.chrome", false, true, "1"),
        AppInfo("Câmera", "com.sec.camera", true, false, "1"),
        AppInfo("Camera FV-5", "com.flavio.camera", false, false, "1"),
        AppInfo("Firefox", "org.mozilla.firefox", false, true, "1"),
    )

    @Test fun achaPorNomeSemAcentoOuPacote() {
        assertEquals("WhatsApp", (BuscaApps.achar(apps, "whatsapp") as BuscaApps.Resultado.Achou).app.nome)
        assertEquals("Chrome", (BuscaApps.achar(apps, "com.android.chrome") as BuscaApps.Resultado.Achou).app.nome)
        assertEquals("Firefox", (BuscaApps.achar(apps, "fire") as BuscaApps.Resultado.Achou).app.nome)
    }

    @Test fun nomeExatoGanhaDoParecido() {
        assertEquals("Câmera", (BuscaApps.achar(apps, "camera") as BuscaApps.Resultado.Achou).app.nome)
    }

    @Test fun avisaQuandoHaVarios() {
        val r = BuscaApps.achar(apps, "cam") as BuscaApps.Resultado.Varios
        assertEquals(2, r.apps.size)
    }

    @Test fun nenhum() {
        assertEquals(BuscaApps.Resultado.Nenhum, BuscaApps.achar(apps, "spotify"))
        assertEquals(BuscaApps.Resultado.Nenhum, BuscaApps.achar(apps, "  "))
    }
}
