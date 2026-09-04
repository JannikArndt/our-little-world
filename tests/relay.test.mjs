import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { attachRelay } from '../server/relay.mjs';

function listen() {
  const server = createServer((req, res) => { res.writeHead(200); res.end('ok'); });
  attachRelay(server, '/relay');
  return new Promise((resolve) => server.listen(0, () => resolve({ server, port: server.address().port })));
}

function open(port, room) {
  const ws = new WebSocket('ws://localhost:' + port + '/relay?room=' + room);
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(new Error('could not connect'));
    setTimeout(() => reject(new Error('timed out')), 3000);
  });
}

const next = (ws) => new Promise((resolve) => { ws.onmessage = (e) => resolve(e.data); });

test('the relay passes messages to the other player in the room', async (t) => {
  const { server, port } = await listen();
  t.after(() => server.close());

  const a = await open(port, 'kitchen');
  const b = await open(port, 'kitchen');
  const heard = next(b);
  a.send(JSON.stringify({ t: 'act', action: { type: 'ping' } }));
  assert.equal(await heard, '{"t":"act","action":{"type":"ping"}}');
  a.close(); b.close();
});

test('rooms do not leak into each other', async (t) => {
  const { server, port } = await listen();
  t.after(() => server.close());

  const a = await open(port, 'ours');
  const c = await open(port, 'theirs');
  let leaked = false;
  c.onmessage = () => { leaked = true; };
  a.send('hello');
  await new Promise(r => setTimeout(r, 200));
  assert.equal(leaked, false);
  a.close(); c.close();
});

test('a whole world snapshot survives the trip', async (t) => {
  const { server, port } = await listen();
  t.after(() => server.close());

  const { createWorld, serialize } = await import('../src/core/world.js');
  const big = JSON.stringify({ t: 'snap', world: serialize(createWorld(5)) });
  assert.ok(big.length > 8000, 'the payload needs a 16-bit length header');

  const a = await open(port, 'big');
  const b = await open(port, 'big');
  const heard = next(b);
  a.send(big);
  assert.equal(await heard, big);
  a.close(); b.close();
});

test('the probe handshake used to detect a relay works', async (t) => {
  const { server, port } = await listen();
  t.after(() => server.close());
  const ws = new WebSocket('ws://localhost:' + port + '/relay?probe=1');
  const opened = await new Promise((resolve) => {
    ws.onopen = () => resolve(true);
    ws.onerror = () => resolve(false);
    setTimeout(() => resolve(false), 2000);
  });
  assert.equal(opened, true);
});
