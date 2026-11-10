package com.amaury.agente

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import kotlin.concurrent.thread

/**
 * Tela "Meus atalhos" (escura): cadastrar sites e marcar apps (inclusive os padrão do Android).
 * O Claude só encontra pelo nome o que estiver salvo aqui. Abre com um toque no ícone da janela principal.
 */
class AtalhosActivity : Activity() {
    private val fundo = Color.parseColor("#0F1115")
    private val card = Color.parseColor("#171A21")
    private val texto = Color.parseColor("#E6E8EE")
    private val suave = Color.parseColor("#9AA3B2")
    private val azul = Color.parseColor("#4C8DFF")
    private val vermelho = Color.parseColor("#FF5C5C")
    private var dp = 1f
    private lateinit var meus: MeusAtalhos
    private lateinit var listaSites: LinearLayout
    private lateinit var textoApps: TextView

    private fun px(v: Int) = (v * dp).toInt()

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        dp = resources.displayMetrics.density
        meus = Atalhos.ler(this)

        val raiz = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(px(20), px(24), px(20), px(32)) }
        raiz.addView(rotulo("Meus atalhos", 22, texto, negrito = true))
        raiz.addView(rotulo("O Claude só acha pelo nome o que está salvo aqui.", 13, suave))

        // ---- sites ----
        raiz.addView(rotulo("Sites", 16, texto, negrito = true, topo = 20))
        listaSites = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        raiz.addView(listaSites)
        val nome = campo("Nome do site (ex.: Banco)", InputType.TYPE_CLASS_TEXT)
        val url = campo("Endereço (ex.: www.meubanco.com.br)", InputType.TYPE_TEXT_VARIATION_URI or InputType.TYPE_CLASS_TEXT)
        raiz.addView(nome); raiz.addView(url)
        raiz.addView(botao("Salvar site", azul) {
            val erro = Atalhos.validarSite(nome.text.toString(), url.text.toString())
            if (erro != null) { Toast.makeText(this, erro, Toast.LENGTH_LONG).show(); return@botao }
            meus = Atalhos.adicionar(meus, nome.text.toString(), url.text.toString())
            gravar()
            nome.setText(""); url.setText("")
            Toast.makeText(this, "Site salvo", Toast.LENGTH_SHORT).show()
        })

        // ---- apps ----
        raiz.addView(rotulo("Apps marcados", 16, texto, negrito = true, topo = 24))
        raiz.addView(rotulo("Marque os apps que você quer abrir direto, incluindo os padrão do Android (navegador, câmera, telefone...).", 13, suave))
        textoApps = rotulo("", 14, texto, topo = 8)
        raiz.addView(textoApps)
        raiz.addView(botao("Marcar os apps padrão do Android", azul) { marcarPadroes() })
        raiz.addView(botao("Escolher outros apps…", suave) { escolherApps() })
        raiz.addView(botao("Voltar", suave, topo = 28) { finish() })

        setContentView(ScrollView(this).apply { setBackgroundColor(fundo); addView(raiz) })
        desenhar()
    }

    // ---------- desenho ----------
    private fun desenhar() {
        listaSites.removeAllViews()
        if (meus.sites.isEmpty()) listaSites.addView(rotulo("Nenhum site salvo ainda. Salve quantos quiser.", 14, suave, topo = 6))
        for (s in meus.sites) {
            val linha = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                background = GradientDrawable().apply { setColor(card); cornerRadius = px(8).toFloat() }
                setPadding(px(12), px(8), px(8), px(8))
                layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = px(6) }
            }
            linha.addView(TextView(this).apply {
                text = "${s.nome}\n${s.url}"; setTextColor(texto); textSize = 14f
                layoutParams = LinearLayout.LayoutParams(0, -2, 1f)
            })
            linha.addView(botao("apagar", vermelho, compacto = true) {
                AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert).setTitle("Apagar \"${s.nome}\"?")
                    .setPositiveButton("Apagar") { _, _ -> meus = Atalhos.remover(meus, s.nome); gravar() }
                    .setNegativeButton("Cancelar", null).show()
            })
            listaSites.addView(linha)
        }
        thread(name = "atalhos-nomes") {
            val nomes = Acoes.apps(this).filter { it.pacote in meus.apps }.map { it.nome }
            val naoAchados = meus.apps.size - nomes.size
            val t = if (meus.apps.isEmpty()) "Nenhum app marcado ainda."
            else nomes.joinToString(", ") + if (naoAchados > 0) " (+$naoAchados que não estão mais instalados)" else ""
            runOnUiThread { textoApps.text = t }
        }
    }

    private fun gravar() {
        Atalhos.salvar(this, meus)
        thread(name = "atalhos-publicar") { Atalhos.publicar(this) }   // o Claude passa a enxergar
        desenhar()
    }

    // ---------- apps ----------
    private fun marcarPadroes() {
        thread(name = "atalhos-padroes") {
            val achados = Padroes.descobrir(this)
            runOnUiThread {
                if (achados.isEmpty()) { Toast.makeText(this, "Não achei apps padrão definidos neste aparelho", Toast.LENGTH_LONG).show(); return@runOnUiThread }
                meus = meus.copy(apps = meus.apps + achados)
                gravar()
                Toast.makeText(this, "${achados.size} apps padrão marcados", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun escolherApps() {
        thread(name = "atalhos-lista") {
            // os do sistema (padrão do Android) primeiro, para ficar fácil de marcar
            val todos = Acoes.apps(this).sortedWith(compareByDescending<AppInfo> { it.sistema }.thenBy { it.nome.lowercase() })
            runOnUiThread {
                val nomes = todos.map { if (it.sistema) "${it.nome}  (padrão)" else it.nome }.toTypedArray()
                val marcados = BooleanArray(todos.size) { todos[it].pacote in meus.apps }
                AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert).setTitle("Apps marcados")
                    .setMultiChoiceItems(nomes, marcados) { _, i, ligado -> marcados[i] = ligado }
                    .setPositiveButton("Salvar") { _, _ ->
                        val escolhidos = todos.filterIndexed { i, _ -> marcados[i] }.map { it.pacote }.toSet()
                        meus = meus.copy(apps = escolhidos); gravar()
                    }
                    .setNegativeButton("Cancelar", null).show()
            }
        }
    }

    // ---------- peças visuais (tudo escuro) ----------
    private fun rotulo(t: String, tam: Int, cor: Int, negrito: Boolean = false, topo: Int = 0) = TextView(this).apply {
        text = t; textSize = tam.toFloat(); setTextColor(cor)
        if (negrito) setTypeface(typeface, android.graphics.Typeface.BOLD)
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = px(topo) }
    }

    private fun campo(dica: String, tipo: Int) = EditText(this).apply {
        hint = dica; inputType = tipo; setSingleLine(true)
        setTextColor(texto); setHintTextColor(Color.parseColor("#5D6675"))
        background = GradientDrawable().apply { setColor(card); cornerRadius = px(8).toFloat(); setStroke(px(1), Color.parseColor("#2A2F3A")) }
        setPadding(px(12), px(10), px(12), px(10))
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = px(8) }
    }

    private fun botao(t: String, cor: Int, topo: Int = 10, compacto: Boolean = false, acao: (View) -> Unit) = Button(this).apply {
        text = t; isAllCaps = false; setTextColor(texto); textSize = if (compacto) 12f else 14f
        background = GradientDrawable().apply { setColor(card); cornerRadius = px(8).toFloat(); setStroke(px(1), cor) }
        layoutParams = (if (compacto) LinearLayout.LayoutParams(-2, px(36)) else LinearLayout.LayoutParams(-1, -2)).apply { topMargin = if (compacto) 0 else px(topo) }
        setOnClickListener(acao)
    }
}
