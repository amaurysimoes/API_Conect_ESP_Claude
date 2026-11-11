// Ferramentas do Claude para CLPs/equipamentos EtherNet/IP. instalarClp(server) é chamado UMA vez em iot_automacao_esp/ferramentas.js
// (depois de instalarGps, para herdar a dica do Render dormindo). Não altera nenhuma ferramenta existente.
import { z } from "zod";
import { MODOS, lerConfig, escolherMaquinaClp, comandoClp, paramsConexao, paramsEstado, lerEstado, bitLigado, acharPonto } from "./clp.js";

const texto = (t, erro = false) => ({ content: [{ type: "text", text: t }], isError: erro });
const AVISO = "Isto NÃO é dispositivo de segurança: emergência é sempre a física. O comando passa pela internet e leva ~1 a 4 s.";

export function instalarClp(server) {
  server.registerTool(
    "listar_clp",
    {
      description:
        "Mostra o CLP/equipamento EtherNet/IP ligado a uma máquina (aba Conexao Socket-TCP/IP): se está conectado e os pontos (bits) salvos, com nome, ação e estado ligado/desligado. " +
        "Use para 'o CLP está conectado?' ou 'quais bits do CLP?'. Sem 'maquina': usa a única com a conexão CLP ligada.",
      inputSchema: { maquina: z.string().optional().describe("nome da máquina") },
    },
    async ({ maquina }) => {
      try {
        const m = await escolherMaquinaClp(maquina);
        const cfg = await lerConfig(m);
        const e = await lerEstado(m, paramsEstado(cfg));
        const tcp = e.conectado ? e.protocolo === "tcp_ip" : cfg.protocolo === "tcp_ip";
        const pontos = Object.values(cfg.pontos).sort((a, b) => a.numero - b.numero);
        const linhas = pontos.map((p) => {
          const est = !e.conectado ? ""
            : tcp ? ` · memória ${bitLigado(e.memorias, p.numero, e.primeiro_bit) ? "LIGADA" : "desligada"}`
              : ` · saída do PC ${bitLigado(e.saida, p.numero, e.primeiro_bit) ? "LIGADA" : "desligada"} · vem do CLP ${bitLigado(e.entrada, p.numero, e.primeiro_bit) ? "LIGADO" : "desligado"}`;
          return `- ${tcp ? "memória M" : "bit "}${p.numero}${p.nome ? ` "${p.nome}"` : ""} (ação: ${p.modo}${p.modo === "pulso" ? ` ${p.pulso_ms} ms` : ""})${est}`;
        });
        return texto(`${m.maquina}: CLP ${cfg.ip || "(sem IP salvo)"} por ${tcp ? "TCP/IP (Modbus TCP)" : "EtherNet/IP"} · ${e.conectado ? "CONECTADO" : `desconectado${e.perdida ? ` (${e.perdida})` : ""}`}
` +
          (linhas.join("\n") || "Nenhum ponto salvo (o usuário cadastra na aba Conexao Socket-TCP/IP).") + `\n${AVISO}`);
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );

  server.registerTool(
    "conectar_clp",
    {
      description:
        "Conecta, desconecta ou identifica o CLP/equipamento EtherNet/IP usando o IP e os parâmetros salvos na aba Conexao Socket-TCP/IP. " +
        "'identificar' só pergunta quem é o equipamento (não abre conexão). Só um scanner por vez pode estar conectado ao equipamento.",
      inputSchema: {
        acao: z.enum(["conectar", "desconectar", "identificar"]).describe("o que fazer"),
        maquina: z.string().optional().describe("nome da máquina"),
      },
    },
    async ({ acao, maquina }) => {
      try {
        const m = await escolherMaquinaClp(maquina);
        const cfg = await lerConfig(m);
        const params = acao === "conectar" ? paramsConexao(cfg) : acao === "identificar" ? (cfg.protocolo === "tcp_ip" ? paramsConexao(cfg) : { ip: cfg.ip }) : {};
        if (acao === "identificar" && !cfg.ip) return texto("Falta o IP do CLP: o usuário salva na aba Conexao Socket-TCP/IP.", true);
        const r = await comandoClp(m, acao, params);
        return texto(`${m.maquina}: ${r.texto}`, !r.ok);
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );

  server.registerTool(
    "acionar_clp",
    {
      description:
        "Liga, desliga ou pulsa um bit (EtherNet/IP) ou uma MEMÓRIA M (TCP/IP) do CLP pelo NÚMERO (ex.: 512 ou 5) ou pelo NOME salvo (ex.: 'garra'). " +
        "Sem 'acao' usa a ação configurada para o bit (alternar, pulso, set=liga, reset=desliga). Se não estiver conectado, conecta sozinho com os dados salvos. " +
        "Se o nome combinar com mais de um bit, pergunte qual. " + AVISO,
      inputSchema: {
        ponto: z.string().describe("número do bit (512) ou nome salvo (garra)"),
        acao: z.enum(MODOS).optional().describe("alternar, pulso, set (liga) ou reset (desliga); sem isso usa a ação do bit"),
        pulso_ms: z.number().int().min(10).max(5000).optional().describe("duração do pulso em ms"),
        maquina: z.string().optional().describe("nome da máquina"),
      },
    },
    async ({ ponto, acao, pulso_ms, maquina }) => {
      try {
        const m = await escolherMaquinaClp(maquina);
        const cfg = await lerConfig(m);
        const p = acharPonto(cfg, ponto);
        let avisoConexao = "";
        if (!(await lerEstado(m, paramsEstado(cfg))).conectado) {
          const c = await comandoClp(m, "conectar", paramsConexao(cfg));
          if (!c.ok) return texto(`${m.maquina}: não consegui conectar ao CLP: ${c.texto}`, true);
          avisoConexao = "(conectou ao CLP primeiro) ";
        }
        const modo = acao ?? p.modo;
        const r = await comandoClp(m, "bit", { bit: p.numero, modo, ...(modo === "pulso" ? { pulso_ms: pulso_ms ?? p.pulso_ms } : {}) });
        return texto(`${m.maquina}: ${avisoConexao}${r.texto}${p.nome ? ` ("${p.nome}")` : ""}`, !r.ok);
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );
}
