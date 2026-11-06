// Ícones do Início, desenhados em azul neon (mesmo estilo do ícone oficial). O ícone oficial (public/icone_ia.png)
// é usado em Informações.
const Base = ({ children }) => (
  <svg className="icone-svg" viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="url(#gNeon)"
       strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <defs>
      <linearGradient id="gNeon" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#00e5ff" />
        <stop offset="1" stopColor="#2d7bff" />
      </linearGradient>
    </defs>
    {children}
  </svg>
);

const ponto = (cx, cy, r, ang) => [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];

// Automação: engrenagem com um raio no meio.
export function IconeAutomacao() {
  const dentes = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const [x1, y1] = ponto(24, 24, 13.5, a);
    const [x2, y2] = ponto(24, 24, 19, a);
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="4.2" />;
  });
  return (
    <Base>
      {dentes}
      <circle cx="24" cy="24" r="11" />
      <polygon points="26,15 18.5,26 23.5,26 21.5,33 29.5,22 24.5,22" fill="url(#gNeon)" strokeWidth="1.2" />
    </Base>
  );
}

// IOT: um centro ligado a vários pontos (a rede de dispositivos).
export function IconeIot() {
  const nos = Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    const [x1, y1] = ponto(24, 24, 6.5, a);
    const [x2, y2] = ponto(24, 24, 14, a);
    const [cx, cy] = ponto(24, 24, 17.5, a);
    return (
      <g key={i}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
        <circle cx={cx} cy={cy} r="3.4" />
      </g>
    );
  });
  return (
    <Base>
      <circle cx="24" cy="24" r="17.5" strokeWidth="1.2" strokeDasharray="2 4" opacity="0.7" />
      {nos}
      <circle cx="24" cy="24" r="5" fill="url(#gNeon)" />
    </Base>
  );
}

// Gerenciar: controles deslizantes (ajustar / configurar).
export function IconeGerenciar() {
  const linhas = [[14, 17], [24, 32], [34, 22]];
  return (
    <Base>
      {linhas.map(([y, x]) => (
        <g key={y}>
          <line x1="8" y1={y} x2="40" y2={y} />
          <circle cx={x} cy={y} r="4.4" style={{ fill: "var(--card)" }} />
        </g>
      ))}
    </Base>
  );
}
