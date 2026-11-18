// Cursor por sala: los snapshots repetidos y la reconexión no repiten carteles.
export function collectTableEvents(cursor, room) {
  if (!room) return { cursor: null, events: [], reset: true };
  const events = room.events || [];
  const lastId = events.at(-1)?.id || 0;
  if (!cursor || cursor.code !== room.code) return { cursor: { code: room.code, lastId }, events: [], reset: true };
  return { cursor: { code: room.code, lastId: Math.max(cursor.lastId, lastId) }, events: events.filter(e => e.id > cursor.lastId), reset: false };
}
