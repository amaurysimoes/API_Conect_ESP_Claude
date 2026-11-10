# Buildar executáveis do agente

Pasta: `aplicacao_desk_agente/agente_python`.

## Ícone
`icone.png` e `icone.ico` desta pasta = cópia de `img/` (original `img/circuito-azul.svg`).
```bash
cp ../../img/icone.png ../../img/icone.ico .
```

## Windows
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\build_windows.ps1
```
Sai em `dist\Windows\Render_Agente.exe`. Feche o agente antes.

## Linux
```bash
bash build_linux.sh
```
Sai em `dist/Linux/Render_Agente`. Faltou pacote: rode o `sudo apt install` que ele mostrar.
Só roda em Linux com glibc igual ou mais nova (`ldd --version`): compile na distro mais antiga.
