import { rank } from './rules.js';

// Recibe exactamente la vista privada de un jugador, nunca las manos rivales.
export function chooseBotAction(view, random = Math.random) {
  const { actions, round, you } = view;
  if (!round || !actions.length || view.role !== 'player') return null;
  const available = action => actions.includes(action);
  const choose = action => ({ action });
  if (available('flor')) return choose('flor');
  const cards = [...round.hand].sort((a, b) => rank(a, round.sample) - rank(b, round.sample));
  const ownCards = [...cards, ...round.table.filter(p => p.seat === you).map(p => p.card)];
  const strength = ownCards.map(c => rank(c, round.sample)).sort((a, b) => b - a);
  const strong = strength[0] >= 90 && strength[1] >= 80;
  if (round.pending) {
    if (round.pending.kind === 'envido') {
      if (round.envido >= 33 && available('real') && random() < .3) return choose('real');
      return choose(round.envido < 25 && random() < .75 ? 'decline' : 'accept');
    }
    if (round.pending.kind === 'flor') {
      if (round.flor >= 42 && available('contra') && random() < .4) return choose('contra');
      return choose(round.flor < 29 && random() < .6 ? 'decline' : 'accept');
    }
    if (round.envido >= 29 && available('envido')) return choose('envido');
    if (strong && available('retruco') && random() < .35) return choose('retruco');
    return choose(strength[0] < 80 && random() < .65 ? 'decline' : 'accept');
  }
  if (round.envido >= 28 && available('envido') && random() < .6) return choose('envido');
  if (strong && available('truco') && random() < .4) return choose('truco');
  if (!available('play') || !cards.length) return null;
  const current = round.current;
  let card = cards.at(-1);
  if (current.length) {
    const top = Math.max(...current.map(p => rank(p.card, round.sample)));
    const leaders = current.filter(p => rank(p.card, round.sample) === top);
    const partnerWinning = leaders.every(p => p.seat % 2 === you % 2);
    card = partnerWinning ? cards[0] : cards.find(c => rank(c, round.sample) > top) || cards[0];
  }
  return { action: 'play', cardId: card.id };
}
