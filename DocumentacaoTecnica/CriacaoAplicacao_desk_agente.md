# Build do Render_Agente

Script: `C:\Dev_AHS\api_conect\aplicacao_desk_agente\agente_python\build_windows.ps1`
Feche o agente antes. Rode de qualquer pasta no PowerShell.

## Windows → `agente_python\dist\Windows\Render_Agente.exe`
```powershell
C:\Dev_AHS\api_conect\aplicacao_desk_agente\agente_python\build_windows.ps1
```
Se entrou na pasta nível a nível (`cd`), use `.\` na frente:
```powershell
cd C:\Dev_AHS\api_conect\aplicacao_desk_agente\agente_python
.\build_windows.ps1
```

## Linux → `agente_python\dist\Linux\Render_Agente`
```powershell
wsl -d Ubuntu -u root -- bash /mnt/c/Dev_AHS/api_conect/aplicacao_desk_agente/agente_python/build_linux.sh
```

## Erro `No Python at ...`
```powershell
cd C:\Dev_AHS\api_conect\aplicacao_desk_agente\agente_python
Remove-Item -Recurse -Force .venv
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```
