// Comandos que a página pode mandar aos agentes (a lista é a mesma do app: app/comandos.py).

export const COMANDOS = [
  { acao: "abrir_explorer", titulo: "Abrir o Explorer (gerenciador de arquivos)", param: "caminho", dica: "Pasta (opcional, ex.: C:\\Users)", obrigatorio: false, confirmar: false },
  { acao: "abrir_programa", titulo: "Abrir um programa cadastrado no agente", param: "nome", dica: "Nome do programa (ex.: bloco de notas)", obrigatorio: true, confirmar: false },
  { acao: "abrir_url", titulo: "Abrir um site no navegador", param: "url", dica: "Site (ex.: www.gmail.com)", obrigatorio: true, confirmar: false },
  { acao: "bloquear_tela", titulo: "Bloquear a tela", param: null, confirmar: false },
  { acao: "info_sistema", titulo: "Informações do sistema (CPU, memória, disco)", param: null, confirmar: false },
  { acao: "desligar", titulo: "Desligar a máquina (em 10 s)", param: null, confirmar: true },
  { acao: "reiniciar", titulo: "Reiniciar a máquina (em 10 s)", param: null, confirmar: true },
];

// Cada clique gera um comando novo, com id único e horário de agora.
export function montar(acao, parametros) {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const ts = Date.now();
  return { id, cmd: { acao, parametros, ts } };
}
