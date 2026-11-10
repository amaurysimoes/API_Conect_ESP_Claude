package com.amaury.agente

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AtalhosTest {
    private val sites = listOf(
        Site("Banco", "https://www.meubanco.com.br"),
        Site("Google", "https://www.google.com"),
        Site("Meu Sistema de Estoque", "https://estoque.empresa.com.br/painel?x=1"),
        Site("Notícias", "https://g1.globo.com"),
        Site("YouTube", "https://www.youtube.com"),
        Site("Mapa da Cidade", "https://maps.google.com"),
    )

    @Test fun jsonVaiEVolta() {
        val a = MeusAtalhos(sites, setOf("com.android.chrome", "com.whatsapp"))
        assertEquals(a, Atalhos.deJson(Atalhos.paraJson(a)))
    }

    @Test fun jsonQuebradoOuVazioNaoDerruba() {
        assertEquals(MeusAtalhos(), Atalhos.deJson(null))
        assertEquals(MeusAtalhos(), Atalhos.deJson(""))
        assertEquals(MeusAtalhos(), Atalhos.deJson("{isso nao e json"))
    }

    @Test fun validaSites() {
        assertNull(Atalhos.validarSite("Banco", "www.meubanco.com.br"))
        assertNull(Atalhos.validarSite("Local", "http://localhost:3000"))
        assertNotNull(Atalhos.validarSite("", "www.google.com"))
        assertNotNull(Atalhos.validarSite("X", "isso nao e site"))
        assertNotNull(Atalhos.validarSite("X".repeat(61), "www.google.com"))
    }

    @Test fun mesmoNomeTrocaOEnderecoEmVezDeDuplicar() {
        val a = Atalhos.adicionar(MeusAtalhos(sites), "BANCO", "www.outrobanco.com")
        assertEquals(sites.size, a.sites.size)
        assertEquals("https://www.outrobanco.com", a.sites.first { it.nome == "BANCO" }.url)
        assertEquals(0, a.sites.count { it.nome == "Banco" })
    }

    @Test fun achaSitePeloNomeOuParteDele() {
        assertEquals("Banco", Atalhos.acharSites(sites, "banco").single().nome)
        assertEquals("Meu Sistema de Estoque", Atalhos.acharSites(sites, "estoque").single().nome)
        assertEquals("Meu Sistema de Estoque", Atalhos.acharSites(sites, "abre meu sistema de estoque").single().nome)
        assertEquals("Notícias", Atalhos.acharSites(sites, "noticias").single().nome)
        assertTrue(Atalhos.acharSites(sites, "spotify").isEmpty())
        assertTrue(Atalhos.acharSites(sites, "  ").isEmpty())
    }

    @Test fun cincoOuMaisSitesFuncionamSemLimite() {
        var a = MeusAtalhos()
        for (i in 1..12) a = Atalhos.adicionar(a, "Site $i", "www.site$i.com")
        assertEquals(12, a.sites.size)
        assertEquals("Site 7", Atalhos.acharSites(a.sites, "site 7").single().nome)
    }

    @Test fun appMarcadoGanhaNoEmpate() {
        val apps = listOf(
            AppInfo("Câmera", "com.sec.camera", true, false, "1"),
            AppInfo("Camera FV-5", "com.flavio.camera", false, false, "1"),
        )
        assertTrue(BuscaApps.achar(apps, "cam") is BuscaApps.Resultado.Varios)
        val r = BuscaApps.achar(apps, "cam", preferidos = setOf("com.sec.camera")) as BuscaApps.Resultado.Achou
        assertEquals("Câmera", r.app.nome)
        // dois marcados continua empatado: pergunta
        assertTrue(BuscaApps.achar(apps, "cam", preferidos = setOf("com.sec.camera", "com.flavio.camera")) is BuscaApps.Resultado.Varios)
    }

    @Test fun atalhosCifradosComAMesmaChaveDoServidor() {
        val a = MeusAtalhos(sites.take(2), setOf("com.whatsapp"))
        val cifrado = Assinatura.cifrar(Atalhos.paraJson(a), "chave-de-teste")
        assertEquals(a, Atalhos.deJson(Assinatura.decifrar(cifrado, "chave-de-teste")))
    }
}
