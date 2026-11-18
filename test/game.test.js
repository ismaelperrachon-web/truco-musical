import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRoom, addPlayer, deal, act, snapshot, actionsFor } from '../server/game.js';
const c = (number, suit = 'guitarras') => ({ id: `${suit}-${number}`, number, suit });
function game(capacity = 2, hands) {
  const { room } = makeRoom('Ana', capacity, 'socket-0');
  for (let i = 1; i < capacity; i++) addPlayer(room, `Jugador ${i}`, `socket-${i}`);
  deal(room); room.round.sample = c(6, 'microfonos');
  room.round.hands = hands || [ [c(1), c(6, 'baquetas'), c(3, 'notas')], [c(7), c(5, 'baquetas'), c(3)] ];
  room.round.original = structuredClone(room.round.hands);
  return room;
}
test('reparto de 2v2 sin duplicados y mano rotativa', () => {
  const { room } = makeRoom('Ana', 4, '0');
  for (let i = 1; i < 4; i++) addPlayer(room, String(i), String(i));
  act(room, 0, 'start');
  assert.equal(new Set([...room.round.hands.flat(), room.round.sample].map(c => c.id)).size, 13);
  assert.ok(room.round.hands.every(hand => hand.length === 3));
  assert.equal(room.mano, 0); deal(room); assert.equal(room.mano, 1);
});
test('no se puede jugar fuera de turno ni una carta ajena; sin cambios al rechazar', () => {
  const room = game(), before = structuredClone(room);
  assert.throws(() => act(room, 1, 'play', c(7).id));
  assert.throws(() => act(room, 0, 'play', c(7).id));
  assert.deepEqual(room, before);
  act(room, 0, 'play', c(1).id); assert.equal(room.round.turn, 1);
  assert.throws(() => act(room, 0, 'play', c(1).id));
});
test('truco escalado sin aceptar, rechazo y derecho a subir tras aceptar', () => {
  let room = game(); act(room, 0, 'truco'); act(room, 1, 'retruco'); act(room, 0, 'decline');
  assert.deepEqual(room.scores, [0,2]); assert.equal(room.phase, 'between');
  room = game(); act(room, 0, 'truco'); act(room, 1, 'accept');
  assert.ok(!actionsFor(room, 0).includes('retruco'));
  act(room, 0, 'play', c(1).id); assert.ok(actionsFor(room, 1).includes('retruco'));
  act(room, 1, 'retruco'); act(room, 0, 'cuatro'); act(room, 1, 'decline');
  assert.deepEqual(room.scores, [3,0]);
});
test('envido encadenado, real y rechazo de una subida', () => {
  const room = game(); act(room, 0, 'envido'); act(room, 1, 'envido'); act(room, 0, 'real');
  assert.equal(room.round.pending.points, 7);
  assert.ok(!actionsFor(room, 1).includes('envido'));
  act(room, 1, 'decline'); assert.equal(room.scores[0], 4);
  assert.equal(room.round.envidoDone, true); assert.ok(!actionsFor(room, 0).includes('envido'));
});
test('empate de envido a favor de mano', () => {
  const room = game(2, [[c(7), c(5, 'baquetas'), c(10, 'notas')], [c(7, 'baquetas'), c(6, 'notas'), c(12)]]);
  act(room, 0, 'envido'); act(room, 1, 'accept'); assert.deepEqual(room.scores, [2,0]);
  const result=snapshot(room,1).round.sideResults[0];
  assert.equal(result.winnerSeat,0); assert.equal(result.tied,true); assert.equal(result.points,2);
  assert.deepEqual(result.entries.map(e=>e.value),[7,7]);
});
test('envido tiene prioridad y el truco pendiente reaparece', () => {
  const room = game(); act(room, 0, 'truco'); act(room, 1, 'envido'); act(room, 0, 'accept');
  assert.equal(room.round.pending.kind, 'truco'); assert.equal(room.round.pending.team, 0);
  act(room, 1, 'accept'); assert.equal(room.round.truco, 2);
});
test('falta envido gana en malas y calcula distancia del líder en buenas', () => {
  const hands = [[c(7),c(6),c(1,'baquetas')], [c(5,'baquetas'),c(3,'notas'),c(10)]];
  let room = game(2,hands); room.scores = [14,13]; act(room, 0, 'falta'); act(room, 1, 'accept');
  assert.equal(room.phase, 'finished'); assert.equal(room.winner, 0); assert.equal(room.scores[0], 30);
  assert.equal(room.round.sideResults[0].points,16); assert.equal(room.round.sideResults[0].matchWon,true);
  room = game(2,hands); room.scores = [23,14]; act(room, 0, 'falta'); act(room, 1, 'accept');
  assert.deepEqual(room.scores, [30,14]);
});

test('la combinación corregida habilita Flor obligatoria y publica sus 37 tantos', () => {
  const room=game(2,[[c(4,'microfonos'),c(6),c(2)], [c(7,'baquetas'),c(6,'notas'),c(12)]]);
  assert.deepEqual(actionsFor(room,0),['flor']);
  assert.equal(snapshot(room,0).round.flor,37);
  assert.equal(snapshot(room,1).round.flor,null);
  act(room,0,'flor');
  assert.deepEqual(room.scores,[3,0]);
  const result=room.round.sideResults[0];
  assert.deepEqual(result.entries.map(e=>e.value),[37,null]);
  assert.equal(result.winnerSeat,0); assert.equal(result.points,3);
  assert.equal(room.events.at(-2).label,'Flor'); assert.equal(room.events.at(-1).type,'result');
});

test('contraflor querida muestra puntos, ganador y 6 puntos otorgados', () => {
  const room=game(2,[[c(4,'microfonos'),c(6),c(2)], [c(7,'baquetas'),c(6,'baquetas'),c(5,'baquetas')]]);
  act(room,0,'flor');act(room,1,'flor');act(room,1,'contra');act(room,0,'accept');
  const result=room.round.sideResults[0];
  assert.deepEqual(result.entries.map(e=>e.value),[37,38]);
  assert.equal(result.winnerSeat,1);assert.equal(result.points,6);assert.equal(result.tied,false);
  assert.equal(room.events.at(-2).label,'Quiero');
  const {id,...saved}=result; assert.equal(room.events.at(-1).id,id); assert.deepEqual(room.events.at(-1).result,saved);
  assert.equal(room.events.at(-1).result.points,room.scores[1]);
});

test('eventos públicos identifican cartas y cantos sin exponer manos ni duplicar IDs', () => {
  const room=game();
  const before=room.events.length;
  act(room,0,'truco');act(room,1,'retruco');act(room,0,'cuatro');act(room,1,'accept');
  assert.deepEqual(room.events.slice(before).map(e=>e.label),['Truco','Retruco','Vale cuatro','Quiero']);
  act(room,0,'play',c(1).id);
  const event=room.events.at(-1);
  assert.equal(event.type,'card');assert.equal(event.nickname,'Ana');assert.equal(event.card.id,c(1).id);
  assert.equal(room.round.table[0].eventId,event.id);
  const json=JSON.stringify(snapshot(room,1).events);
  for(const card of room.round.hands[0]) assert.ok(!json.includes(JSON.stringify(card.id)));
  assert.equal(new Set(room.events.map(e=>e.id)).size,room.events.length);
  act(room,1,'fold');assert.equal(room.events.at(-1).label,'Me voy al mazo');
});

test('envido no querido anuncia rechazo sin revelar tantos', () => {
  const room=game();act(room,0,'real');act(room,1,'decline');
  assert.deepEqual(room.events.slice(-2).map(e=>e.label),['Real envido','No quiero']);
  assert.equal(room.round.sideResults.length,0);
  assert.ok(room.events.every(e=>e.type!=='result'));
});

test('empate 2v2: todos los tantos y prioridad circular desde mano', () => {
  const room=game(4,[[c(7),c(1,'baquetas'),c(10,'notas')], [c(6),c(1,'notas'),c(10,'baquetas')], [c(7,'baquetas'),c(1),c(12,'notas')], [c(7,'notas'),c(2,'baquetas'),c(11)]]);
  room.mano=2;room.round.turn=2;room.round.leader=2;
  act(room,2,'envido');act(room,3,'accept');
  const result=room.round.sideResults[0];
  assert.deepEqual(result.entries.map(e=>e.value),[7,6,7,7]);
  assert.equal(result.winnerSeat,2);assert.equal(result.mano,2);assert.equal(result.tied,true);
  assert.deepEqual(snapshot(room,0).events,snapshot(room,3).events);
});
test('flor obligatoria, simple, contraflor y resto', () => {
  const hands = [[c(7),c(6),c(1)], [c(7,'baquetas'),c(6,'notas'),c(12)]];
  let room = game(2, hands);
  assert.deepEqual(actionsFor(room, 0), ['flor']); assert.deepEqual(actionsFor(room, 1), []);
  act(room, 0, 'flor'); assert.equal(room.scores[0], 3); assert.equal(room.round.envidoDone, true);
  const both = [[c(7),c(6),c(1)], [c(7,'baquetas'),c(6,'baquetas'),c(5,'baquetas')]];
  room = game(2, both); act(room, 0, 'flor'); act(room, 1, 'flor'); act(room, 1, 'contra'); act(room, 0, 'decline');
  assert.deepEqual(room.scores, [0,4]);
  room = game(2, both); act(room, 0, 'flor'); act(room, 1, 'flor'); act(room, 1, 'resto'); act(room, 0, 'accept');
  assert.equal(room.phase, 'finished'); assert.equal(room.winner, 1);
});
test('flor y flor acepta por 3; contraflor querida por 6', () => {
  const both = [[c(7),c(6),c(1)], [c(7,'baquetas'),c(6,'baquetas'),c(5,'baquetas')]];
  for (const [raise, points] of [[null,3], ['contra',6]]) {
    const room = game(2, both); act(room,0,'flor'); act(room,1,'flor');
    if (raise) { act(room,1,raise); act(room,0,'accept'); } else act(room,1,'accept');
    assert.equal(room.scores[1],points);
  }
});
test('dos bazas ganadas cierran ronda, no se permite envido desde la segunda', () => {
  const room = game(); act(room,0,'play',c(1).id); act(room,1,'play',c(7).id);
  assert.equal(room.round.turn,0); assert.ok(!actionsFor(room,0).includes('envido'));
  act(room,0,'play',c(6,'baquetas').id); act(room,1,'play',c(5,'baquetas').id);
  assert.equal(room.phase,'between'); assert.equal(room.scores[0],1);
});
test('privacidad: snapshot nunca incluye manos ajenas, mazo ni tokens', () => {
  const room = game(); const view = snapshot(room, 0); const json = JSON.stringify(view);
  assert.equal(view.round.hand.length,3);
  for (const card of room.round.hands[1]) assert.ok(!json.includes(JSON.stringify(card.id)));
  for (const p of room.players) { assert.ok(!json.includes(p.token)); assert.ok(!json.includes(p.socketId)); }
  assert.ok(!('original' in view.round)); assert.ok(!('hands' in view.round));
});
test('sin conexión se pausa; 2v2 desempata una baza por equipo y respeta el orden', () => {
  const room = game(4, [[c(3),c(6),c(1,'notas')], [c(2),c(5),c(10,'notas')], [c(3,'baquetas'),c(6,'baquetas'),c(7,'microfonos')], [c(2,'notas'),c(5,'baquetas'),c(11)]]);
  room.players[1].connected=false; assert.deepEqual(actionsFor(room,0),[]); room.players[1].connected=true;
  for (let seat=0;seat<4;seat++) act(room,seat,'play',room.round.hands[seat][0].id);
  assert.equal(room.round.tricks[0],0); assert.equal(room.round.turn,0);
});
test('partidas completas aleatorias 1v1 y 2v2 no se atascan', () => {
  for (const capacity of [2,4]) for (let run=0;run<12;run++) {
    const {room}=makeRoom('A',capacity,'s0');
    for(let i=1;i<capacity;i++) addPlayer(room,`P${i}`,`s${i}`);
    let steps=0;
    while(room.phase!=='finished' && steps++<2000) {
      const choices=room.players.map(p=>({seat:p.seat,actions:actionsFor(room,p.seat)})).filter(p=>p.actions.length);
      assert.ok(choices.length, `Bloqueo: ${JSON.stringify(snapshot(room,0))}`);
      const player=choices[0];
      const selected=['start','next','flor','accept','play'].find(a=>player.actions.includes(a));
      assert.ok(selected);
      act(room,player.seat,selected,selected==='play'?room.round.hands[player.seat][0].id:undefined);
    }
    assert.equal(room.phase,'finished'); assert.ok(room.scores.some(s=>s>=30));
  }
});
