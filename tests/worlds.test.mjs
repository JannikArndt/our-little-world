import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
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

test('a third player is turned away rather than given somebody else\'s role', () => {
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
  s.touch(world.name, { device: 'kid', role: 'A' });          // the child still plays
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
  assert.equal(s.putSnapshot(world.name, { tick: 100, world: '{"tick":100}' }).ok, true);
  assert.equal(s.getSnapshot(world.name).tick, 100);
  const stale = s.putSnapshot(world.name, { tick: 40, world: '{"tick":40}' });
  assert.equal(stale.ok, false);
  assert.equal(stale.snapshot.tick, 100, 'the stale device is handed the good world back');
  assert.equal(s.putSnapshot(world.name, { tick: 220, world: '{"tick":220}' }).ok, true);
  assert.equal(s.getSnapshot(world.name).tick, 220);
});

test('a snapshot that is not a world is refused', () => {
  const s = new Worlds({});
  const { world } = s.create({ device: 'kid' });
  assert.equal(s.putSnapshot(world.name, { tick: 1, world: 'x'.repeat(600 * 1024) }).ok, false);
  assert.equal(s.putSnapshot('nowhere', { tick: 1, world: '{}' }).ok, false);
});

test('a real world snapshot survives a restart of the server', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'olw-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { createWorld, serialize, deserialize } = await import('../src/core/world.js');

  const first = await new Worlds({ dir }).load();
  const { world } = first.create({ device: 'kid', role: 'A' });
  const text = serialize(createWorld(7));
  first.putSnapshot(world.name, { tick: 500, world: text });
  await first.close();

  const files = await readdir(dir);
  assert.deepEqual(files, [world.name + '.json']);

  const second = await new Worlds({ dir }).load();
  const kept = second.getSnapshot(world.name);
  assert.equal(kept.tick, 500);
  assert.ok(deserialize(kept.world), 'what comes back off disk is still a world');
  assert.deepEqual(publicView(second.get(world.name)).taken, ['A']);
});

/* ---------------- over HTTP ---------------- */

function listen() {
  const store = new Worlds({});
  const api = createApi(store);
  const server = createServer(async (req, res) => {
    if (await api(req, res)) return;
    res.writeHead(404); res.end('no');
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, store, base: 'http://localhost:' + server.address().port })));
}

const get = async (base, path) => {
  const r = await fetch(base + path);
  return { status: r.status, body: await r.json() };
};
const post = async (base, path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json() };
};

test('the whole matchmaking dance, over HTTP', async (t) => {
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
  const put = await post(base, '/api/worlds/' + name + '/snapshot', { device: 'kid-ipad', tick: 12, world: '{"tick":12}' });
  assert.equal(put.status, 200);
  const back = await get(base, '/api/worlds/' + name + '/snapshot');
  assert.equal(back.body.tick, 12);
  const stale = await post(base, '/api/worlds/' + name + '/snapshot', { device: 'dad-phone', tick: 3, world: '{"tick":3}' });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.snapshot.tick, 12);

  // and a world that was never started says so plainly
  assert.equal((await get(base, '/api/worlds/quiet-fox')).status, 404);
  assert.equal((await post(base, '/api/worlds/quiet-fox/join', { device: 'x' })).status, 404);
});

test('a name from a link or an old bookmark starts the world if nobody has', async (t) => {
  const { server, base } = await listen();
  t.after(() => server.close());

  // no such world, and no intention of starting one: say so
  const cold = await post(base, '/api/worlds/quiet-fox/join', { device: 'a' });
  assert.equal(cold.status, 404);

  // the same name, from somebody who followed a link
  const started = await post(base, '/api/worlds/quiet-fox/join', { device: 'a', role: 'A', start: true });
  assert.equal(started.status, 201);
  assert.equal(started.body.world.name, 'quiet-fox', 'the world keeps the name it was given');
  assert.equal(started.body.role, 'A');

  // and the second link-follower joins it rather than starting a second one
  const second = await post(base, '/api/worlds/quiet-fox/join', { device: 'b', role: 'B', start: true });
  assert.equal(second.status, 200);
  assert.equal(second.body.world.name, 'quiet-fox');
  assert.equal(second.body.role, 'B');
  assert.equal((await get(base, '/api/health')).body.worlds, 1);
});

test('a device asking for a world by name gets it whether or not it is listed', async (t) => {
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

test('the api does not answer for anything it does not own', async (t) => {
  const { server, base } = await listen();
  t.after(() => server.close());
  assert.equal((await fetch(base + '/index.html')).status, 404);   // fell through to the file server
  assert.equal((await fetch(base + '/api/nonsense')).status, 404);
  const bad = await fetch(base + '/api/worlds', { method: 'POST', body: 'not json' });
  assert.equal(bad.status, 400);
});

test('nobody can fill the directory from one machine', async (t) => {
  const { server, base } = await listen();
  t.after(() => server.close());
  let refused = 0;
  for (let i = 0; i < 40; i++) {
    const r = await post(base, '/api/worlds', { device: 'flood' + i });
    if (r.status === 429) refused++;
  }
  assert.ok(refused >= 5, 'a flood of new worlds should start being refused');
});
