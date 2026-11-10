package com.amaury.agente

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * Fica rodando em segundo plano (com uma notificação pequena, exigência do Android):
 *  - ouve em tempo real o Firebase: brokers/<broker>/android/<dispositivo>/comandos
 *  - obedece só comandos ASSINADOS (mesma regra do agente do PC), responde em .../resultado/<id>
 *  - a cada 15 s grava .../status (online + resumo) e, quando muda, a lista de apps (cifrada) em .../apps
 */
class AgenteService : Service() {
    private lateinit var cfg: Config
    private lateinit var fb: FirebaseRest
    @Volatile private var ativo = false
    private val vistos = LinkedHashSet<String>()
    private var receptorPacotes: BroadcastReceiver? = null

    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (ativo) return START_STICKY
        cfg = Config.ler(this)
        if (cfg.dispositivo.isEmpty() || cfg.chave.isEmpty()) { stopSelf(); return START_NOT_STICKY }
        fb = FirebaseRest(cfg.firebase)
        subirParaPrimeiroPlano()
        ativo = true
        Estado.rodando = true
        thread(name = "agente-comandos") { laçoComandos() }
        thread(name = "agente-status") { laçoStatus() }
        thread(name = "agente-apps") { publicarApps() }
        escutarPacotes()
        return START_STICKY
    }

    override fun onDestroy() {
        ativo = false
        Estado.rodando = false
        receptorPacotes?.let { try { unregisterReceiver(it) } catch (e: Exception) { /* já solto */ } }
        super.onDestroy()
    }

    // ---------- notificação (primeiro plano) ----------
    private fun subirParaPrimeiroPlano() {
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(NotificationChannel("agente", "Agente Android", NotificationManager.IMPORTANCE_MIN))
        }
        val abrir = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0,
        )
        @Suppress("DEPRECATION")
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "agente") else Notification.Builder(this)
        val n = b.setSmallIcon(R.drawable.ic_stat).setContentTitle("Agente Android").setContentText(cfg.dispositivo)
            .setContentIntent(abrir).setOngoing(true).build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(1, n)
    }

    // ---------- comandos ----------
    private fun laçoComandos() {
        var espera = 2_000L
        while (ativo) {
            try {
                fb.ouvir(
                    "${cfg.base}/comandos",
                    aoConectar = { espera = 2_000L; Estado.ultimoOk = System.currentTimeMillis() },
                    aoEvento = { ev, dados -> tratar(ev, dados) },
                    continuar = { ativo },
                )
            } catch (e: Exception) {
                Log.w(TAG, "Firebase (comandos): ${e.message}")
            }
            if (!ativo) break
            try { Thread.sleep(espera) } catch (e: InterruptedException) { break }
            espera = minOf(espera * 2, 30_000L)
        }
    }

    private fun tratar(evento: String, dados: String) {
        for ((id, cmd) in Fila.comandos(evento, dados)) {
            if (!vistos.add(id)) continue
            while (vistos.size > 300) vistos.remove(vistos.first())
            try { processar(id, cmd) } catch (e: Exception) { Log.w(TAG, "comando $id: ${e.message}") }
        }
    }

    private fun processar(id: String, cmd: JSONObject) {
        val resultado = when (Fila.validar(cfg.chave, id, cmd, System.currentTimeMillis())) {
            Validade.ASSINATURA_INVALIDA -> { Log.w(TAG, "comando $id recusado: assinatura inválida"); apagar(id); return }
            Validade.EXPIRADO -> Resultado(false, "comando fora da validade de 60 s (confira o relógio do celular)")
            Validade.OK -> {
                val acao = cmd.optString("acao")
                val r = Acoes.executar(this, acao, Fila.parametros(cmd))
                if (acao == "listar_apps") publicarApps()
                r
            }
        }
        val corpo = JSONObject().put("ok", resultado.ok).put("texto", resultado.texto)
            .put("em", JSONObject().put(".sv", "timestamp")).toString()
        try { fb.requisitar("PUT", "${cfg.base}/resultado/$id", corpo) } catch (e: Exception) { Log.w(TAG, "resultado: ${e.message}") }
        apagar(id)
    }

    private fun apagar(id: String) {
        try { fb.requisitar("DELETE", "${cfg.base}/comandos/$id") } catch (e: Exception) { Log.w(TAG, "apagar: ${e.message}") }
    }

    // ---------- sinal de vida ----------
    private fun laçoStatus() {
        while (ativo) {
            try {
                val r = Acoes.resumo(this)
                val resumo = JSONObject().put("modelo", r.modelo).put("android", r.android).put("bateria", r.bateria)
                    .put("carregando", r.carregando).put("tela", r.telaLigada).put("rede", r.rede).put("livre_gb", r.livreGb)
                val corpo = JSONObject().put("online", true).put("tipo", "android")
                    .put("visto_em", JSONObject().put(".sv", "timestamp")).put("resumo", resumo)
                    .put("acoes", org.json.JSONArray(Acoes.SUPORTADAS)).toString()
                fb.requisitar("PUT", "${cfg.base}/status", corpo)
                Estado.ultimoOk = System.currentTimeMillis()
            } catch (e: Exception) {
                Log.w(TAG, "Firebase (status): ${e.message}")
            }
            try { Thread.sleep(15_000) } catch (e: InterruptedException) { break }
        }
    }

    // ---------- lista de apps ----------
    @Synchronized private fun publicarApps() {
        try {
            val corpo = JSONObject().put("v", 1).put("dados", Acoes.listaCifrada(this, cfg.chave)).toString()
            fb.requisitar("PUT", "${cfg.base}/apps", corpo, timeoutMs = 20_000)
        } catch (e: Exception) {
            Log.w(TAG, "Firebase (apps): ${e.message}")
        }
    }

    /** App instalado ou removido: atualiza a lista para a IA. */
    private fun escutarPacotes() {
        val f = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED); addAction(Intent.ACTION_PACKAGE_REMOVED); addDataScheme("package")
        }
        receptorPacotes = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, i: Intent?) { thread(name = "agente-apps2") { Thread.sleep(2_000); publicarApps() } }
        }
        registerReceiver(receptorPacotes, f)
    }

    companion object {
        private const val TAG = "AgenteAndroid"
        fun iniciar(ctx: Context) {
            val i = Intent(ctx, AgenteService::class.java)
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
        }
    }
}

/** Liga o agente sozinho quando o celular reinicia. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED && Config.completa(ctx)) AgenteService.iniciar(ctx)
    }
}
