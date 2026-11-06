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
