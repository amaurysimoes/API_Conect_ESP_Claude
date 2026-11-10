package com.amaury.agente

import android.content.Context

/** Configuração guardada no próprio celular (SharedPreferences, só este app lê). */
data class Config(val firebase: String, val broker: String, val dispositivo: String, val chave: String) {
    val base get() = "brokers/$broker/android/$dispositivo"

    companion object {
        private const val ARQ = "agente"
        const val FIREBASE_PADRAO = "https://amauryesp-active-default-rtdb.firebaseio.com"

        fun ler(ctx: Context): Config {
            val p = ctx.getSharedPreferences(ARQ, Context.MODE_PRIVATE)
            return Config(
                p.getString("firebase", FIREBASE_PADRAO) ?: FIREBASE_PADRAO,
                p.getString("broker", "AMAURY_01") ?: "AMAURY_01",
                p.getString("dispositivo", "") ?: "",
                p.getString("chave", "") ?: "",
            )
        }

        fun salvar(ctx: Context, c: Config) {
            ctx.getSharedPreferences(ARQ, Context.MODE_PRIVATE).edit()
                .putString("firebase", c.firebase).putString("broker", c.broker)
                .putString("dispositivo", c.dispositivo).putString("chave", c.chave).apply()
        }

        fun completa(ctx: Context): Boolean = ler(ctx).let { it.dispositivo.isNotEmpty() && it.chave.isNotEmpty() && it.broker.isNotEmpty() }

        // Permissões já pedidas: cada uma é pedida uma vez, para não ficar em laço se o usuário recusar.
        fun jaPediu(ctx: Context, qual: String) = ctx.getSharedPreferences(ARQ, Context.MODE_PRIVATE).getBoolean("pediu_$qual", false)
        fun marcouPedido(ctx: Context, qual: String) = ctx.getSharedPreferences(ARQ, Context.MODE_PRIVATE).edit().putBoolean("pediu_$qual", true).apply()
        fun esquecerPedido(ctx: Context, qual: String) = ctx.getSharedPreferences(ARQ, Context.MODE_PRIVATE).edit().remove("pediu_$qual").apply()
    }
}

/** Estado do serviço, lido pela janelinha para colorir o pontinho (verde = conectado). */
object Estado {
    @Volatile var rodando = false
    @Volatile var ultimoOk = 0L
    val conectado get() = rodando && System.currentTimeMillis() - ultimoOk < 40_000
}
