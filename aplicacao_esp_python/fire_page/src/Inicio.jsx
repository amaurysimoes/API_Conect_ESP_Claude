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
