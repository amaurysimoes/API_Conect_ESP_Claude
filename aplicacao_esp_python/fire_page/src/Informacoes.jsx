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
