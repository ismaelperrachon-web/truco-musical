import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { makeRoom, addPlayer, addBot, removeBot, actionsFor, act, snapshot, teamOf } from './game.js';
import { chooseBotAction } from './bot.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function createGameServer({ development = false, botDelayMs } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const http = createServer(app);
  const allowedOrigin = process.env.CLIENT_ORIGIN;
  const io = new Server(http, {
    maxHttpBufferSize: 4096,
    cors: allowedOrigin ? { origin: allowedOrigin } : undefined,
    allowRequest: (req, done) => {
      const origin = req.headers.origin;
      if (!origin) return done(null, true); // Native clients / CLI.
      try { done(null, origin === allowedOrigin || new URL(origin).host === req.headers.host); }
      catch { done(null, false); }
    }
  });
  const rooms = new Map();
  const ipLimits = new Map();
  const profiles = new Map(), botTimers = new Map();
  let directoryTimer, closing = false;
  const directory = () => ({
    people: [...profiles.entries()].filter(([, s]) => s.connected).slice(0, 200).map(([id, s]) => {
      const room = rooms.get(s.data.code);
      return { id, nickname: s.data.nickname, status: !room ? 'available' : !room.isPublic ? 'private' : s.data.role === 'spectator' ? 'watching' : room.phase === 'waiting' ? 'waiting' : 'playing',
        ...(room?.isPublic ? { code: room.code, canJoin: room.phase === 'waiting' && room.players.length < room.capacity, canWatch: true } : {}) };
    }),
    rooms: [...rooms.values()].filter(r => r.isPublic && r.players.some(p => !p.isBot && p.connected))
      .sort((a, b) => Number(b.phase === 'waiting') - Number(a.phase === 'waiting') || a.createdAt - b.createdAt).slice(0, 100)
      .map(r => ({ code: r.code, host: r.players.find(p => p.seat === r.host)?.nickname || 'Mesa', capacity: r.capacity, filled: r.players.length,
        phase: r.phase, scores: r.scores, spectators: r.spectators.length,
        players: r.players.map(p => ({ nickname: p.nickname, isBot: Boolean(p.isBot), connected: p.connected })) }))
  });
  const publishDirectory = () => {
    if (closing || directoryTimer) return;
    directoryTimer = setTimeout(() => { directoryTimer = null; io.emit('directory', directory()); }, 40);
    directoryTimer.unref();
  };
  const cancelBot = code => { const pending = botTimers.get(code); if (pending) clearTimeout(pending.timer); botTimers.delete(code); };
  const scheduleBot = room => {
    if (closing) return;
    const bot = room.phase === 'playing' && room.players.find(p => p.isBot && actionsFor(room, p.seat).length);
    if (!bot) { cancelBot(room.code); return; }
    const last = room.events.at(-1), key = `${bot.seat}:${last?.id || 0}`;
    if (botTimers.get(room.code)?.key === key) return;
    cancelBot(room.code);
    const delay = botDelayMs ?? (last?.type === 'result' ? 9300 : last?.type === 'deal' ? 1000 : 2800);
    const timer = setTimeout(() => {
      botTimers.delete(room.code);
      if (closing || rooms.get(room.code) !== room || !room.players.includes(bot)) return;
      const decision = chooseBotAction(snapshot(room, bot.seat));
      if (!decision) return;
      act(room, bot.seat, decision.action, decision.cardId);
      notify(room);
    }, delay);
    timer.unref(); botTimers.set(room.code, { key, timer });
  };
  const notify = (room, gameChanged = true) => {
    if (gameChanged) room.revision++;
    room.updated = Date.now();
    for (const p of room.players) if (p.connected && !p.isBot) io.to(p.socketId).emit('state', snapshot(room, p.seat));
    for (const spectator of room.spectators) io.to(spectator.socketId).emit('state', snapshot(room));
    scheduleBot(room); publishDirectory();
  };
  const destroyRoom = room => {
    cancelBot(room.code); rooms.delete(room.code);
    for (const spectator of room.spectators) {
      const client = io.sockets.sockets.get(spectator.socketId);
      if (client) { client.data.code = null; client.data.role = null; client.leave(room.code); client.emit('room-closed'); }
    }
    publishDirectory();
  };
  const findMembership = socket => {
    const room = rooms.get(socket.data.code);
    const player = room?.players.find(p => p.socketId === socket.id);
    if (!player) throw new Error('Volvé a entrar a la sala.');
    return { room, player };
  };
  io.on('connection', socket => {
    socket.data.publicId = randomUUID();
    socket.emit('directory', directory());
    let windowStart = Date.now(), calls = 0;
    const handle = (event, fn) => socket.on(event, (payload, ack) => {
      if (typeof ack !== 'function') return;
      if (Date.now() - windowStart > 10000) { calls = 0; windowStart = Date.now(); }
      if (++calls > 50) return ack({ error: 'Demasiadas acciones. Esperá unos segundos.' });
      try {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Solicitud inválida.');
        ack({ ok: true, ...fn(payload) });
      } catch (error) { ack({ error: error.message || 'No se pudo completar la acción.' }); }
    });
    const nickname = input => {
      if (typeof input !== 'string') throw new Error('Ingresá tu apodo.');
      const name = input.trim().replace(/[\u0000-\u001f\u007f]/g, '');
      if (!name || name.length > 20) throw new Error('El apodo debe tener entre 1 y 20 caracteres.');
      return name;
    };
    const registerProfile = name => { socket.data.nickname = name; profiles.set(socket.data.publicId, socket); publishDirectory(); };
    const findRoom = code => {
      if (typeof code !== 'string' || !/^[A-F0-9]{8}$/.test(code)) throw new Error('El código de sala debe tener 8 caracteres.');
      const room = rooms.get(code);
      if (!room) throw new Error('Esa sala ya no existe. Creá una mesa nueva.');
      return room;
    };
    const claim = (room, player) => {
      socket.data.code = room.code; socket.data.role = 'player';
      registerProfile(player.nickname);
      socket.join(room.code);
      notify(room);
      return { code: room.code, token: player.token, selfId: socket.data.publicId, state: snapshot(room, player.seat) };
    };
    handle('identify', data => {
      if (typeof data.nickname === 'string' && !data.nickname.trim() && !socket.data.code) {
        profiles.delete(socket.data.publicId); socket.data.nickname = ''; publishDirectory(); return { selfId: socket.data.publicId };
      }
      const name = nickname(data.nickname);
      const room = rooms.get(socket.data.code);
      const member = room?.players.find(p => p.socketId === socket.id) || room?.spectators.find(p => p.socketId === socket.id);
      registerProfile(member?.nickname || name);
      return { selfId: socket.data.publicId };
    });
    handle('create', data => {
      if (socket.data.code) throw new Error('Ya estás en una sala.');
      if (![2, 4].includes(data.capacity)) throw new Error('Elegí 1v1 o 2v2.');
      if (data.bot !== undefined && typeof data.bot !== 'boolean') throw new Error('Modalidad de bot inválida.');
      if (data.isPublic !== undefined && typeof data.isPublic !== 'boolean') throw new Error('Visibilidad inválida.');
      if (data.bot && data.capacity !== 2) throw new Error('La práctica rápida es mano a mano.');
      const name = nickname(data.nickname);
      const ip = socket.handshake.address;
      const recent = (ipLimits.get(ip) || []).filter(t => Date.now() - t < 60000);
      if (recent.length >= 10 || rooms.size >= 1000) throw new Error('Esperá un minuto antes de crear otra mesa.');
      recent.push(Date.now()); ipLimits.set(ip, recent);
      const { room, player } = makeRoom(name, data.capacity, socket.id);
      room.isPublic = data.isPublic !== false;
      // Reintento extremadamente improbable; nunca sobrescribir otra sala.
      if (rooms.has(room.code)) throw new Error('Intentá crear la mesa de nuevo.');
      rooms.set(room.code, room);
      if (data.bot) { addBot(room); act(room, player.seat, 'start'); }
      return claim(room, player);
    });
    handle('join', data => {
      if (socket.data.code) throw new Error('Ya estás en una sala.');
      const room = findRoom(data.code);
      let player = typeof data.token === 'string' ? room.players.find(p => p.token === data.token) : null;
      if (player) {
        const oldSocket = io.sockets.sockets.get(player.socketId);
        if (oldSocket && oldSocket.id !== socket.id) {
          oldSocket.data.code = null; oldSocket.leave(room.code);
          oldSocket.emit('replaced'); oldSocket.disconnect(true);
        }
        player.socketId = socket.id; player.connected = true;
      } else player = addPlayer(room, nickname(data.nickname), socket.id);
      return claim(room, player);
    });
    handle('watch', data => {
      if (socket.data.code) throw new Error('Salí de tu mesa antes de mirar otra.');
      const room = findRoom(data.code), name = nickname(data.nickname);
      if (room.spectators.length >= 100) throw new Error('Esta mesa llegó al límite de espectadores.');
      room.spectators.push({ socketId: socket.id, nickname: name });
      socket.data.code = room.code; socket.data.role = 'spectator';
      registerProfile(name); socket.join(room.code); notify(room, false);
      return { code: room.code, selfId: socket.data.publicId, state: snapshot(room) };
    });
    handle('sit', () => {
      const room = rooms.get(socket.data.code);
      if (!room || socket.data.role !== 'spectator') throw new Error('No estás mirando esta mesa.');
      const player = addPlayer(room, socket.data.nickname, socket.id);
      room.spectators = room.spectators.filter(p => p.socketId !== socket.id);
      return claim(room, player);
    });
    handle('add-bot', data => {
      const { room, player } = findMembership(socket);
      if (player.seat !== room.host || data.revision !== room.revision) throw new Error('Solo el anfitrión puede agregar bots a la mesa actual.');
      addBot(room); notify(room); return {};
    });
    handle('remove-bot', data => {
      const { room, player } = findMembership(socket);
      if (player.seat !== room.host || data.revision !== room.revision) throw new Error('Solo el anfitrión puede quitar bots de la mesa actual.');
      removeBot(room, data.seat); notify(room); return {};
    });
    handle('invite', data => {
      const { room, player } = findMembership(socket);
      if (room.phase !== 'waiting' || room.players.length >= room.capacity) throw new Error('Tu mesa no tiene lugares disponibles.');
      const target = typeof data.personId === 'string' ? profiles.get(data.personId) : null;
      if (!target?.connected || target.id === socket.id) throw new Error('Esa persona ya no está disponible.');
      if (target.data.code) throw new Error('Esa persona ya está en una mesa.');
      const recent = (socket.data.invites || []).filter(time => Date.now() - time < 30000);
      if (recent.length >= 5) throw new Error('Ya enviaste varias invitaciones. Esperá unos segundos.');
      recent.push(Date.now()); socket.data.invites = recent;
      target.emit('invitation', { id: randomUUID(), code: room.code, from: player.nickname, capacity: room.capacity, expiresAt: Date.now() + 60000 });
      return { nickname: target.data.nickname };
    });
    handle('action', data => {
      const { room, player } = findMembership(socket);
      if (data.revision !== room.revision) throw new Error('La mesa cambió. Intentá otra vez.');
      if (typeof data.action !== 'string' || (data.cardId !== undefined && typeof data.cardId !== 'string')) throw new Error('Jugada inválida.');
      act(room, player.seat, data.action, data.cardId);
      notify(room);
      return {};
    });
    handle('leave', () => {
      if (socket.data.role === 'spectator') {
        const room = rooms.get(socket.data.code);
        if (!room) throw new Error('La mesa ya se cerró.');
        room.spectators = room.spectators.filter(p => p.socketId !== socket.id);
        socket.data.code = null; socket.data.role = null; socket.leave(room.code);
        notify(room, false); return {};
      }
      const { room, player } = findMembership(socket);
      if (room.phase === 'playing' || room.phase === 'between') {
        room.phase = 'finished'; room.winner = 1 - teamOf(player.seat);
        room.log.push({ id: `leave-${room.revision}`, message: `${player.nickname} abandonó la partida. Gana el equipo ${room.winner + 1}.`, type: 'score' });
      }
      room.players = room.players.filter(p => p !== player);
      if (room.host === player.seat) room.host = room.players.find(p => !p.isBot)?.seat ?? null;
      socket.data.code = null; socket.data.role = null; socket.leave(room.code);
      if (!room.players.some(p => !p.isBot)) destroyRoom(room); else notify(room);
      return {};
    });
    socket.on('disconnect', () => {
      profiles.delete(socket.data.publicId); publishDirectory();
      const room = rooms.get(socket.data.code);
      if (room && socket.data.role === 'spectator') {
        room.spectators = room.spectators.filter(p => p.socketId !== socket.id); notify(room, false); return;
      }
      const player = room?.players.find(p => p.socketId === socket.id);
      if (player) { player.connected = false; notify(room); }
    });
  });
  const cleanup = setInterval(() => {
    for (const room of rooms.values()) if (Date.now() - room.updated > 2 * 60 * 60 * 1000 && !room.spectators.length && room.players.every(p => p.isBot || !p.connected)) destroyRoom(room);
    for (const [ip, times] of ipLimits) if (times.every(t => Date.now() - t > 60000)) ipLimits.delete(ip);
  }, 60000);
  cleanup.unref();
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  let vite;
  if (development) {
    const { createServer: createViteServer } = await import('vite');
    const { readFile } = await import('node:fs/promises');
    vite = await createViteServer({ root, server: { middlewareMode: true, hmr: { server: http } }, appType: 'custom' });
    app.use(vite.middlewares);
    app.get('/', async (req, res, next) => {
      try { res.type('html').send(await vite.transformIndexHtml(req.originalUrl, await readFile(path.join(root, 'index.html'), 'utf8'))); }
      catch (error) { vite.ssrFixStacktrace(error); next(error); }
    });
  } else {
    app.use(express.static(path.join(root, 'dist')));
    app.get('/', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
  }
  return { app, http, io, rooms, close: async () => { closing = true; clearInterval(cleanup); clearTimeout(directoryTimer); for (const code of botTimers.keys()) cancelBot(code); await vite?.close(); await new Promise(resolve => io.close(resolve)); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await createGameServer();
  server.http.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log(`Truco Oriental: http://localhost:${process.env.PORT || 3000}`));
}
