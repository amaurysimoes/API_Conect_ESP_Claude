# Criar o agente do PC (Render_Agente)

Pasta: `aplicacao_desk_agente/agente_python`. Cada sistema compila o seu: Windows no Windows, Linux no Linux.

## No Linux → `dist/Linux/Render_Agente`
```bash
cd ~/Dev_AHS/api_conect/aplicacao_desk_agente/agente_python
pkill -f Render_Agente
bash build_linux.sh
./dist/Linux/Render_Agente &
```
- Faltou pacote: rode o `sudo apt install ...` que ele mostrar e repita o `bash build_linux.sh`.
- Só roda em Linux com glibc igual ou mais nova que a desta máquina (`ldd --version`).

## No Windows → `dist\Windows\Render_Agente.exe`
Feche o agente antes (o Windows não deixa sobrescrever o `.exe` em uso).
```powershell
cd C:\Dev-AHS\api_conect\aplicacao_desk_agente\agente_python
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\build_windows.ps1
```
A `.venv` só precisa ser criada uma vez em cada máquina.

## Ícone
`icone.png` e `icone.ico` da pasta = cópia de `img/`. Se mudar o ícone: `cp ../../img/icone.png ../../img/icone.ico .`

## Cuidados
- `dist/` não vai para o git: o executável fica só na máquina.
- `dist/MCP_TOKEN.txt` é seu: não abrir nem enviar.
