import { randomInt } from 'node:crypto';

export const SUITS = ['guitarras', 'baquetas', 'notas', 'microfonos'];
export const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
export const PIECES = [2, 4, 5, 11, 10];
const VALUES = { 2: 30, 4: 29, 5: 28, 11: 27, 10: 27 };
export const deck = () => SUITS.flatMap(suit => NUMBERS.map(number => ({ id: `${suit}-${number}`, suit, number })));
export function shuffle(cards) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function piece(card, sample) {
  if (card.suit !== sample.suit) return null;
  if (PIECES.includes(card.number)) return card.number;
  if (card.number === 12 && PIECES.includes(sample.number)) return sample.number;
  return null;
}
export const commonValue = card => card.number <= 7 ? card.number : 0;
export function rank(card, sample) {
  const p = piece(card, sample);
  if (p) return 100 - PIECES.indexOf(p);
  if (card.number === 1 && card.suit === 'guitarras') return 90;
  if (card.number === 1 && card.suit === 'baquetas') return 89;
  if (card.number === 7 && card.suit === 'guitarras') return 88;
  if (card.number === 7 && card.suit === 'notas') return 87;
  return ({ 3: 80, 2: 79, 1: 78, 12: 77, 11: 76, 10: 75, 7: 74, 6: 73, 5: 72, 4: 71 })[card.number];
}
export function flor(hand, sample) {
  const pieces = hand.filter(c => piece(c, sample));
  const values = pieces.map(c => VALUES[piece(c, sample)]).sort((a, b) => b - a);
  if (pieces.length >= 2) return values[0] + values.slice(1).reduce((sum, v) => sum + v - 20, 0) + hand.filter(c => !piece(c, sample)).reduce((sum, c) => sum + commonValue(c), 0);
  if (hand.every(c => c.suit === hand[0].suit)) {
    const ordinary = hand.filter(c => !piece(c, sample)).reduce((sum, c) => sum + commonValue(c), 0);
    return pieces.length ? values[0] + ordinary : 20 + ordinary;
  }
  return null;
}
export function envido(hand, sample) {
  const pieces = hand.filter(c => piece(c, sample));
  if (pieces.length) return Math.max(...pieces.map(c => VALUES[piece(c, sample)])) + Math.max(0, ...hand.filter(c => !piece(c, sample)).map(commonValue));
  let best = Math.max(...hand.map(commonValue));
  for (let i = 0; i < hand.length; i++) for (let j = i + 1; j < hand.length; j++) {
    if (hand[i].suit === hand[j].suit) best = Math.max(best, 20 + commonValue(hand[i]) + commonValue(hand[j]));
  }
  return best;
}
export const faltaPoints = scores => Math.max(...scores) < 15 ? 30 : 30 - Math.max(...scores);

// null: parda; undefined: todavía falta jugar. Equipo de mano: desempate final.
export function roundWinner(results, manoTeam) {
  if (!results.length) return undefined;
  if (results.length >= 2) {
    const [a, b] = results;
    if (a === null && b !== null) return b;
    if (a !== null && (b === null || a === b)) return a;
  }
  if (results.length < 3) return undefined;
  const [a, b, c] = results;
  if (c !== null) return c;
  if (a !== null) return a;
  if (b !== null) return b;
  return manoTeam;
}
