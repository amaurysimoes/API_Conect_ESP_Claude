# Subir para o GitHub

## Normal
```bash
git pull
git add .
git commit -m "Update"
git push
```

## Modo hard (o GitHub fica exatamente igual a esta máquina)
Apaga no GitHub o que não estiver aqui, inclusive o que outra máquina enviou.
```bash
git add -A
git commit -m "Update"
git push --force origin main
```

O `.gitignore` já impede `.env`, `node_modules`, `.venv` e `dist`.
