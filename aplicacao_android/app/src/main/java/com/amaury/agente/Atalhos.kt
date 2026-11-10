package com.amaury.agente

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

data class Site(val nome: String, val url: String)

/** O que o usuário salvou no celular: sites (nome + endereço) e apps marcados (pacotes). */
data class MeusAtalhos(val sites: List<Site> = emptyList(), val apps: Set<String> = emptySet())

/** Atalhos salvos: guardados no celular e publicados CIFRADOS para o Claude (mesma regra da lista de apps). Parte pura testada no PC. */
object Atalhos {
    private const val ARQ = "atalhos"

    fun paraJson(a: MeusAtalhos): String {
        val s = JSONArray()
        a.sites.forEach { s.put(JSONObject().put("n", it.nome).put("u", it.url)) }
        val p = JSONArray()
        a.apps.sorted().forEach { p.put(it) }
        return JSONObject().put("sites", s).put("apps", p).toString()
    }

    fun deJson(texto: String?): MeusAtalhos {
        if (texto.isNullOrBlank()) return MeusAtalhos()
        return try {
            val o = JSONObject(texto)
            val sites = ArrayList<Site>()
            o.optJSONArray("sites")?.let { s ->
                for (i in 0 until s.length()) {
                    val x = s.optJSONObject(i) ?: continue
                    val n = x.optString("n"); val u = x.optString("u")
                    if (n.isNotEmpty() && u.isNotEmpty()) sites.add(Site(n, u))
                }
            }
            val apps = LinkedHashSet<String>()
            o.optJSONArray("apps")?.let { p -> for (i in 0 until p.length()) p.optString(i).takeIf { it.isNotEmpty() }?.let { apps.add(it) } }
            MeusAtalhos(sites, apps)
        } catch (e: Exception) {
            MeusAtalhos()
        }
    }

    fun normalizarUrl(u: String): String = u.trim().let { if ("://" in it) it else "https://$it" }

    /** Mensagem de erro, ou null se o site está bom. */
    fun validarSite(nome: String, url: String): String? {
        if (nome.isBlank()) return "Dê um nome ao site"
        if (nome.trim().length > 60) return "Nome muito grande (até 60 letras)"
        val u = normalizarUrl(url)
        if (!Regex("^https?://[^\\s/]+\\.[^\\s/]+\\S*$|^https?://localhost\\S*$").matches(u)) return "Endereço inválido (ex.: www.google.com)"
        return null
    }

    /** Mesmo nome (sem acento e sem diferença de maiúscula) troca o endereço em vez de duplicar. */
    fun adicionar(a: MeusAtalhos, nome: String, url: String): MeusAtalhos {
        val n = nome.trim()
        val restantes = a.sites.filter { BuscaApps.norm(it.nome) != BuscaApps.norm(n) }
        return a.copy(sites = restantes + Site(n, normalizarUrl(url)))
    }

    fun remover(a: MeusAtalhos, nome: String): MeusAtalhos = a.copy(sites = a.sites.filter { it.nome != nome })

    /** Sites cujo nome combina com o pedido; devolve só o grupo mais parecido (nome igual > começa com > contém > parte das palavras). */
    fun acharSites(sites: List<Site>, consulta: String): List<Site> {
        val q = BuscaApps.norm(consulta)
        if (q.isEmpty()) return emptyList()
        val palavras = q.split(Regex("\\s+")).filter { it.isNotEmpty() }
        val niveis: List<(Site) -> Boolean> = listOf(
            { s -> BuscaApps.norm(s.nome) == q },
            { s -> BuscaApps.norm(s.nome).startsWith(q) },
            { s -> BuscaApps.norm(s.nome).contains(q) || q.contains(BuscaApps.norm(s.nome)) },
            { s -> BuscaApps.norm(s.nome).split(Regex("\\s+")).let { nome -> palavras.all { it in nome } } },
        )
        for (regra in niveis) {
            val achados = sites.filter(regra)
            if (achados.isNotEmpty()) return achados
        }
        return emptyList()
    }

    // ---------- guardado no celular e publicado para o Claude ----------
    fun ler(ctx: Context): MeusAtalhos =
        deJson(ctx.getSharedPreferences(ARQ, Context.MODE_PRIVATE).getString("json", null))

    fun salvar(ctx: Context, a: MeusAtalhos) {
        ctx.getSharedPreferences(ARQ, Context.MODE_PRIVATE).edit().putString("json", paraJson(a)).apply()
    }

    /** Envia os atalhos cifrados para brokers/<broker>/android/<celular>/atalhos. Chamar fora da tela principal (rede). */
    fun publicar(ctx: Context) {
        try {
            val cfg = Config.ler(ctx)
            if (cfg.dispositivo.isEmpty() || cfg.chave.isEmpty()) return
            val corpo = JSONObject().put("v", 1).put("dados", Assinatura.cifrar(paraJson(ler(ctx)), cfg.chave)).toString()
            FirebaseRest(cfg.firebase).requisitar("PUT", "${cfg.base}/atalhos", corpo, timeoutMs = 15_000)
        } catch (e: Exception) {
            Log.w("AgenteAndroid", "Firebase (atalhos): ${e.message}")
        }
    }
}
