# AUTOMACAO_IOT-AHS — leia antes de qualquer coisa

Este projeto tem memória própria nos documentos abaixo. **Antes de responder ou mexer em qualquer coisa, leia os dois inteiros:**

1. `1-#DocumentacaoTecnica/Preferencias_projeto.md` — tudo o que o usuário pediu e prefere, regras permanentes, estado atual, pendências e histórico cronológico.
2. `1-#DocumentacaoTecnica/Estrutura_projeto.md` — passo a passo para recriar o projeto (o que instalar, estrutura, como rodar), SEM o código dos arquivos. As últimas linhas explicam como gerar os executáveis (Windows e Linux).

Regras que valem em TODO pedido (detalhes no Preferencias):
- Atualizar os dois documentos sozinho a cada pedido/ajuste (`Estrutura_projeto.md` é gerado: `.venv\Scripts\python.exe tools\gerar_estrutura.py`).
- Manter também `1-#DocumentacaoTecnica/Publicar_firepage.md` (passo a passo de publicar a página fire_page) sempre atualizado.
- `1-#DocumentacaoTecnica/Criar_firepage.md` (criar a fire_page do zero) é gerado junto com o Estrutura_projeto.md pelo mesmo comando; regenerar a cada mudança em `fire_page/`.
- Sempre gerar os DOIS executáveis (Windows e Linux, o Linux via WSL `Ubuntu-24.04`) a cada atualização do app.
- Revisar e compilar o firmware (`firmware/Repetidor/src/repetidor.cpp`) a cada mudança; deixá-lo sem bug.
- Fazer só o que for pedido; o usuário vai traçando os planos aos poucos.
- Responder primeiro a pergunta feita. Ser direto. Não afirmar que testou o que não testou.
- **Salvar o estado a cada passo concluído** na seção "ESTADO ATUAL" do `Preferencias_projeto.md` (para retomar se o console fechar) e manter os passo a passo (`Estrutura_projeto.md`, `Criar_firepage.md`, `Publicar_firepage.md`) sempre atualizados, para o usuário conseguir refazer o projeto em etapas.
- Manter tudo SIMPLES (preferência do usuário): sem enfeites, sem exigências desnecessárias; nomes de arquivos compatíveis com o que fazem.
- **Card de Informações = SEMPRE o último card** (menu Informações do programa e último cartão do Início do site) e SEMPRE atualizado: a cada função nova, editar `TOPICOS` em `app/info_card.py` (rodar `tools/gerar_estrutura.py` gera o `fire_page/src/topicos.js`), publicar o site e regerar os executáveis.
