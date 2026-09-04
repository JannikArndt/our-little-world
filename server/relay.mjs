// A very small WebSocket relay: whatever one player sends, the other players
// in the same room receive. It keeps no game state of its own — the host
// browser is still the authority — so it stays tiny and boring on purpose.
//
// No dependencies; RFC 6455 is short enough to read.

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const rooms = new Map();

function accept(key) {
  return createHash('sha1').update(key + GUID).digest('base64');
}

function frame(payload) {
  const data = Buffer.from(payload, 'utf8');
  const len = data.length;
  let head;
  if (len < 126) {
    head = Buffer.alloc(2);
    head[1] = len;
  } else if (len < 65536) {
    head = Buffer.alloc(4);
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[1] = 127;
    head.writeUInt32BE(0, 2);
    head.writeUInt32BE(len, 6);
  }
  head[0] = 0x81;                       // FIN + text
  return Buffer.concat([head, data]);
}

function controlFrame(opcode, payload) {
  const data = payload ? Buffer.from(payload) : Buffer.alloc(0);
  const head = Buffer.alloc(2);
  head[0] = 0x80 | opcode;
  head[1] = data.length;
  return Buffer.concat([head, data]);
}

class Peer {
  constructor(socket, room) {
    this.socket = socket;
    this.room = room;
    this.buf = Buffer.alloc(0);
    this.fragments = [];
    this.alive = true;
  }
  send(text) {
    if (!this.alive) return;
    try { this.socket.write(frame(text)); } catch (e) { this.close(); }
  }
  close() {
    if (!this.alive) return;
    this.alive = false;
    const set = rooms.get(this.room);
    if (set) { set.delete(this); if (!set.size) rooms.delete(this.room); }
    try { this.socket.destroy(); } catch (e) { /* already gone */ }
  }
}

function readFrames(peer, onText) {
  let buf = peer.buf;
  for (;;) {
    if (buf.length < 2) break;
    const fin = (buf[0] & 0x80) !== 0;
    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f;
    let off = 2;
    if (len === 126) { if (buf.length < off + 2) break; len = buf.readUInt16BE(off); off += 2; }
    else if (len === 127) { if (buf.length < off + 8) break; len = Number(buf.readBigUInt64BE(off)); off += 8; }
    if (len > 4 * 1024 * 1024) { peer.close(); return; }
    let mask = null;
    if (masked) { if (buf.length < off + 4) break; mask = buf.slice(off, off + 4); off += 4; }
    if (buf.length < off + len) break;

    let payload = buf.slice(off, off + len);
    if (mask) {
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    }
    buf = buf.slice(off + len);

    if (opcode === 0x8) { peer.socket.write(controlFrame(0x8)); peer.close(); return; }
    if (opcode === 0x9) { peer.socket.write(controlFrame(0xA, payload)); continue; }
    if (opcode === 0xA) continue;
    if (opcode === 0x1 || opcode === 0x2 || opcode === 0x0) {
      peer.fragments.push(payload);
      if (fin) {
        const text = Buffer.concat(peer.fragments).toString('utf8');
        peer.fragments = [];
        onText(text);
      }
    }
  }
  peer.buf = buf;
}

/** Attach the relay to an existing http server, at the given path. */
export function attachRelay(server, path = '/relay') {
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== path) { socket.destroy(); return; }
    const key = req.headers['sec-websocket-key'];
    if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + accept(key) + '\r\n\r\n'
    );
    socket.setNoDelay(true);

    if (url.searchParams.get('probe') === '1') {
      setTimeout(() => { try { socket.write(controlFrame(0x8)); socket.destroy(); } catch (e) { /* ignore */ } }, 50);
      return;
    }

    const room = (url.searchParams.get('room') || 'home').slice(0, 40);
    const peer = new Peer(socket, room);
    if (!rooms.has(room)) rooms.set(room, new Set());
    rooms.get(room).add(peer);

    socket.on('data', (chunk) => {
      peer.buf = Buffer.concat([peer.buf, chunk]);
      readFrames(peer, (text) => {
        for (const other of rooms.get(room) || []) if (other !== peer) other.send(text);
      });
    });
    socket.on('error', () => peer.close());
    socket.on('close', () => peer.close());
  });

  const ping = setInterval(() => {
    for (const set of rooms.values())
      for (const p of set) { try { p.socket.write(controlFrame(0x9)); } catch (e) { p.close(); } }
  }, 25000);
  ping.unref();
  return server;
}

export function roomSizes() {
  const out = {};
  for (const [room, set] of rooms) out[room] = set.size;
  return out;
}

// Standalone: node server/relay.mjs [port]
if (import.meta.url === 'file://' + process.argv[1]) {
  const port = Number(process.argv[2] || 8081);
  const server = createServer((req, res) => { res.writeHead(200); res.end('relay ok'); });
  attachRelay(server);
  server.listen(port, () => console.log('relay on ws://localhost:' + port + '/relay'));
}
