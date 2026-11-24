import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { createGameServer } from '../server/index.js';
import { chooseBotAction } from '../server/bot.js';

async function setup(t,options={}) {
  const server=await createGameServer(options),clients=[];
  await new Promise(resolve=>server.http.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.http.address().port}`;
  t.after(async()=>{clients.forEach(c=>c.disconnect());await server.close();});
  const connect=async()=>{
    const client=io(url,{forceNew:true,transports:['websocket'],reconnection:false,autoConnect:false});clients.push(client);
    client.on('directory',data=>{client.directory=data;});client.on('state',data=>{client.view=data;});
    const connected=once(client,'connect');client.connect();await connected;return client;
  };
  return {server,connect};
}
function until(client,event,predicate,current) {
  if(predicate(current())) return Promise.resolve(current());
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{client.off(event,listener);reject(new Error(`No llegó ${event}`));},3000);
    const listener=data=>{if(predicate(data)){clearTimeout(timer);client.off(event,listener);resolve(data);}};
    client.on(event,listener);
  });
}
const directory=(client,predicate)=>until(client,'directory',predicate,()=>client.directory);
const state=(client,predicate)=>until(client,'state',predicate,()=>client.view);
const call=(client,event,payload={})=>client.timeout(3000).emitWithAck(event,payload);

test('presencia y mesas públicas permiten entrar desde la lista; privadas ocultan su código', {timeout:12000},async t=>{
  const {connect}=await setup(t),a=await connect(),b=await connect(),c=await connect();
  const whoA=await call(a,'identify',{nickname:'Ana'}),whoB=await call(b,'identify',{nickname:'Bruno'});
  assert.ok(whoA.selfId && whoB.selfId && whoA.selfId!==a.id);
  const online=await directory(b,d=>d?.people.length===2);
  assert.ok(online.people.some(p=>p.nickname==='Ana' && p.status==='available'));
  assert.ok(!JSON.stringify(online).includes(a.id));
  const host=await call(a,'create',{nickname:'Ana',capacity:2,isPublic:true});
  const listed=await directory(b,d=>d?.rooms.some(r=>r.code===host.code));
  const room=listed.rooms.find(r=>r.code===host.code);
  assert.equal(room.filled,1);assert.equal(room.host,'Ana');assert.ok(!JSON.stringify(listed).includes(host.token));
  const joined=await call(b,'join',{code:room.code,nickname:'Bruno'});assert.equal(joined.ok,true);
  await directory(c,d=>d?.rooms.find(r=>r.code===host.code)?.filled===2);
  assert.ok((await call(c,'join',{code:room.code,nickname:'Caro'})).error);
  const hidden=await call(c,'create',{nickname:'Caro',capacity:2,isPublic:false});
  const after=await directory(b,d=>d?.people.some(p=>p.nickname==='Caro' && p.status==='private'));
  assert.ok(!JSON.stringify(after).includes(hidden.code));assert.ok(!JSON.stringify(after).includes(hidden.token));
  const disconnected=once(b,'disconnect');b.disconnect();await disconnected;
  await directory(a,d=>d?.people.every(p=>p.id!==whoB.selfId));
});

test('invitación interna a una mesa privada: aceptar ocupa un asiento sin escribir código', {timeout:12000},async t=>{
  const {connect}=await setup(t),a=await connect(),b=await connect(),outsider=await connect();
  const guest=await call(b,'identify',{nickname:'Bruno'});
  const host=await call(a,'create',{nickname:'Ana',capacity:2,isPublic:false});
  assert.ok((await call(outsider,'invite',{personId:guest.selfId})).error);
  const invitation=once(b,'invitation');
  assert.equal((await call(a,'invite',{personId:guest.selfId})).ok,true);
  const [payload]=await invitation;
  assert.equal(payload.code,host.code);assert.equal(payload.from,'Ana');assert.ok(payload.expiresAt>Date.now());
  assert.ok(!JSON.stringify(payload).includes(host.token));
  const joined=await call(b,'join',{code:payload.code,nickname:'Bruno'});
  assert.equal(joined.ok,true);assert.equal(joined.state.role,'player');
  assert.ok((await call(a,'invite',{personId:guest.selfId})).error);
});

test('espectadores no ven cartas privadas, no juegan y no pausan al entrar o salir', {timeout:12000},async t=>{
  const {server,connect}=await setup(t),a=await connect(),b=await connect(),watcher=await connect();
  const host=await call(a,'create',{nickname:'Ana',capacity:2});await call(b,'join',{code:host.code,nickname:'Bruno'});
  const room=server.rooms.get(host.code),revision=room.revision;
  const watched=await call(watcher,'watch',{code:host.code,nickname:'Público'});
  assert.equal(watched.state.role,'spectator');assert.equal(watched.token,undefined);assert.equal(room.revision,revision);
  const start=await call(a,'action',{action:'start',revision});assert.equal(start.ok,true);
  const view=await state(watcher,s=>s?.phase==='playing');
  assert.deepEqual(view.round.hand,[]);assert.equal(view.round.envido,null);assert.equal(view.round.flor,null);assert.deepEqual(view.actions,[]);
  const raw=JSON.stringify(view);
  for(const card of room.round.hands.flat()) assert.ok(!raw.includes(JSON.stringify(card.id)));
  for(const player of room.players) assert.ok(!raw.includes(player.token));
  assert.ok((await call(watcher,'action',{action:'play',revision:room.revision,cardId:room.round.hands[0][0].id})).error);
  assert.ok((await call(watcher,'add-bot',{revision:room.revision})).error);
  const before=room.revision;await call(watcher,'leave');
  assert.equal(room.revision,before);assert.equal(room.phase,'playing');assert.ok(room.players.every(p=>p.connected));
  await call(watcher,'watch',{code:host.code,nickname:'Público'});
  const serverSocket=server.io.sockets.sockets.get(watcher.id),gone=once(serverSocket,'disconnect');
  watcher.disconnect();await gone;
  assert.equal(room.spectators.length,0);assert.equal(room.phase,'playing');
  const resumed=await connect();const recovered=await call(resumed,'watch',{code:host.code,nickname:'Público'});
  assert.deepEqual(recovered.state.round.hand,[]);assert.equal(recovered.state.role,'spectator');
});

test('un espectador puede sentarse antes del reparto; un intento fallido no pierde su vista', {timeout:12000},async t=>{
  const {server,connect}=await setup(t),a=await connect(),b=await connect(),c=await connect();
  const host=await call(a,'create',{nickname:'Ana',capacity:2});
  await call(b,'watch',{code:host.code,nickname:'Bruno'});
  const seated=await call(b,'sit');assert.equal(seated.state.role,'player');assert.ok(seated.token);
  assert.equal(server.rooms.get(host.code).spectators.length,0);
  await call(c,'watch',{code:host.code,nickname:'Caro'});
  assert.ok((await call(c,'sit')).error);
  assert.equal(server.rooms.get(host.code).spectators.length,1);assert.equal(c.view.role,'spectator');
  await call(b,'leave');const closed=once(c,'room-closed');await call(a,'leave');await closed;
  assert.equal(server.rooms.size,0);
  assert.equal((await call(c,'create',{nickname:'Caro',capacity:2})).ok,true);
});

test('práctica arranca con un bot autónomo, se pausa al desconectar y recupera el asiento', {timeout:15000},async t=>{
  const {server,connect}=await setup(t,{botDelayMs:10}),a=await connect();
  const host=await call(a,'create',{nickname:'Ana',capacity:2,bot:true});
  assert.equal(host.state.phase,'playing');assert.equal(host.state.players[1].isBot,true);
  const room=server.rooms.get(host.code);
  for(let i=0;i<20 && !room.events.some(e=>e.type==='card' && e.seat===1);i++) {
    const view=await state(a,s=>s?.actions.length>0 || s?.phase!=='playing');
    if(view.phase!=='playing') break;
    const decision=chooseBotAction(view,()=>.99);assert.ok(decision);
    const result=await call(a,'action',{...decision,revision:view.revision});assert.equal(result.ok,true,result.error);
  }
  assert.ok(room.events.some(e=>e.type==='card' && e.seat===1),'El bot debe tirar una carta por sí mismo');
  const serverSocket=server.io.sockets.sockets.get(a.id),gone=once(serverSocket,'disconnect');a.disconnect();await gone;
  const before=room.eventSequence,hand=room.round.hands[0].map(c=>c.id);
  await new Promise(resolve=>setTimeout(resolve,60));assert.equal(room.eventSequence,before);
  const resumed=await connect(),joined=await call(resumed,'join',{code:host.code,token:host.token});
  assert.deepEqual(joined.state.round.hand.map(c=>c.id),hand);assert.equal(joined.state.you,0);
  await call(resumed,'leave');assert.equal(server.rooms.size,0);
});

test('solo el anfitrión edita bots en la espera, también para completar 2v2', {timeout:12000},async t=>{
  const {server,connect}=await setup(t),a=await connect(),b=await connect();
  const host=await call(a,'create',{nickname:'Ana',capacity:4});await call(b,'join',{code:host.code,nickname:'Bruno'});
  const room=server.rooms.get(host.code);
  assert.ok((await call(b,'add-bot',{revision:room.revision})).error);
  assert.equal((await call(a,'add-bot',{revision:room.revision})).ok,true);
  assert.equal((await call(a,'add-bot',{revision:room.revision})).ok,true);
  assert.equal(room.players.length,4);
  assert.equal((await call(a,'remove-bot',{seat:2,revision:room.revision})).ok,true);
  assert.equal(room.players.length,3);await call(a,'add-bot',{revision:room.revision});
  await call(a,'action',{action:'start',revision:room.revision});
  assert.ok((await call(a,'remove-bot',{seat:2,revision:room.revision})).error);
});
