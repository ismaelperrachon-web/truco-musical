import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRoom, addBot, removeBot, act, snapshot, actionsFor } from '../server/game.js';
import { chooseBotAction } from '../server/bot.js';

test('bots ocupan asientos y se pueden quitar solamente antes de repartir', () => {
  const {room}=makeRoom('Ana',4,'human');
  addBot(room);addBot(room);addBot(room);
  assert.equal(new Set(room.players.map(p=>p.nickname)).size,4);
  assert.ok(room.players.slice(1).every(p=>p.isBot && p.connected && p.token===null && p.socketId===null));
  removeBot(room,2);assert.equal(room.players.length,3);
  addBot(room);assert.equal(room.players.find(p=>p.seat===2).isBot,true);
  act(room,0,'start');assert.throws(()=>removeBot(room,1));assert.throws(()=>addBot(room));
});

test('bots completan partidas 1v1 y 2v2 con jugadas válidas y sin mutar su vista', () => {
  for(const capacity of [2,4]) for(let run=0;run<12;run++) {
    const {room}=makeRoom('Ana',capacity,'human');
    for(let i=1;i<capacity;i++) addBot(room);
    act(room,0,'start');
    let steps=0;
    while(room.phase!=='finished' && steps++<2500) {
      if(room.phase==='between') { act(room,0,'next');continue; }
      const p=room.players.find(p=>actionsFor(room,p.seat).length);
      assert.ok(p,'La partida debe tener una acción disponible');
      const view=structuredClone(snapshot(room,p.seat)),before=structuredClone(view);
      const decision=chooseBotAction(view,()=>[0,.4,.99][steps%3]);
      assert.deepEqual(view,before);assert.ok(decision);assert.ok(view.actions.includes(decision.action));
      if(decision.action==='play') assert.ok(view.round.hand.some(c=>c.id===decision.cardId));
      act(room,p.seat,decision.action,decision.cardId);
    }
    assert.equal(room.phase,'finished');assert.ok(room.scores.some(n=>n>=30));
  }
});

test('la vista del espectador no contiene manos, tantos privados ni acciones', () => {
  const {room}=makeRoom('Ana',2,'human');addBot(room);act(room,0,'start');
  const view=snapshot(room),serialized=JSON.stringify(view);
  assert.equal(view.role,'spectator');assert.equal(view.you,null);assert.deepEqual(view.actions,[]);
  assert.deepEqual(view.round.hand,[]);assert.equal(view.round.envido,null);assert.equal(view.round.flor,null);
  for(const card of room.round.hands.flat()) assert.ok(!serialized.includes(JSON.stringify(card.id)));
  assert.ok(!serialized.includes(room.players[0].token));
  assert.equal(chooseBotAction(view),null);
});
