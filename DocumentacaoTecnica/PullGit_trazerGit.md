# Trazer do GitHub

## Normal (preserva o que você mudou)

Traz as novidades e mantém suas alterações locais.

```bash
git pull origin main
```

Se reclamar de alterações locais que conflitam:

```bash
git stash
git pull origin main
git stash pop
```

## Hard

Deixa tudo exatamente igual ao GitHub. Mantém só o que está no `.gitignore` (`node_modules`, `.env`, `.venv`, `dist`).

```bash
git fetch origin
git reset --hard origin/main
git clean -fd
```
