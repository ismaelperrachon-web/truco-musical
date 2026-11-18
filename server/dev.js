import { createGameServer } from './index.js';
const port = Number(process.env.PORT) || 5173;
const server = await createGameServer({ development: true });
server.http.listen(port, '0.0.0.0', () => console.log(`\n  Truco Oriental · http://localhost:${port}\n  En tu celular: usá la IP local de esta computadora y el mismo puerto.\n`));
