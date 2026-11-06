# Publicar a página (fire_page) no Firebase

Endereço: **https://amauryesp-active.web.app**

Tudo no PowerShell, **dentro da pasta `fire_page`**.

## Deploy (primeira vez em uma máquina)

1. Instalar o Node.js 20+ (https://nodejs.org), fechar e abrir o PowerShell.
2. Instalar a ferramenta do Firebase:
   ```powershell
   npm install -g firebase-tools
   ```
3. Entrar na conta Google dona do projeto (abre o navegador):
   ```powershell
   firebase logout
   firebase login --reauth
   ```
4. Ir para a pasta da página e instalar as dependências:
   ```powershell
   cd C:\Dev-AHS\AUTOMACAO_IOT\fire_page
   npm install
   ```
5. Gerar a pasta `dist`:
   ```powershell
   npm run build
   ```
6. Publicar:
   ```powershell
   firebase deploy --only hosting
   ```
   No final aparece `Hosting URL: https://amauryesp-active.web.app`.

(`firebase.json` e `.firebaserc` já vêm na pasta `fire_page` e apontam para o projeto/site `amauryesp-active`.
Não precisa rodar `firebase init`.)

Regra do banco (console do Firebase → Realtime Database → Regras → Publicar):
```json
{
  "rules": {
    "esps": {
      ".read": true,
      ".write": true,
      "$nome": { ".indexOn": ["modelo"] }
    }
  }
}
```

---

## Atualizar projeto:

Tem que estar aqui:
C:\AUTOMACAO-IOT-fire_page>

Depois de mudar algo em `fire_page\src` (ou `public`), pelo console:

```powershell
cd C:\Dev-AHS\AUTOMACAO_IOT\fire_page
npm run build
firebase deploy --only hosting
```

Depois abra https://amauryesp-active.web.app e atualize com **Ctrl+F5**.

Se der erro de login (`Failed to list Firebase projects` ou `Invalid refresh token`):
```powershell
firebase logout
firebase login --reauth
```
e rode o `deploy` de novo.
