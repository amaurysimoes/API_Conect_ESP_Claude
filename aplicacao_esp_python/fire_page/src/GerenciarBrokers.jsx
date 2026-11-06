import { useEffect, useState } from "react";
import { get, onValue, ref, remove, set } from "firebase/database";
import { db } from "./firebase";

const ONLINE_MS = 30000;
const TIPOS = { fire: "Firebase (internet)", mqtt: "MQTT (rede local)" };
// Só apaga quem digitar a senha. Guardamos apenas a verificação (SHA-256), não a senha escrita no código.
const SENHA_APAGAR_SHA256 = "86a54b1b9582afe628355269c62919645163dd1029040795cb941d126ab65553";

async function senhaOk(texto) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === SENHA_APAGAR_SHA256;
}

// Gerenciar Brokers IOT: todos os brokers criados (Firebase e MQTT). Editar troca o nome; Apagar exige a senha.
// Apagar remove brokers/<nome>, inclusive as máquinas e a fila de comandos dele.
export default function GerenciarBrokers() {
  const [brokers, setBrokers] = useState({});
  const [agora, setAgora] = useState(Date.now());
  const [senha, setSenha] = useState("");
  const [editando, setEditando] = useState(null); // nome que está sendo editado
  const [novoNome, setNovoNome] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const off = onValue(ref(db, "brokers"), (s) => setBrokers(s.val() || {}));
    const t = setInterval(() => setAgora(Date.now()), 5000);
    return () => { off(); clearInterval(t); };
  }, []);

  const nomes = Object.keys(brokers).filter((n) => brokers[n] && typeof brokers[n] === "object").sort();
  const online = (b) => {
    const proprio = b.ativo !== false && typeof b.visto_em === "number" && agora - b.visto_em < ONLINE_MS;
    const maquina = Object.values(b.maquinas || {}).some(
      (m) => m?.status?.online === true && typeof m.status.visto_em === "number" && agora - m.status.visto_em < ONLINE_MS);
    return proprio || maquina;
  };

  async function apagar(nome) {
    if (!(await senhaOk(senha))) return setMsg("Senha incorreta: o broker não foi apagado.");
    setSenha("");
    remove(ref(db, `brokers/${nome}`))
      .then(() => setMsg(`Broker '${nome}' apagado.`))
      .catch((e) => setMsg(`Erro ao apagar: ${e.message || e}`));
  }

  async function salvarNome(antigo) {
    const novo = novoNome.trim();
    if (novo === antigo) return setEditando(null);
    if (!/^[A-Za-z0-9_-]+$/.test(novo)) return setMsg("Nome: só letras, números, - e _ (sem espaço).");
    if (brokers[novo]) return setMsg(`Já existe um broker chamado '${novo}'.`);
    try { // copia o cadastro inteiro para o nome novo e remove o antigo
      const dados = (await get(ref(db, `brokers/${antigo}`))).val();
      if (!dados) return setMsg("O broker não existe mais.");
      await set(ref(db, `brokers/${novo}`), dados);
      await remove(ref(db, `brokers/${antigo}`));
      setEditando(null);
      setMsg(`Broker '${antigo}' agora se chama '${novo}'. Escolha o nome novo no agente e no app.`);
    } catch (e) {
      setMsg(`Erro ao trocar o nome: ${e.message || e}`);
    }
  }

  return (
    <section className="card">
      <div className="head">
        <h2>Gerenciar Brokers IOT</h2>
      </div>
      <p className="muted">Todos os brokers criados, Firebase e MQTT. Antes de trocar o nome ou apagar, pare o broker e o agente que usam esse broker.</p>
      <input type="password" className="senha-apagar" placeholder="Senha para apagar" value={senha} onChange={(e) => setSenha(e.target.value)} />
      <ul className="list">
        {nomes.length === 0 && <li className="muted">Nenhum broker criado.</li>}
        {nomes.map((n) => {
          const b = brokers[n];
          const on = online(b);
          const qtd = Object.keys(b.maquinas || {}).length;
          return (
            <li key={n} className="linha-broker">
              <span className="info-broker">
                <span className={`dot ${on ? "on" : "off"}`} /> <b>{n}</b>
                <span className="muted"> · {TIPOS[b.tipo] || "sem tipo (resto de máquina)"} · {b.ip || "—"} · {qtd} máquina(s) · {on ? "online" : "offline"}</span>
              </span>
              <span className="acoes">
                <button className="neon-azul" onClick={() => { setEditando(n); setNovoNome(n); }}>Editar</button>
                <button className="neon-vermelho" onClick={() => apagar(n)}>Apagar</button>
              </span>
              {editando === n && (
                <span className="linha-editar">
                  <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Novo nome" autoFocus />
                  <button className="neon-azul" onClick={() => salvarNome(n)}>Salvar</button>
                  <button className="off" onClick={() => setEditando(null)}>Cancelar</button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {msg && <p className="muted">{msg}</p>}
    </section>
  );
}
