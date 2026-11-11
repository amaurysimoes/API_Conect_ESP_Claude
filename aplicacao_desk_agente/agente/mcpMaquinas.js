// Ferramentas do Claude para as máquinas. instalarMaquinas(server) é chamado UMA vez em iot_automacao_esp/ferramentas.js
// (depois de instalarGps, para herdar a dica do Render dormindo). Não altera nenhuma ferramenta existente.
import { z } from "zod";
import { listarMaquinas } from "./maquinas.js";
import { executarNaMaquina, ACOES, escolher as escolherMaquina } from "./executar.js";
import { PROGRAMAS } from "./catalogo.js";
import { listarAtalhos, verificarNaMaquina } from "./atalhos.js";

const texto = (t, erro = false) => ({ content: [{ type: "text", text: t }], isError: erro });

export function instalarMaquinas(server) {
  server.registerTool(
    "listar_maquinas",
    {
      description:
        "Lista os computadores com o agente instalado: se estão ativos (online) agora e um resumo (CPU, memória, disco, tempo ligado). " +
        "Use para 'qual máquina está ativa?'. Responda em uma ou duas linhas por máquina.",
    },
    async () => {
      try {
        const lista = await listarMaquinas();
        if (!lista.length) return texto("Nenhuma máquina cadastrada.");
        return texto(lista.map((m) =>
          `${m.maquina} (${m.broker}): ${m.online ? "ATIVA" : `offline, sem sinal há ${m.visto_ha_s ?? "?"} s`}` +
          (m.resumo && m.online ? ` · CPU ${m.resumo.cpu}% · memória ${m.resumo.memoria}% · disco ${m.resumo.disco}% · ligada há ${m.resumo.ligado_h} h` : "")
        ).join("\n"));
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );

  server.registerTool(
    "executar_na_maquina",
    {
      description:
        "Faz algo num computador com o agente: abrir QUALQUER programa (Word, Excel, Chrome, ou um caminho completo), abrir site, pasta ou arquivo, " +
        "fechar programa, bloquear a tela, ver informações, desligar ou reiniciar. " +
        `Programas conhecidos: ${PROGRAMAS.map((p) => p.nome).join(", ")}; qualquer outro vale pelo nome ou caminho. ` +
        "Sem 'maquina': usa a única ativa, ou a resposta pede a máquina (pergunte \"Qual máquina?\" citando os nomes). " +
        "ANTES de dizer que não achou um site, programa, pasta ou arquivo do usuário, consulte a ferramenta listar_atalhos. Sites, programas, pastas e arquivos PERSONALIZADOS do usuário (os dele, que ele desenvolve ou usa) só são encontrados se ele os SALVOU: use a ação abrir_atalho (ou a ferramenta abrir_atalho); se não estiver salvo, diga que ele precisa salvar na aba Desk-Automacao_Firebase (botão Salvar). " +
        "desligar/reiniciar: SEMPRE pergunte antes e só então use confirmado=true.",
      inputSchema: {
        acao: z.enum(ACOES).describe("o que fazer"),
        maquina: z.string().optional().describe("nome da máquina, ex.: DEV_ENG"),
        programa: z.string().optional().describe("para abrir_programa/fechar_programa: nome (ex.: 'excel') ou caminho do .exe"),
        argumentos: z.string().optional().describe("argumentos do programa, ex.: um arquivo a abrir"),
        url: z.string().optional().describe("para abrir_url"),
        caminho: z.string().optional().describe("para abrir_pasta/abrir_arquivo"),
        confirmado: z.boolean().optional().describe("true só depois do usuário confirmar desligar/reiniciar"),
        atalho: z.string().optional().describe("para abrir_atalho: nome ou palavra do atalho salvo (ex.: 'meu sistema de estoque')"),
      },
    },
    async (args) => {
      try {
        const r = await executarNaMaquina(args);
        return texto(`${r.maquina}: ${r.texto}`, !r.ok);
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );

  server.registerTool(
    "listar_atalhos",
    {
      description:
        "Lista os atalhos PERSONALIZADOS que o usuário salvou (as personalizações dele: sites, programas, pastas e arquivos que ele mesmo desenvolve ou usa) e, com verificar=true, " +
        "Use SEMPRE que ele falar de \"meus atalhos\", \"minhas personalizações\", \"meus sites\", \"minhas aplicações\" ou \"meus programas\". Não precisa de máquina ativa para listar. " +
        "confere no computador quais existem de verdade. Use para 'quais são as minhas aplicações?' ou 'minhas aplicações estão instaladas aqui?'. " +
        "Os que não existem ainda na máquina: diga que ainda não estão lá.",
      inputSchema: {
        maquina: z.string().optional().describe("nome da máquina; sem ele usa a única ativa"),
        verificar: z.boolean().optional().describe("true: confere no computador se os programas, pastas e arquivos existem"),
      },
    },
    async ({ maquina, verificar }) => {
      try {
        const lista = await listarAtalhos();                     // os atalhos valem para todas as máquinas
        if (!lista.length) return texto("Não há atalhos salvos. O usuário cadastra na aba Desk-Automacao_Firebase.");
        let achados = null, alvo = null;
        if (verificar) {
          alvo = await escolherMaquina(maquina);
          if (!alvo.online) return texto(`A máquina ${alvo.maquina} está offline (sem sinal há ${alvo.visto_ha_s ?? "?"} s). Avise o usuário.`, true);
          achados = await verificarNaMaquina(alvo, lista);
        }
        const marca = (a) => achados === null || achados[a.id] === null ? "" : achados[a.id] ? " ✓ existe na máquina" : " ✗ NÃO existe ainda nesta máquina";
        return texto((alvo ? `${alvo.maquina}:\n` : "Atalhos salvos:\n") + lista.map((a) => `- ${a.nome} [${a.tipo}] ${a.alvo}${a.argumentos ? " " + a.argumentos : ""}${marca(a)}`).join("\n"));
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );

  server.registerTool(
    "abrir_atalho",
    {
      description:
        "Abre um atalho PERSONALIZADO salvo pelo usuário (site, programa, pasta ou arquivo) pelo nome ou por palavras dele, ex.: 'abre meu sistema de estoque'. " +
        "Se o programa ou caminho ainda não existir na máquina, a resposta diz que não tem ainda: repasse isso ao usuário. " +
        "Se combinar com mais de um, pergunte qual. Sem 'maquina': usa a única ativa.",
      inputSchema: {
        atalho: z.string().describe("nome ou palavras do atalho, ex.: 'sistema de estoque'"),
        maquina: z.string().optional().describe("nome da máquina"),
      },
    },
    async ({ atalho, maquina }) => {
      try {
        const r = await executarNaMaquina({ acao: "abrir_atalho", atalho, maquina });
        return texto(`${r.maquina}: ${r.texto}`, !r.ok);
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );
}
