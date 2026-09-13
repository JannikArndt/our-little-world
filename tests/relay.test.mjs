import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { attachRelay, forgetRooms } from '../server/relay.mjs';

function listen() {
  const server = createServer((req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  attachRelay(server, '/relay');
  return new Promise(resolve =>
    server.listen(0, () => resolve({ server, port: server.address().port })),
  );
}

function open(port, room) {
  const ws = new WebSocket('ws://localhost:' + port + '/relay?room=' + room);
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('could not connect'));
    setTimeout(() => reject(new Error('timed out')), 3000);
  });
}

const next = ws =>
  new Promise(resolve => {
    ws.onmessage = e => resolve(e.data);
  });

/** A hand-rolled client for the one thing a real WebSocket won't do: send a
 *  frame that claims more is coming. Handshakes over a raw socket and hands
 *  it back once the 101 response has arrived. */
function rawClient(port, room) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, 'localhost', () => {
      socket.write(
        'GET /relay?room=' +
          room +
          ' HTTP/1.1\r\n' +
          'Host: localhost\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
          'Sec-WebSocket-Version: 13\r\n\r\n',
      );
    });
    let buf = Buffer.alloc(0);
    const onData = chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.includes('\r\n\r\n')) {
        socket.removeListener('data', onData);
        resolve(socket);
      }
    };
    socket.on('data', onData);
    socket.on('error', reject);
    setTimeout(() => reject(new Error('handshake timed out')), 3000);
  });
}

/** A masked client frame, built the way the relay itself expects one — with
 *  the option to leave FIN unset, which no real client here ever does. */
function clientFrame(opcode, fin, text) {
  const data = Buffer.from(text, 'utf8');
  const mask = Buffer.from([1, 2, 3, 4]);
  const head = Buffer.alloc(2);
  head[0] = (fin ? 0x80 : 0) | opcode;
  head[1] = 0x80 | data.length; // masked, length < 126 is all these tests need
  const masked = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
  return Buffer.concat([head, mask, masked]);
}

test('the relay passes messages to the other player in the room', async t => {
  const { server, port } = await listen();
  t.after(() => server.close());

  const a = await open(port, 'kitchen');
  const b = await open(port, 'kitchen');
  const heard = next(b);
  a.send(JSON.stringify({ t: 'act', action: { type: 'ping' } }));
  assert.equal(await heard, '{"t":"act","action":{"type":"ping"}}');
  a.close();
  b.close();
});

test('rooms do not leak into each other', async t => {
  const { server, port } = await listen();
  t.after(() => server.close());

  const a = await open(port, 'ours');
  const c = await open(port, 'theirs');
  let leaked = false;
  c.onmessage = () => {
    leaked = true;
  };
  a.send('hello');
  await new Promise(r => setTimeout(r, 200));
  assert.equal(leaked, false);
  a.close();
  c.close();
});

test('a whole world snapshot survives the trip', async t => {
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
  a.close();
  b.close();
});

test('the probe handshake used to detect a relay works', async t => {
  const { server, port } = await listen();
  t.after(() => server.close());
  const ws = new WebSocket('ws://localhost:' + port + '/relay?probe=1');
  const opened = await new Promise(resolve => {
    ws.onopen = () => resolve(true);
    ws.onerror = () => resolve(false);
    setTimeout(() => resolve(false), 2000);
  });
  assert.equal(opened, true);
});

test('the relay hands the last world it saw to whoever joins next', async t => {
  const { server, port } = await listen();
  t.after(() => {
    forgetRooms();
    server.close();
  });

  const host = await open(port, 'kept');
  host.send(JSON.stringify({ t: 'snap', peer: 'p1', world: '{"schema":7,"tick":42}' }));
  await new Promise(r => setTimeout(r, 50));

  // somebody arrives later — even after the first player has gone home
  host.close();
  await new Promise(r => setTimeout(r, 50));
  const late = await open(port, 'kept');
  const first = JSON.parse(await next(late));
  assert.equal(first.t, 'kept');
  assert.equal(JSON.parse(first.world).tick, 42, 'and it is the world the room was in');
  late.close();
});

test('what one room is holding never reaches another', async t => {
  const { server, port } = await listen();
  t.after(() => {
    forgetRooms();
    server.close();
  });

  const a = await open(port, 'ourroom');
  a.send(JSON.stringify({ t: 'snap', peer: 'p1', world: '{"schema":7,"tick":9}' }));
  await new Promise(r => setTimeout(r, 50));

  const b = await open(port, 'someone-elses');
  let heard = null;
  b.onmessage = e => {
    heard = e.data;
  };
  await new Promise(r => setTimeout(r, 120));
  assert.equal(heard, null, 'a different room starts empty');
  a.close();
  b.close();
});

test('a frame that claims more is coming is closed, not believed', async t => {
  const { server, port } = await listen();
  t.after(() => server.close());

  const socket = await rawClient(port, 'fragment-test');
  const closed = new Promise(resolve => socket.on('close', () => resolve(true)));
  socket.write(clientFrame(0x1, false, 'only half a message'));
  const wasClosed = await Promise.race([closed, new Promise(r => setTimeout(() => r(false), 500))]);
  assert.equal(wasClosed, true, 'a peer that fragments is not a real client');
});

test('a room holds at most the two who are playing', async t => {
  const { server, port } = await listen();
  t.after(() => server.close());

  const a = await open(port, 'crowded');
  const b = await open(port, 'crowded');
  await assert.rejects(open(port, 'crowded'), 'a third arrival is not let in');
  a.close();
  b.close();
});
