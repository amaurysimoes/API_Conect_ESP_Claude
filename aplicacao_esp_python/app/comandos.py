"""Comandos que a página e o app podem mandar aos agentes (a lista é a mesma da página: fire_page/src/comandos.js)."""
import time
import uuid

# acao, título na lista, parâmetro (nome do campo ou None), dica do campo, pede confirmação?
COMANDOS = [
    {"acao": "abrir_explorer", "titulo": "Abrir o Explorer (gerenciador de arquivos)", "param": "caminho",
     "dica": "Pasta (opcional, ex.: C:\\Users)", "obrigatorio": False, "confirmar": False},
    {"acao": "abrir_programa", "titulo": "Abrir um programa cadastrado no agente", "param": "nome",
     "dica": "Nome do programa (ex.: bloco de notas)", "obrigatorio": True, "confirmar": False},
    {"acao": "abrir_url", "titulo": "Abrir um site no navegador", "param": "url",
     "dica": "Site (ex.: www.gmail.com)", "obrigatorio": True, "confirmar": False},
    {"acao": "bloquear_tela", "titulo": "Bloquear a tela", "param": None, "confirmar": False},
    {"acao": "info_sistema", "titulo": "Informações do sistema (CPU, memória, disco)", "param": None, "confirmar": False},
    {"acao": "desligar", "titulo": "Desligar a máquina (em 10 s)", "param": None, "confirmar": True},
    {"acao": "reiniciar", "titulo": "Reiniciar a máquina (em 10 s)", "param": None, "confirmar": True},
]


def montar(acao, parametros):
    """(id, comando pronto para gravar no Firebase). Cada clique gera um comando novo, com id único."""
    id_ = uuid.uuid4().hex[:12]
    ts = int(time.time() * 1000)
    return id_, {"acao": acao, "parametros": parametros, "ts": ts}
