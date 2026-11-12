# Trazer do GitHub (modo hard)

Deixa tudo exatamente igual ao GitHub. Mantém só o que está no `.gitignore` (`node_modules`, `.env`, `.venv`, `dist`).

```bash
git fetch origin
git reset --hard origin/main
git clean -fd
```
