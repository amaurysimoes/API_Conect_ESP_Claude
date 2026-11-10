// Ferramentas do Claude para os celulares Android. instalarAndroid(server) é chamado UMA vez em src/ferramentas.js
// (depois de instalarMaquinas). Não altera nenhuma ferramenta existente.
import { z } from "zod";
import { listarAndroid, lerApps, lerAtalhos, enviarComando, escolher } from "./android.js";

const texto = (t, erro = false) => ({ content: [{ type: "text", text: t }], isError: erro });
const ACOES = ["info", "listar_apps", "abrir_app", "abrir_url", "voltar_inicio", "abrir_atalho"];

export function instalarAndroid(server) {
  server.registerTool(
    "listar_android",
    {
      description:
        "Lista os celulares Android com o Agente instalado: se estão ativos agora e um resumo (modelo, versão do Android, bateria, rede). " +
        "Use para 'meu celular está ligado?'. Responda em uma linha por celular.",
    },
    async () => {
      try {
        const l = await listarAndroid();
        if (!l.length) return texto("Nenhum celular cadastrado.");
        return texto(l.map((d) => {
          const r = d.resumo;
          return `${d.dispositivo}: ${d.online ? "ATIVO" : `offline, sem sinal há ${d.visto_ha_s ?? "?"} s`}` +
            (r && d.online ? ` · ${r.modelo} · Android ${r.android} · bateria ${r.bateria}%${r.carregando ? " (carregando)" : ""} · rede ${r.rede}` : "");
        }).join("\n"));
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );

  server.registerTool(
    "apps_android",
    {
      description:
        "Mostra os aplicativos instalados no celular (nome e pacote), lidos da lista que o próprio celular publica. " +
        "Use para 'quais apps eu tenho?', 'tenho o Spotify?', 'quais navegadores tenho?'. " +
        "Para atualizar a lista antes, use executar_no_android com a ação listar_apps.",
      inputSchema: {
        celular: z.string().optional().describe("nome do celular; sem ele usa o único ativo"),
        busca: z.string().optional().describe("parte do nome ou do pacote para filtrar"),
        tipo: z.enum(["todos", "usuario", "sistema", "navegadores", "marcados"]).optional().describe("filtro; padrão: todos. marcados = os que o usuário marcou como favoritos/padrão"),
      },
    },
    async ({ celular, busca, tipo }) => {
      try {
        const alvo = await escolher(celular);
        const { em, apps } = await lerApps(alvo);
        const marcados = new Set((await lerAtalhos(alvo).catch(() => ({ apps: [] }))).apps);
        const q = busca?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        const plano = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        const filtrados = apps.filter((a) =>
          (!q || plano(a.n).includes(q) || a.p.toLowerCase().includes(q)) &&
          (tipo === "usuario" ? !a.s : tipo === "sistema" ? a.s : tipo === "navegadores" ? a.b : tipo === "marcados" ? marcados.has(a.p) : true));
        const idade = Math.round((Date.now() - em) / 60000);
        const linhas = filtrados.slice(0, 300).map((a) => `${a.n} (${a.p})${a.b ? " [navegador]" : ""}${a.s ? " [sistema]" : ""}${marcados.has(a.p) ? " [marcado]" : ""}`);
        return texto(`${alvo.dispositivo}: ${filtrados.length} de ${apps.length} apps (lista de ${idade} min atrás)\n${linhas.join("\n")}` +
          (filtrados.length > 300 ? `\n… e mais ${filtrados.length - 300}` : ""));
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );

  server.registerTool(
    "atalhos_android",
    {
      description:
        "Mostra o que o usuário SALVOU no celular na tela Meus atalhos: os sites (nome e endereço) e os apps marcados (inclusive os padrão do Android). " +
        "Use para 'quais sites eu salvei?' e 'quais são meus apps marcados?'. Para abrir, use executar_no_android com abrir_atalho.",
      inputSchema: { celular: z.string().optional().describe("nome do celular; sem ele usa o único ativo") },
    },
    async ({ celular }) => {
      try {
        const alvo = await escolher(celular);
        const { sites, apps } = await lerAtalhos(alvo);
        const nomes = new Map((await lerApps(alvo).catch(() => ({ apps: [] }))).apps.map((a) => [a.p, a.n]));
        const linhasSites = sites.length ? sites.map((s) => `- ${s.n}: ${s.u}`).join("\n") : "(nenhum site salvo)";
        const linhasApps = apps.length ? apps.map((p) => `- ${nomes.get(p) ?? p}`).join("\n") : "(nenhum app marcado)";
        return texto(`${alvo.dispositivo}\nSites salvos (${sites.length}):\n${linhasSites}\nApps marcados (${apps.length}):\n${linhasApps}`);
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );

  server.registerTool(
    "executar_no_android",
    {
      description:
        "Faz algo no celular Android: abrir um app pelo nome ('abre o WhatsApp'), abrir um site (opcionalmente num navegador específico, ex.: Chrome ou Firefox), " +
        "voltar para a tela inicial, ver informações ou atualizar a lista de apps. Sites e apps que o usuário SALVOU/MARCOU no celular (tela Meus atalhos) abrem pela ação abrir_atalho, pelo nome; o que não está salvo lá, ele precisa salvar. Sem 'celular': usa o único ativo, ou a resposta pede qual (pergunte \"Qual celular?\").",
      inputSchema: {
        acao: z.enum(ACOES).describe("o que fazer"),
        celular: z.string().optional().describe("nome do celular"),
        app: z.string().optional().describe("para abrir_app: nome do app (ex.: 'whatsapp') ou pacote"),
        url: z.string().optional().describe("para abrir_url: endereço do site"),
        navegador: z.string().optional().describe("para abrir_url: navegador (ex.: 'chrome', 'firefox'); sem ele usa o padrão"),
        atalho: z.string().optional().describe("para abrir_atalho: nome de um site salvo ou de um app marcado no celular (ex.: 'banco')"),
      },
    },
    async ({ acao, celular, app, url, navegador, atalho }) => {
      try {
        const alvo = await escolher(celular);
        if (!alvo.online) return texto(`O celular ${alvo.dispositivo} está offline (sem sinal há ${alvo.visto_ha_s ?? "?"} s). Avise o usuário.`, true);
        if (Array.isArray(alvo.acoes) && !alvo.acoes.includes(acao)) return texto(`O app deste celular não suporta "${acao}" (atualize o api_conect.apk).`, true);
        const p = {};
        if (acao === "abrir_app") { if (!app) return texto("Diga qual app.", true); p.app = app; }
        if (acao === "abrir_atalho") { if (!atalho) return texto("Diga qual atalho.", true); p.atalho = atalho; }
        if (acao === "abrir_url") { if (!url) return texto("Diga o endereço (url).", true); p.url = url; if (navegador) p.navegador = navegador; }
        const r = await enviarComando(alvo, acao, p);
        return texto(`${alvo.dispositivo}: ${r.texto}`, !r.ok);
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );
}
