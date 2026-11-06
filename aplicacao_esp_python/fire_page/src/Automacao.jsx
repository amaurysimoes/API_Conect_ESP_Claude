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
