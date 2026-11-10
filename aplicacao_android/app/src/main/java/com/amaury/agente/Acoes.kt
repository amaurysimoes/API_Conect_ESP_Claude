package com.amaury.agente

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.PowerManager
import android.os.StatFs
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

data class Resultado(val ok: Boolean, val texto: String)

/** O que o celular sabe fazer quando mandamos. O nome de cada ação é o mesmo que o servidor usa. */
object Acoes {
    val SUPORTADAS = listOf("info", "listar_apps", "abrir_app", "abrir_url", "voltar_inicio", "listar_atalhos", "abrir_atalho")

    fun executar(ctx: Context, acao: String, p: Map<String, Any?>): Resultado = try {
        when (acao) {
            "info" -> Resultado(true, info(ctx))
            "listar_apps" -> listarApps(ctx)
            "abrir_app" -> abrirApp(ctx, texto(p, "app"))
            "abrir_url" -> abrirUrl(ctx, texto(p, "url"), p["navegador"]?.toString()?.trim().orEmpty())
            "voltar_inicio" -> voltarInicio(ctx)
            "listar_atalhos" -> listarAtalhos(ctx)
            "abrir_atalho" -> abrirAtalho(ctx, texto(p, "atalho"))
            else -> Resultado(false, "ação desconhecida: $acao")
        }
    } catch (e: IllegalArgumentException) {
        Resultado(false, e.message ?: "parâmetro inválido")
    } catch (e: Exception) {
        Resultado(false, "erro: ${e.message ?: e.javaClass.simpleName}")
    }

    private fun texto(p: Map<String, Any?>, chave: String): String {
        val v = p[chave]?.toString()?.trim().orEmpty()
        require(v.isNotEmpty() && v.length <= 500) { "falta o parâmetro '$chave'" }
        return v
    }

    // ---------- apps instalados ----------
    @Suppress("DEPRECATION")
    fun apps(ctx: Context): List<AppInfo> {
        val pm = ctx.packageManager
        val navegadores = pm.queryIntentActivities(
            Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")).addCategory(Intent.CATEGORY_BROWSABLE), 0,
        ).map { it.activityInfo.packageName }.toSet()
        val lista = pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
        return lista.distinctBy { it.activityInfo.packageName }.map { ri ->
            val pacote = ri.activityInfo.packageName
            AppInfo(
                nome = ri.loadLabel(pm).toString(),
                pacote = pacote,
                sistema = (ri.activityInfo.applicationInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0,
                navegador = pacote in navegadores,
                versao = try { pm.getPackageInfo(pacote, 0).versionName ?: "" } catch (e: Exception) { "" },
            )
        }.sortedBy { it.nome.lowercase() }
    }

    /** Lista cifrada (AES-GCM com a chave do app): o banco é aberto, então ninguém além do servidor deve ler. */
    fun listaCifrada(ctx: Context, chave: String): String {
        val arr = JSONArray()
        for (a in apps(ctx)) arr.put(JSONObject().put("n", a.nome).put("p", a.pacote).put("s", a.sistema).put("b", a.navegador).put("v", a.versao))
        return Assinatura.cifrar(JSONObject().put("em", System.currentTimeMillis()).put("apps", arr).toString(), chave)
    }

    private fun listarApps(ctx: Context): Resultado {
        val n = apps(ctx).size
        return Resultado(true, "$n apps com ícone no celular; lista atualizada para a IA")
    }

    // ---------- abrir ----------
    /** Do segundo plano o Android 10+ só deixa abrir telas se o app tiver "Exibir sobre outros apps". */
    private fun semPermissaoDeAbrir(ctx: Context) =
        Build.VERSION.SDK_INT >= 29 && !Settings.canDrawOverlays(ctx)

    private const val AVISO_PERMISSAO = "falta a permissão 'Exibir sobre outros apps' (abra o Agente Android no celular e permita)"

    private fun abrirApp(ctx: Context, consulta: String): Resultado {
        if (semPermissaoDeAbrir(ctx)) return Resultado(false, AVISO_PERMISSAO)
        return when (val r = BuscaApps.achar(apps(ctx), consulta, Atalhos.ler(ctx).apps)) {
            is BuscaApps.Resultado.Nenhum -> Resultado(false, "nenhum app parecido com \"$consulta\" (use listar_apps)")
            is BuscaApps.Resultado.Varios -> Resultado(false, "\"$consulta\" combina com vários: ${r.apps.take(6).joinToString(", ") { it.nome }}. Diga qual.")
            is BuscaApps.Resultado.Achou -> abrirPacote(ctx, r.app)
        }
    }

    private fun abrirPacote(ctx: Context, app: AppInfo): Resultado {
        val i = ctx.packageManager.getLaunchIntentForPackage(app.pacote) ?: return Resultado(false, "${app.nome} não pode ser aberto")
        ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return Resultado(true, "aberto: ${app.nome}")
    }

    // ---------- atalhos salvos pelo usuário (sites e apps marcados) ----------
    private fun listarAtalhos(ctx: Context): Resultado {
        val meus = Atalhos.ler(ctx)
        Atalhos.publicar(ctx)
        val marcados = apps(ctx).filter { it.pacote in meus.apps }
        val sites = if (meus.sites.isEmpty()) "nenhum" else meus.sites.joinToString("; ") { "${it.nome} (${it.url})" }
        val appsTxt = if (marcados.isEmpty()) "nenhum" else marcados.joinToString(", ") { it.nome }
        return Resultado(true, "Sites: $sites. Apps marcados: $appsTxt")
    }

    /** Abre um site salvo ou um app marcado pelo nome. Só acha o que o usuário salvou na tela Meus atalhos. */
    private fun abrirAtalho(ctx: Context, nome: String): Resultado {
        val meus = Atalhos.ler(ctx)
        val sites = Atalhos.acharSites(meus.sites, nome)
        val achadoApps = BuscaApps.achar(apps(ctx).filter { it.pacote in meus.apps }, nome)
        val candidatos = sites.map { "site ${it.nome}" } + when (achadoApps) {
            is BuscaApps.Resultado.Achou -> listOf("app ${achadoApps.app.nome}")
            is BuscaApps.Resultado.Varios -> achadoApps.apps.map { "app ${it.nome}" }
            BuscaApps.Resultado.Nenhum -> emptyList()
        }
        return when {
            candidatos.isEmpty() -> Resultado(false, "nenhum atalho salvo parecido com \"$nome\". Salve na tela Meus atalhos do app (toque no ícone).")
            candidatos.size > 1 -> Resultado(false, "\"$nome\" combina com mais de um atalho: ${candidatos.joinToString(", ")}. Diga qual.")
            sites.size == 1 -> abrirUrl(ctx, sites[0].url, "")
            else -> abrirPacote(ctx, (achadoApps as BuscaApps.Resultado.Achou).app)
        }
    }

    private fun abrirUrl(ctx: Context, urlTexto: String, navegador: String): Resultado {
        if (semPermissaoDeAbrir(ctx)) return Resultado(false, AVISO_PERMISSAO)
        val url = if ("://" in urlTexto) urlTexto else "https://$urlTexto"
        val uri = Uri.parse(url)
        require(uri.scheme == "http" || uri.scheme == "https") { "só endereços http/https" }
        val i = Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        var onde = "navegador padrão"
        if (navegador.isNotEmpty()) {
            when (val r = BuscaApps.achar(apps(ctx).filter { it.navegador }, navegador)) {
                is BuscaApps.Resultado.Achou -> { i.setPackage(r.app.pacote); onde = r.app.nome }
                is BuscaApps.Resultado.Varios -> return Resultado(false, "\"$navegador\" combina com: ${r.apps.joinToString(", ") { it.nome }}")
                BuscaApps.Resultado.Nenhum -> return Resultado(false, "navegador \"$navegador\" não encontrado")
            }
        }
        ctx.startActivity(i)
        return Resultado(true, "aberto no $onde: $url")
    }

    private fun voltarInicio(ctx: Context): Resultado {
        if (semPermissaoDeAbrir(ctx)) return Resultado(false, AVISO_PERMISSAO)
        ctx.startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return Resultado(true, "voltou para a tela inicial")
    }

    // ---------- informações ----------
    data class Resumo(val modelo: String, val android: String, val bateria: Int, val carregando: Boolean, val telaLigada: Boolean, val rede: String, val livreGb: Double)

    @Suppress("DEPRECATION")
    fun resumo(ctx: Context): Resumo {
        val b = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val nivel = b?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val escala = b?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val status = b?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val rede = try {
            (ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).activeNetworkInfo?.typeName ?: "sem rede"
        } catch (e: Exception) { "?" }
        val st = StatFs(Environment.getDataDirectory().path)
        return Resumo(
            modelo = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
            android = "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
            bateria = if (nivel >= 0 && escala > 0) nivel * 100 / escala else -1,
            carregando = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL,
            telaLigada = (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive,
            rede = rede,
            livreGb = Math.round(st.availableBytes / 1.0e9 * 10) / 10.0,
        )
    }

    fun info(ctx: Context): String {
        val r = resumo(ctx)
        return "${r.modelo} · Android ${r.android} · bateria ${r.bateria}%${if (r.carregando) " (carregando)" else ""} · " +
            "${r.livreGb} GB livres · rede ${r.rede} · tela ${if (r.telaLigada) "ligada" else "apagada"}"
    }

    @Suppress("unused")
    private fun memoriaBaixa(ctx: Context) = ActivityManager.MemoryInfo().also { (ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(it) }.lowMemory
}
