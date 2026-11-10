# Gera dist\Windows\Render_Agente.exe (sem janela, com o ícone circuito-azul). Rodar no PowerShell, dentro desta pasta, com o .venv criado.
# Se o agente estiver rodando a partir de dist\Windows, feche-o antes (o Windows não deixa sobrescrever um .exe em uso).
$R = $PSScriptRoot
& "$R\.venv\Scripts\python.exe" -m pip install -q pyinstaller
& "$R\.venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean --onefile --noconsole --name Render_Agente `
  --hidden-import pystray._win32 `
  --icon "$R\icone.ico" --add-data "$R\icone.ico;." --add-data "$R\icone.png;." `
  --distpath "$R\dist\Windows" --workpath "$R\build\windows" --specpath "$R\build\windows" "$R\main.py"
