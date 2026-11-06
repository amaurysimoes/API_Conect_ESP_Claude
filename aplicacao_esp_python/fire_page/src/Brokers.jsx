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
