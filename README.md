# Automacao IOT Amaury

Claude liga ESPs, abre programas no PC e apps no celular, e traça rotas. Tudo pelo Firebase Realtime Database `amauryesp-active`.

```
Claude ──► /mcp (token) ──► ponte (Render) ──► Firebase ──► ESP32 · agente do PC · app Android
Você   ──► painel (senha) ──► nomes dos pinos, endereços, atalhos
```

| Pasta | O que é |
|---|---|
| `src/` | ponte: painel + MCP |
| `gps_amaury/` | rotas, endereços, GPS |
| `aplicacao_desk_agente/` | agente do PC (Windows/Linux) + aba Desk |
| `aplicacao_android/` | `api_conect.apk` |
| `aplicacao_clp/` | aba Conexao Socket-TCP/IP (CLP EtherNet/IP) |
| `aplicacao_esp_python/` | programa de carga do ESP e firmware |
| `DocumentacaoTecnica/` | manuais |

## Rodar local
```powershell
copy .env.example .env      # PAINEL_SENHA e MCP_TOKEN
npm install
npm run local               # http://localhost:3333
```

## Render
`DocumentacaoTecnica/CriarServico_bluePrint.md`

## Claude
- claude.ai → Conectores → URL `https://<servico>.onrender.com/mcp/<MCP_TOKEN>`
- Claude Code: `claude mcp add --transport http casa https://<servico>.onrender.com/mcp --header "Authorization: Bearer <MCP_TOKEN>"`

## Manuais
`EstruturaSistema.md` · `ManualNovosDispositivos.md` · `ProjetosAmaury_Adicionado.md` · `CriacaoAppAndroid.md` · `PullGit_trazerGit.md` · `PushGit_enviarGit.md`
