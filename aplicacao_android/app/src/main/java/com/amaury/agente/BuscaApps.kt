package com.amaury.agente

import java.text.Normalizer

data class AppInfo(
    val nome: String,
    val pacote: String,
    val sistema: Boolean,
    val navegador: Boolean,
    val versao: String,
)

/** Acha um app pelo nome falado ("whatsapp", "câmera") ou pelo pacote ("com.whatsapp"). Código puro, testado no PC. */
object BuscaApps {
    sealed class Resultado {
        data class Achou(val app: AppInfo) : Resultado()
        data class Varios(val apps: List<AppInfo>) : Resultado()
        object Nenhum : Resultado()
    }

    fun norm(s: String): String =
        Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase().trim()

    /** [preferidos] = pacotes marcados pelo usuário: se o empate tiver exatamente um marcado, é ele. */
    fun achar(apps: List<AppInfo>, consulta: String, preferidos: Set<String> = emptySet()): Resultado {
        val q = norm(consulta)
        if (q.isEmpty()) return Resultado.Nenhum
        val niveis: List<(AppInfo) -> Boolean> = listOf(
            { a -> a.pacote.lowercase() == q || norm(a.nome) == q },
            { a -> norm(a.nome).startsWith(q) },
            { a -> norm(a.nome).contains(q) || a.pacote.lowercase().contains(q) },
        )
        for (regra in niveis) {
            val achados = apps.filter(regra)
            if (achados.size == 1) return Resultado.Achou(achados[0])
            if (achados.size > 1) {
                val marcados = achados.filter { it.pacote in preferidos }
                return if (marcados.size == 1) Resultado.Achou(marcados[0]) else Resultado.Varios(achados)
            }
        }
        return Resultado.Nenhum
    }
}
