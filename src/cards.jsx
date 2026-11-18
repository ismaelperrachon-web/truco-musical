export const SUITS = {
  guitarras: { name: 'Guitarras', old: 'Espadas', color: '#438ce4' },
  baquetas: { name: 'Baquetas', old: 'Bastos', color: '#299b75' },
  notas: { name: 'Notas', old: 'Oros', color: '#c39637' },
  microfonos: { name: 'Micrófonos', old: 'Copas', color: '#dc736b' }
};
export function SuitIcon({ suit, size = 28, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {suit === 'guitarras' && <><path d="m28 19 9-12 4 3-10 12c4 5 2 9-2 9-1 6-6 11-12 10-8-1-12-8-9-14 2-4 5-5 9-5 1-5 6-7 11-3Z"/><circle cx="21" cy="29" r="4"/><path d="m24 26 14-17M13 34l4 3m17-25 5 4m-3-7 4 3"/></>}
    {suit === 'baquetas' && <><path d="M8 7c2-2 5 0 6 3l24 29-3 3L11 13C8 11 6 9 8 7ZM40 7c-2-2-5 0-6 3L10 39l3 3 24-29c3-2 5-4 3-6Z"/><path d="m20 20 8 9m-5-10 5 5"/></>}
    {suit === 'notas' && <><path d="M29 33V9l12-3v24M29 16l12-3"/><ellipse cx="23.5" cy="34" rx="5.5" ry="4" transform="rotate(-20 23.5 34)"/><ellipse cx="35.5" cy="31" rx="5.5" ry="4" transform="rotate(-20 35.5 31)"/><path d="M13 12v15m-4-12h8M13 8v1"/><ellipse cx="8" cy="29" rx="5" ry="3.5" transform="rotate(-20 8 29)"/></>}
    {suit === 'microfonos' && <><rect x="18" y="5" width="16" height="24" rx="8" transform="rotate(28 26 17)"/><path d="m17 26-9 16 5 3 9-16m-2-17 13 7m-13-3 11 6m-7-13 11 6M18 31l4 2"/></>}
  </svg>;
}
export function Card({ card, back = false, onClick, disabled = false, className = '', small = false }) {
  const Component = onClick ? 'button' : 'div';
  if (back) return <div className={`playing-card card-back ${small ? 'small-card' : ''} ${className}`} aria-label="Carta boca abajo"><div className="back-pattern"><span>✳</span><b>ORIENTAL</b></div></div>;
  const suit = SUITS[card.suit];
  return <Component {...(onClick ? { type: 'button', onClick, disabled } : {})} className={`playing-card ${small ? 'small-card' : ''} ${card.piece ? 'is-piece' : ''} ${className}`} style={{ '--suit': suit.color }} aria-label={`${card.number} de ${suit.name}${card.piece ? ', pieza' : ''}`}>
    <span className="card-corner"><b>{card.number}</b><SuitIcon suit={card.suit} size={15}/></span>
    <span className="card-art"><SuitIcon suit={card.suit} size={56}/></span>
    <span className="card-corner bottom"><b>{card.number}</b><SuitIcon suit={card.suit} size={15}/></span>
    {card.piece && <span className="piece-dot" title="Pieza">✦</span>}
  </Component>;
}
