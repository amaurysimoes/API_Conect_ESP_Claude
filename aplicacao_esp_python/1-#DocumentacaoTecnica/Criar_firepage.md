# Criar a página fire_page do zero

Passo a passo de como a `fire_page` foi criada (Vite + React + Firebase), para refazer em qualquer máquina.
Gerado por `tools/gerar_criar_firepage.py` com o código atual dos arquivos
(`.venv\Scripts\python.exe tools\gerar_criar_firepage.py`). Para **publicar** a página, veja `Publicar_firepage.md`.

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
cd C:\Dev-AHS\AUTOMACAO_IOT
mkdir fire_page
cd fire_page
mkdir src
mkdir public
```

## Passo 3 — Copiar as imagens para `public`

Os backgrounds e o ícone ficam em `public` para serem servidos como estão (a página os chama por `/nome`):

```powershell
Copy-Item ..\assets\background_iot.jpg public\
Copy-Item ..\assets\background_iot_l.jpg public\
Copy-Item ..\assets\icone_ia.png public\
```

(`background_iot.jpg` = Dark, `background_iot_l.jpg` = Light, `icone_ia.png` = ícone da aba.)

## Passo 4 — Criar os arquivos

Crie cada arquivo abaixo, dentro de `fire_page`, com exatamente este conteúdo.

### `fire_page/package.json`

Dependências e comandos (`npm run dev`, `npm run build`, `npm run preview`). `"type": "module"` é obrigatório.

```json
{
  "name": "fire-page",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "firebase": "^11.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.0"
  }
}
```

### `fire_page/vite.config.js`

Configuração do Vite com o plugin do React.

```javascript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
```

### `fire_page/index.html`

Página base. O Vite injeta o código a partir de `/src/main.jsx`.

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/x-icon" href="/icone_ia.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AUTOMACAO_IOT-AHS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

### `fire_page/.gitignore`

Pastas que não se copiam nem se versionam.

```text
node_modules
dist
.firebase
```

### `fire_page/src/firebase.js`

Conexão com o Realtime Database. **Só a URL do banco**: nunca coloque chave/secret aqui (tudo que é publicado fica público).

```javascript
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Só a URL do banco: a regra atual não exige login. NÃO colocar a chave/secret do banco aqui:
// tudo que fica nesta página é público.
const app = initializeApp({ databaseURL: "https://amauryesp-active-default-rtdb.firebaseio.com" });
export const db = getDatabase(app);
```

### `fire_page/src/main.jsx`

Ponto de entrada: monta o `App` na `div#root`.

```jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);
```

### `fire_page/src/comandos.js`

Lista de comandos dos agentes e a assinatura HMAC-SHA256 no navegador (idêntica à do agente e do app).

```javascript
// Comandos que a página pode mandar aos agentes (a lista é a mesma do app: app/comandos.py).

export const COMANDOS = [
  { acao: "abrir_explorer", titulo: "Abrir o Explorer (gerenciador de arquivos)", param: "caminho", dica: "Pasta (opcional, ex.: C:\\Users)", obrigatorio: false, confirmar: false },
  { acao: "abrir_programa", titulo: "Abrir um programa cadastrado no agente", param: "nome", dica: "Nome do programa (ex.: bloco de notas)", obrigatorio: true, confirmar: false },
  { acao: "abrir_url", titulo: "Abrir um site no navegador", param: "url", dica: "Site (ex.: www.gmail.com)", obrigatorio: true, confirmar: false },
  { acao: "bloquear_tela", titulo: "Bloquear a tela", param: null, confirmar: false },
  { acao: "info_sistema", titulo: "Informações do sistema (CPU, memória, disco)", param: null, confirmar: false },
  { acao: "desligar", titulo: "Desligar a máquina (em 10 s)", param: null, confirmar: true },
  { acao: "reiniciar", titulo: "Reiniciar a máquina (em 10 s)", param: null, confirmar: true },
];

// Cada clique gera um comando novo, com id único e horário de agora.
export function montar(acao, parametros) {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const ts = Date.now();
  return { id, cmd: { acao, parametros, ts } };
}
```

### `fire_page/src/Brokers.jsx`

Aba Brokers: lista os brokers cadastrados e o cardzinho de comandos (máquina, comando, EXECUTAR).

```jsx
import { useEffect, useRef, useState } from "react";
import { onValue, ref, set } from "firebase/database";
import { db } from "./firebase";
import { COMANDOS, montar } from "./comandos";

const ONLINE_MS = 30000;   // quem renova o sinal a cada 10 s e passa de 30 s sem sinal está offline
const ESPERA_MS = 20000;   // quanto tempo espera o resultado do agente

// Lista os brokers cadastrados (Firebase "fire" e MQTT da rede). Clicar num broker abre o cardzinho de comandos.
// Os comandos vão SEMPRE pelo Firebase: para um broker MQTT quem entrega à rede local é o app (Broker MQTT IOT).
export default function Brokers() {
  const [brokers, setBrokers] = useState({});
  const [agora, setAgora] = useState(Date.now());
  const [aberto, setAberto] = useState(null);

  useEffect(() => {
    const off = onValue(ref(db, "brokers"), (s) => setBrokers(s.val() || {}));
    const t = setInterval(() => setAgora(Date.now()), 5000);
    return () => { off(); clearInterval(t); };
  }, []);

  // Broker online = o cadastro dele está ativo (app aberto) OU alguma máquina dele (agente) está online.
  const maquinaOnline = (b) => Object.values(b.maquinas || {}).some(
    (m) => m?.status?.online === true && typeof m.status.visto_em === "number" && agora - m.status.visto_em < ONLINE_MS);
  const online = (b) => (b.ativo !== false && typeof b.visto_em === "number" && agora - b.visto_em < ONLINE_MS) || maquinaOnline(b);
  const nomes = Object.keys(brokers).filter((n) => brokers[n] && typeof brokers[n] === "object").sort();

  // Dois grupos: quem é quem. Firebase = a máquina fala pela INTERNET (pode estar em qualquer rede).
  // MQTT = a máquina precisa estar na REDE LOCAL do broker (o app Broker MQTT IOT entrega o comando a ela).
  const grupos = [
    { tipo: "fire", titulo: "Broker Firebase", sub: "internet — a máquina pode estar em qualquer rede", vazio: "Nenhum broker Firebase. Ative um em Broker IOT → Broker Fire IOT (app)." },
    { tipo: "mqtt", titulo: "Broker MQTT", sub: "rede local — a máquina precisa estar na mesma rede do broker", vazio: "Nenhum broker MQTT. Ative um em Broker IOT → Broker MQTT IOT (app)." },
  ];

  return (
    <section className="card">
      <div className="head">
        <h2>Brokers IOT</h2>
      </div>
      <p className="muted">Clique num broker para enviar comandos às máquinas dele.</p>
      {grupos.map((g) => {
        const doGrupo = nomes.filter((n) => brokers[n].tipo === g.tipo);
        return (
          <div key={g.tipo} className="grupo">
            <h3>{g.titulo} <span className="muted">· {g.sub}</span></h3>
            <ul className="list">
              {doGrupo.length === 0 && <li className="muted">{g.vazio}</li>}
              {doGrupo.map((n) => {
                const b = brokers[n];
                const on = online(b);
                return (
                  <li key={n} className="click" onClick={() => setAberto(n)}>
                    <span><span className={`dot ${on ? "on" : "off"}`} /> <b>{n}</b></span>
                    <span className="muted">{b.ip || "—"} · {on ? "online" : "offline"}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {aberto && brokers[aberto] && (
        <CardComandos nome={aberto} broker={brokers[aberto]} brokerOnline={online(brokers[aberto])} onFechar={() => setAberto(null)} />
      )}
    </section>
  );
}

function CardComandos({ nome, broker, brokerOnline, onFechar }) {
  const [maquinas, setMaquinas] = useState({});
  const [agora, setAgora] = useState(Date.now());
  const [maquina, setMaquina] = useState("");
  const [idx, setIdx] = useState(0);
  const [valor, setValor] = useState("");
  const [confirma, setConfirma] = useState(false);
  const [resultado, setResultado] = useState(null); // { texto, tipo: "ok" | "erro" | "aviso" }
  const [aguardando, setAguardando] = useState(false);
  const parar = useRef(null);

  const cmd = COMANDOS[idx];

  useEffect(() => {
    const off = onValue(ref(db, `brokers/${nome}/maquinas`), (s) => setMaquinas(s.val() || {}));
    const t = setInterval(() => setAgora(Date.now()), 5000);
    return () => { off(); clearInterval(t); if (parar.current) parar.current(); };
  }, [nome]);

  const nomesMaq = Object.keys(maquinas).sort();
  useEffect(() => {
    if (!maquina && nomesMaq.length) setMaquina(nomesMaq[0]);
  }, [nomesMaq.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const maqOnline = (m) => {
    const st = maquinas[m]?.status;
    return st?.online === true && typeof st.visto_em === "number" && agora - st.visto_em < ONLINE_MS;
  };

  const trocar = (i) => { setIdx(i); setValor(""); setConfirma(false); setResultado(null); };

  async function executar() {
    if (aguardando) return;
    if (!maquina) return setResultado({ texto: "Escolha uma máquina.", tipo: "aviso" });
    if (cmd.param && cmd.obrigatorio && !valor.trim()) return setResultado({ texto: "Preencha o campo do comando.", tipo: "aviso" });
    if (cmd.confirmar && !confirma) return setResultado({ texto: "Marque a confirmação para desligar/reiniciar.", tipo: "aviso" });
    const params = {};
    if (cmd.param && valor.trim()) params[cmd.param] = valor.trim();
    if (cmd.confirmar) params.confirmado = true;

    setAguardando(true); // um clique = um comando: só libera quando o resultado chegar (ou o tempo acabar)
    setResultado({ texto: "Enviando o comando...", tipo: "aviso" });
    try {
      const { id, cmd: comando } = montar(cmd.acao, params);
      const base = `brokers/${nome}/maquinas/${maquina}`;
      await set(ref(db, `${base}/comandos/${id}`), comando);
      setResultado({ texto: "Enviado. Esperando o agente executar...", tipo: "aviso" });
      const fim = () => { if (parar.current) { parar.current(); parar.current = null; } setAguardando(false); };
      const off = onValue(ref(db, `${base}/resultado/${id}`), (s) => {
        const r = s.val();
        if (!r) return;
        setResultado({ texto: (r.ok ? "✔ " : "✖ ") + (r.mensagem || ""), tipo: r.ok ? "ok" : "erro" });
        fim();
      });
      const tempo = setTimeout(() => {
        setResultado({ texto: "Sem resposta do agente (ele está ligado e observando este broker?).", tipo: "aviso" });
        fim();
      }, ESPERA_MS);
      parar.current = () => { off(); clearTimeout(tempo); };
    } catch (e) {
      setResultado({ texto: "✖ " + (e.message || e), tipo: "erro" });
      setAguardando(false);
    }
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <h2>Comandos — {nome} <span className="muted">· {broker.tipo === "mqtt" ? "MQTT (rede local)" : "Firebase (internet)"}</span></h2>
          <button className="off" onClick={onFechar}>✕</button>
        </div>
        {broker.tipo === "mqtt" && !brokerOnline && (
          <p className="aviso">Este broker MQTT está offline: o app (Broker MQTT IOT) precisa estar ativo na rede para entregar os comandos.</p>
        )}

        <label>Máquina</label>
        <select value={maquina} onChange={(e) => setMaquina(e.target.value)}>
          {nomesMaq.length === 0 && <option value="">Nenhuma máquina neste broker ainda</option>}
          {nomesMaq.map((m) => (
            <option key={m} value={m}>{maqOnline(m) ? "●" : "○"} {m} ({maqOnline(m) ? "online" : "offline"})</option>
          ))}
        </select>

        <label>Comando</label>
        <select value={idx} onChange={(e) => trocar(Number(e.target.value))}>
          {COMANDOS.map((c, i) => <option key={c.acao} value={i}>{c.titulo}</option>)}
        </select>

        {cmd.param && <input placeholder={cmd.dica} value={valor} onChange={(e) => setValor(e.target.value)} />}
        {cmd.confirmar && (
          <label className="check"><input type="checkbox" checked={confirma} onChange={(e) => setConfirma(e.target.checked)} /> Confirmo: esta ação desliga/reinicia a máquina</label>
        )}

        {resultado && <p className={`resultado ${resultado.tipo}`}>{resultado.texto}</p>}
        <button className="success wide" disabled={aguardando} onClick={executar}>{aguardando ? "AGUARDANDO..." : "EXECUTAR"}</button>
      </div>
    </div>
  );
}
```

### `fire_page/src/topicos.js`

GERADO a partir de app/info_card.py (tools/gerar_topicos_site.py): o conteúdo do card de Informações.

```javascript
// GERADO por tools/gerar_topicos_site.py a partir de app/info_card.py: NÃO edite aqui.
// Para mudar o conteúdo do card de Informações, edite TOPICOS em app/info_card.py e gere de novo.
export const TOPICOS = [
  {
    "titulo": "1. Repetidor ESP32",
    "onde": "menu Arquivo → Automação ESP_Firebase → Repetidor ESP32",
    "que": "Transforma um ESP32 num repetidor de Wi-Fi e conversa com ele pela USB.",
    "serve": "Ampliar uma rede e dar internet a outros aparelhos. O ESP continua repetindo sozinho, sem o PC: se for desligado e ligado numa fonte externa, volta com a última rede (só não volta se você apertar PARAR). O LED azul da placa pisca enquanto está conectado.",
    "usar": [
      "Ligue o ESP32 na USB, escolha a porta e clique em CONECTAR.",
      "Clique em ESCANEAR e escolha a rede na lista (ou digite o nome). Marque Comum ou Corporativa (EAP, que pede usuário).",
      "Preencha a senha e clique em ATIVAR REPETIDOR. O Wi-Fi novo se chama <i>REDE + REPET</i>.",
      "PARAR REPETIDOR desliga. Placa vazia? Use ⚡ Gravar firmware (.cpp)."
    ]
  },
  {
    "titulo": "2. Painel do repetidor (dashboard)",
    "onde": "no próprio ESP, pelo navegador",
    "que": "Uma página que o ESP32 mostra enquanto está repetindo.",
    "serve": "Ver quantos aparelhos estão conectados e se está tudo funcionando: lista dos aparelhos (MAC, IP e sinal), internet (DNS, conexão e NAT), rede de origem (sinal, canal, IP), quedas e o motivo da última, tempo ligado, motivo do último reinício (energia, travou, queda de tensão), memória, temperatura e versão.",
    "usar": [
      "Com o repetidor ativo, conecte no Wi-Fi <i>REDE + REPET</i> e abra http://192.168.4.1/ (se a rede de origem usar 192.168.4.x, o endereço é http://192.168.77.1/).",
      "Ou, de qualquer aparelho na rede de origem, abra http://IP_DO_ESP/ (o IP aparece no display e no log do app).",
      "A página atualiza sozinha a cada 2 s. Não tem senha: quem estiver na rede consegue abrir.",
      "Só funciona depois de ATIVAR REPETIDOR."
    ]
  },
  {
    "titulo": "3. Automação FireBase",
    "onde": "menu Arquivo → Automação ESP_Firebase → Automação Firebase",
    "que": "Configura e grava, num ESP32, o firmware que liga o ESP ao Firebase.",
    "serve": "Acionar pinos (ligar/desligar e pulso), ler chaves (switch) e medir a tensão de alimentação pelo site, de qualquer lugar. O display do ESP mostra o último pino acionado.",
    "usar": [
      "Conecte o ESP32 e escolha a porta.",
      "Informe o nome do ESP, o modelo, o Wi-Fi e a senha. Marque se a placa tem display.",
      "Monte a lista de pinos: + ADICIONAR PINO ou TODOS OS PINOS LIVRES. Cada pino é Saída (ON/OFF) ou Entrada (switch).",
      "Clique em ⚡ Gravar no ESP. Ao ligar, o ESP aparece sozinho no site, na página Automação.",
      "Arquivo → Editar Automações ESP: escolha um arquivo do firmware (abre na pasta firmware; se não achar, em C:\\) e edite o código (o texto aparece com cores e números de linha, como no VS Code). SALVAR grava no arquivo; CANCELAR fecha sem gravar o que não foi salvo.",
      "Arquivo → Nova Automação ESP_Firebase: reservado, em branco por enquanto."
    ]
  },
  {
    "titulo": "4. Site",
    "onde": "https://amauryesp-active.web.app",
    "que": "Página na internet com o Início e as páginas Automação, Brokers IOT, Gerenciar Brokers IOT e Informações do Sistema.",
    "serve": "Acionar os ESPs e mandar comandos às máquinas sem abrir este programa, de qualquer lugar.",
    "usar": [
      "Automação: clique num ESP online e use Ligar ou Pulso em cada pino.",
      "Brokers IOT: dois grupos. <b>Broker Firebase</b> (internet: a máquina pode estar em qualquer rede) e <b>Broker MQTT</b> (rede local: a máquina precisa estar na mesma rede do broker). Clique num broker, escolha a máquina e o comando e clique em EXECUTAR. O broker aparece online quando está ativo ou quando alguma máquina dele está online.",
      "Gerenciar Brokers IOT: veja todos os brokers criados e apague os que não quer mais (dois cliques).",
      "Informações do Sistema: este mesmo guia, sempre como o último card.",
      "Para atualizar o site depois de mudar algo: veja o passo a passo Publicar_firepage.md."
    ]
  },
  {
    "titulo": "5. Automação IOT Site",
    "onde": "menu Automação IOT Site → Site Gerenciamento IOT e Listar Real Time Database",
    "que": "O mesmo site, aberto dentro deste programa, e a lista do banco de dados em tempo real.",
    "serve": "Usar o site sem abrir o navegador e ver o que está gravado no Firebase.",
    "usar": [
      "Os dois abrem como um card sobre a janela principal (como este); cada um fecha só no seu X.",
      "Site Gerenciamento IOT: abre o site aqui dentro. Use Recarregar para atualizar ou Abrir no navegador para abrir fora do programa.",
      "Listar Real Time Database: mostra o conteúdo do banco (esps e brokers, os nós que as regras liberam) com visual de editor de código e atualiza sozinho, na hora que algo muda."
    ]
  },
  {
    "titulo": "6. Broker MQTT IOT",
    "onde": "menu Broker IOT → Broker MQTT IOT",
    "que": "Um broker MQTT que roda dentro deste programa, para a rede local.",
    "serve": "Máquinas da mesma rede (ou sem internet) recebem comandos direto. Ele também entrega ao MQTT os comandos que o site manda pelo Firebase: por isso precisa ficar ativo na rede.",
    "usar": [
      "Informe o nome, a porta (padrão 1883), o usuário e a senha das máquinas.",
      "Clique em ATIVAR BROKER MQTT e deixe o programa aberto. Se o Windows perguntar do Firewall, permita redes privadas.",
      "A lista mostra as máquinas conectadas. PARAR BROKER MQTT desliga."
    ]
  },
  {
    "titulo": "7. Broker Fire IOT",
    "onde": "menu Broker IOT → Broker Fire IOT",
    "que": "Cadastra este computador como broker no Firebase e lista os brokers Firebase, os da internet (online/offline). Os brokers MQTT, da rede local, ficam no Broker MQTT IOT e no site.",
    "serve": "Mandar comandos às máquinas por qualquer rede, pela internet.",
    "usar": [
      "Dê um nome e clique em ATIVAR BROKER FIRE.",
      "Clique num broker da lista: abre o card de comandos.",
      "Escolha a máquina e o comando e clique em EXECUTAR. Um clique é um comando, executado uma vez."
    ]
  },
  {
    "titulo": "8. Gerenciar IOT Broker",
    "onde": "menu Broker IOT → Gerenciar IOT Broker (e no site: Gerenciar Brokers IOT)",
    "que": "Lista todos os brokers criados, Firebase e MQTT.",
    "serve": "Ver o que existe, trocar o nome e apagar o que não precisa mais (com senha). Apagar remove o broker, as máquinas e a fila de comandos dele.",
    "usar": [
      "Abra o menu Broker IOT → Gerenciar IOT Broker. A lista mostra o tipo (Firebase ou MQTT), o IP, quantas máquinas e se está online.",
      "EDITAR NOME (botão azul): troca o nome do broker. Depois, escolha o nome novo no agente e no app.",
      "APAGAR BROKER (botão vermelho): só apaga se você digitar a senha no campo \"Senha para apagar\".",
      "No site é igual: Gerenciar Brokers IOT, botões Editar e Apagar.",
      "Restos sem tipo aparecem como \"sem tipo (resto de máquina)\": são de uma máquina que ainda escreve ali; apague para limpar."
    ]
  },
  {
    "titulo": "9. Automação IOT Fire",
    "onde": "menu Broker IOT → Automação IOT Fire",
    "que": "Cria planos que o agente da máquina executa sozinho na hora marcada. Por enquanto: enviar e-mail. O plano fica salvo no Firebase.",
    "serve": "Mandar e-mails automáticos numa data e hora (uma vez, todo dia ou em dias da semana), com destinatários, título e texto à sua escolha.",
    "usar": [
      "Antes, no Agente IOT (canal Firebase), cadastre em \"Contas de e-mail\" o Gmail e a senha de app que vão enviar. Pode cadastrar várias contas; as senhas ficam só na máquina do agente e o agente precisa ficar ligado.",
      "Abra Automação IOT Fire, escolha o broker e a máquina, escolha a conta que envia, preencha nome, quando, destinatários, título e texto e clique em SALVAR PLANO.",
      "Clique num plano da lista para editar; ATIVAR / DESATIVAR e APAGAR PLANO ficam acima do formulário.",
      "A lista mostra o resultado da última execução (OK ou o erro). Máquina desligada: o e-mail sai se o atraso for de até 10 minutos; depois disso o horário é pulado."
    ]
  },
  {
    "titulo": "10. Agente IOT",
    "onde": "programa à parte: iot_FireMQtt_agente\\dist\\windows\\AgenteIOT.exe (Linux: dist/linux/AgenteIOT)",
    "que": "Programa instalado em cada máquina (Windows ou Linux) que será controlada.",
    "serve": "Executa o que chega do broker, só ações permitidas: abrir o Explorer (pasta opcional), abrir um programa cadastrado, abrir um site, bloquear a tela, informações do sistema, desligar e reiniciar (pedem confirmação). No canal Firebase também executa os planos da Automação IOT Fire (e-mails agendados).",
    "usar": [
      "Abra o agente, dê o nome da máquina e escolha o broker: Firebase ou MQTT. Clique em INICIAR AGENTE.",
      "Marque \"Iniciar sozinho\" para ele ligar junto com o programa.",
      "Depois de configurado, o agente abre escondido: só o ícone ao lado do relógio. Clique no ícone para abrir; ao minimizar, ele volta a se esconder. Botão direito no ícone: Abrir ou Sair (Sair para o agente).",
      "Sites: digite www.gmail.com e o https:// entra sozinho.",
      "No MQTT também vale texto simples, por exemplo: <i>explorer</i>, <i>info</i>, <i>bloquear</i>, <i>url www.site.com</i>.",
      "Cada comando executa uma vez; comando com mais de 30 s é ignorado.",
      "Linux: rode na sessão gráfica (precisa de libxcb-cursor0) e cadastre os programas permitidos no config.json.",
      "Passo a passo completo: Agente_IOT.md."
    ]
  },
  {
    "titulo": "11. Tema e documentos",
    "onde": "botão Light/Dark e pasta 1-#DocumentacaoTecnica",
    "que": "O botão do canto troca entre escuro e claro. A pasta de documentação guarda tudo o que foi feito.",
    "serve": "Consultar o histórico e refazer o projeto passo a passo.",
    "usar": [
      "Preferencias_projeto.md: histórico e onde estamos.",
      "Estrutura_projeto.md: o código de todos os arquivos.",
      "Criar_firepage.md, Publicar_firepage.md e Agente_IOT.md: site e agente."
    ]
  },
  {
    "titulo": "12. Informações do Sistema",
    "onde": "menu Informações do Sistema (programa) e último card do Início (site)",
    "que": "Este guia.",
    "serve": "Saber o que cada coisa é e como usar. Fica sempre como o último card do programa e do site, e é atualizado a cada função nova.",
    "usar": [
      "No programa, só fecha no X do card.",
      "No programa, todos os formulários abrem assim, como card dentro da janela principal, um por vez: abrir outro fecha o atual (os brokers e a gravação do firmware continuam rodando em segundo plano).",
      "No site, o X volta ao Início."
    ]
  }
];
```

### `fire_page/src/Informacoes.jsx`

Página Informações: card azul neon com o que cada coisa é e como usar (X volta ao Início).

```jsx
import { TOPICOS } from "./topicos";

// Informações: o que cada coisa é, para que serve e como usar. O conteúdo vem de topicos.js (gerado a partir do
// programa: app/info_card.py), então é sempre igual ao card de Informações do programa. O X volta ao Início.
export default function Informacoes({ ir }) {
  return (
    <section className="info-card">
      <div className="head">
        <h2>Informações do Sistema</h2>
        <button className="info-x" title="Fechar" onClick={() => ir("home")}>✕</button>
      </div>
      {TOPICOS.map((t) => (
        <div key={t.titulo} className="info-topico">
          <h3>{t.titulo}</h3>
          <div className="info-onde">{t.onde}</div>
          <p><b>O que é:</b> <span dangerouslySetInnerHTML={{ __html: t.que }} /></p>
          <p><b>Para que serve:</b> <span dangerouslySetInnerHTML={{ __html: t.serve }} /></p>
          <p><b>Como usar:</b></p>
          <ul>
            {t.usar.map((u, i) => <li key={i} dangerouslySetInnerHTML={{ __html: u }} />)}
          </ul>
        </div>
      ))}
    </section>
  );
}
```

### `fire_page/src/util.js`

Regra de online/offline (renovou o sinal há menos de 30 s), usada pelas páginas.

```javascript
// Online = renovou o "visto_em" há menos de 30 s (os ESPs e os brokers renovam a cada 10 s).
export const ONLINE_MS = 30000;
export const estaOnline = (item, agora) =>
  !!item && item.ativo !== false && typeof item.visto_em === "number" && agora - item.visto_em < ONLINE_MS;
```

### `fire_page/src/App.jsx`

Casca do site: cabeçalho, tema e navegação entre as páginas (#/automacao, #/brokers).

```jsx
import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "./firebase";
import Automacao from "./Automacao";
import Brokers from "./Brokers";
import GerenciarBrokers from "./GerenciarBrokers";
import Informacoes from "./Informacoes";
import Inicio from "./Inicio";

// Casca do site: cabeçalho, tema e navegação entre as páginas (Início, Automação, Brokers IOT, Gerenciar Brokers IOT, Informações).
// As páginas ficam no endereço (#/automacao, #/brokers): o botão voltar do navegador funciona e dá para guardar nos favoritos.
function lerHash() {
  const p = window.location.hash.replace("#/", "");
  return p === "automacao" || p === "brokers" || p === "gerenciar" || p === "informacoes" ? p : "home";
}
const ir = (p) => { window.location.hash = p === "home" ? "" : `#/${p}`; };

export default function App() {
  const [dark, setDark] = useState(true);
  const [conectado, setConectado] = useState(false);
  const [pagina, setPagina] = useState(lerHash()); // "home" | "automacao" | "brokers" | "gerenciar" | "informacoes"

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  useEffect(() => {
    const aoMudar = () => setPagina(lerHash());
    window.addEventListener("hashchange", aoMudar);
    const offCon = onValue(ref(db, ".info/connected"), (s) => setConectado(!!s.val()));
    return () => { window.removeEventListener("hashchange", aoMudar); offCon(); };
  }, []);

  return (
    <div className="app">
      <header className="bar">
        <span className="brand" onClick={() => ir("home")}><img src="/icone_ia.png" alt="" /> AUTOMACAO_IOT-AHS</span>
        {pagina !== "home" && <button className="link" onClick={() => ir("home")}>← Início</button>}
        <span className={`dot ${conectado ? "on" : "off"}`}>{conectado ? "Firebase conectado" : "Sem conexão"}</span>
        <button className="theme" onClick={() => setDark(!dark)}>{dark ? "☀  Light" : "☾  Dark"}</button>
      </header>
      <main className="page">
        {pagina === "automacao" ? <Automacao /> : pagina === "brokers" ? <Brokers /> : pagina === "gerenciar" ? <GerenciarBrokers /> : pagina === "informacoes" ? <Informacoes ir={ir} /> : <Inicio ir={ir} />}
      </main>
    </div>
  );
}
```

### `fire_page/src/Inicio.jsx`

Página Início: cartões grandes para entrar na Automação e nos Brokers.

```jsx
import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "./firebase";
import { estaOnline } from "./util";
import { IconeAutomacao, IconeGerenciar, IconeIot } from "./icones";
import { TOPICOS } from "./topicos";

// Início: as páginas do sistema, em cartões grandes. `ir` troca de página.
export default function Inicio({ ir }) {
  const [esps, setEsps] = useState({});
  const [brokers, setBrokers] = useState({});
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => {
    const offEsps = onValue(ref(db, "esps"), (s) => setEsps(s.val() || {}));
    const offBrokers = onValue(ref(db, "brokers"), (s) => setBrokers(s.val() || {}));
    const t = setInterval(() => setAgora(Date.now()), 5000);
    return () => { offEsps(); offBrokers(); clearInterval(t); };
  }, []);

  const nEsps = Object.keys(esps).length;
  const nEspsOn = Object.values(esps).filter((e) => estaOnline(e, agora)).length;
  const lista = Object.values(brokers).filter((b) => b && typeof b === "object" && b.tipo);
  const nFire = lista.filter((b) => b.tipo === "fire").length;
  const nMqtt = lista.filter((b) => b.tipo === "mqtt").length;

  return (
    <div className="home">
      <h2>O que você quer abrir?</h2>
      <div className="tiles">
        <button className="tile" onClick={() => ir("automacao")}>
          <span className="tile-icone"><IconeAutomacao /></span>
          <b>Automação</b>
          <span className="muted">Acionar os pinos dos ESPs</span>
          <span className="tile-info">{nEsps === 0 ? "nenhum ESP ainda" : `${nEspsOn} de ${nEsps} ESP online`}</span>
        </button>
        <button className="tile" onClick={() => ir("brokers")}>
          <span className="tile-icone"><IconeIot /></span>
          <b>Brokers IOT</b>
          <span className="muted">Mandar comandos às máquinas</span>
          <span className="tile-info">{nFire + nMqtt === 0 ? "nenhum broker ainda" : `${nFire} Firebase · ${nMqtt} MQTT`}</span>
        </button>
        <button className="tile" onClick={() => ir("gerenciar")}>
          <span className="tile-icone"><IconeGerenciar /></span>
          <b>Gerenciar Brokers IOT</b>
          <span className="muted">Ver os brokers criados e apagar</span>
          <span className="tile-info">{nFire + nMqtt} broker{nFire + nMqtt === 1 ? "" : "s"}</span>
        </button>
        {/* Regra: o card de Informações é SEMPRE o último. Funções novas entram ACIMA dele. */}
        <button className="tile tile-info-card" onClick={() => ir("informacoes")}>
          <span className="tile-icone"><img className="tile-img" src="/icone_ia.png" alt="" /></span>
          <b>Informações do Sistema</b>
          <span className="muted">O que cada coisa é e como usar</span>
          <span className="tile-info">{TOPICOS.length} tópicos</span>
        </button>
      </div>
    </div>
  );
}
```

### `fire_page/src/Automacao.jsx`

Página Automação: lista de ESPs e botões Ligar/Pulso dos pinos (grava em esps/<nome>/pinos/<gpio>).

```jsx
import { useEffect, useState } from "react";
import { get, onValue, ref, remove, update } from "firebase/database";
import { db } from "./firebase";
import { estaOnline } from "./util";

// Página Automação: lista os ESPs e aciona os pinos deles.
// Os ESPs e seus pinos NÃO são cadastrados aqui: o ESP se registra sozinho em esps/<nome> quando liga
// (firmware automacao_iot.cpp, gravado pelo form "Automação FireBase" do app). A página só lista e aciona.
export default function Automacao() {
  const [esps, setEsps] = useState({});
  const [sel, setSel] = useState(null); // null = status geral
  const [agora, setAgora] = useState(Date.now());
  const [erro, setErro] = useState("");

  useEffect(() => {
    const off = onValue(ref(db, "esps"), (s) => setEsps(s.val() || {}));
    const t = setInterval(() => setAgora(Date.now()), 5000);
    return () => { off(); clearInterval(t); };
  }, []);

  const nomes = Object.keys(esps).sort();
  const atual = sel && esps[sel] ? sel : null;
  const esp = atual ? esps[atual] : null;
  const pinos = esp?.pinos || {};
  const online = (e) => estaOnline(e, agora);
  useEffect(() => {
    if (atual && !online(esps[atual])) setSel(null); // o ESP aberto caiu: volta para a lista (onde ele aparece desabilitado)
  }, [agora, esps]); // eslint-disable-line react-hooks/exhaustive-deps

  const falha = (e) => setErro(e.message || String(e));
  const atualizar = () => get(ref(db, "esps")).then((s) => setEsps(s.val() || {})).catch(falha);
  const alternar = (g, estado) => update(ref(db, `esps/${atual}/pinos/${g}`), { estado: !estado }).catch(falha);
  const pulso = (g) => update(ref(db, `esps/${atual}/pinos/${g}`), { pulso: true }).catch(falha);

  return (
    <>
      {!atual ? (
        <section className="card">
          <div className="head">
            <h2>Automação — ESPs</h2>
            <button className="primary" onClick={atualizar}>Atualizar</button>
          </div>
          <ul className="list">
            {nomes.length === 0 && <li className="muted">Nenhum ESP ainda. Grave um pelo app (Automação FireBase).</li>}
            {nomes.map((n) => (
              <li key={n} className={online(esps[n]) ? "click" : "desativado"} onClick={() => online(esps[n]) && setSel(n)}>
                <span><span className={`dot ${online(esps[n]) ? "on" : "off"}`} /> <b>{n}</b></span>
                <span className="muted">{online(esps[n]) ? `${esps[n].ip || "—"} · ${esps[n].modelo || "—"}` : "offline"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="card">
          <div className="head">
            <button className="link" onClick={() => setSel(null)}>← voltar pra lista de ESPs</button>
            <button className="primary" onClick={atualizar}>Atualizar</button>
          </div>
          <h2>
            <span className={`dot ${online(esp) ? "on" : "off"}`} /> {atual}{esp.ip ? ` — ${esp.ip}` : ""}
          </h2>
          {typeof esp.vcc === "number" && <p className="muted">Alimentação: <b>{esp.vcc.toFixed(2)} V</b></p>}
          {!online(esp) && <p className="muted">ESP sem sinal há mais de 30 s (desligado ou sem Wi-Fi).</p>}
          <ul className="list">
            {Object.keys(pinos).length === 0 && <li className="muted">Este ESP ainda não informou pinos.</li>}
            {Object.entries(pinos).map(([g, p]) => (
              <li key={g}>
                <span><b>{p.nome || `Pino ${g}`}</b> <span className="muted">GPIO {g}</span></span>
                {p.tipo === "entrada" ? (
                  <span className="acoes">
                    <span className="muted">Switch</span>
                    <span className={`badge ${p.estado ? "on" : "off"}`}>{p.estado ? "ON" : "OFF"}</span>
                  </span>
                ) : (
                  <span className="acoes">
                    <button className={p.estado ? "danger" : "success"} onClick={() => alternar(g, p.estado)}>
                      {p.estado ? "🔴 Desligar" : "🟢 Ligar"}
                    </button>
                    <button className="primary" onClick={() => pulso(g)}>Pulso</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <button className="off wide" onClick={() => { if (confirm(`Remover ${atual} da lista? Ele volta sozinho quando o ESP ligar.`)) { remove(ref(db, `esps/${atual}`)).catch(falha); setSel(null); } }}>
            Remover da lista
          </button>
        </section>
      )}
      {erro && <p className="erro">{erro}</p>}
    </>
  );
}
```

### `fire_page/src/styles.css`

Visual igual ao app Python: Dark/Light, mesmos backgrounds, responsivo.

```css
:root[data-theme="dark"] {
  --bg-img: url("/background_iot.jpg"); --bar: #1c1c1e; --card: #1c1c1e; --border: #2c2c2e;
  --text: #f2f2f7; --muted: #8e8e93; --input: #2c2c2e;
}
:root[data-theme="light"] {
  --bg-img: url("/background_iot_l.jpg"); --bar: #ffffff; --card: #ffffff; --border: #d1d1d6;
  --text: #1c1c1e; --muted: #6e6e73; --input: #eeeef0;
}
:root { --accent: #0a84ff; --success: #34c759; --danger: #ff3b30; }

* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  font-family: "Segoe UI", system-ui, sans-serif; font-size: 13px; color: var(--text);
  background: var(--bg-img) right bottom / cover no-repeat fixed, var(--card);
}
.app { min-height: 100%; display: flex; flex-direction: column; }
.bar {
  display: flex; align-items: center; gap: 16px; padding: 8px 16px;
  background: var(--bar); border-bottom: 1px solid var(--border);
}
.brand { font-weight: bold; font-size: 15px; display: flex; align-items: center; gap: 8px; margin-right: auto; }
.brand img { width: 22px; height: 22px; }
.dot::before { content: "●"; margin-right: 6px; }
.dot.on::before { color: var(--success); }
.dot.off::before { color: var(--danger); }
.page { max-width: 760px; width: 100%; margin: 0 auto; padding: 20px 16px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; }
.head h2 { margin: 0; }
button.link { background: none; color: var(--accent); padding: 8px 0; }
.list li.click { cursor: pointer; }
.list li.click:hover { background: var(--input); }
.dot.on::before, .dot.off::before { margin-right: 4px; }
h2 .dot::before { margin-right: 6px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 20px; }
h2 { margin: 0 0 12px; font-size: 20px; }
.muted { color: var(--muted); font-size: 12px; }
.list { list-style: none; margin: 0 0 14px; padding: 0; }
.list li {
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 8px;
}
.list li.sel { background: var(--accent); color: #fff; }
.list li.sel .muted { color: #e6f0ff; }
.list li:not(.sel):hover { background: var(--input); }
.acoes { display: flex; gap: 6px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.row input { flex: 1 1 110px; }
input {
  background: var(--input); border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 10px; color: var(--text); font: inherit; min-width: 0;
}
input:focus { outline: none; border-color: var(--accent); }
button {
  border: none; border-radius: 8px; padding: 8px 14px; font: inherit; font-weight: bold;
  color: #fff; cursor: pointer;
}
button.primary { background: var(--accent); }
button.success { background: var(--success); min-width: 56px; }
button.off { background: var(--border); color: var(--muted); min-width: 56px; }
button.danger { background: var(--danger); }
button.wide { width: 100%; margin-top: 4px; }
button.theme { background: var(--input); color: var(--text); }
.erro { color: var(--danger); margin: 10px 0 0; }
.badge { min-width: 56px; text-align: center; padding: 8px 14px; border-radius: 8px; font-weight: bold; }
.badge.on { background: var(--success); color: #fff; }
.badge.off { background: var(--border); color: var(--muted); }
.list li.desativado { opacity: 0.45; cursor: not-allowed; }
.list li.desativado b { text-decoration: line-through; }

/* abas e cardzinho de comandos (aba Brokers) */
.abas { display: flex; gap: 6px; }
button.aba { background: transparent; color: var(--muted); padding: 6px 14px; }
button.aba.sel { background: var(--accent); color: #fff; }
.modal-fundo { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 10; }
.modal { width: 100%; max-width: 520px; max-height: 92vh; overflow: auto; }
.modal label { display: block; color: var(--muted); font-size: 12px; margin: 10px 0 4px; }
.modal label.check { display: flex; align-items: center; gap: 8px; color: var(--text); font-size: 13px; margin: 8px 0; }
.modal input[type="text"], .modal input[type="password"], .modal input:not([type]), .modal select { width: 100%; margin-top: 2px; }
.modal input[type="checkbox"] { width: auto; accent-color: var(--accent); }
select { background: var(--input); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; color: var(--text); font: inherit; }
.resultado { margin: 12px 0 4px; font-weight: bold; text-align: center; }
.resultado.ok { color: var(--success); } .resultado.erro { color: var(--danger); } .resultado.aviso { color: var(--muted); }
.aviso { color: #ff9f0a; font-size: 12px; }
button:disabled { opacity: 0.6; cursor: wait; }

/* início: cartões das páginas */
.brand { cursor: pointer; }
.home h2 { margin: 6px 0 16px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
button.tile { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; text-align: left; padding: 22px;
  background: var(--card); color: var(--text); border: 1px solid var(--border); border-radius: 14px; font-weight: normal; font-size: 14px; }
button.tile:hover { border-color: var(--accent); }
button.tile b { font-size: 20px; }
.tile-icone { font-size: 34px; }
.tile-info { margin-top: 8px; color: var(--accent); font-weight: bold; font-size: 13px; }

/* Informações: card azul neon (igual ao do programa) */
.info-card { background: #08111f; border: 2px solid #00b4ff; border-radius: 16px; padding: 22px; color: #d7ecff;
  box-shadow: 0 0 28px rgba(0, 180, 255, 0.55), inset 0 0 18px rgba(0, 180, 255, 0.12); }
.info-card h2 { color: #00d4ff; margin: 0; }
.info-card h3 { color: #00d4ff; margin: 18px 0 0; font-size: 16px; }
.info-onde { color: #7fb8ff; font-size: 12px; margin-bottom: 4px; }
.info-card p { margin: 6px 0; }
.info-card ul { margin: 4px 0 0; padding-left: 22px; }
.info-card li { margin: 3px 0; }
button.info-x { background: transparent; color: #00b4ff; border: 1px solid #00b4ff; font-size: 16px; padding: 2px 12px; }
button.info-x:hover { background: #00b4ff; color: #08111f; }
button.tile-info-card { border-color: #00b4ff; box-shadow: 0 0 14px rgba(0, 180, 255, 0.35); }

/* Brokers: dois grupos (Firebase x MQTT) */
.grupo { margin-top: 16px; }
.grupo h3 { margin: 0 0 6px; font-size: 16px; }
.grupo h3 .muted { font-weight: normal; }

/* ícones do Início */
.icone-svg { filter: drop-shadow(0 0 6px rgba(0, 200, 255, 0.6)); display: block; }
.tile-icone { display: flex; align-items: center; height: 48px; }
.tile-img { width: 46px; height: 46px; border-radius: 11px; box-shadow: 0 0 10px rgba(0, 180, 255, 0.6); }

/* botões neon (Gerenciar Brokers IOT) */
button.neon-azul, button.neon-vermelho { background: transparent; border: 2px solid; border-radius: 8px; padding: 6px 14px; font-weight: bold; }
button.neon-azul { color: #00b4ff; border-color: #00b4ff; box-shadow: 0 0 10px rgba(0, 180, 255, 0.7), inset 0 0 8px rgba(0, 180, 255, 0.25); text-shadow: 0 0 6px rgba(0, 180, 255, 0.8); }
button.neon-vermelho { color: #ff3b5c; border-color: #ff3b5c; box-shadow: 0 0 10px rgba(255, 59, 92, 0.7), inset 0 0 8px rgba(255, 59, 92, 0.25); text-shadow: 0 0 6px rgba(255, 59, 92, 0.8); }
button.neon-azul:hover { background: #00b4ff; color: #08111f; text-shadow: none; }
button.neon-vermelho:hover { background: #ff3b5c; color: #08111f; text-shadow: none; }
.senha-apagar { width: 100%; margin: 6px 0 12px; }
.linha-broker { flex-wrap: wrap; }
.info-broker { flex: 1 1 240px; min-width: 0; }
.linha-editar { flex: 1 1 100%; display: flex; gap: 8px; margin-top: 6px; }
.linha-editar input { flex: 1; }

/* ============ NEON: todos os botões e cards (só visual) ============ */
:root[data-theme="dark"]  { --neon: 0, 180, 255;  --neon-g: 0, 230, 118; --neon-r: 255, 59, 92;  --neon-c: 142, 142, 147; --neon-fundo: 8, 17, 31; }
:root[data-theme="light"] { --neon: 10, 132, 255; --neon-g: 31, 168, 74; --neon-r: 224, 36, 74;  --neon-c: 110, 110, 115; --neon-fundo: 255, 255, 255; }

button {
  --n: var(--neon);
  background: transparent; color: rgb(var(--n)); border: 2px solid rgb(var(--n)); border-radius: 8px;
  box-shadow: 0 0 10px rgba(var(--n), 0.55), inset 0 0 8px rgba(var(--n), 0.18);
  text-shadow: 0 0 6px rgba(var(--n), 0.6);
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}
button:hover:not(:disabled) { background: rgb(var(--n)); color: #08111f; text-shadow: none; box-shadow: 0 0 16px rgba(var(--n), 0.9); }
button:disabled { box-shadow: none; text-shadow: none; opacity: 0.55; }
button.primary, button.theme, button.aba, button.neon-azul, button.info-x { --n: var(--neon); }
button.success { --n: var(--neon-g); }
button.danger, button.neon-vermelho { --n: var(--neon-r); }
button.off { --n: var(--neon-c); }
button.aba { padding: 6px 14px; }
button.aba.sel { background: rgba(var(--n), 0.28); }
button.link { border: none; box-shadow: none; text-shadow: none; background: none; color: var(--accent); }
button.link:hover:not(:disabled) { background: none; color: var(--text); box-shadow: none; }

/* cards: borda e brilho neon */
.card, .modal {
  border: 2px solid rgba(var(--neon), 0.95);
  box-shadow: 0 0 18px rgba(var(--neon), 0.5), inset 0 0 12px rgba(var(--neon), 0.1);
}
button.tile {
  --n: var(--neon);
  color: var(--text); text-shadow: none; border: 2px solid rgba(var(--n), 0.95);
  box-shadow: 0 0 18px rgba(var(--n), 0.5), inset 0 0 12px rgba(var(--n), 0.1);
}
button.tile:hover:not(:disabled) { background: rgba(var(--n), 0.1); color: var(--text); box-shadow: 0 0 26px rgba(var(--n), 0.85), inset 0 0 14px rgba(var(--n), 0.2); }
button.tile-info-card { box-shadow: 0 0 26px rgba(var(--n), 0.8), inset 0 0 14px rgba(var(--n), 0.2); }
```

### `fire_page/firebase.json`

Diz ao Firebase Hosting o que publicar: a pasta `dist`, como página única (todas as rotas vão para `index.html`) e em qual site.

```json
{
  "hosting": {
    "site": "amauryesp-active",
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
```

### `fire_page/.firebaserc`

Liga esta pasta ao projeto Firebase `amauryesp-active`.

```json
{
  "projects": {
    "default": "amauryesp-active"
  }
}
```


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
