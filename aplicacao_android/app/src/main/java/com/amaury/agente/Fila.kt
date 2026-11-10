package com.amaury.agente

import org.json.JSONObject

/** Leitura do fluxo de eventos do Firebase (SSE) e conferência dos comandos. Código sem dependência do Android visual. */
class SseParser(private val aoEvento: (evento: String, dados: String) -> Unit) {
    private var evento = "message"
    private val dados = StringBuilder()
    private var temDados = false

    /** Recebe uma linha do fluxo (sem a quebra de linha). Linha vazia fecha o evento. */
    fun linha(l: String) {
        if (l.isEmpty()) {
            if (temDados) aoEvento(evento, dados.toString())
            evento = "message"; dados.setLength(0); temDados = false
            return
        }
        if (l.startsWith(":")) return
        val i = l.indexOf(':')
        val campo = if (i < 0) l else l.substring(0, i)
        var valor = if (i < 0) "" else l.substring(i + 1)
        if (valor.startsWith(" ")) valor = valor.substring(1)
        when (campo) {
            "event" -> evento = valor
            "data" -> { if (temDados) dados.append('\n'); dados.append(valor); temDados = true }
        }
    }
}

enum class Validade { OK, ASSINATURA_INVALIDA, EXPIRADO }

object Fila {
    const val EXPIRA_MS = 60_000L

    /**
     * Comandos novos contidos num evento do Firebase. O Firebase manda {"path":"/","data":{...todos...}} ao conectar e
     * {"path":"/<id>","data":{...}} quando um comando é gravado. Remoções (data = null) e eventos de sinal de vida são ignorados.
     */
    fun comandos(evento: String, dados: String): List<Pair<String, JSONObject>> {
        if (evento != "put" && evento != "patch") return emptyList()
        val raiz = try { JSONObject(dados) } catch (e: Exception) { return emptyList() }
        val data = raiz.opt("data")
        if (data !is JSONObject) return emptyList()
        val partes = raiz.optString("path", "/").split('/').filter { it.isNotEmpty() }
        return when (partes.size) {
            0 -> data.keys().asSequence().mapNotNull { k -> (data.opt(k) as? JSONObject)?.let { k to it } }.toList()
            1 -> listOf(partes[0] to data)
            else -> emptyList()
        }
    }

    /** Parâmetros do comando como mapa simples (texto e verdadeiro/falso). */
    fun parametros(cmd: JSONObject): Map<String, Any?> {
        val p = cmd.optJSONObject("parametros") ?: return emptyMap()
        val m = HashMap<String, Any?>()
        for (k in p.keys()) {
            val v = p.opt(k)
            m[k] = if (v == JSONObject.NULL) null else v
        }
        return m
    }

    fun validar(chave: String, id: String, cmd: JSONObject, agora: Long): Validade {
        val ts = (cmd.opt("ts") as? Number)?.toLong() ?: return Validade.ASSINATURA_INVALIDA
        val esperado = Assinatura.assinar(chave, id, cmd.optString("acao"), parametros(cmd), ts)
        if (!Assinatura.iguais(esperado, cmd.optString("assinatura"))) return Validade.ASSINATURA_INVALIDA
        return if (kotlin.math.abs(agora - ts) > EXPIRA_MS) Validade.EXPIRADO else Validade.OK
    }
}
