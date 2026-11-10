package com.amaury.agente

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.AlarmClock
import android.provider.ContactsContract
import android.provider.MediaStore
import android.provider.Settings

/** Descobre quais são os apps PADRÃO do aparelho (navegador, câmera, telefone, mensagens...) para marcar de uma vez. */
object Padroes {
    @Suppress("DEPRECATION")
    fun descobrir(ctx: Context): Set<String> {
        val pm = ctx.packageManager
        val intencoes = listOf(
            Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com")).addCategory(Intent.CATEGORY_BROWSABLE), // navegador
            Intent(MediaStore.ACTION_IMAGE_CAPTURE),                                   // câmera
            Intent(Intent.ACTION_DIAL),                                                // telefone
            Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:")),                         // mensagens
            Intent(Settings.ACTION_SETTINGS),                                          // configurações
            Intent(Intent.ACTION_VIEW, ContactsContract.Contacts.CONTENT_URI),         // contatos
            Intent(Intent.ACTION_VIEW).setType("image/*"),                             // galeria
            Intent(AlarmClock.ACTION_SHOW_ALARMS),                                     // relógio
            Intent(Intent.ACTION_VIEW, Uri.parse("content://com.android.calendar/time")), // agenda
            Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")),                        // e-mail
            Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0")),                          // mapas
            Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_CALCULATOR), // calculadora
        )
        val abriveis = Acoes.apps(ctx).map { it.pacote }.toSet()      // só o que a IA consegue abrir (tem ícone)
        val achados = LinkedHashSet<String>()
        for (i in intencoes) {
            val pacote = try { pm.resolveActivity(i, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName } catch (e: Exception) { null }
            if (pacote != null && pacote != "android" && pacote in abriveis) achados.add(pacote)   // "android" = o seletor, sem padrão definido
        }
        return achados
    }
}
