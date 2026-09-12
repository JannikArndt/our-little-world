// Session decides who runs the clock and how the two sides of a game agree on
// one world. These tests wire two real Session instances together through a
// tiny in-memory transport, so the handshake and the reconcile logic run
// exactly as they do in a browser, with nobody's network involved.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/net/session.js';
import { serialize } from '../src/core/world.js';

/** A message board both sides post to, standing in for the relay. */
class Bus {
  constructor() {
    this.peers = [];
  }
  join(deliver) {
    this.peers.push(deliver);
    return this.peers.length - 1;
  }
  send(fromId, msg) {
    for (let i = 0; i < this.peers.length; i++) if (i !== fromId) this.peers[i](msg);
  }
}

/** Same shape as WsTransport, minus the actual socket. */
class FakeTransport {
  constructor(bus) {
    this.bus = bus;
    this.onStatus = null;
    this.held = null;
  }
  connect(onMessage) {
    this.onMessage = onMessage;
    this.id = this.bus.join(msg => {
      if (this.held) this.held.push(msg);
      else this.onMessage(msg);
    });
    // a tick late, the way a real socket's onopen fires after connect()
    // has already handed back its promise — so onStatus is always wired
    // by the time this runs, never called too early to be heard
    Promise.resolve().then(() => {
      if (this.onStatus) this.onStatus('online');
    });
    return Promise.resolve();
  }
  /** Queue what arrives instead of delivering it, to force a race on purpose. */
  hold() {
    this.held = [];
  }
  release() {
    const h = this.held || [];
    this.held = null;
    for (const m of h) this.onMessage(m);
  }
  send(msg) {
    this.bus.send(this.id, msg);
  }
  close() {}
}

function road(role, x0) {
  const tiles = [];
  for (let x = x0; x < x0 + 6; x++) tiles.push({ x, y: 12 });
  return { type: 'road.build', role, tiles };
}
const roadIdx = x => 12 * 40 + x;

/** The host has to exist first, or the tie-break in the fix might hand
 *  either side the clock — start them one after the other, the way a real
 *  second player joins a room that is already going. */
async function paired(room) {
  const bus = new Bus();
  const ta = new FakeTransport(bus),
    tb = new FakeTransport(bus);
  const host = new Session({ room, role: 'A', transport: ta });
  await host.start();
  const guest = new Session({ room, role: 'B', transport: tb });
  await guest.start();
  return { host, guest, ta, tb };
}

test('a guest keeps a road a stale snapshot never saw', async () => {
  const { host, guest, tb } = await paired('r');
  assert.equal(host.isHost, true);
  assert.equal(guest.isHost, false);

  // a snapshot already on its way when the guest builds — it can only show
  // the world as it was a moment ago, before the road existed anywhere
  const stale = serialize(host.world);

  tb.hold(); // the host's ack will not land yet
  const ok = guest.dispatch(road('B', 20));
  assert.equal(ok, true, 'the guest could afford it');
  assert.equal(guest.world.terrain[roadIdx(21)], 3, 'built locally, straight away');
  assert.equal(guest.pending.length, 1, 'not yet confirmed by the host');

  // the stale snapshot lands after the action, the way a message that left
  // first can still arrive second
  guest.receive({ t: 'snap', peer: host.peer, world: stale });
  assert.equal(
    guest.world.terrain[roadIdx(21)],
    3,
    'a snapshot that predates the road must not erase it',
  );

  tb.release(); // the ack shows up eventually
  assert.equal(guest.pending.length, 0, 'and once it does, nothing is left pending');
});

test('an ack retires the pending action, so it stops being replayed', async () => {
  const { host, guest } = await paired('r2');

  guest.dispatch(road('B', 20));
  // the fake bus delivers straight away, so the round trip — act, then the
  // host's ack — is already done by the time dispatch() returns
  assert.equal(guest.pending.length, 0, 'the ack arrived and cleared it');
  assert.equal(host.world.terrain[roadIdx(21)], 3, 'the host applied it too');

  // a later snapshot needs no help from pending any more — it already has
  // the road, because the host really built it
  const fresh = serialize(host.world);
  guest.world.terrain[roadIdx(21)] = 0; // pretend a local hiccup undid it
  guest.receive({ t: 'snap', peer: host.peer, world: fresh });
  assert.equal(guest.world.terrain[roadIdx(21)], 3);
});

test('a rejected action does not haunt every snapshot for ever', async () => {
  const { host, guest } = await paired('r3');

  // the host secretly disagrees about what the guest can afford — a real
  // desync, not a timing race, so no ack will ever come
  host.world.players.B.res.stone = 0;
  guest.world.players.B.res.stone = 9;

  guest.dispatch(road('B', 20));
  assert.equal(guest.pending.length, 1, 'the host never acked — it could not pay');
  assert.equal(host.world.terrain[roadIdx(21)], 0, 'the host really did refuse it');

  // ages the pending entry past its welcome, the way a clock passing five
  // real seconds would — without an actual five-second test
  guest.pending[0].at -= 6000;
  const laterSnap = serialize(host.world);
  guest.receive({ t: 'snap', peer: host.peer, world: laterSnap });
  assert.equal(guest.pending.length, 0, 'gone, rather than kept for ever');
  assert.equal(guest.world.terrain[roadIdx(21)], 0, 'and the road really is not there');
});

test('a reconnect says hello again, so the other side knows to catch us up', async () => {
  const bus = new Bus();
  const ta = new FakeTransport(bus),
    tb = new FakeTransport(bus);
  const host = new Session({ room: 'r4', role: 'A', transport: ta });
  const guest = new Session({ room: 'r4', role: 'B', transport: tb });
  await Promise.all([host.start(), guest.start()]);

  const heard = [];
  ta.bus.peers[tb.id] = msg => heard.push(msg); // watch what the guest receives from the host

  ta.onStatus('reconnecting');
  ta.onStatus('online'); // the socket came back
  assert.ok(
    heard.some(m => m.t === 'hello'),
    'a reconnect said hello again',
  );
});

test('two peers who hear each other before deciding do not both grab the clock', async () => {
  const bus = new Bus();
  const ta = new FakeTransport(bus),
    tb = new FakeTransport(bus);
  // make ta the one with the higher peer id, deterministically, so the test
  // does not depend on how Math.random() happened to sort them
  const a = new Session({ room: 'r5', role: 'A', transport: ta });
  const b = new Session({ room: 'r5', role: 'B', transport: tb });
  a.peer = 'zzz';
  b.peer = 'aaa';
  await Promise.all([a.start(), b.start()]);
  // 'aaa' sorts lower, so it should be the one holding the clock
  assert.equal(b.isHost, true, 'the lower id kept the clock');
  assert.equal(a.isHost, false, 'the higher id waited for it instead of racing for it');
});
