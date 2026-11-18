import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { ArrowUpRight, ArrowRight, Check, Copy, Link, Users, X, ChevronRight, CircleHelp, LogOut, Music2, Flag, MessageCircle, ShieldCheck, RotateCcw } from 'lucide-react';
import { Card, SuitIcon, SUITS } from './cards';
import AudioControls from './AudioControls';
import { useTableAnnouncements, TableAnnouncement, CantoResult } from './announcements';

const socket = io(import.meta.env.VITE_SERVER_URL || undefined, { autoConnect: false });
const labels = { start: 'Repartir cartas', next: 'Siguiente ronda', rematch: 'Jugar la revancha', truco: 'Truco', retruco: 'Retruco', cuatro: 'Vale cuatro', envido: 'Envido', real: 'Real envido', falta: 'Falta envido', flor: '¡Flor!', contra: 'Contraflor', resto: 'Contraflor al resto', accept: 'Quiero', decline: 'No quiero', fold: 'Irme al mazo' };
const initialCode = new URLSearchParams(location.search).get('sala')?.toUpperCase() || '';
const stored = (key, fallback = '') => { try { return sessionStorage.getItem(key) || fallback; } catch { return fallback; } };
const save = (key, value) => { try { sessionStorage.setItem(key, value); } catch { /* Navegación privada sin almacenamiento. */ } };
const forget = key => { try { sessionStorage.removeItem(key); } catch {} };
export default function App() {
  const [room, setRoom] = useState(null), [connected, setConnected] = useState(false), [busy, setBusy] = useState(false);
  const [nickname, setNickname] = useState(stored('nickname')), [code, setCode] = useState(initialCode), [capacity, setCapacity] = useState(2);
  const [joinMode, setJoinMode] = useState(Boolean(initialCode)), [error, setError] = useState(''), [toast, setToast] = useState('');
  const [rules, setRules] = useState(false), [leaveConfirm, setLeaveConfirm] = useState(false), [reviewResult, setReviewResult] = useState(null);
  const latest = useRef(null), active = useRef(initialCode), lastRevision = useRef(-1);
  const announcements = useTableAnnouncements(room);
  const toastTimer = useRef();
  const showToast = message => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 3000); };
  const acceptState = state => {
    if (state.code === latest.current?.code && state.revision < lastRevision.current) return;
    lastRevision.current = state.revision;
    latest.current = state; setRoom(state);
  };
  useEffect(() => {
    const onConnect = () => {
      setConnected(true); setError('');
      const currentCode = active.current;
      const token = currentCode && stored(`token:${currentCode}`);
      if (currentCode && token) {
        socket.timeout(8000).emit('join', { code: currentCode, token }, (err, response) => {
          if (err || response?.error) { setError(err ? 'No se pudo recuperar la mesa. Intentá de nuevo.' : response.error); latest.current = null; setRoom(null); forget(`token:${currentCode}`); return; }
          acceptState(response.state);
        });
      }
    };
    const onDisconnect = () => setConnected(false);
    const onReplaced = () => { setError('Tu lugar se abrió en otra pestaña.'); active.current = ''; latest.current = null; setRoom(null); };
    socket.on('connect', onConnect); socket.on('disconnect', onDisconnect); socket.on('state', acceptState);
    socket.on('connect_error', () => { setConnected(false); setError('No hay conexión con el servidor. Estamos intentando reconectar.'); });
    socket.on('replaced', onReplaced); socket.connect();
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('state', acceptState); socket.off('replaced', onReplaced); socket.disconnect(); clearTimeout(toastTimer.current); };
  }, []);
  async function request(event, payload) {
    if (!socket.connected) { setError('Esperá a recuperar la conexión.'); return; }
    setBusy(true); setError('');
    try {
      const response = await socket.timeout(8000).emitWithAck(event, payload);
      if (response.error) throw new Error(response.error);
      return response;
    } catch (e) { setError(e.message === 'operation has timed out' ? 'El servidor tardó demasiado. Volvé a intentar.' : e.message); }
    finally { setBusy(false); }
  }
  async function enter(e) {
    e.preventDefault(); save('nickname', nickname.trim());
    const result = await request(joinMode ? 'join' : 'create', { nickname: nickname.trim(), code: code.trim().toUpperCase(), capacity, token: stored(`token:${code.trim().toUpperCase()}`) });
    if (!result) return;
    active.current = result.code; save(`token:${result.code}`, result.token); acceptState(result.state);
    history.replaceState(null, '', `?sala=${result.code}`);
  }
  const action = (action, cardId) => request('action', { action, cardId, revision: latest.current.revision });
  const roomURL = () => { const url = new URL(location.href); url.search = `?sala=${room.code}`; return url.href; };
  async function copyLink() {
    try { await navigator.clipboard.writeText(roomURL()); showToast('Enlace copiado. ¡Invitá a tu gente!'); }
    catch { showToast('Seleccioná el enlace debajo para copiarlo.'); }
  }
  async function leave() {
    const result = await request('leave', {}); if (!result) return;
    forget(`token:${room.code}`); active.current = ''; latest.current = null; lastRevision.current = -1;
    setRoom(null); setCode(''); setJoinMode(false); setLeaveConfirm(false); history.replaceState(null, '', location.pathname);
  }
  return <div className="app-shell">
    <header className="topbar"><button className="brand" aria-label="Truco Oriental, inicio" onClick={() => room ? showToast('Ya estás en tu mesa.') : window.scrollTo({ top: 0, behavior: 'smooth' })}><span className="brand-mark">✳</span><span>truco<span className="brand-light">oriental</span><span className="brand-caption">EL DE ACÁ. CON OTRO RITMO.</span></span></button>
      <nav><span className="nav-current">{room ? 'Tu mesa' : 'A jugar'}</span><button onClick={() => setRules(true)}>Cómo se juega <ArrowUpRight size={14}/></button></nav>
      <div className="header-right"><span className={`connection ${connected ? '' : 'offline'}`}><i/>{connected ? 'En línea' : 'Conectando'}</span><AudioControls/></div>
    </header>
    {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Cerrar aviso"><X size={16}/></button></div>}
    {!room ? <main className="landing">
      <div className="intro-line"><span className="eyebrow"><span className="little-line"/> TRUCO URUGUAYO, ONLINE</span><span className="edition">40 CARTAS · 4 PALOS · MIL EXCUSAS PARA JUNTARSE</span></div>
      <div className="landing-grid"><section className="hero"><h1>La misma mesa.<br/><em>Estés donde estés.</em></h1><p className="hero-copy">Un truco entre amigos, aunque estén lejos.<br/>Poné tu apodo, compartí el enlace y que hablen las cartas.</p>
        <div className="hero-tags"><span><Check size={13}/> Sin registro</span><span><Check size={13}/> En tiempo real</span><span><Check size={13}/> Bien uruguayo</span></div>
        <div className="demo-scene" aria-label="Cartas musicales de truco"><div className="demo-oval"><span className="table-ring"/><span className="table-word">ORIENTAL</span></div><div className="demo-cards"><Card className="demo-left" card={{ number: 1, suit: 'guitarras' }}/><Card className="demo-mid" card={{ number: 2, suit: 'notas' }}/><Card className="demo-right" card={{ number: 7, suit: 'microfonos' }}/></div><div className="demo-bubble">¿Un truquito? <Music2 size={14}/></div><span className="demo-star star-one">✳</span><span className="demo-star star-two">✦</span><span className="demo-footnote">LAS CARTAS DE SIEMPRE. UN NUEVO COMPÁS.</span></div>
      </section>
      <section className="entry-panel"><div className="panel-heading"><span className="panel-icon"><Users size={21}/></span><span className="tiny-label">HAY LUGAR PARA VOS</span></div><h2>{joinMode ? 'Te estaban esperando.' : 'Armá la mesa.'}</h2><p>{joinMode ? 'Ingresá tu apodo y sumate a la partida.' : 'Lo mejor del truco empieza con una invitación.'}</p><form onSubmit={enter}>
        <label className="input-label" htmlFor="nickname">Tu apodo <span>Así te van a conocer</span></label><input id="nickname" placeholder="¿Cómo te dicen?" maxLength={20} required autoComplete="nickname" value={nickname} onChange={e => setNickname(e.target.value)}/>
        {joinMode ? <><label className="input-label" htmlFor="code">Código de la mesa</label><input id="code" className="code-input" placeholder="Ej. A1B2C3D4" maxLength={8} minLength={8} pattern="[a-fA-F0-9]{8}" required value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g, ''))}/></> : <><label className="input-label">¿Cómo jugamos?</label><div className="mode-selector" role="radiogroup" aria-label="Modalidad">{[2, 4].map(n => <button type="button" role="radio" aria-checked={capacity === n} key={n} className={capacity === n ? 'selected' : ''} onClick={() => setCapacity(n)}><span className="mode-title"><Users size={16}/>{n === 2 ? '1 vs 1' : '2 vs 2'}<span className="radio-dot"/></span><small>{n === 2 ? 'Mano a mano' : 'En equipos'}</small></button>)}</div></>}
        <button className="primary-button" disabled={busy || !connected || !nickname.trim()} type="submit">{busy ? 'Preparando la mesa…' : joinMode ? 'Entrar a la mesa' : 'Crear mesa'}<ArrowRight size={18}/></button>
        <p className="form-footnote"><Link size={12}/>{joinMode ? 'Sin cuentas. Directo a las cartas.' : 'Vas a recibir un enlace para invitar a tus amigos.'}</p>
      </form><div className="entry-divider"/><button className="join-switch" onClick={() => { setJoinMode(!joinMode); setError(''); }}>{joinMode ? '¿Querés armar otra mesa?' : '¿Ya te invitaron a una mesa?'}<span>{joinMode ? 'Crear mesa' : 'Entrar con código'}<ChevronRight size={14}/></span></button></section></div>
      <section className="feature-strip"><div><span className="feature-number">01</span><div><h3>Tu gente, tu mesa.</h3><p>De a dos o en equipos. Vos elegís.</p></div></div><div><span className="feature-number">02</span><div><h3>Pasá el enlace y listo.</h3><p>Un mensaje y ya están todos acá.</p></div></div><div><span className="feature-number">03</span><div><h3>Hasta las 30, como en casa.</h3><p>Con muestra, piezas, envido y flor.</p></div></div></section>
      <section className="musical-footer"><span>UN MAZO CON IDENTIDAD PROPIA</span><div>{Object.entries(SUITS).map(([key, suit]) => <span key={key} style={{ color: suit.color }}><SuitIcon suit={key} size={20}/>{suit.name}</span>)}</div><button onClick={() => setRules(true)}>Conocé las cartas <ArrowUpRight size={14}/></button></section>
    </main> : <main className="room-page"><div className="room-heading"><div><span className="eyebrow">{room.phase === 'waiting' ? 'QUE SE ARME LA RONDA' : `RONDA ${room.roundNumber} · A 30 PUNTOS`}</span><h1>La mesa de {room.players.find(p => p.seat === room.host)?.nickname}.</h1></div><div className="room-tools"><span className="room-code">#{room.code}</span><button className="secondary-button" onClick={copyLink}><Copy size={15}/><span>Copiar enlace</span></button><button className="icon-button" aria-label="Salir de la mesa" onClick={() => setLeaveConfirm(true)}><LogOut size={17}/></button></div></div>
      <div className="game-layout"><section className="game-main">{room.phase === 'waiting' ? <Lobby room={room} url={roomURL()} copy={copyLink} action={action} busy={busy}/> : <GameTable room={room} action={action} busy={busy || !connected || Boolean(announcements.active)} pendingCards={announcements.pendingCards}/>}
      </section><aside className="game-sidebar"><Scoreboard room={room}/>{Boolean(room.round?.sideResults?.length) && <section className="canto-history"><span className="tiny-label">RESULTADOS DE LOS CANTOS</span>{room.round.sideResults.map(result => <button key={result.id} className="secondary-button" onClick={() => setReviewResult(result)}><span>{result.label} · +{result.points}</span><span>Ver resultado <ArrowUpRight size={13}/></span></button>)}</section>}<section className="activity-panel"><div className="aside-heading"><span className="tiny-label">LO QUE SE CANTÓ</span><MessageCircle size={15}/></div><div className="activity-log" role="log" aria-label="Actividad de la mesa">{room.log.slice(-12).reverse().map((entry, i) => <div key={entry.id} className={`log-entry ${entry.type} ${i === 0 ? 'latest' : ''}`}><span className="log-dot"/><p>{entry.message}</p></div>)}</div></section><button className="rules-shortcut" onClick={() => setRules(true)}><CircleHelp size={17}/><span>¿Cómo era esa regla?</span><ArrowUpRight size={15}/></button></aside></div>
    </main>}
    <footer className="site-footer"><span>Hecho para compartir la mesa.</span><span>TRUCO ORIENTAL <span className="footer-star">✳</span> URUGUAY</span><button onClick={() => setRules(true)}>Las reglas de casa <ArrowUpRight size={12}/></button></footer>
    {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
    {room && <TableAnnouncement event={announcements.active} you={room.you} onDismiss={announcements.dismiss}/>}
    {reviewResult && <Modal wide eyebrow="LOS TANTOS DE LA RONDA" title="Resultado del canto" onClose={() => setReviewResult(null)}><CantoResult result={reviewResult} you={room?.you}/></Modal>}
    {rules && <Rules onClose={() => setRules(false)}/>}
    {leaveConfirm && <Modal title="¿Te vas de la mesa?" onClose={() => setLeaveConfirm(false)}><p className="modal-copy">{['playing', 'between'].includes(room?.phase) ? 'Si salís durante la partida, gana el equipo rival. Podés cerrar esta ventana y volver a conectarte sin abandonar tu lugar.' : 'Vas a liberar tu lugar en esta mesa.'}</p><div className="modal-actions"><button className="secondary-button" onClick={() => setLeaveConfirm(false)}>Me quedo</button><button className="danger-button" disabled={busy} onClick={leave}>Salir de la mesa</button></div></Modal>}
  </div>;
}
function Lobby({ room, url, copy, action, busy }) {
  const full = room.players.length === room.capacity;
  return <div className="lobby"><div className="lobby-top"><span className="live-pill"><i/>{room.players.length} de {room.capacity} en la mesa</span><span className="tiny-label">{room.capacity === 2 ? 'MANO A MANO' : 'POR EQUIPOS'}</span></div><div className="lobby-emblem">✳</div><h2>{full ? 'Estamos todos.' : 'Faltan tus cómplices.'}</h2><p>{full ? 'Cuando quieran, que empiecen las cartas.' : 'Pasales el enlace. La mesa los está esperando.'}</p><div className="lobby-seats">{Array.from({ length: room.capacity }, (_, seat) => { const player = room.players.find(p => p.seat === seat); return <div key={seat} className={`lobby-seat ${player ? 'occupied' : ''}`}><span className={`avatar team-${seat % 2}`}>{player?.nickname.slice(0, 1).toUpperCase() || '+'}</span><b>{player?.nickname || 'Lugar libre'}</b><small>{player ? player.connected ? `Equipo ${seat % 2 + 1}${seat === room.you ? ' · Vos' : ''}` : 'Reconectando…' : 'Esperando…'}</small></div>; })}</div><div className="share-link"><input readOnly aria-label="Enlace para compartir" value={url} onFocus={e => e.target.select()}/><button aria-label="Copiar enlace" onClick={copy}><Copy size={17}/></button></div><div className="lobby-buttons"><a className="secondary-button" href={`https://wa.me/?text=${encodeURIComponent(`¿Un truquito? Sumate a mi mesa: ${url}`)}`} target="_blank" rel="noreferrer"><MessageCircle size={16}/>Invitar por WhatsApp<ArrowUpRight size={14}/></a>{room.actions.includes('start') && <button className="primary-button" disabled={busy} onClick={() => action('start')}>Repartir cartas<ArrowRight size={17}/></button>}</div><span className="lobby-note"><ShieldCheck size={14}/>{room.you === room.host ? 'Vos repartís cuando estén todos conectados.' : 'El anfitrión va a repartir cuando estén todos.'}</span></div>;
}
function Scoreboard({ room }) {
  return <section className="score-panel"><div className="aside-heading"><span className="tiny-label">EL TANTEADOR</span><Flag size={15}/></div><div className="score-teams">{[0, 1].map(team => <div key={team} className={room.you % 2 === team ? 'my-team' : ''}><span>{room.capacity === 2 ? team === room.you % 2 ? 'Vos' : 'Rival' : team === room.you % 2 ? 'Nosotros' : 'Ellos'}</span><strong>{room.scores[team]}</strong><small>{room.scores[team] >= 15 ? 'BUENAS' : 'MALAS'}</small></div>)}</div><div className="score-track">{[0, 1].map(team => <div key={team}><span style={{ width: `${Math.min(room.scores[team] / 30, 1) * 100}%` }}/><i/></div>)}</div><div className="score-caption"><span>0</span><span>15</span><span>30</span></div><p>15 malas + 15 buenas. Hasta las 30.</p></section>;
}
function GameTable({ room, action, busy, pendingCards }) {
  const r = room.round, me = room.players.find(p => p.seat === room.you);
  const others = room.players.filter(p => p.seat !== room.you).sort((a, b) => (a.seat - room.you + room.capacity) % room.capacity - (b.seat - room.you + room.capacity) % room.capacity);
  const isTurn = room.phase === 'playing' && r.turn === room.you && !r.pending && !r.awaitingFlor;
  const canPlay = room.actions.includes('play') && !busy;
  const paused = room.players.some(p => !p.connected);
  const displayed = (r.current.length ? r.current : r.lastTrick).filter(play => !pendingCards.has(play.eventId));
  const waiting = room.players.find(p => p.seat === r.turn)?.nickname;
  const actionIds = room.actions.filter(a => a !== 'play' && a !== 'fold');
  const status = paused ? 'La mesa está pausada hasta que vuelvan a conectarse todos.'
    : room.phase === 'finished' ? room.winner === room.you % 2 ? '¡Ganaron la partida! Bien jugado.' : 'Esta vez ganó el otro equipo. ¿Sale revancha?'
    : room.phase === 'between' ? `${r.result.team === room.you % 2 ? 'Ganaron' : 'Ganó el otro equipo'} esta ronda · ${r.result.points} ${r.result.points === 1 ? 'punto' : 'puntos'}`
    : room.actions.includes('flor') ? '¡Tenés flor! Cantala antes de jugar tu primera carta.'
    : r.awaitingFlor ? 'Esperando que se anuncien las flores de la mesa.'
    : r.pending ? `${room.players.find(p => p.seat === r.pending.caller)?.nickname} cantó ${r.pending.label.toLowerCase()}. ${actionIds.includes('accept') ? 'Te toca responder.' : 'Esperando respuesta…'}`
    : isTurn ? 'Te toca. Elegí una carta o hacé un canto.' : `Juega ${waiting}. Que hablen las cartas.`;
  return <><div className="table-wrapper"><div className="table-topline"><span className="tiny-label">{room.capacity === 2 ? 'MANO A MANO' : 'POR EQUIPOS'}</span><span className="stake">Ronda por <b>{r.truco} {r.truco === 1 ? 'punto' : 'puntos'}</b></span></div><div className={`felt-table ${room.capacity === 4 ? 'four-players' : ''}`}><span className="felt-brand">✳<small>TRUCO ORIENTAL</small></span>
      {others.map((p, i) => <div key={p.seat} className={`opponent opponent-${others.length === 1 ? 'top' : ['left', 'top', 'right'][i]} ${r.turn === p.seat && !r.pending && room.phase === 'playing' ? 'their-turn' : ''}`}><div className="opponent-hand">{Array.from({ length: p.count }, (_, j) => <Card back small key={j}/>)}</div><div className="seat-label"><span className={`avatar mini team-${p.seat % 2}`}>{p.nickname[0].toUpperCase()}</span><b>{p.nickname}</b>{p.seat === room.mano && <span className="mano-tag">M</span>}<i className={p.connected ? 'online-dot' : 'offline-dot'}/></div></div>)}
      <div className="sample-area"><span className="tiny-label">LA MUESTRA</span><Card small card={r.sample}/><span className="sample-caption">Piezas de {SUITS[r.sample.suit].name.toLowerCase()}</span></div>
      <div className="played-area">{displayed.length ? displayed.map((play, i) => <div className="played-card" key={`${play.trick}-${play.seat}`} style={{ '--rotation': `${i % 2 === 0 ? -8 : 9}deg` }}><Card small card={play.card}/><small>{room.players.find(p => p.seat === play.seat)?.nickname}</small></div>) : <span className="empty-table-copy">La primera carta<br/>marca el compás.</span>}</div>
      <div className="trick-markers" aria-label="Resultado de las bazas">{[0, 1, 2].map(i => <span key={i} className={r.tricks[i] === undefined ? '' : r.tricks[i] === null ? 'tied' : r.tricks[i] === room.you % 2 ? 'won' : 'lost'}>{r.tricks[i] === undefined ? i + 1 : r.tricks[i] === null ? '=' : r.tricks[i] === room.you % 2 ? '✓' : '×'}</span>)}</div>
    </div><div className="own-seat"><span className={`avatar mini team-${room.you % 2}`}>{me.nickname[0].toUpperCase()}</span><b>{me.nickname} <small>(vos)</small></b>{room.you === room.mano && <span className="mano-tag">MANO</span>}<span className="private-points">Envido <b>{r.envido}</b>{r.flor !== null && <> · Flor <b>{r.flor}</b></>}</span></div>
    <div className="my-hand">{r.hand.map(card => <Card key={card.id} card={card} onClick={() => action('play', card.id)} disabled={!canPlay}/>)}</div>
    </div><div className={`turn-status ${isTurn ? 'your-turn' : ''}`} role="status"><span className="status-dot"/>{status}</div>
    <div className="action-bar"><div className="call-buttons">{actionIds.map(id => <button key={id} className={['accept', 'next', 'rematch', 'flor'].includes(id) ? 'primary-button' : id === 'decline' ? 'decline-button' : 'call-button'} disabled={busy} onClick={() => action(id)}>{id === 'rematch' && <RotateCcw size={15}/>} {labels[id]}{id === 'next' && <ArrowRight size={15}/>}</button>)}{!actionIds.length && <span className="action-hint">{room.phase !== 'playing' ? 'El anfitrión da comienzo a la próxima.' : 'Los cantos disponibles van a aparecer acá.'}</span>}</div>{room.actions.includes('fold') && <button className="fold-button" disabled={busy} onClick={() => action('fold')}>Al mazo<ArrowUpRight size={14}/></button>}</div></>;
}
function Modal({ title, onClose, children, wide = false, eyebrow = 'LAS REGLAS DE CASA' }) {
  const ref = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    const keydown = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const elements = ref.current.querySelectorAll('button, a[href], input, [tabindex="0"]');
        const first = elements[0], last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    ref.current.querySelector('button')?.focus(); document.addEventListener('keydown', keydown);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; before?.focus(); };
  }, []);
  return <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}><section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}><div className="modal-header"><div><span className="eyebrow">{eyebrow}</span><h2 id="modal-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={19}/></button></div>{children}</section></div>;
}
function Rules({ onClose }) {
  const [tab, setTab] = useState('mesa');
  return <Modal wide title="El de acá. Con todas las letras." onClose={onClose}><div className="rules-tabs" role="tablist" aria-label="Reglas">{[['mesa', 'La mesa'], ['piezas', 'Cartas y piezas'], ['cantos', 'Los cantos']].map(([id, name]) => <button key={id} role="tab" aria-selected={tab === id} aria-controls="rules-content" onClick={() => setTab(id)}>{name}</button>)}</div><div className="rules-content" id="rules-content" role="tabpanel">
    {tab === 'mesa' && <><h3>Un encuentro a 30 puntos.</h3><p>Jugás mano a mano o en parejas, con compañeros en asientos alternados. Son 15 malas y 15 buenas. Cada ronda reparte tres cartas por persona y una muestra boca arriba.</p><h3>Al mejor de tres bazas.</h3><p>Ganar dos bazas te da la ronda. Si empardan la primera, decide la segunda; si la segunda es parda, vale la primera. Si ganan una cada uno, decide la tercera. Si la tercera es parda, gana la primera; tres pardas favorecen a mano.</p><h3>La mano va girando.</h3><p>Mano juega primero y desempata envido y flor. En parejas, el orden desde mano decide los empates. Quien gana una baza sale en la siguiente; una parda conserva la salida.</p><h3>Tu lugar te espera.</h3><p>Si se corta internet, pausamos la mesa. Volvé desde la misma pestaña o recargala para recuperar tus cartas. Salir con el botón de abandonar concede la partida al rival.</p></>}
    {tab === 'piezas' && <><div className="suit-guide">{Object.entries(SUITS).map(([id, s]) => <div key={id} style={{ color: s.color }}><SuitIcon suit={id} size={30}/><b>{s.name}</b><small>{s.old}</small></div>)}</div><h3>La muestra manda.</h3><p>El 2, 4, 5, 11 y 10 del palo de la muestra son piezas, en ese orden. Si una pieza salió de muestra, el 12 de ese palo toma su fuerza y sus puntos.</p><div className="rank-list"><b>DE MAYOR A MENOR</b><p>Piezas → 1 de guitarras → 1 de baquetas → 7 de guitarras → 7 de notas → 3 → 2 → otros 1 → 12 → 11 → 10 → otros 7 → 6 → 5 → 4.</p></div><p>Las cartas del mismo escalón empardan entre equipos. Las figuras comunes valen 0 para envido y flor; del 1 al 7, su número.</p><h3>Los puntos de las piezas.</h3><p>2 = 30 · 4 = 29 · 5 = 28 · 11 = 27 · 10 = 27.</p></>}
    {tab === 'cantos' && <><h3>Truco, retruco, vale cuatro.</h3><p>Sin canto, la ronda vale 1. Queridos: 2, 3 y 4 puntos. No queridos: 1, 2 y 3 puntos para quien cantó. El equipo que aceptó tiene derecho a subir.</p><h3>El envido va primero.</h3><p>Se canta durante la primera baza. Una pieza suma su valor y la mayor carta común de las otras dos, sin importar el palo. Sin piezas: dos del mismo palo suman sus valores + 20; si las tres son distintas, la mayor.</p><p>Envido vale 2, real 3. Podés encadenar hasta dos envidos, un real y una falta, en ese orden. Rechazar el primer canto da 1; rechazar una subida da el valor acumulado anterior.</p><p>Falta envido reemplaza el acumulado: si ambos van en malas, decide el partido; si alguno va en buenas, vale lo que le falta al que va ganando para llegar a 30. Puede interrumpir un truco, que se responde después.</p><h3>Si hay flor, se canta.</h3><p>Hay flor con tres cartas del mismo palo, con dos o tres piezas, o con una pieza y otras dos cartas del mismo palo entre sí. Con una pieza se suma su valor y el nominal de las otras dos, aunque sean de otro palo: pieza del 4 (29) + 6 y 2 de guitarras = 37. Las figuras comunes valen 0. Con dos o tres piezas: la mayor completa, las demás menos 20 cada una, más las cartas comunes. Sin piezas: suma + 20.</p><p>Es obligatorio anunciarla antes de jugar. Anula el envido. Flor simple o flor y flor: 3 al ganador. Contraflor: 6 si quieren, 4 si no. Contraflor al resto: gana la partida si quieren, 4 si no. Los empates favorecen a mano.</p></>}
    <div className="rules-note"><ShieldCheck size={17}/><span>El servidor reparte, calcula los puntos y valida cada jugada. Tus cartas solo las ves vos.</span></div></div></Modal>;
}

