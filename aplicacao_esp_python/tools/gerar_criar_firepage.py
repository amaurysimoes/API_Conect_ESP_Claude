"""Regenera 1-#DocumentacaoTecnica/Criar_firepage.md: passo a passo para criar a página fire_page do zero,
com o código ATUAL de cada arquivo.

Uso (na raiz do projeto):  .venv\\Scripts\\python.exe tools\\gerar_criar_firepage.py
(o tools\\gerar_estrutura.py também chama este gerador).
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "1-#DocumentacaoTecnica" / "Criar_firepage.md"
PAGE = ROOT / "fire_page"

FILES = [
    ("package.json", "json", "Dependências e comandos (`npm run dev`, `npm run build`, `npm run preview`). `\"type\": \"module\"` é obrigatório."),
    ("vite.config.js", "javascript", "Configuração do Vite com o plugin do React."),
    ("index.html", "html", "Página base. O Vite injeta o código a partir de `/src/main.jsx`."),
    (".gitignore", "text", "Pastas que não se copiam nem se versionam."),
    ("src/firebase.js", "javascript", "Conexão com o Realtime Database. **Só a URL do banco**: nunca coloque chave/secret aqui (tudo que é publicado fica público)."),
    ("src/main.jsx", "jsx", "Ponto de entrada: monta o `App` na `div#root`."),
    ("src/comandos.js", "javascript", "Lista de comandos dos agentes e a assinatura HMAC-SHA256 no navegador (idêntica à do agente e do app)."),
    ("src/Brokers.jsx", "jsx", "Aba Brokers: lista os brokers cadastrados e o cardzinho de comandos (máquina, comando, EXECUTAR)."),
    ("src/topicos.js", "javascript", "GERADO a partir de app/info_card.py (tools/gerar_topicos_site.py): o conteúdo do card de Informações."),
    ("src/Informacoes.jsx", "jsx", "Página Informações: card azul neon com o que cada coisa é e como usar (X volta ao Início)."),
    ("src/util.js", "javascript", "Regra de online/offline (renovou o sinal há menos de 30 s), usada pelas páginas."),
    ("src/App.jsx", "jsx", "Casca do site: cabeçalho, tema e navegação entre as páginas (#/automacao, #/brokers)."),
    ("src/Inicio.jsx", "jsx", "Página Início: cartões grandes para entrar na Automação e nos Brokers."),
    ("src/Automacao.jsx", "jsx", "Página Automação: lista de ESPs e botões Ligar/Pulso dos pinos (grava em esps/<nome>/pinos/<gpio>)."),
    ("src/styles.css", "css", "Visual igual ao app Python: Dark/Light, mesmos backgrounds, responsivo."),
    ("firebase.json", "json", "Diz ao Firebase Hosting o que publicar: a pasta `dist`, como página única (todas as rotas vão para `index.html`) e em qual site."),
    (".firebaserc", "json", "Liga esta pasta ao projeto Firebase `amauryesp-active`."),
]

HEAD = """# Criar a página fire_page do zero

Passo a passo de como a `fire_page` foi criada (Vite + React + Firebase), para refazer em qualquer máquina.
Gerado por `tools/gerar_criar_firepage.py` com o código atual dos arquivos
(`.venv\\Scripts\\python.exe tools\\gerar_criar_firepage.py`). Para **publicar** a página, veja `Publicar_firepage.md`.

**Regras:** use o PowerShell, e rode os comandos `npm` **dentro de `fire_page`** (a raiz do projeto é Python e não
tem `package.json`). Não foi usado `npm create vite`: os arquivos foram escritos à mão, exatamente como abaixo.

## O que é

Uma página web que monitora e aciona os ESPs pelo Realtime Database
`https://amauryesp-active-default-rtdb.firebaseio.com`. Estrutura no banco:

```
esps/<nome do ESP>/modelo
esps/<nome do ESP>/pinos/<gpio>/nome
esps/<nome do ESP>/pinos/<gpio>/tipo      (saida | entrada, gravado pelo ESP)
esps/<nome do ESP>/pinos/<gpio>/estado    (true = ON, false = OFF)
esps/<nome do ESP>/vcc                    (tensão de alimentação, gravada pelo ESP)
```

A página recusa os GPIO reservados: 21/22 (display OLED, sagrado), 1/3 (serial USB) e 6 a 11 (flash).

## Passo 1 — Requisitos

- Node.js 20 ou mais novo (https://nodejs.org). Confira: `node -v` e `npm -v`.
- Para publicar: `npm install -g firebase-tools` (veja `Publicar_firepage.md`).

## Passo 2 — Criar a pasta e as subpastas

```powershell
cd C:\\Dev-AHS\\AUTOMACAO_IOT
mkdir fire_page
cd fire_page
mkdir src
mkdir public
```

## Passo 3 — Copiar as imagens para `public`

Os backgrounds e o ícone ficam em `public` para serem servidos como estão (a página os chama por `/nome`):

```powershell
Copy-Item ..\\assets\\background_iot.jpg public\\
Copy-Item ..\\assets\\background_iot_l.jpg public\\
Copy-Item ..\\assets\\icone_ia.png public\\
```

(`background_iot.jpg` = Dark, `background_iot_l.jpg` = Light, `icone_ia.png` = ícone da aba.)

## Passo 4 — Criar os arquivos

Crie cada arquivo abaixo, dentro de `fire_page`, com exatamente este conteúdo.

"""

TAIL = """
## Passo 5 — Instalar as dependências

Dentro de `fire_page`:

```powershell
npm install
```

Cria `node_modules` (não se copia para outra máquina) e o `package-lock.json`.

## Passo 6 — Testar no computador

```powershell
npm run dev
```

Abra `http://localhost:5173`. O topo deve mostrar **"Firebase conectado"** (precisa das regras do banco
publicadas: veja `Publicar_firepage.md`, seção 1.5). Pare com Ctrl+C.

## Passo 7 — Gerar a versão final (cria a pasta `dist`)

```powershell
npm run build
```

Tem que terminar com `✓ built in ...`. A `dist` é o que vai para o Firebase; ela é apagada e refeita a cada build e
**nunca é editada à mão**.

## Passo 8 — Ligar ao Firebase Hosting e publicar

Os arquivos `firebase.json` e `.firebaserc` (Passo 4) já fazem a ligação com o projeto `amauryesp-active` e o site
`amauryesp-active`. Falta só entrar na conta e publicar:

```powershell
firebase login --reauth
firebase deploy --only hosting
```

Endereço final: **https://amauryesp-active.web.app**. Detalhes e problemas comuns: `Publicar_firepage.md`.
(A pasta `.firebase` que aparece depois do deploy é só cache do Firebase: não se cria nem se copia.)

## Como deve ficar a pasta no final

```
fire_page/
├── .firebase/        (cache do deploy, criada sozinha)
├── .firebaserc
├── .gitignore
├── dist/             (criada por npm run build)
├── firebase.json
├── index.html
├── node_modules/     (criada por npm install)
├── package.json
├── package-lock.json (criado por npm install)
├── vite.config.js
├── public/           (background_iot.jpg, background_iot_l.jpg, icone_ia.png)
└── src/              (App.jsx, firebase.js, main.jsx, styles.css)
```
"""


def main():
    parts = [HEAD]
    for rel, lang, desc in FILES:
        path = PAGE / rel
        code = path.read_text(encoding="utf-8").rstrip("\n") if path.exists() else "(arquivo não encontrado)"
        parts.append(f"### `fire_page/{rel}`\n\n{desc}\n\n```{lang}\n{code}\n```\n\n")
    parts.append(TAIL)
    OUT.write_text("".join(parts), encoding="utf-8")
    print(f"Gerado: {OUT}")


if __name__ == "__main__":
    main()
