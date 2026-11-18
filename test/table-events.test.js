import test from 'node:test';
import assert from 'node:assert/strict';
import { collectTableEvents } from '../src/tableEvents.js';

test('carteles: ingreso no reproduce historia; cada evento posterior se procesa una sola vez', () => {
  const room={code:'A',events:[{id:1,type:'call'}]};
  const joined=collectTableEvents(null,room);assert.deepEqual(joined.events,[]);
  room.events.push({id:2,type:'call'},{id:3,type:'result'});
  const live=collectTableEvents(joined.cursor,room);
  assert.deepEqual(live.events.map(e=>e.id),[2,3]);
  assert.deepEqual(collectTableEvents(live.cursor,room).events,[]);
  assert.deepEqual(collectTableEvents(live.cursor,{code:'B',events:[{id:1,type:'card'}]}).events,[]);
  assert.equal(collectTableEvents(live.cursor,null).reset,true);
});

test('carteles: reconexión recupera novedades en orden y una vista vieja no retrocede el cursor', () => {
  const current={code:'A',lastId:8};
  const resumed=collectTableEvents(current,{code:'A',events:[{id:8},{id:9,type:'call'},{id:10,type:'card'}]});
  assert.deepEqual(resumed.events.map(e=>e.id),[9,10]);
  const old=collectTableEvents(resumed.cursor,{code:'A',events:[{id:8}]});
  assert.equal(old.cursor.lastId,10);assert.deepEqual(old.events,[]);
});
