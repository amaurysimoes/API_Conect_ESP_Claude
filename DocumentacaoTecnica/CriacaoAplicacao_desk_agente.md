# Build do Render_Agente

Feche o agente antes.

```powershell
cd C:\Dev_AHS\api_conect\aplicacao_desk_agente\agente_python
```

## Windows → `dist\Windows\Render_Agente.exe`
```powershell
.\build_windows.ps1
```

## Linux → `dist\Linux\Render_Agente`
```powershell
wsl -d Ubuntu -u root -- bash /mnt/c/Dev_AHS/api_conect/aplicacao_desk_agente/agente_python/build_linux.sh
```

## Erro `No Python at ...`
```powershell
Remove-Item -Recurse -Force .venv
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```
