import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worlds, free, publicView } from '../server/worlds.mjs';
import { createApi } from '../server/api.mjs';
import { cleanName, prettyName, randomName, worldEmoji } from '../src/core/names.js';

const DAY = 24 * 60 * 60 * 1000;

/* ---------------- names ---------------- */

test('a world name is two words a child can say, and a picture', () => {
  for (let i = 0; i < 200; i++) {
    const n = randomName();
    assert.match(n, /^[a-z]+-[a-z]+$/, n + ' is not two plain words');
    assert.notEqual(worldEmoji(n), '🌍', n + ' has no animal in it');
  }
  assert.equal(prettyName('sunny-otter'), 'Sunny Otter');
});

test('names from a link or a text field are cleaned up, not trusted', () => {
  assert.equal(cleanName('  Sunny  Otter! '), 'sunny-otter');
  assert.equal(cleanName('../../etc/passwd'), 'etcpasswd');
  assert.equal(cleanName('---'), '');
  assert.equal(cleanName('x'.repeat(80)).length, 32);
});

test('a name already in use is never handed out twice', () => {
  const taken = new Set();
  for (let i = 0; i < 400; i++) {
    const n = randomName(taken);
    assert.equal(taken.has(n), false);
    taken.add(n);
  }
});

/* ---------------- the store ---------------- */

test('starting a world takes one spot and leaves the other free', () => {
  const s = new Worlds({});
  const { world, role } = s.create({ device: 'kid-ipad', role: 'A' });
  assert.equal(role, 'A');
  assert.deepEqual(free(world), ['B']);
  assert.equal(s.open().length, 1);
  assert.equal(s.open()[0].free.length, 1);
});

test('once both spots are taken the world cannot be found any more', () => {
  const s = new Worlds({});
  const { world } = s.create({ device: 'kid', role: 'A' });
  const joined = s.join(world.name, { device: 'dad' });
  assert.equal(joined.role, 'B');
  assert.equal(joined.full, false);
  assert.deepEqual(s.open(), []);
  // but it is still there for the two who are in it
  assert.equal(s.get(world.name).name, world.name);
});

test('a device that comes back gets its own spot again, not a new one', () => {
  const s = new Worlds({});
  const { world } = s.create({ device: 'kid', role: 'A' });
  s.join(world.name, { device: 'dad' });
  const again = s.join(world.name, { device: 'kid' });
  assert.equal(again.role, 'A');
  assert.equal(Object.keys(s.get(world.name).slots).length, 2);
});

test('a heartbeat claims a spot for a device that never managed to join', () => {
  // a join that never reached the server — a dropped request, not a refusal
  // — should not leave a device stuck outside once it starts sending "still
  // here" instead
  const s = new Worlds({});
  const { world } = s.create({ device: 'kid', role: 'A' });
  const w = s.touch(world.name, { device: 'dad', role: 'B' });
  assert.equal(w.slots.B.device, 'dad');
  assert.equal(
    s.putSnapshot(world.name, { device: 'dad', tick: 1, world: '{"tick":1}' }).ok,
    true,
    'the repaired spot is enough to save from',
  );
});

test("a third player is turned away rather than given somebody else's role", () => {
  const s = new Worlds({});
  const { world } = s.create({ device: 'kid', role: 'A' });
  s.join(world.name, { device: 'dad' });
  const third = s.join(world.name, { device: 'stranger' });
  assert.equal(third.role, null);
  assert.equal(third.full, true);
});

test('a spot nobody has used for days can be taken over', () => {
  let t = Date.now();
  const s = new Worlds({ staleSlotMs: 3 * DAY, now: () => t });
  const { world } = s.create({ device: 'kid', role: 'A' });
  s.join(world.name, { device: 'old-phone' });
  t += 4 * DAY;
  s.touch(world.name, { device: 'kid', role: 'A' }); // the child still plays
  const back = s.join(world.name, { device: 'new-phone' });
  assert.equal(back.role, 'B', 'the spot nobody has used is the one that goes');
  assert.equal(s.get(world.name).slots.A.device, 'kid', 'and the child keeps theirs');
});

test('leaving frees the spot again', () => {
  const s = new Worlds({});
  const { world } = s.create({ device: 'kid', role: 'A' });
  s.join(world.name, { device: 'dad' });
  s.leave(world.name, { device: 'dad' });
  assert.deepEqual(free(s.get(world.name)), ['B']);
  assert.equal(s.open().length, 1);
});

test('a world nobody has opened for a fortnight is forgotten', async () => {
  let t = Date.now();
  const s = new Worlds({ ttlMs: 14 * DAY, now: () => t });
  const { world } = s.create({ device: 'kid', role: 'A' });
  t += 13 * DAY;
  await s.sweep();
  assert.ok(s.get(world.name), 'thirteen days is still ours');
  t += 2 * DAY;
  await s.sweep();
  assert.equal(s.get(world.name), null);
});

test('playing keeps a world alive indefinitely', async () => {
  let t = Date.now();
  const s = new Worlds({ ttlMs: 7 * DAY, now: () => t });
  const { world } = s.create({ device: 'kid', role: 'A' });
  for (let week = 0; week < 6; week++) {
    t += 6 * DAY;
    s.touch(world.name, { device: 'kid', role: 'A' });
    await s.sweep();
  }
  assert.ok(s.get(world.name), 'a world played in every six days should never expire');
});

/* ---------------- snapshots ---------------- */

test('the server keeps the last world a host sent, and refuses an older one', () => {
  const s = new Worlds({});
  const { world } = s.create({ device: 'kid', role: 'A' });
  assert.equal(
    s.putSnapshot(world.name, { device: 'kid', tick: 100, world: '{"tick":100}' }).ok,
    true,
  );
  assert.equal(s.getSnapshot(world.name).tick, 100);
  const stale = s.putSnapshot(world.name, { device: 'kid', tick: 40, world: '{"tick":40}' });
  assert.equal(stale.ok, false);
  assert.equal(stale.snapshot.tick, 100, 'the stale device is handed the good world back');
  assert.equal(
    s.putSnapshot(world.name, { device: 'kid', tick: 220, world: '{"tick":220}' }).ok,
    true,
  );
  assert.equal(s.getSnapshot(world.name).tick, 220);
});

test('starting a world over is the one time a fresh world beats the kept one', () => {
  const s = new Worlds({});
  const { world } = s.create({ device: 'kid', role: 'A' });
  s.putSnapshot(world.name, { device: 'kid', tick: 900, world: '{"tick":900}' });
  // without saying so, the village that was just cleared is handed back
  assert.equal(
    s.putSnapshot(world.name, { device: 'kid', tick: 0, world: '{"tick":0}' }).ok,
    false,
  );
  assert.equal(
    s.putSnapshot(world.name, { device: 'kid', tick: 0, world: '{"tick":0}', reset: true }).ok,
    true,
  );
  assert.equal(s.getSnapshot(world.name).tick, 0);
});

test('a snapshot that is not a world is refused', () => {
  const s = new Worlds({});
  const { world } = s.create({ device: 'kid' });
  assert.equal(
    s.putSnapshot(world.name, { device: 'kid', tick: 1, world: 'x'.repeat(600 * 1024) }).ok,
    false,
  );
  assert.equal(s.putSnapshot('nowhere', { device: 'kid', tick: 1, world: '{}' }).ok, false);
  // whatever sent this knows the room's name, nothing more — the world field
  // has to actually be the text a client would send, not just anything at all
  assert.equal(s.putSnapshot(world.name, { device: 'kid', tick: 1, world: { tick: 1 } }).ok, false);
  assert.equal(s.putSnapshot(world.name, { device: 'kid', tick: 1, world: undefined }).ok, false);
});

test('a stranger who only knows the name cannot touch the saved world', () => {
  const s = new Worlds({});
  const { world } = s.create({ device: 'kid', role: 'A' });
  const r = s.putSnapshot(world.name, { device: 'a-stranger', tick: 1, world: '{"tick":1}' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not-a-player');
  assert.equal(s.getSnapshot(world.name), null, 'nothing was written');
  // and joining first is all it takes — a spot, not a password
  const joined = s.join(world.name, { device: 'a-stranger', role: 'B' });
  assert.equal(joined.role, 'B');
  assert.equal(
    s.putSnapshot(world.name, { device: 'a-stranger', tick: 1, world: '{"tick":1}' }).ok,
    true,
  );
});

test('a real world snapshot survives a restart of the server', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'olw-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { createWorld, serialize, deserialize } = await import('../src/core/world.js');

  const first = await new Worlds({ dir }).load();
  const { world } = first.create({ device: 'kid', role: 'A' });
  const text = serialize(createWorld(7));
  first.putSnapshot(world.name, { device: 'kid', tick: 500, world: text });
  await first.close();

  const files = await readdir(dir);
  // one file per world, and the counting ledger beside them
  assert.deepEqual(files.sort(), [world.name + '.json', 'stats.json'].sort());

  const second = await new Worlds({ dir }).load();
  const kept = second.getSnapshot(world.name);
  assert.equal(kept.tick, 500);
  assert.ok(deserialize(kept.world), 'what comes back off disk is still a world');
  assert.deepEqual(publicView(second.get(world.name)).taken, ['A']);
});

test('a world is known by its filename, not a field inside the file', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'olw-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const w = {
    name: 'somebody-elses-name',
    created: Date.now(),
    seen: Date.now(),
    roles: ['A', 'B'],
    slots: {},
    snapshot: null,
    active: {},
    far: null,
  };
  await writeFile(join(dir, 'honest-otter.json'), JSON.stringify(w));

  const s = await new Worlds({ dir }).load();
  assert.ok(s.get('honest-otter'), 'known by the name of the file it came from');
  assert.equal(s.get('somebody-elses-name'), null, 'not by whatever the file claims about itself');
});

test('a file with a name this code would never have written is left alone', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'olw-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, '..evil.json'), JSON.stringify({ name: '..evil' }));
  const s = await new Worlds({ dir }).load();
  assert.equal(s.worlds.size, 0, 'a name that is not already clean is not trusted');
});

test('flush refuses to write a name it did not clean itself', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'olw-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const s = new Worlds({ dir });
  // reaching past the public API on purpose: this is the belt-and-braces
  // check for a name that should never get this far in the first place
  s.worlds.set('../evil', {
    name: '../evil',
    created: Date.now(),
    seen: Date.now(),
    roles: ['A', 'B'],
    slots: {},
    snapshot: null,
    active: {},
    far: null,
  });
  s.dirty.add('../evil');
  await s.flush();
  const files = await readdir(dir).catch(() => []);
  assert.equal(
    files.some(f => f.indexOf('evil') >= 0),
    false,
    'nothing escaped the data directory',
  );
});

/* ---------------- over HTTP ---------------- */

function listen() {
  const store = new Worlds({});
  const api = createApi(store);
  const server = createServer(async (req, res) => {
    if (await api(req, res)) return;
    res.writeHead(404);
    res.end('no');
  });
  return new Promise(resolve =>
    server.listen(0, () =>
      resolve({ server, store, base: 'http://localhost:' + server.address().port }),
    ),
  );
}

const get = async (base, path) => {
  const r = await fetch(base + path);
  return { status: r.status, body: await r.json() };
};
const post = async (base, path, body) => {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return { status: r.status, body: await r.json() };
};

test('the whole matchmaking dance, over HTTP', async t => {
  const { server, base } = await listen();
  t.after(() => server.close());

  assert.equal((await get(base, '/api/health')).body.ok, true);
  assert.deepEqual((await get(base, '/api/worlds')).body.worlds, []);

  // the child starts a world
  const made = await post(base, '/api/worlds', { device: 'kid-ipad', role: 'A' });
  assert.equal(made.status, 201);
  const name = made.body.world.name;
  assert.equal(made.body.role, 'A');
  assert.deepEqual(made.body.world.free, ['B']);

  // the parent finds it in the list and joins the free spot
  const list = await get(base, '/api/worlds');
  assert.equal(list.body.worlds.length, 1);
  assert.equal(list.body.worlds[0].name, name);
  const joined = await post(base, '/api/worlds/' + name + '/join', { device: 'dad-phone' });
  assert.equal(joined.body.role, 'B');

  // and now nobody else can stumble into it
  assert.deepEqual((await get(base, '/api/worlds')).body.worlds, []);
  const third = await post(base, '/api/worlds/' + name + '/join', { device: 'someone-else' });
  assert.equal(third.body.role, null);
  assert.equal(third.body.full, true);

  // the world itself travels through the server
  const empty = await get(base, '/api/worlds/' + name + '/snapshot');
  assert.equal(empty.status, 200, 'a world nobody has played yet is not an error');
  assert.equal(empty.body.world, null);
  const put = await post(base, '/api/worlds/' + name + '/snapshot', {
    device: 'kid-ipad',
    tick: 12,
    world: '{"tick":12}',
  });
  assert.equal(put.status, 200);
  const back = await get(base, '/api/worlds/' + name + '/snapshot');
  assert.equal(back.body.tick, 12);
  const stale = await post(base, '/api/worlds/' + name + '/snapshot', {
    device: 'dad-phone',
    tick: 3,
    world: '{"tick":3}',
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.snapshot.tick, 12);

  // and a world that was never started says so plainly
  assert.equal((await get(base, '/api/worlds/quiet-fox')).status, 404);
  assert.equal((await post(base, '/api/worlds/quiet-fox/join', { device: 'x' })).status, 404);
});

test('a name from a link or an old bookmark starts the world if nobody has', async t => {
  const { server, base } = await listen();
  t.after(() => server.close());

  // no such world, and no intention of starting one: say so
  const cold = await post(base, '/api/worlds/quiet-fox/join', { device: 'a' });
  assert.equal(cold.status, 404);

  // the same name, from somebody who followed a link
  const started = await post(base, '/api/worlds/quiet-fox/join', {
    device: 'a',
    role: 'A',
    start: true,
  });
  assert.equal(started.status, 201);
  assert.equal(started.body.world.name, 'quiet-fox', 'the world keeps the name it was given');
  assert.equal(started.body.role, 'A');

  // and the second link-follower joins it rather than starting a second one
  const second = await post(base, '/api/worlds/quiet-fox/join', {
    device: 'b',
    role: 'B',
    start: true,
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.world.name, 'quiet-fox');
  assert.equal(second.body.role, 'B');
  assert.equal((await get(base, '/api/health')).body.worlds, 1);
});

test('a device asking for a world by name gets it whether or not it is listed', async t => {
  const { server, base } = await listen();
  t.after(() => server.close());
  const made = await post(base, '/api/worlds', { device: 'kid', role: 'A' });
  const name = made.body.world.name;
  await post(base, '/api/worlds/' + name + '/join', { device: 'dad' });
  const one = await get(base, '/api/worlds/' + name);
  assert.equal(one.status, 200);
  assert.deepEqual(one.body.world.taken, ['A', 'B']);
  assert.equal(one.body.world.emoji.length > 0, true);
});

test('a full world stays joinable to the two devices already in it', async t => {
  const { server, base } = await listen();
  t.after(() => server.close());
  const made = await post(base, '/api/worlds', { device: 'kid', role: 'A' });
  const name = made.body.world.name;
  await post(base, '/api/worlds/' + name + '/join', { device: 'dad', role: 'B' });

  // the child's own iPad, coming back: still theirs, however full the world is
  const back = await post(base, '/api/worlds/' + name + '/join', { device: 'kid', role: 'A' });
  assert.equal(back.body.role, 'A');
  assert.equal(back.body.full, false);

  // a stranger is told plainly that there is no room, and the browser only
  // walks past that when the player has already said which of the two they are
  const third = await post(base, '/api/worlds/' + name + '/join', { device: 'stranger' });
  assert.equal(third.body.role, null);
  assert.equal(third.body.full, true);
});

test('starting over, over HTTP: the old village does not come back', async t => {
  const { server, base } = await listen();
  t.after(() => server.close());
  const made = await post(base, '/api/worlds', { device: 'kid', role: 'A' });
  const name = made.body.world.name;
  await post(base, '/api/worlds/' + name + '/snapshot', {
    device: 'kid',
    tick: 900,
    world: '{"tick":900}',
  });

  const stale = await post(base, '/api/worlds/' + name + '/snapshot', {
    device: 'kid',
    tick: 0,
    world: '{"tick":0}',
  });
  assert.equal(stale.status, 409, 'a device with an old save is still put right');

  const over = await post(base, '/api/worlds/' + name + '/snapshot', {
    device: 'kid',
    tick: 0,
    world: '{"tick":0}',
    reset: true,
  });
  assert.equal(over.status, 200);
  const back = await get(base, '/api/worlds/' + name + '/snapshot');
  assert.equal(back.body.tick, 0, 'whoever opens the page next gets the fresh world');
});

test('the api does not answer for anything it does not own', async t => {
  const { server, base } = await listen();
  t.after(() => server.close());
  assert.equal((await fetch(base + '/index.html')).status, 404); // fell through to the file server
  assert.equal((await fetch(base + '/api/nonsense')).status, 404);
  const bad = await fetch(base + '/api/worlds', { method: 'POST', body: 'not json' });
  assert.equal(bad.status, 400);
});

test('health only answers a plain GET', async t => {
  const { server, base } = await listen();
  t.after(() => server.close());
  assert.equal((await fetch(base + '/api/health', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/api/health', { method: 'PUT' })).status, 405);
  assert.equal((await fetch(base + '/api/health')).status, 200);
});

test('nobody can fill the directory from one machine', async t => {
  const { server, base } = await listen();
  t.after(() => server.close());
  let refused = 0;
  for (let i = 0; i < 40; i++) {
    const r = await post(base, '/api/worlds', { device: 'flood' + i });
    if (r.status === 429) refused++;
  }
  assert.ok(refused >= 5, 'a flood of new worlds should start being refused');
});

test('a flood of activity on one world is throttled too, not just creating one', async t => {
  const { server, base } = await listen();
  t.after(() => server.close());
  const made = await post(base, '/api/worlds', { device: 'kid' });
  const name = made.body.world.name;
  let refused = 0;
  for (let i = 0; i < 1210; i++) {
    const r = await fetch(base + '/api/worlds/' + name);
    if (r.status === 429) refused++;
  }
  assert.ok(refused >= 5, 'a flood of lookups on one world should start being refused too');
});

test('without TRUST_PROXY, a claimed X-Forwarded-For buys no extra budget', async t => {
  const { server, base } = await listen();
  t.after(() => server.close());
  const createAs = ip =>
    fetch(base + '/api/worlds', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ device: 'x' }),
    }).then(r => r.status);

  for (let i = 0; i < 30; i++) await createAs('9.9.9.9');
  assert.equal(await createAs('8.8.8.8'), 429, 'a different claimed address changed nothing');
});

test('TRUST_PROXY=1 gives each forwarded address its own budget', async t => {
  process.env.TRUST_PROXY = '1';
  t.after(() => delete process.env.TRUST_PROXY);
  const { server, base } = await listen();
  t.after(() => server.close());
  const createAs = ip =>
    fetch(base + '/api/worlds', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ device: 'x' }),
    }).then(r => r.status);

  let refused = 0;
  for (let i = 0; i < 35; i++) if ((await createAs('1.1.1.1')) === 429) refused++;
  assert.ok(refused >= 5, 'the first address did get throttled on its own');
  assert.equal(await createAs('2.2.2.2'), 201, 'a different address still has its own budget');
});

test('TRUST_PROXY=1 trusts the last hop, not whatever a client wrote first', async t => {
  // a real proxy appends its own idea of the address rather than replacing
  // what arrived — so a client prepending a made-up address ahead of the
  // real one must not be able to pick its own bucket that way
  process.env.TRUST_PROXY = '1';
  t.after(() => delete process.env.TRUST_PROXY);
  const { server, base } = await listen();
  t.after(() => server.close());
  const createWithChain = xff =>
    fetch(base + '/api/worlds', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': xff },
      body: JSON.stringify({ device: 'x' }),
    }).then(r => r.status);

  let refused = 0;
  for (let i = 0; i < 35; i++)
    if ((await createWithChain('made-up-' + i + ', 3.3.3.3')) === 429) refused++;
  assert.ok(refused >= 5, 'a different claimed first hop each time changed nothing');
  assert.equal(
    await createWithChain('a-fresh-lie, 3.3.3.3'),
    429,
    'the real (last, proxy-appended) address is what is actually throttled',
  );
});

test('TRUST_PROXY=1 prefers X-Real-IP over X-Forwarded-For', async t => {
  // X-Real-IP has nothing to parse and nothing a client can make it say —
  // CapRover's nginx always overwrites it with its own observed peer. Where
  // both headers are present, it wins over whatever X-Forwarded-For claims.
  process.env.TRUST_PROXY = '1';
  t.after(() => delete process.env.TRUST_PROXY);
  const { server, base } = await listen();
  t.after(() => server.close());
  const createAs = (realIp, xff) =>
    fetch(base + '/api/worlds', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-real-ip': realIp,
        'x-forwarded-for': xff,
      },
      body: JSON.stringify({ device: 'x' }),
    }).then(r => r.status);

  let refused = 0;
  for (let i = 0; i < 35; i++)
    if ((await createAs('4.4.4.4', 'a-different-lie-' + i)) === 429) refused++;
  assert.ok(refused >= 5, 'the real X-Real-IP address did get throttled on its own');
  assert.equal(
    await createAs('5.5.5.5', 'a-different-lie-again'),
    201,
    'a different X-Real-IP still has its own budget, regardless of X-Forwarded-For',
  );
});
