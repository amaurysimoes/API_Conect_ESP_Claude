# Gera dist\AgenteLeve.exe (sem janela). Rodar no PowerShell, dentro desta pasta, com o .venv criado.
$R = $PSScriptRoot
& "$R\.venv\Scripts\python.exe" -m pip install -q pyinstaller
& "$R\.venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean --onefile --noconsole --name AgenteLeve `
  --hidden-import pystray._win32 `
  --icon "$R\icone.ico" --add-data "$R\icone.ico;." --add-data "$R\icone.png;." `
  --distpath "$R\dist" --workpath "$R\build" --specpath "$R\build" "$R\main.py"
