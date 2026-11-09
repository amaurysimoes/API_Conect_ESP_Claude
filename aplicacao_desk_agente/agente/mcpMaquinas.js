// Ferramentas do Claude para as máquinas. instalarMaquinas(server) é chamado UMA vez em src/ferramentas.js
// (depois de instalarGps, para herdar a dica do Render dormindo). Não altera nenhuma ferramenta existente.
import { z } from "zod";
import { listarMaquinas } from "./maquinas.js";
import { executarNaMaquina, ACOES } from "./executar.js";
import { PROGRAMAS } from "./catalogo.js";

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
        "desligar/reiniciar: SEMPRE pergunte antes e só então use confirmado=true.",
      inputSchema: {
        acao: z.enum(ACOES).describe("o que fazer"),
        maquina: z.string().optional().describe("nome da máquina, ex.: DEV_ENG"),
        programa: z.string().optional().describe("para abrir_programa/fechar_programa: nome (ex.: 'excel') ou caminho do .exe"),
        argumentos: z.string().optional().describe("argumentos do programa, ex.: um arquivo a abrir"),
        url: z.string().optional().describe("para abrir_url"),
        caminho: z.string().optional().describe("para abrir_pasta/abrir_arquivo"),
        confirmado: z.boolean().optional().describe("true só depois do usuário confirmar desligar/reiniciar"),
      },
    },
    async (args) => {
      try {
        const r = await executarNaMaquina(args);
        return texto(`${r.maquina}: ${r.texto}`, !r.ok);
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );
}
