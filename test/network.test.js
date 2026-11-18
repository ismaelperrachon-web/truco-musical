import test from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { once } from 'node:events';
import { createGameServer } from '../server/index.js';
import { actionsFor } from '../server/game.js';

test('dos clientes: crear, compartir, jugar, rechazar intrusos y recuperar el asiento', { timeout: 15000 }, async t => {
  const server = await createGameServer();
  await new Promise(resolve => server.http.listen(0,'127.0.0.1',resolve));
  const url = `http://127.0.0.1:${server.http.address().port}`;
  const clients=[];
  t.after(async()=> { clients.forEach(c=>c.disconnect()); await server.close(); });
  async function client() {
    const socket=connect(url,{forceNew:true,transports:['websocket'],reconnection:false}); clients.push(socket);
    await once(socket,'connect'); return socket;
  }
  const a=await client(), b=await client();
  const host=await a.emitWithAck('create',{nickname:'Ana',capacity:2});
  assert.equal(host.ok,true); assert.ok(host.token);
  const guest=await b.emitWithAck('join',{nickname:'Luis',code:host.code});
  assert.equal(guest.ok,true); assert.equal(guest.state.you,1);
  const stateA=once(a,'state'),stateB=once(b,'state');
  const start=await a.emitWithAck('action',{action:'start',revision:guest.state.revision});
  assert.equal(start.ok,true);
  const [va]=await stateA,[vb]=await stateB;
  assert.equal(va.round.hand.length,3); assert.equal(vb.round.hand.length,3);
  const json=JSON.stringify(va);
  vb.round.hand.forEach(c=>assert.ok(!json.includes(JSON.stringify(c.id))));
  assert.ok(!json.includes(guest.token));
  const stale=await a.emitWithAck('action',{action:'fold',revision:0}); assert.ok(stale.error);
  const intruder=await client(); const no=await intruder.emitWithAck('join',{nickname:'Intruso',code:host.code}); assert.ok(no.error);
  const forged=await intruder.emitWithAck('action',{action:'fold',revision:va.revision}); assert.ok(forged.error);
  const before=va.round.hand.map(c=>c.id);
  const disconnected=once(b,'state'); a.disconnect(); await disconnected;
  const recovered=await client(); const restored=await recovered.emitWithAck('join',{code:host.code,token:host.token});
  assert.equal(restored.ok,true); assert.equal(restored.state.you,0); assert.deepEqual(restored.state.round.hand.map(c=>c.id),before);
  assert.ok(restored.state.players.every(p=>p.connected));
  const left=await b.emitWithAck('leave',{}); assert.equal(left.ok,true);
  const room=server.rooms.get(host.code); assert.equal(room.phase,'finished'); assert.equal(room.winner,0);
});

test('cuatro clientes juegan una ronda 2v2 con vistas privadas sincronizadas', { timeout: 15000 }, async t => {
  const server=await createGameServer();
  await new Promise(resolve=>server.http.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.http.address().port}`, clients=[];
  t.after(async()=>{clients.forEach(c=>c.disconnect());await server.close();});
  const views=[];
  for(let i=0;i<4;i++) {
    const socket=connect(url,{forceNew:true,transports:['websocket'],reconnection:false});
    clients.push(socket); await once(socket,'connect'); socket.on('state',view=>{views[i]=view;});
  }
  const host=await clients[0].emitWithAck('create',{nickname:'A',capacity:4});
  for(let i=1;i<4;i++) assert.equal((await clients[i].emitWithAck('join',{nickname:`P${i}`,code:host.code})).ok,true);
  const room=server.rooms.get(host.code);
  assert.equal((await clients[0].emitWithAck('action',{action:'start',revision:room.revision})).ok,true);
  // Un ciclo de eventos permite entregar los snapshots a todos los sockets.
  await new Promise(resolve=>setImmediate(resolve));
  for(let seat=0;seat<4;seat++) {
    assert.equal(views[seat].you,seat); assert.equal(views[seat].round.hand.length,3);
    for(let other=0;other<4;other++) if(other!==seat) for(const card of room.round.hands[other]) assert.ok(!JSON.stringify(views[seat]).includes(JSON.stringify(card.id)));
  }
  let steps=0;
  const played=new Set();
  while(room.phase==='playing' && steps++<40) {
    const seat=room.players.find(p=>actionsFor(room,p.seat).length)?.seat;
    assert.notEqual(seat,undefined);
    const available=actionsFor(room,seat);
    const action=['flor','accept','play'].find(a=>available.includes(a));
    assert.ok(action);
    if(action==='play') played.add(seat);
    const response=await clients[seat].emitWithAck('action',{action,revision:room.revision,cardId:action==='play'?room.round.hands[seat][0].id:undefined});
    assert.equal(response.ok,true,response.error);
  }
  assert.equal(room.phase,'between'); assert.equal(played.size,4);
  assert.ok(room.scores.some(n=>n>0));
});

test('flor corregida y resultados de contraflor llegan iguales a ambos jugadores', {timeout:15000}, async t=>{
  const server=await createGameServer();
  await new Promise(resolve=>server.http.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.http.address().port}`, clients=[];
  t.after(async()=>{clients.forEach(c=>c.disconnect());await server.close();});
  for(let i=0;i<2;i++) {
    const client=connect(url,{forceNew:true,transports:['websocket'],reconnection:false});
    clients.push(client);await once(client,'connect');
  }
  const host=await clients[0].emitWithAck('create',{nickname:'Ana',capacity:2});
  await clients[1].emitWithAck('join',{nickname:'Luis',code:host.code});
  const room=server.rooms.get(host.code);
  await clients[0].emitWithAck('action',{action:'start',revision:room.revision});
  // Reparto controlado en el servidor de prueba, sin rutas de debug en producción.
  const card=(number,suit)=>({id:`${suit}-${number}`,number,suit});
  room.round.sample=card(7,'microfonos');
  room.round.hands=[[card(4,'microfonos'),card(6,'guitarras'),card(2,'guitarras')],[card(7,'baquetas'),card(6,'baquetas'),card(5,'baquetas')]];
  room.round.original=structuredClone(room.round.hands);
  for(const [seat,action] of [[0,'flor'],[1,'flor'],[1,'contra']]) {
    const result=await clients[seat].emitWithAck('action',{action,revision:room.revision});assert.equal(result.ok,true);
  }
  const updates=clients.map(client=>once(client,'state'));
  assert.equal((await clients[0].emitWithAck('action',{action:'accept',revision:room.revision})).ok,true);
  const [a,b]=(await Promise.all(updates)).map(([view])=>view);
  assert.deepEqual(a.round.sideResults,b.round.sideResults);
  const result=a.round.sideResults[0];
  assert.deepEqual(result.entries.map(e=>e.value),[37,38]);
  assert.equal(result.winnerSeat,1);assert.equal(result.points,6);assert.equal(result.label,'Contraflor');
  assert.deepEqual(a.events,b.events);
  assert.deepEqual(a.events.slice(-2).map(e=>e.type),['call','result']);
  const publicJson=JSON.stringify(a.events);
  for(const card of room.round.hands.flat()) assert.ok(!publicJson.includes(JSON.stringify(card.id)));
});
