import test from 'node:test';
import assert from 'node:assert/strict';
import { deck, shuffle, rank, piece, envido, flor, roundWinner, faltaPoints } from '../server/rules.js';
const c = (number, suit = 'guitarras') => ({ id: `${suit}-${number}`, number, suit });

test('mazo español: 40 cartas únicas, sin 8 ni 9; barajado sin pérdida', () => {
  const cards = deck();
  assert.equal(cards.length, 40); assert.equal(new Set(cards.map(c => c.id)).size, 40);
  assert.ok(cards.every(c => ![8, 9].includes(c.number)));
  assert.deepEqual(shuffle(cards).map(c => c.id).sort(), cards.map(c => c.id).sort());
});
test('jerarquía completa y empates ordinarios', () => {
  const sample = c(6, 'notas');
  const order = [c(2, 'notas'), c(4, 'notas'), c(5, 'notas'), c(11, 'notas'), c(10, 'notas'), c(1), c(1, 'baquetas'), c(7), c(7, 'notas'), c(3), c(2), c(1, 'microfonos'), c(12), c(11), c(10), c(7, 'microfonos'), c(6), c(5), c(4)];
  for (let i = 1; i < order.length; i++) assert.ok(rank(order[i - 1], sample) > rank(order[i], sample));
  for (const n of [3, 2, 12, 11, 10, 6, 5, 4]) assert.equal(rank(c(n), sample), rank(c(n, 'baquetas'), sample));
});
test('el rey sustituye exactamente las cinco posibles piezas de muestra', () => {
  for (const n of [2, 4, 5, 11, 10]) {
    const sample = c(n, 'microfonos'), king = c(12, 'microfonos');
    assert.equal(piece(king, sample), n);
    assert.equal(rank(king, sample), rank(c(n, 'microfonos'), c(6, 'microfonos')));
    assert.equal(piece(c(12), sample), null);
  }
  assert.equal(piece(c(12), c(7)), null);
});
test('envido: una pieza, dos del palo, tres palos y figuras', () => {
  const sample = c(6, 'notas');
  assert.equal(envido([c(4, 'notas'), c(6), c(1, 'baquetas')], sample), 35);
  assert.equal(envido([c(7), c(6), c(12, 'baquetas')], sample), 33);
  assert.equal(envido([c(12), c(10), c(7, 'baquetas')], sample), 20);
  assert.equal(envido([c(7), c(6, 'baquetas'), c(12, 'microfonos')], sample), 7);
  assert.equal(envido([c(12, 'notas'), c(6), c(1, 'baquetas')], c(2, 'notas')), 36);
});
test('flor: los tres casos, rey sustituto y convención confirmada con una pieza', () => {
  const sample = c(6, 'notas');
  assert.equal(flor([c(7), c(6), c(1)], sample), 34);
  assert.equal(flor([c(2, 'notas'), c(5, 'notas'), c(6)], sample), 44);
  assert.equal(flor([c(2, 'notas'), c(4, 'notas'), c(5, 'notas')], sample), 47);
  assert.equal(flor([c(2, 'notas'), c(7, 'notas'), c(1, 'notas')], sample), 38);
  assert.equal(flor([c(12, 'notas'), c(4, 'notas'), c(6)], c(2, 'notas')), 45);
  assert.equal(flor([c(2, 'notas'), c(7), c(6)], sample), null);
  assert.equal(flor([c(7), c(6, 'baquetas'), c(1, 'microfonos')], sample), null);
});
test('resolución de bazas: todas las combinaciones de pardas', () => {
  const cases = [ [[0], undefined], [[null], undefined], [[0,0],0], [[1,1],1], [[null,0],0], [[null,1],1], [[0,null],0], [[1,null],1], [[0,1],undefined], [[null,null],undefined], [[0,1,0],0], [[0,1,1],1], [[0,1,null],0], [[1,0,null],1], [[null,null,1],1], [[null,null,null],0] ];
  for (const [results, expected] of cases) assert.equal(roundWinner(results, 0), expected, JSON.stringify(results));
  assert.equal(roundWinner([null,null,null], 1), 1);
});
test('falta envido: frontera de malas y buenas', () => {
  assert.equal(faltaPoints([14,14]), 30); assert.equal(faltaPoints([0,0]), 30);
  assert.equal(faltaPoints([15,1]), 15); assert.equal(faltaPoints([20,27]), 3);
});
