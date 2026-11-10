package com.amaury.agente

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.Toast

/**
 * Janela pequena e escura, só com o ícone (fase de testes). O pontinho no canto: verde = conectado, vermelho = sem conexão.
 * Toque longo no ícone = trocar nome, broker e chave. Na primeira vez pede a configuração e as permissões, uma de cada vez.
 */
class MainActivity : Activity() {
    private lateinit var ponto: View
    private val h = Handler(Looper.getMainLooper())
    private val colorir = object : Runnable {
        override fun run() {
            (ponto.background as GradientDrawable).setColor(
                when { Estado.conectado -> Color.parseColor("#3DDC84"); Estado.rodando -> Color.parseColor("#FFB020"); else -> Color.parseColor("#FF5C5C") },
            )
            h.postDelayed(this, 2000)
        }
    }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        val dp = resources.displayMetrics.density
        val raiz = FrameLayout(this).apply { setPadding((28 * dp).toInt(), (28 * dp).toInt(), (28 * dp).toInt(), (28 * dp).toInt()) }
        val tamanho = (112 * dp).toInt()
        val icone = ImageView(this).apply {
            setImageResource(R.drawable.icone)
            scaleType = ImageView.ScaleType.FIT_CENTER
            setOnClickListener { startActivity(Intent(this@MainActivity, AtalhosActivity::class.java)) }   // toque: Meus atalhos
            setOnLongClickListener { configurar(false); true }                                          // toque longo: configuração
        }
        raiz.addView(icone, FrameLayout.LayoutParams(tamanho, tamanho, Gravity.CENTER))
        ponto = View(this).apply { background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setStroke((2 * dp).toInt(), Color.WHITE) } }
        val d = (22 * dp).toInt()
        raiz.addView(ponto, FrameLayout.LayoutParams(d, d, Gravity.BOTTOM or Gravity.END))
        setContentView(raiz)
    }

    override fun onResume() {
        super.onResume()
        h.post(colorir)
        if (!Config.completa(this)) configurar(true) else seguir()
    }

    override fun onPause() {
        h.removeCallbacks(colorir)
        super.onPause()
    }

    // ---------- configuração (janelinha escura) ----------
    private fun configurar(obrigatoria: Boolean) {
        val dp = resources.displayMetrics.density
        val atual = Config.ler(this)
        val padrao = Build.MODEL.replace(Regex("[^A-Za-z0-9_-]"), "_")
        fun campo(dica: String, valor: String, senha: Boolean = false) = EditText(this).apply {
            hint = dica; setText(valor); setTextColor(Color.parseColor("#E6E8EE")); setHintTextColor(Color.parseColor("#5D6675"))
            inputType = InputType.TYPE_CLASS_TEXT or if (senha) InputType.TYPE_TEXT_VARIATION_PASSWORD else InputType.TYPE_TEXT_VARIATION_NORMAL
            setSingleLine(true)
        }
        val nome = campo("Nome do celular (ex.: Pixel_Amaury)", atual.dispositivo.ifEmpty { padrao })
        val broker = campo("Broker", atual.broker)
        val chave = campo("Chave (o MCP_TOKEN do Render)", atual.chave, senha = true)
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding((20 * dp).toInt(), (8 * dp).toInt(), (20 * dp).toInt(), 0)
            addView(nome); addView(broker); addView(chave)
        }
        val dlg = AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("Agente Android").setView(col).setCancelable(!obrigatoria)
            .setPositiveButton("Salvar", null).apply { if (!obrigatoria) setNegativeButton("Cancelar", null) }.create()
        dlg.setOnShowListener {
            dlg.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val n = nome.text.toString().trim(); val br = broker.text.toString().trim(); val c = chave.text.toString().trim()
                when {
                    !Regex("[A-Za-z0-9_-]+").matches(n) -> Toast.makeText(this, "Nome: só letras, números, - e _", Toast.LENGTH_LONG).show()
                    br.isEmpty() || c.isEmpty() -> Toast.makeText(this, "Preencha o broker e a chave", Toast.LENGTH_LONG).show()
                    else -> {
                        Config.salvar(this, Config(atual.firebase, br, n, c))
                        stopService(Intent(this, AgenteService::class.java))   // recomeça com os dados novos
                        dlg.dismiss()
                        seguir()
                    }
                }
            }
        }
        dlg.show()
    }

    // ---------- permissões, uma de cada vez (cada uma é pedida uma única vez) ----------
    private fun seguir() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED
            && !Config.jaPediu(this, "notificacao")) {
            Config.marcouPedido(this, "notificacao")
            requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), 1)
            return
        }
        if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(this) && !Config.jaPediu(this, "sobrepor")) {
            Config.marcouPedido(this, "sobrepor")
            Toast.makeText(this, "Permita \"Exibir sobre outros apps\": é o que deixa a IA abrir apps", Toast.LENGTH_LONG).show()
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            return
        }
        if (Build.VERSION.SDK_INT >= 23 && !(getSystemService(POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName)
            && !Config.jaPediu(this, "bateria")) {
            Config.marcouPedido(this, "bateria")
            try {
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
                return
            } catch (e: Exception) { /* aparelho sem essa tela: segue */ }
        }
        AgenteService.iniciar(this)
    }

    override fun onRequestPermissionsResult(code: Int, p: Array<out String>, r: IntArray) {
        super.onRequestPermissionsResult(code, p, r)
        seguir()
    }
}
