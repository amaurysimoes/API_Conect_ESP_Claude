# Criar o agente do PC (Render_Agente)

Pasta: `aplicacao_desk_agente/agente_python`. Saída: `dist\Windows\Render_Agente.exe` e `dist\Linux\Render_Agente`.

## Neste PC (Windows) — as duas versões
Feche o agente antes (o Windows não deixa sobrescrever o `.exe` em uso).

1ª vez, ou se der `No Python at ...` (a `.venv` veio de outro PC; apague a pasta `.venv` antes):
```powershell
cd C:\Dev_AHS\api_conect\aplicacao_desk_agente\agente_python
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Windows → `dist\Windows\Render_Agente.exe`:
```powershell
cd C:\Dev_AHS\api_conect\aplicacao_desk_agente\agente_python
.\build_windows.ps1
```

Linux → `dist\Linux\Render_Agente` (pelo WSL):
```powershell
wsl -d Ubuntu -u root -- bash /mnt/c/Dev_AHS/api_conect/aplicacao_desk_agente/agente_python/build_linux.sh
```
- Terminou certo quando aparece `LINUX_FIM`.
- Sem WSL: `wsl --install -d Ubuntu` e reinicie o PC.
- O binário só roda em Linux com glibc igual ou mais nova que a do WSL (`wsl -d Ubuntu -- ldd --version`).

## Num PC Linux → `dist/Linux/Render_Agente`
```bash
cd ~/Dev_AHS/api_conect/aplicacao_desk_agente/agente_python
pkill -f Render_Agente
bash build_linux.sh
./dist/Linux/Render_Agente &
```
- Faltou pacote: rode o `sudo apt install ...` que ele mostrar e repita o `bash build_linux.sh`.

## Ícone
Os dois builds copiam sozinhos `api_conect/img/icone.ico` e `icone.png`.
- Windows: o `.exe` sai com o `icone.ico`.
- Linux: o binário não leva ícone dentro. O build cria o atalho **Render Agente** no menu de aplicativos, com o ícone.

## Cuidados
- `dist/` não vai para o git: o executável fica só na máquina.
- `dist/MCP_TOKEN.txt` é seu: não abrir nem enviar.
