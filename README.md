# Automacao IOT Amaury

Liga o Claude aos ESPs do Firebase Realtime Database (`amauryesp-active`). Você dá nomes aos pinos numa página
("luz frente") e depois pede ao Claude em conversa normal: *"liga a luz da frente de casa"*.

```
Claude ──► /mcp (token) ──► esta ponte ──► Firebase esps/<nome>/pinos/<gpio>/estado ──► ESP obedece (consulta a cada 1 s)
Você   ──► /  (senha)   ──► painel: palavras salvas em esps/<nome>/palavras/<gpio>
```

- `src/servidor.js` painel + MCP remoto (Render). `src/mcp.js` MCP local por stdio. `src/ferramentas.js` as ferramentas.
- `aplicacao_esp_python/` projeto completo do programa que grava o ESP (PyQt6 + PlatformIO), com o código dos firmwares em `firmware/`. O `.exe` do Windows fica em Releases.
- `DocumentacaoTecnica/ManualNovosDispositivos.md` passo a passo para configurar um ESP novo.
- `firmware_esp/Automacao` cópia de referência do firmware do ESP.
- O banco só libera o caminho `esps` (regras abertas, sem login). Por isso as palavras ficam dentro do próprio ESP.

## Subir no Render
1. Criar o repositório (privado) no GitHub e dar `git push`.
2. Render → New → Blueprint → escolher o repositório (`render.yaml` já configura tudo).
3. Em Environment do serviço, copiar `PAINEL_SENHA` e `MCP_TOKEN` (gerados sozinhos).
4. Abrir `https://<servico>.onrender.com/` (usuário qualquer, senha = `PAINEL_SENHA`) e preencher as palavras de cada pino. Salvar.

## Ligar ao Claude
- **claude.ai** (Configurações → Conectores → Adicionar conector personalizado): URL `https://<servico>.onrender.com/mcp/<MCP_TOKEN>`
- **Claude Code**: `claude mcp add --transport http casa https://<servico>.onrender.com/mcp --header "Authorization: Bearer <MCP_TOKEN>"`
- **Local, sem Render**: abrir esta pasta no Claude Code (o `.mcp.json` já registra `casa`).

O plano grátis do Render dorme após ~15 min sem uso: o primeiro pedido pode demorar uns 30 s.

## Local
`npm install`, depois `PAINEL_SENHA=x MCP_TOKEN=y npm start` e abrir http://localhost:3333.
