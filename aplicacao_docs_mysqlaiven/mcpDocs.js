// Ferramentas do Claude para os documentos do Aiven. instalarDocs(server) é chamado UMA vez em iot_automacao_esp/ferramentas.js.
// Não altera nenhuma ferramenta existente. A IA só LÊ e transfere; excluir é só na aba /docs (com a senha do painel).
import { z } from "zod";
import { listarDocumentos, lerDocumento, buscarDocumentos, validarNome } from "./documentos.js";
import { criarTrabalho, aguardar, descartar, urlPublica } from "./trabalhos.js";
import { listarMaquinas, enviarComando } from "../aplicacao_desk_agente/agente/maquinas.js";

const texto = (t, erro = false) => ({ content: [{ type: "text", text: t }], isError: erro });
const kb = (n) => (n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const temDocs = (m) => Array.isArray(m.acoes) && m.acoes.includes("docs_enviar");

async function escolherMaquina(nome) {
  const todas = await listarMaquinas();
  if (!todas.length) throw new Error("Nenhuma máquina cadastrada no Firebase.");
  if (nome) {
    const m = todas.filter((x) => x.maquina.toLowerCase() === String(nome).toLowerCase());
    if (m.length !== 1) throw new Error(`Máquina "${nome}" ${m.length ? "existe em mais de um broker" : "não encontrada"}. Máquinas: ${todas.map((x) => x.maquina).join(", ")}.`);
    return m[0];
  }
  const prontas = todas.filter((x) => x.online && temDocs(x));
  if (prontas.length === 1) return prontas[0];
  if (prontas.length > 1) throw new Error(`Há ${prontas.length} máquinas com agente de documentos: ${prontas.map((x) => x.maquina).join(", ")}. Pergunte ao usuário: "Qual máquina?".`);
  throw new Error("Nenhuma máquina ativa tem o agente com suporte a documentos (agente antigo ou desligado). O usuário precisa trocar o Render_Agente.exe pelo novo e abri-lo.");
}

// Manda o comando ao agente e espera o trabalho terminar (o agente faz a transferência em segundo plano)
async function viaAgente(m, acao, params, tipo, dados) {
  const base = urlPublica();
  if (!base) throw new Error("O servidor não sabe o próprio endereço: defina DOCS_URL_PUBLICA (no Render o RENDER_EXTERNAL_URL já vem pronto).");
  if (!m.online) throw new Error(`A máquina ${m.maquina} está offline.`);
  if (!temDocs(m)) throw new Error(`O agente da máquina ${m.maquina} não suporta documentos: troque o Render_Agente.exe pelo novo.`);
  const token = criarTrabalho(tipo, dados);
  try {
    const r = await enviarComando(m, acao, { url: base, token, ...params });
    if (!r.ok) return { ok: false, texto: r.texto };
    const fim = await aguardar(token);
    if (fim.estado === "ok") return { ok: true, texto: fim.texto };
    if (fim.estado === "erro") return { ok: false, texto: fim.texto };
    return { ok: true, texto: "Ainda transferindo (arquivo grande ou servidor lento). Confira depois em listar_documentos." };
  } finally { setTimeout(() => descartar(token), 60000); }
}

export function instalarDocs(server) {
  server.registerTool(
    "listar_documentos",
    {
      description: "Lista os documentos guardados no banco Aiven (aba Documentos Database): qualquer tipo (planilhas, Word, PDF, etc.), com tamanho e nº de imagens. " +
        "Use para 'quais documentos eu tenho?'. 'extensao' filtra por tipo.",
      inputSchema: { extensao: z.string().optional().describe("filtra por tipo, sem ponto: xls, xlsx, doc, docx, pdf…") },
    },
    async ({ extensao }) => {
      try {
        const d = await listarDocumentos(extensao);
        return texto(d.length ? d.map((x) => `- ${x.nome} (.${x.extensao}, ${kb(x.tamanho)}, ${x.imagens} imagem(ns)${x.completo ? "" : ", ENVIO INCOMPLETO"})`).join("\n") : "Nenhum documento encontrado.");
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );

  server.registerTool(
    "ler_documento",
    {
      description: "Lê o TEXTO de um documento do banco Aiven (xlsx/xls/doc/docx/pdf/txt/csv…; planilha: linhas por aba no formato 'L12: A=..| B=..'; Word: parágrafos). " +
        "Informe o nome exato (veja listar_documentos). Imagens não são lidas.",
      inputSchema: {
        nome: z.string().describe("nome do arquivo, ex.: 'Relatorio.xlsx'"),
        limite: z.number().int().min(500).max(100000).optional().describe("máximo de caracteres (padrão 20000)"),
      },
    },
    async ({ nome, limite }) => {
      try {
        const r = await lerDocumento(nome, limite ?? 20000);
        return texto(`${nome}${r.truncado ? ` (primeiros ${r.texto.length} de ${r.total} caracteres)` : ""}\n\n${r.texto}`);
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );

  server.registerTool(
    "buscar_documento",
    {
      description: "Procura um termo (sem diferenciar maiúsculas/acentos) no texto dos documentos do banco Aiven e mostra as linhas encontradas. Filtre por 'extensao' para ser mais rápido.",
      inputSchema: { termo: z.string(), extensao: z.string().optional() },
    },
    async ({ termo, extensao }) => {
      try {
        const r = await buscarDocumentos(termo, extensao);
        return texto(r.achados.length ? r.achados.map((a) => `${a.documento}\n${a.trechos.map((t) => "  " + t).join("\n")}`).join("\n\n") : `Nada encontrado em ${r.verificados} documento(s).`);
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );

  server.registerTool(
    "enviar_documento_da_maquina",
    {
      description: "Envia para o banco Aiven um arquivo qualquer (documento, planilha, PDF, imagem…; não programas) que está no PC do usuário (máquina com o agente). Informe o caminho completo, ex.: C:\\Users\\...\\Relatorio.xlsx. " +
        "Se já existir um com o mesmo nome, substitui. Planilhas com muitas imagens demoram (compactação).",
      inputSchema: { caminho: z.string().describe("caminho completo do arquivo no PC"), maquina: z.string().optional() },
    },
    async ({ caminho, maquina }) => {
      try {
        validarNome(caminho.split(/[\\/]/).pop());
        const m = await escolherMaquina(maquina);
        const r = await viaAgente(m, "docs_enviar", { caminho }, "enviar");
        return texto(`${m.maquina}: ${r.texto}`, !r.ok);
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );

  server.registerTool(
    "baixar_documento_para_maquina",
    {
      description: "Baixa um documento do banco Aiven para o PC do usuário (máquina com o agente), remontando o arquivo original com as imagens. Sem 'pasta' salva em Downloads.",
      inputSchema: { nome: z.string(), maquina: z.string().optional(), pasta: z.string().optional().describe("pasta de destino no PC") },
    },
    async ({ nome, maquina, pasta }) => {
      try {
        const m = await escolherMaquina(maquina);
        const r = await viaAgente(m, "docs_baixar", { nome, ...(pasta ? { pasta } : {}) }, "baixar", { nome });
        return texto(`${m.maquina}: ${r.texto}`, !r.ok);
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );

  server.registerTool(
    "abrir_documento_na_maquina",
    {
      description: "Abre um documento do banco Aiven NO PC do usuário (máquina com o agente) com o programa padrão do tipo: .xlsx/.xls no Excel, .docx/.doc no Word, .pdf no leitor de PDF, etc. " +
        "O agente baixa o arquivo para uma pasta temporária e abre na frente. Use para 'abre o relatório X'.",
      inputSchema: { nome: z.string().describe("nome do arquivo (veja listar_documentos)"), maquina: z.string().optional() },
    },
    async ({ nome, maquina }) => {
      try {
        const m = await escolherMaquina(maquina);
        const r = await viaAgente(m, "docs_abrir", { nome }, "baixar", { nome });
        return texto(`${m.maquina}: ${r.texto}`, !r.ok);
      } catch (e) { return texto(String(e.message || e), true); }
    }
  );
}
