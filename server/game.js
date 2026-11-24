import { randomBytes, randomUUID } from 'node:crypto';
import { deck, shuffle, piece, rank, envido, flor, faltaPoints, roundWinner } from './rules.js';

export const LABELS = { truco: 'Truco', retruco: 'Retruco', cuatro: 'Vale cuatro', envido: 'Envido', real: 'Real envido', falta: 'Falta envido', flor: 'Flor', contra: 'Contraflor', resto: 'Contraflor al resto', accept: 'Quiero', decline: 'No quiero', fold: 'Me voy al mazo' };
const TRUCO = ['unused', 'unused', 'truco', 'retruco', 'cuatro'];
export const teamOf = seat => seat % 2;
const allConnected = room => room.players.length === room.capacity && room.players.every(p => p.connected);
export function makeRoom(nickname, capacity, socketId) {
  const room = { code: randomBytes(4).toString('hex').toUpperCase(), capacity, players: [], spectators: [], isPublic: true, host: 0, phase: 'waiting', scores: [0, 0], roundNumber: 0, mano: capacity - 1, round: null, winner: null, log: [], events: [], eventSequence: 0, revision: 0, createdAt: Date.now(), updated: Date.now() };
  const player = addPlayer(room, nickname, socketId);
  return { room, player };
}
export function addPlayer(room, nickname, socketId) {
  if (room.phase !== 'waiting' || room.players.length >= room.capacity) throw new Error('La mesa ya está completa o la partida comenzó.');
  const seat = Array.from({ length: room.capacity }, (_, i) => i).find(i => !room.players.some(p => p.seat === i));
  const player = { seat, nickname, token: randomUUID(), socketId, connected: true };
  room.players.push(player);
  note(room, `${nickname} se sentó a la mesa.`, 'join');
  return player;
}
export function addBot(room) {
  const nickname = ['Bot Oriental', 'Bot del Mate', 'Bot Candombe'].find(name => !room.players.some(p => p.isBot && p.nickname === name)) || 'Bot Oriental';
  const bot = addPlayer(room, nickname, null);
  bot.isBot = true; bot.token = null;
  return bot;
}
export function removeBot(room, seat) {
  const bot = room.players.find(p => p.seat === seat && p.isBot);
  if (room.phase !== 'waiting' || !bot) throw new Error('Solo se pueden quitar bots antes de repartir.');
  room.players = room.players.filter(p => p !== bot);
  note(room, 'Se liberó el lugar del bot.', 'join');
}
function note(room, message, type = 'info') {
  room.log.push({ id: randomUUID(), message, type });
  room.log = room.log.slice(-60);
}
function announce(room, data) {
  const event = { ...data, id: ++room.eventSequence, roundNumber: room.roundNumber };
  room.events.push(event);
  room.events = room.events.slice(-128);
  return event;
}
function announceCall(room, seat, action) {
  announce(room, { type: 'call', seat, nickname: room.players.find(p => p.seat === seat).nickname, label: LABELS[action] });
}
function award(room, team, points, reason) {
  room.scores[team] += points;
  note(room, `${reason} · Equipo ${team + 1} +${points}`, 'score');
  if (room.scores[team] >= 30) { room.phase = 'finished'; room.winner = team; if (room.round) room.round.pending = null; }
}
export function deal(room) {
  room.mano = (room.mano + 1) % room.capacity;
  room.roundNumber++;
  const cards = shuffle(deck());
  const hands = Array.from({ length: room.capacity }, () => []);
  for (let card = 0; card < 3; card++) for (let offset = 0; offset < room.capacity; offset++) hands[(room.mano + offset) % room.capacity].push(cards.pop());
  room.round = { sample: cards.pop(), hands, original: structuredClone(hands), turn: room.mano, leader: room.mano, current: [], lastTrick: [], table: [], tricks: [], truco: 1, lastTrucoTeam: null, pending: null, suspended: null, envidoDone: false, florDeclared: [], florDone: false, result: null, sideResults: [] };
  room.phase = 'playing';
  note(room, `Ronda ${room.roundNumber}. ${room.players.find(p => p.seat === room.mano).nickname} es mano.`, 'deal');
  announce(room, { type: 'deal' });
}
const holders = room => room.round.original.map((h, seat) => flor(h, room.round.sample) !== null ? seat : null).filter(s => s !== null);
const mustFlor = (room, seat) => !room.round.florDone && holders(room).includes(seat) && !room.round.florDeclared.includes(seat);
function canEnvido(room) {
  const r = room.round;
  return r.tricks.length === 0 && !r.envidoDone && !r.florDeclared.length;
}
function envidoRaises(p) {
  const sequence = p.sequence;
  if (sequence.includes('falta')) return [];
  const result = ['falta'];
  if (!sequence.includes('real')) {
    result.unshift('real');
    if (sequence.filter(c => c === 'envido').length < 2) result.unshift('envido');
  }
  return result;
}
export function actionsFor(room, seat) {
  if (!room.players.some(p => p.seat === seat)) return [];
  if (room.phase === 'waiting') return seat === room.host && allConnected(room) ? ['start'] : [];
  if (room.phase === 'between') return seat === room.host && allConnected(room) ? ['next'] : [];
  if (room.phase === 'finished') return seat === room.host && allConnected(room) ? ['rematch'] : [];
  if (!allConnected(room)) return [];
  const r = room.round, p = r.pending, team = teamOf(seat);
  if (p?.kind === 'flor') {
    if (holders(room).some(s => !r.florDeclared.includes(s))) return mustFlor(room, seat) ? ['flor'] : [];
    if (p.team === team) return [];
    return ['accept', 'decline', ...(p.level === 'flor' ? ['contra', 'resto'] : p.level === 'contra' ? ['resto'] : [])];
  }
  if (mustFlor(room, seat)) return ['flor'];
  // Resolver primero todas las flores evita cobrar envido o cerrar una ronda
  // antes de que un compañero anuncie su flor obligatoria.
  if (!r.florDone && holders(room).some(s => !r.florDeclared.includes(s))) return [];
  if (p) {
    if (p.team === team) return [];
    if (p.kind === 'envido') return ['accept', 'decline', ...envidoRaises(p)];
    return ['accept', 'decline', ...(p.target < 4 ? [TRUCO[p.target + 1]] : []), ...(canEnvido(room) ? ['envido', 'real', 'falta'] : [])];
  }
  if (seat !== r.turn) return [];
  return ['play', 'fold', ...(r.truco < 4 && r.lastTrucoTeam !== team ? [TRUCO[r.truco + 1]] : []), ...(canEnvido(room) ? ['envido', 'real', 'falta'] : [])];
}
function best(room, kind) {
  const r = room.round;
  const entries = [];
  for (let offset = 0; offset < room.capacity; offset++) {
    const seat = (room.mano + offset) % room.capacity;
    const value = kind === 'flor' ? flor(r.original[seat], r.sample) : envido(r.original[seat], r.sample);
    if (value !== null) entries.push({ seat, value });
  }
  // El orden circular conserva la prioridad de mano, también entre compañeros.
  const winner = entries.reduce((a, b) => b.value > a.value ? b : a);
  return { winner, entries };
}
function settleCanto(room, kind, label, points, comparison = best(room, kind)) {
  const { winner, entries } = comparison;
  const result = {
    kind, label, winnerSeat: winner.seat, team: teamOf(winner.seat), points,
    tied: entries.some(e => e.value === winner.value && teamOf(e.seat) !== teamOf(winner.seat)),
    mano: room.mano,
    entries: room.players.map(p => ({ seat: p.seat, nickname: p.nickname, value: entries.find(e => e.seat === p.seat)?.value ?? null }))
  };
  award(room, result.team, points, label);
  result.matchWon = room.phase === 'finished';
  const event = announce(room, { type: 'result', result });
  room.round.sideResults.push({ ...result, id: event.id });
}
function resume(room) {
  if (room.phase === 'finished') return;
  room.round.pending = room.round.suspended;
  room.round.suspended = null;
}
function endRound(room, team, reason) {
  const r = room.round;
  r.result = { team, reason, points: r.truco };
  r.pending = null;
  award(room, team, r.truco, reason);
  if (room.phase !== 'finished') room.phase = 'between';
}
function declareFlor(room, seat) {
  const r = room.round;
  if (r.pending?.kind === 'truco') r.suspended = r.pending;
  r.envidoDone = true;
  r.florDeclared.push(seat);
  note(room, `${room.players.find(p => p.seat === seat).nickname}: ¡Flor!`, 'call');
  announceCall(room, seat, 'flor');
  if (r.pending?.kind !== 'flor') r.pending = { kind: 'flor', level: 'flor', team: teamOf(seat), caller: seat, label: 'Flor', points: 3, decline: 3 };
  const florHolders = holders(room);
  if (florHolders.some(s => !r.florDeclared.includes(s))) return;
  if (new Set(florHolders.map(teamOf)).size === 1) {
    r.florDone = true;
    settleCanto(room, 'flor', 'Flor sin rival', 3);
    resume(room);
  }
}
export function act(room, seat, action, cardId) {
  if (!actionsFor(room, seat).includes(action)) throw new Error('Esa jugada no está disponible ahora.');
  if (action === 'start' || action === 'next') { deal(room); return; }
  if (action === 'rematch') { room.scores = [0, 0]; room.winner = null; room.roundNumber = 0; room.mano = room.capacity - 1; deal(room); return; }
  const r = room.round, team = teamOf(seat), p = r.pending;
  const name = room.players.find(player => player.seat === seat).nickname;
  if (action === 'flor') { declareFlor(room, seat); return; }
  if (action === 'play') {
    const index = r.hands[seat].findIndex(c => c.id === cardId);
    if (index < 0) throw new Error('Esa carta no está en tu mano.');
    const [card] = r.hands[seat].splice(index, 1);
    const event = announce(room, { type: 'card', seat, nickname: name, card });
    const play = { seat, card, trick: r.tricks.length, eventId: event.id };
    r.current.push(play); r.table.push(play);
    note(room, `${name} tiró ${card.number} de ${card.suit}.`, 'card');
    if (r.current.length < room.capacity) { r.turn = (seat + 1) % room.capacity; return; }
    const max = Math.max(...r.current.map(play => rank(play.card, r.sample)));
    const winners = r.current.filter(play => rank(play.card, r.sample) === max);
    const winner = new Set(winners.map(play => teamOf(play.seat))).size === 1 ? teamOf(winners[0].seat) : null;
    r.tricks.push(winner);
    note(room, winner === null ? 'Baza parda.' : `Equipo ${winner + 1} ganó la baza.`, 'trick');
    const result = roundWinner(r.tricks, teamOf(room.mano));
    r.lastTrick = r.current; r.current = [];
    if (result !== undefined) endRound(room, result, 'Ronda ganada');
    else { r.leader = winner === null ? r.leader : winners[0].seat; r.turn = r.leader; }
    return;
  }
  if (action === 'fold') { announceCall(room, seat, action); endRound(room, 1 - team, `${name} se fue al mazo`); return; }
  if (['truco', 'retruco', 'cuatro'].includes(action)) {
    const target = TRUCO.indexOf(action);
    r.pending = { kind: 'truco', caller: seat, team, target, label: LABELS[action], decline: target - 1 };
  } else if (['envido', 'real', 'falta'].includes(action)) {
    if (p?.kind === 'truco') r.suspended = p;
    const sequence = p?.kind === 'envido' ? [...p.sequence, action] : [action];
    const previous = p?.kind === 'envido' ? p.points : 1;
    const points = action === 'falta' ? faltaPoints(room.scores) : (p?.kind === 'envido' ? p.points : 0) + (action === 'real' ? 3 : 2);
    r.pending = { kind: 'envido', caller: seat, team, label: sequence.map(a => LABELS[a]).join(' + '), sequence, points, decline: previous };
  } else if (['contra', 'resto'].includes(action)) {
    r.pending = { kind: 'flor', caller: seat, team, level: action, label: LABELS[action], points: action === 'resto' ? 30 : 6, decline: 4 };
  } else if (action === 'accept' || action === 'decline') {
    note(room, `${name}: ${LABELS[action]}.`, 'call');
    announceCall(room, seat, action);
    if (p.kind === 'truco') {
      if (action === 'decline') { r.truco = p.decline; endRound(room, p.team, `${p.label} no querido`); }
      else { r.truco = p.target; r.lastTrucoTeam = p.team; r.pending = null; }
    } else {
      if (p.kind === 'envido') r.envidoDone = true;
      else r.florDone = true;
      if (action === 'decline') award(room, p.team, p.decline, `${p.label} no querido`);
      else {
        const { winner, entries } = best(room, p.kind);
        note(room, entries.map(e => `${room.players.find(player => player.seat === e.seat).nickname}: ${e.value}`).join(' · '), 'reveal');
        // Falta y resto en malas ganan la partida completa, incluso con marcador previo.
        const points = (p.kind === 'flor' && p.level === 'resto') || (p.kind === 'envido' && p.sequence.includes('falta') && Math.max(...room.scores) < 15) ? 30 - room.scores[teamOf(winner.seat)] : p.points;
        settleCanto(room, p.kind, p.label, points, { winner, entries });
      }
      resume(room);
    }
    return;
  }
  note(room, `${name}: ¡${LABELS[action]}!`, 'call');
  announceCall(room, seat, action);
}
export function snapshot(room, seat = null) {
  const r = room.round;
  const player = room.players.find(p => p.seat === seat);
  return {
    code: room.code, capacity: room.capacity, host: room.host, phase: room.phase, scores: room.scores, isPublic: room.isPublic,
    role: player ? 'player' : 'spectator', spectatorCount: room.spectators.length,
    mano: room.mano, roundNumber: room.roundNumber, winner: room.winner, revision: room.revision,
    players: room.players.map(p => ({ seat: p.seat, nickname: p.nickname, connected: p.connected, isBot: Boolean(p.isBot), count: r?.hands[p.seat]?.length ?? 0 })),
    log: room.log, events: room.events, you: player ? seat : null, actions: player ? actionsFor(room, seat) : [],
    round: r ? {
      sample: r.sample, turn: r.turn, table: r.table, current: r.current, lastTrick: r.lastTrick, tricks: r.tricks,
      truco: r.truco, pending: r.pending ? { kind: r.pending.kind, label: r.pending.label, team: r.pending.team, caller: r.pending.caller, points: r.pending.points ?? r.pending.target } : null,
      result: r.result, sideResults: r.sideResults, florDeclared: r.florDeclared,
      awaitingFlor: !r.florDone && holders(room).some(s => !r.florDeclared.includes(s)),
      hand: player ? r.hands[seat].map(c => ({ ...c, piece: piece(c, r.sample) })) : [],
      envido: player ? envido(r.original[seat], r.sample) : null, flor: player ? flor(r.original[seat], r.sample) : null
    } : null
  };
}
