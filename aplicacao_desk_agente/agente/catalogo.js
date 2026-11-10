// Os 20 programas da aba Desk-Automacao_Firebase. "alvo" é o que o Windows abre (nome do exe, ou protocolo como ms-settings:);
// "processo" é o nome para fechar. Qualquer outro programa também funciona: é só dizer o nome ou o caminho completo.
export const PROGRAMAS = [
  { id: "word", nome: "Word", alvo: "winword", processo: "winword.exe", apelidos: ["word", "winword", "documento"] },
  { id: "excel", nome: "Excel", alvo: "excel", processo: "excel.exe", apelidos: ["excel", "planilha", "planilhas"] },
  { id: "powerpoint", nome: "PowerPoint", alvo: "powerpnt", processo: "powerpnt.exe", apelidos: ["powerpoint", "power point", "apresentação", "slides"] },
  { id: "outlook", nome: "Outlook", alvo: "outlook", processo: "outlook.exe", apelidos: ["outlook", "e-mail", "email"] },
  { id: "onenote", nome: "OneNote", alvo: "onenote", processo: "onenote.exe", apelidos: ["onenote", "one note", "anotações"] },
  { id: "chrome", nome: "Chrome", alvo: "chrome", processo: "chrome.exe", apelidos: ["chrome", "google chrome"] },
  { id: "edge", nome: "Edge", alvo: "msedge", processo: "msedge.exe", apelidos: ["edge", "microsoft edge"] },
  { id: "firefox", nome: "Firefox", alvo: "firefox", processo: "firefox.exe", apelidos: ["firefox"] },
  { id: "bloco", nome: "Bloco de Notas", alvo: "notepad", processo: "notepad.exe", apelidos: ["bloco de notas", "notepad"] },
  { id: "calculadora", nome: "Calculadora", alvo: "calc", processo: "calculatorapp.exe", apelidos: ["calculadora", "calc"] },
  { id: "paint", nome: "Paint", alvo: "mspaint", processo: "mspaint.exe", apelidos: ["paint", "mspaint"] },
  { id: "explorador", nome: "Explorador de Arquivos", alvo: "explorer", processo: null, apelidos: ["explorador", "explorer", "explorador de arquivos"] },
  { id: "tarefas", nome: "Gerenciador de Tarefas", alvo: "taskmgr", processo: "taskmgr.exe", apelidos: ["gerenciador de tarefas", "taskmgr"] },
  { id: "painel", nome: "Painel de Controle", alvo: "control", processo: null, apelidos: ["painel de controle"] },
  { id: "configuracoes", nome: "Configurações", alvo: "ms-settings:", processo: "systemsettings.exe", apelidos: ["configurações", "configuracoes", "ajustes"] },
  { id: "vscode", nome: "VS Code", alvo: "code", processo: "code.exe", apelidos: ["vs code", "vscode", "visual studio code"] },
  { id: "teams", nome: "Teams", alvo: "ms-teams:", processo: "ms-teams.exe", apelidos: ["teams", "microsoft teams"] },
  { id: "spotify", nome: "Spotify", alvo: "spotify", processo: "spotify.exe", apelidos: ["spotify", "música", "musica"] },
  { id: "terminal", nome: "Terminal do Windows", alvo: "wt", processo: "windowsterminal.exe", apelidos: ["terminal", "terminal do windows"] },
  { id: "captura", nome: "Ferramenta de Captura", alvo: "snippingtool", processo: "snippingtool.exe", apelidos: ["captura", "ferramenta de captura", "print"] },
];

const normalizar = (t) => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// "abre o excel" -> excel; "chrome" -> chrome; "C:\\Apps\\x.exe" ou "notepad++" (desconhecido) -> usa do jeito que veio.
export function resolverPrograma(texto) {
  const t = normalizar(texto);
  let melhor = null, tam = 0;
  for (const p of PROGRAMAS) {
    for (const nome of [p.id, p.nome, ...p.apelidos]) {
      const n = normalizar(nome);
      if (n.length > tam && new RegExp(String.raw`(^|\s)${escapar(n)}([\s.,!?;:]|$)`).test(t)) { melhor = p; tam = n.length; }
    }
  }
  if (melhor) return { alvo: melhor.alvo, processo: melhor.processo, nome: melhor.nome };
  const livre = String(texto).trim();
  return { alvo: livre, processo: /\.exe$/i.test(livre) ? livre.split(/[\\/]/).pop() : `${livre}.exe`, nome: livre };
}

// Cards de ação da aba Desk. "id" é a ação que o agente executa; a página só mostra o que o agente da máquina diz suportar.
export const ACOES_CARDS = [
  { id: "info", nome: "Informações", grupo: "Sistema", dica: "CPU, memória, disco e tempo ligado" },
  { id: "bloquear_tela", nome: "Bloquear tela", grupo: "Sistema", dica: "Bloqueia o Windows" },
  { id: "desligar", nome: "Desligar", grupo: "Sistema", perigosa: true, confirmar: "Desligar a máquina em 10 segundos?" },
  { id: "reiniciar", nome: "Reiniciar", grupo: "Sistema", perigosa: true, confirmar: "Reiniciar a máquina em 10 segundos?" },
  { id: "cancelar_desligamento", nome: "Cancelar desligamento", grupo: "Sistema", dica: "Cancela desligar/reiniciar em andamento" },
  { id: "abrir_url", nome: "Abrir site", grupo: "Abrir", botao: "Abrir", campos: [{ nome: "url", rotulo: "endereço do site", exemplo: "www.google.com" }] },
  { id: "abrir_pasta", nome: "Abrir pasta", grupo: "Abrir", botao: "Abrir", campos: [{ nome: "caminho", rotulo: "caminho da pasta", exemplo: "C:\Users" }] },
  { id: "abrir_arquivo", nome: "Abrir arquivo", grupo: "Abrir", botao: "Abrir", campos: [{ nome: "caminho", rotulo: "caminho do arquivo", exemplo: "C:\Docs\relatorio.xlsx" }] },
  { id: "abrir_programa", nome: "Abrir qualquer programa", grupo: "Abrir", botao: "Abrir", campos: [{ nome: "programa", rotulo: "nome ou caminho do .exe", exemplo: "winword" }, { nome: "argumentos", rotulo: "argumentos (opcional)", opcional: true }] },
  { id: "fechar_programa", nome: "Fechar programa", grupo: "Abrir", botao: "Fechar", campos: [{ nome: "programa", rotulo: "nome do programa", exemplo: "excel" }] },
];
