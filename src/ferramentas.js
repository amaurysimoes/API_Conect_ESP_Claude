// As ferramentas que o Claude enxerga (usadas pelo MCP local via stdio e pelo MCP remoto via HTTP).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listarEsps, acionar } from "./firebase.js";
import { mapaDe, achar } from "./mapa.js";

const texto = (t, erro = false) => ({ content: [{ type: "text", text: t }], isError: erro });

export function criarServidorMcp() {
  const server = new McpServer({ name: "automacao-iot-amaury", version: "0.2.0" });

  server.registerTool(
    "listar_dispositivos",
    {
      description:
        "Lista os ESPs da casa, se estão online e seus pinos de saída (luzes, relés) com o estado atual e as palavras que o usuário cadastrou para cada um (ex.: 'luz frente').",
    },
    async () => {
      const esps = await listarEsps();
      const saida = esps.map((e) => ({
        esp: e.nome,
        online: e.online,
        visto_ha_s: e.visto_ha_s,
        pinos: e.pinos
          .filter((p) => p.tipo === "saida")
          .map((p) => ({ pino: p.gpio, ligado: p.estado, palavras: e.palavras[p.gpio] ?? [] })),
      }));
      return texto(JSON.stringify(saida, null, 2));
    }
  );

  server.registerTool(
    "acionar",
    {
      description:
        "Liga, desliga ou dá um pulso (~1 s) em um pino de saída. Use 'descricao' com o que o usuário falou (ex.: 'luz da frente'); " +
        "a ponte acha o pino pelas palavras cadastradas. Só use 'esp'+'pino' se o usuário citar o número. " +
        "Se houver mais de um ESP e o usuário não disser qual, a resposta pede o dispositivo: pergunte \"Qual dispositivo você quer acionar?\" citando os nomes (ex.: FIRE_AHS01?), e repita o pedido com 'esp' preenchido. " +
        "Se a descrição não bater com nenhum pino, ou bater com vários, a resposta diz isso: pergunte ao usuário, não adivinhe.",
      inputSchema: {
        acao: z.enum(["ligar", "desligar", "pulso"]).describe("ligar, desligar ou pulso (aperta e solta, ex.: portão)"),
        descricao: z.string().optional().describe("o que o usuário pediu, ex.: 'luz da frente'"),
        esp: z.string().optional().describe("nome do ESP, ex.: FIRE_AHS01 (só com 'pino')"),
        pino: z.number().int().optional().describe("número do GPIO (só com 'esp')"),
      },
    },
    async ({ acao, descricao, esp, pino }) => {
      const esps = await listarEsps();
      let alvoEsp = esp, alvoPino = pino;
      const nomes = esps.map((e) => e.nome).join(", ");
      const perguntaDispositivo = (motivo) =>
        texto(`${motivo} Há ${esps.length} dispositivos: ${nomes}. Pergunte ao usuário: "Qual dispositivo você quer acionar?" citando os nomes, e repita o pedido informando 'esp'.`, true);
      const limpa = (t) => String(t).toLowerCase().replace(/[^a-z0-9]/g, "");

      if (descricao) {
        // Se o usuário citou o nome de um ESP na frase ("... no FIRE_AHS02"), só vale esse ESP.
        const citados = esps.filter((e) => limpa(descricao).includes(limpa(e.nome)));
        const permitidos = alvoEsp ? [alvoEsp] : citados.length ? citados.map((e) => e.nome) : esps.map((e) => e.nome);
        const mapa = Object.fromEntries(Object.entries(mapaDe(esps)).filter(([n]) => permitidos.includes(n)));
        const achados = achar(mapa, descricao);
        if (achados.length === 0) {
          const dica = esps.length > 1 && !citados.length && !alvoEsp
            ? perguntaDispositivo(`Nenhum pino cadastrado combina com "${descricao}" (ou o dispositivo não ficou claro).`)
            : texto(`Nenhum pino cadastrado combina com "${descricao}". Use listar_dispositivos e confirme com o usuário qual é, ou peça para ele cadastrar as palavras no painel.`, true);
          return dica;
        }
        if (achados.length > 1) {
          const esDiferentes = new Set(achados.map((a) => a.esp)).size > 1;
          if (esDiferentes) return perguntaDispositivo(`"${descricao}" existe em mais de um dispositivo.`);
          return texto(`"${descricao}" combina com mais de um pino (${achados.map((a) => `pino ${a.gpio}`).join("; ")}) do ${achados[0].esp}. Pergunte ao usuário qual deles.`, true);
        }
        ({ esp: alvoEsp, gpio: alvoPino } = achados[0]);
      }
      if (!alvoEsp && esps.length === 1) alvoEsp = esps[0].nome; // só um ESP: não precisa perguntar
      if (!alvoEsp && alvoPino !== undefined) return perguntaDispositivo(`Faltou dizer de qual dispositivo é o pino ${alvoPino}.`);
      if (!alvoEsp || alvoPino === undefined) return texto("Informe 'descricao' ou então 'esp' e 'pino'.", true);

      const dispositivo = esps.find((e) => e.nome === alvoEsp);
      if (!dispositivo) return texto(`ESP "${alvoEsp}" não existe no Firebase.`, true);
      const p = dispositivo.pinos.find((x) => x.gpio === alvoPino);
      if (!p) return texto(`O ESP ${alvoEsp} não cadastrou o pino ${alvoPino}.`, true);
      if (p.tipo !== "saida") return texto(`O pino ${alvoPino} é uma entrada (switch), não dá para acionar.`, true);

      await acionar(alvoEsp, alvoPino, acao);

      const sinal = dispositivo.online
        ? `O ESP está online (último sinal há ${dispositivo.visto_ha_s}s) e aplica em até ~1 s.`
        : `ATENÇÃO: o ESP parece OFFLINE (último sinal há ${dispositivo.visto_ha_s ?? "?"}s). O comando ficou gravado e só vale quando ele voltar. Avise o usuário.`;
      return texto(`Comando "${acao}" gravado para ${alvoEsp} pino ${alvoPino} (${p.nome}). ${sinal}`);
    }
  );

  return server;
}
