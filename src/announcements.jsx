import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Card, SUITS } from './cards';
import { collectTableEvents } from './tableEvents';
import { sound } from './sound';

export function useTableAnnouncements(room) {
  const cursor = useRef(null);
  const [queue, setQueue] = useState([]);
  const active = queue[0] || null;
  const dismiss = () => setQueue(current => current.slice(1));
  useLayoutEffect(() => {
    const next = collectTableEvents(cursor.current, room);
    cursor.current = next.cursor;
    if (next.reset) setQueue([]);
    if (next.events.some(e => e.type === 'deal')) sound('deal');
    const arrivals = next.events.filter(e => e.type !== 'deal');
    if (arrivals.length) setQueue(current => [...current, ...arrivals]);
  }, [room?.code, room?.events]);
  useEffect(() => {
    if (!active) return;
    sound(active.type === 'card' ? 'card' : active.type === 'result' ? 'win' : 'call');
    const timer = setTimeout(() => setQueue(current => current[0]?.id === active.id ? current.slice(1) : current), active.type === 'result' ? 6500 : 2500);
    return () => clearTimeout(timer);
  }, [active?.id]);
  return { active, dismiss, pendingCards: new Set(queue.filter(e => e.type === 'card').map(e => e.id)) };
}

export function CantoResult({ result, you }) {
  const winner = result.entries.find(e => e.seat === result.winnerSeat);
  const mano = result.entries.find(e => e.seat === result.mano);
  return <div className="canto-result">
    <span className="eyebrow">LOS TANTOS SOBRE LA MESA</span><h2>{result.label}</h2>
    <div className={`result-players ${result.entries.length === 4 ? 'four-results' : ''}`}>
      {result.entries.map(entry => <div key={entry.seat} className={entry.seat === result.winnerSeat ? 'result-winner' : ''}>
        <span>{entry.seat === you ? `Vos · ${entry.nickname}` : entry.nickname}</span>
        <strong>{entry.value ?? '—'}</strong><small>{entry.value === null ? 'SIN FLOR' : 'PUNTOS'}</small>
      </div>)}
    </div>
    <p className="result-verdict">{winner?.seat === you ? '¡Ganaste el canto!' : `¡Ganó ${winner?.nickname}!`}</p>
    {result.tied && <p className="result-tie">Empate de tantos: ganó por prioridad de mano{result.entries.length === 4 ? `, en el orden desde ${mano?.nickname}` : ''}.</p>}
    <p className="result-award">Equipo {result.team + 1} suma <b>+{result.points}</b> {result.points === 1 ? 'punto' : 'puntos'}{result.matchWon ? ' · ¡Partida ganada!' : ''}</p>
  </div>;
}

export function TableAnnouncement({ event, you, onDismiss }) {
  if (!event) return null;
  return <div className={`table-announcement announcement-${event.type}`} key={event.id}>
    <section className="announcement-panel" role="status" aria-live="polite" aria-atomic="true">
      {event.type === 'result' ? <><CantoResult result={event.result} you={you}/><button className="secondary-button announcement-continue" onClick={onDismiss}>Seguir jugando →</button></> : <>
        <span className="announcement-author">{event.seat === you ? `Vos · ${event.nickname}` : event.nickname}</span>
        <h2>{event.type === 'card' ? '¡A la mesa!' : `¡${event.label}!`}</h2>
        {event.type === 'card' ? <><div className="announced-card"><Card card={event.card}/></div><p>{event.card.number} de {SUITS[event.card.suit].name.toLowerCase()}</p></> : <span className="announcement-ornament" aria-hidden="true">✳</span>}
      </>}
    </section>
  </div>;
}
