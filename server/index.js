import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import { makeRoom, addPlayer, act, snapshot, teamOf } from './game.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function createGameServer({ development = false } = {}) {
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
  const notify = room => {
    room.revision++; room.updated = Date.now();
    for (const p of room.players) if (p.connected) io.to(p.socketId).emit('state', snapshot(room, p.seat));
  };
  const findMembership = socket => {
    const room = rooms.get(socket.data.code);
    const player = room?.players.find(p => p.socketId === socket.id);
    if (!player) throw new Error('Volvé a entrar a la sala.');
    return { room, player };
  };
  io.on('connection', socket => {
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
    const claim = (room, player) => {
      socket.data.code = room.code;
      socket.join(room.code);
      notify(room);
      return { code: room.code, token: player.token, state: snapshot(room, player.seat) };
    };
    handle('create', data => {
      if (socket.data.code) throw new Error('Ya estás en una sala.');
      if (![2, 4].includes(data.capacity)) throw new Error('Elegí 1v1 o 2v2.');
      const name = nickname(data.nickname);
      const ip = socket.handshake.address;
      const recent = (ipLimits.get(ip) || []).filter(t => Date.now() - t < 60000);
      if (recent.length >= 10 || rooms.size >= 1000) throw new Error('Esperá un minuto antes de crear otra mesa.');
      recent.push(Date.now()); ipLimits.set(ip, recent);
      const { room, player } = makeRoom(name, data.capacity, socket.id);
      // Reintento extremadamente improbable; nunca sobrescribir otra sala.
      if (rooms.has(room.code)) throw new Error('Intentá crear la mesa de nuevo.');
      rooms.set(room.code, room);
      return claim(room, player);
    });
    handle('join', data => {
      if (socket.data.code) throw new Error('Ya estás en una sala.');
      if (typeof data.code !== 'string' || !/^[A-F0-9]{8}$/.test(data.code)) throw new Error('El código de sala debe tener 8 caracteres.');
      const room = rooms.get(data.code);
      if (!room) throw new Error('Esa sala ya no existe. Creá una mesa nueva.');
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
    handle('action', data => {
      const { room, player } = findMembership(socket);
      if (data.revision !== room.revision) throw new Error('La mesa cambió. Intentá otra vez.');
      if (typeof data.action !== 'string' || (data.cardId !== undefined && typeof data.cardId !== 'string')) throw new Error('Jugada inválida.');
      act(room, player.seat, data.action, data.cardId);
      notify(room);
      return {};
    });
    handle('leave', () => {
      const { room, player } = findMembership(socket);
      if (room.phase === 'playing' || room.phase === 'between') {
        room.phase = 'finished'; room.winner = 1 - teamOf(player.seat);
        room.log.push({ id: `leave-${room.revision}`, message: `${player.nickname} abandonó la partida. Gana el equipo ${room.winner + 1}.`, type: 'score' });
      }
      room.players = room.players.filter(p => p !== player);
      if (room.host === player.seat) room.host = room.players[0]?.seat ?? 0;
      socket.data.code = null; socket.leave(room.code);
      if (!room.players.length) rooms.delete(room.code); else notify(room);
      return {};
    });
    socket.on('disconnect', () => {
      const room = rooms.get(socket.data.code);
      const player = room?.players.find(p => p.socketId === socket.id);
      if (player) { player.connected = false; notify(room); }
    });
  });
  const cleanup = setInterval(() => {
    for (const [code, room] of rooms) if (Date.now() - room.updated > 2 * 60 * 60 * 1000 && room.players.every(p => !p.connected)) rooms.delete(code);
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
  return { app, http, io, rooms, close: async () => { clearInterval(cleanup); await vite?.close(); await new Promise(resolve => io.close(resolve)); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await createGameServer();
  server.http.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log(`Truco Oriental: http://localhost:${process.env.PORT || 3000}`));
}
