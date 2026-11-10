# Subir para o GitHub

Repositório: https://github.com/amaurysimoes/API_Conect_ESP_Claude · branch `main`.
Cada `git push` faz deploy no Render sozinho (1-3 min).

## Uma vez em cada máquina
- Linux: `git config --global core.autocrlf input`
- Windows: `git config --global core.autocrlf true`

## Sempre
```bash
cd ~/Dev_AHS/api_conect          # Windows: cd C:\Dev-AHS\api_conect
git pull                         # antes de mexer
git status                       # ver o que mudou
git add <arquivo1> <arquivo2>    # um por um, nunca git add -A
git commit -m "o que mudou"
git push origin main
```

## Nunca enviar
`.env`, `node_modules/`, `.venv/`, `dist/`, `dist/MCP_TOKEN.txt`, senhas e chaves.
