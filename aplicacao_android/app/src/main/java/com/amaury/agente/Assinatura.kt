package com.amaury.agente

import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Assinatura dos comandos e criptografia da lista de apps. Código puro (sem Android), testado no PC.
 * Tem de dar EXATAMENTE o mesmo resultado que o servidor (aplicacao_desk_agente/agente/maquinas.js e
 * aplicacao_android/servidor/criptoApps.js).
 *
 * Assinatura = HMAC-SHA256(chave, "<id>\n<acao>\n<parametros em JSON ordenado>\n<ts>") em hexadecimal.
 */
object Assinatura {
    /** JSON com o mesmo texto do JSON.stringify do JavaScript (chaves ordenadas). Não usa org.json: ele escapa a barra "/". */
    fun json(v: Any?): String = when (v) {
        null -> "null"
        is Boolean -> v.toString()
        is Int, is Long -> v.toString()
        is Number -> if (v.toDouble() % 1.0 == 0.0) v.toLong().toString() else v.toString()
        is String -> aspas(v)
        is Map<*, *> -> v.entries.sortedBy { it.key.toString() }
            .joinToString(",", "{", "}") { aspas(it.key.toString()) + ":" + json(it.value) }
        is List<*> -> v.joinToString(",", "[", "]") { json(it) }
        else -> aspas(v.toString())
    }

    private fun aspas(s: String): String {
        val sb = StringBuilder("\"")
        for (c in s) {
            when {
                c == '"' -> sb.append("\\\"")
                c == '\\' -> sb.append("\\\\")
                c == '\b' -> sb.append("\\b")
                c == '\u000C' -> sb.append("\\f")
                c == '\n' -> sb.append("\\n")
                c == '\r' -> sb.append("\\r")
                c == '\t' -> sb.append("\\t")
                c < ' ' -> sb.append(String.format("\\u%04x", c.code))
                else -> sb.append(c)
            }
        }
        return sb.append('"').toString()
    }

    fun mensagem(id: String, acao: String, parametros: Map<String, Any?>, ts: Long): String =
        "$id\n$acao\n${json(parametros)}\n$ts"

    fun assinar(chave: String, id: String, acao: String, parametros: Map<String, Any?>, ts: Long): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(chave.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return mac.doFinal(mensagem(id, acao, parametros, ts).toByteArray(Charsets.UTF_8))
            .joinToString("") { String.format("%02x", it) }
    }

    fun iguais(a: String, b: String): Boolean =
        MessageDigest.isEqual(a.toByteArray(Charsets.UTF_8), b.toByteArray(Charsets.UTF_8))

    // ---------- criptografia da lista de apps (AES-256-GCM) ----------
    // Formato: base64url( iv[12] + texto cifrado + etiqueta[16] ). Chave = SHA-256("android|" + chave).
    private fun chaveAes(chave: String) =
        SecretKeySpec(MessageDigest.getInstance("SHA-256").digest("android|$chave".toByteArray(Charsets.UTF_8)), "AES")

    fun cifrar(texto: String, chave: String, iv: ByteArray = ByteArray(12).also { SecureRandom().nextBytes(it) }): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, chaveAes(chave), GCMParameterSpec(128, iv))
        return Base64Url.codificar(iv + c.doFinal(texto.toByteArray(Charsets.UTF_8)))
    }

    fun decifrar(dados: String, chave: String): String {
        val b = Base64Url.decodificar(dados)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, chaveAes(chave), GCMParameterSpec(128, b.copyOfRange(0, 12)))
        return String(c.doFinal(b, 12, b.size - 12), Charsets.UTF_8)
    }
}

/** Base64 "url safe" sem preenchimento (java.util.Base64 só existe a partir do Android 8; aqui vale para o 5.0). */
object Base64Url {
    private const val T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

    fun codificar(b: ByteArray): String {
        val sb = StringBuilder()
        var i = 0
        while (i < b.size) {
            val n = (b[i].toInt() and 255 shl 16) or
                (if (i + 1 < b.size) b[i + 1].toInt() and 255 shl 8 else 0) or
                (if (i + 2 < b.size) b[i + 2].toInt() and 255 else 0)
            sb.append(T[n shr 18 and 63]).append(T[n shr 12 and 63])
            if (i + 1 < b.size) sb.append(T[n shr 6 and 63])
            if (i + 2 < b.size) sb.append(T[n and 63])
            i += 3
        }
        return sb.toString()
    }

    fun decodificar(s: String): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        var acc = 0
        var bits = 0
        for (ch in s) {
            if (ch == '=') break
            val v = T.indexOf(ch)
            require(v >= 0) { "base64 inválido" }
            acc = (acc shl 6) or v
            bits += 6
            if (bits >= 8) {
                bits -= 8
                out.write(acc shr bits and 255)
            }
        }
        return out.toByteArray()
    }
}
