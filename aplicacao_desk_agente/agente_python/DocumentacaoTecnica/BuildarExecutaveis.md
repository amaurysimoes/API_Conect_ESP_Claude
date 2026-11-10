# Buildar executáveis do agente (Windows e Linux)

Pasta: `aplicacao_desk_agente/agente_python`. Saída: `dist/Windows/Render_Agente.exe` e `dist/Linux/Render_Agente`.
`dist/`, `build/` e `.venv/` não vão para o git.

## Ícone (obrigatório em todo executável)
1. O original é `img/circuito-azul.svg`, e dele saem `img/icone.png` e `img/icone.ico`.
2. Copiar os dois para esta pasta (devem ficar iguais aos de `img/`):
   - Linux: `cp ../../img/icone.png ../../img/icone.ico .`
   - Windows: `copy ..\..\img\icone.png . ; copy ..\..\img\icone.ico .`
3. Conferir no Linux: `cmp icone.png ../../img/icone.png && cmp icone.ico ../../img/icone.ico && echo ok`
4. Uso no build:
   - Windows: `--icon icone.ico` é o ícone do `.exe`, e `--add-data` leva `icone.png`/`icone.ico` para a bandeja.
   - Linux: `--add-data` leva o `icone.png` para a bandeja. Binário Linux não tem ícone embutido.
5. Bandeja: o circuito com um ponto verde (conectado) ou vermelho (sem conexão), feito em `main.py`.

## Windows (`.exe`)
Rodar no PowerShell, dentro desta pasta.
1. Fechar o `Render_Agente.exe` se ele estiver rodando de `dist\Windows` (o Windows não deixa sobrescrever).
2. Criar a `.venv` (1ª vez nesta máquina):
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```
3. Compilar:
   ```powershell
   .\build_windows.ps1
   ```
4. Sai em `dist\Windows\Render_Agente.exe` (sem janela de console, com o ícone).

## Linux (binário)
Rodar no Linux ou no WSL. O script cria um ambiente próprio, sem usar a `.venv`.
1. Compilar:
   ```bash
   bash build_linux.sh
   ```
2. Se aparecer "Faltam pacotes": rodar o `sudo apt install ...` que ele mostrar e repetir o passo 1.
3. Sai em `dist/Linux/Render_Agente` (já executável).
4. Testar (opcional): `python3 teste_linux.py`.

### Compatibilidade (glibc)
- O binário só roda em Linux com glibc igual ou mais nova que a da máquina onde foi compilado. Ver com `ldd --version`.
- Ubuntu 22.04 = 2.35 · 24.04 = 2.39 · 20.04 = 2.31.
- Compilar na distro mais antiga que se quer atender. No Windows, pelo WSL:
  ```powershell
  wsl -d Ubuntu-22.04 -- bash /mnt/c/Dev-AHS/api_conect/aplicacao_desk_agente/agente_python/build_linux.sh
  ```

## Cuidados
- `.venv` é por sistema: a do Windows não roda no Linux, e vice-versa. Trocou de máquina, cria de novo.
- `dist/MCP_TOKEN.txt` é do usuário: não abrir e não commitar.
- Não rodar dois agentes com a mesma máquina e o mesmo broker ao mesmo tempo.
