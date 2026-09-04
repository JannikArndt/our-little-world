import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, serialize, deserialize, BLOCK_TICKS, freeBed } from '../src/core/world.js';
import { applyAction } from '../src/core/actions.js';
import { tick } from '../src/core/sim.js';
import { maybeEvent } from '../src/core/events.js';
import { findPath } from '../src/core/pathfind.js';
import { T, tileAt, walkable } from '../src/core/grid.js';

const run = (w, n) => { for (let i = 0; i < n; i++) tick(w); return w; };

test('the same seed always makes the same world', () => {
  assert.equal(serialize(createWorld(42)), serialize(createWorld(42)));
  assert.notEqual(serialize(createWorld(42)), serialize(createWorld(43)));
});

test('the simulation is deterministic', () => {
  const a = run(createWorld(7), 900);
  const b = run(createWorld(7), 900);
  assert.equal(serialize(a), serialize(b));
});

test('a world survives a round trip through storage', () => {
  const w = run(createWorld(11), 300);
  const back = deserialize(serialize(w));
  assert.equal(serialize(back), serialize(w));
});

test('nobody can cross the river until the bridge is there', () => {
  const w = createWorld(3);
  w.players.A.res.plank = 5; w.players.A.res.stone = 4;
  assert.equal(findPath(w, 8, 13, 27, 13, { within: 1 }), null);
  applyAction(w, { type: 'bridge.build', role: 'A', planks: 5, stone: 4, quality: 3 });
  assert.ok(findPath(w, 8, 13, 27, 13, { within: 1 }), 'the far bank should be reachable');
});

test('a broken bridge stops people, and mending it lets them through again', () => {
  const w = createWorld(3);
  w.players.A.res.plank = 9; w.players.A.res.stone = 9;
  applyAction(w, { type: 'bridge.build', role: 'A', planks: 5, stone: 4, quality: 2 });
  applyAction(w, { type: 'world.event', event: 'storm' });
  assert.equal(findPath(w, 8, 13, 27, 13, { within: 1 }), null);
  applyAction(w, { type: 'bridge.repair', role: 'A' });
  assert.ok(findPath(w, 8, 13, 27, 13, { within: 1 }));
});

test('building a bridge costs exactly what it says', () => {
  const w = createWorld(3);
  w.players.A.res.plank = 5; w.players.A.res.stone = 4;
  assert.equal(applyAction(w, { type: 'bridge.build', role: 'A', planks: 6, stone: 4, quality: 3 }), false,
    'should refuse when the planks are not there');
  assert.equal(w.bridge.built, false);
  assert.equal(applyAction(w, { type: 'bridge.build', role: 'A', planks: 5, stone: 4, quality: 3 }), true);
  assert.equal(w.players.A.res.plank, 0);
  assert.equal(w.players.A.res.stone, 0);
});

test('felling a tree leaves a stump, gives wood and drops a log', () => {
  const w = createWorld(5);
  const t = w.trees.find(t => t.state === 'standing');
  const before = w.players.A.res.wood;
  applyAction(w, { type: 'tree.fell', role: 'A', treeId: t.id, dir: 'S', wood: 2, logs: 2 });
  assert.equal(t.state, 'stump');
  assert.equal(w.players.A.res.wood, before + 2);
  assert.equal(w.logs.length, 1);
  assert.ok(walkable(w, t.x, t.y), 'the tile is free once the tree is down');
});

test('the sawmill turns wood into planks and cannot cheat', () => {
  const w = createWorld(5);
  w.players.A.res.wood = 1;
  assert.equal(applyAction(w, { type: 'saw.run', role: 'A', wood: 2, planks: 4 }), false);
  assert.equal(applyAction(w, { type: 'saw.run', role: 'A', wood: 1, planks: 3 }), true);
  assert.equal(w.players.A.res.wood, 0);
  assert.equal(w.players.A.res.plank, 1 + 3);
});

test('a road costs one stone for every two steps and speeds people up', () => {
  const w = createWorld(5);
  w.players.B.res.stone = 3;
  const tiles = [{ x: 26, y: 22 }, { x: 27, y: 22 }, { x: 28, y: 22 }, { x: 29, y: 22 }];
  assert.equal(applyAction(w, { type: 'road.build', role: 'B', tiles }), true);
  assert.equal(w.players.B.res.stone, 1);
  for (const t of tiles) assert.equal(tileAt(w, t.x, t.y), T.ROAD);
});

test('resources move between players and into the village basket', () => {
  const w = createWorld(5);
  w.players.A.res.wood = 3;
  applyAction(w, { type: 'give', from: 'A', to: 'B', res: 'wood', n: 2 });
  assert.equal(w.players.A.res.wood, 1);
  assert.equal(w.players.B.res.wood, 2);
  applyAction(w, { type: 'give', from: 'A', to: 'B', res: 'wood', n: 9 });
  assert.equal(w.players.A.res.wood, 0, 'you cannot give what you do not have');
  assert.equal(w.players.B.res.wood, 3);

  const larder = w.larder.food;
  w.players.B.res.food = 2;
  applyAction(w, { type: 'larder.give', from: 'B', n: 2 });
  assert.equal(w.larder.food, larder + 2);
});

test('somebody without a bed moves into a new house', () => {
  const w = createWorld(9);
  const site = w.buildings.find(b => b.state === 'site');
  w.players.A.res.plank = 9; w.players.A.res.stone = 9;
  assert.ok(w.villagers.some(v => !v.homeId), 'somebody starts without a bed');
  applyAction(w, {
    type: 'house.build', role: 'A', siteId: site.id, plan: {},
    beds: 2, warm: true, light: true, roomy: true, reachable: true, planks: 5, stone: 3,
  });
  assert.ok(freeBed(w));
  run(w, 900);
  assert.ok(w.villagers.every(v => v.homeId), 'everybody has a bed after a while');
});

test('hungry people eat from the basket and cheer up', () => {
  const w = createWorld(13);
  w.larder.food = 8;
  for (const v of w.villagers) v.hunger = 90;
  run(w, 900);
  assert.ok(w.larder.food < 8, 'bread was eaten');
  assert.ok(w.villagers.some(v => v.hunger < 40), 'somebody is properly fed again');
});

test('wheat grows when watered and stalls when it is dry', () => {
  const w = createWorld(17);
  const p1 = w.plots[0], p2 = w.plots[1];
  applyAction(w, { type: 'plot.plant', role: 'B', plotId: p1.id });
  applyAction(w, { type: 'plot.plant', role: 'B', plotId: p2.id });
  applyAction(w, { type: 'plot.water', role: 'B', plotId: p1.id });
  run(w, 600);
  assert.ok(p1.growth > 20, 'watered wheat grows');
  assert.ok(p2.growth < 5, 'dry wheat barely moves');
});

test('a ripe plot can be cut, and only once', () => {
  const w = createWorld(19);
  const p = w.plots[0];
  applyAction(w, { type: 'plot.plant', role: 'B', plotId: p.id });
  p.state = 'ripe'; p.growth = 100;
  assert.equal(applyAction(w, { type: 'plot.harvest', role: 'B', plotId: p.id }), true);
  assert.equal(w.players.B.res.wheat, 3);
  assert.equal(applyAction(w, { type: 'plot.harvest', role: 'B', plotId: p.id }), false);
});

test('a sheep will not walk to a place it cannot reach', () => {
  const w = createWorld(23);
  const s = w.sheep[0];
  s.x = 27.5; s.y = 6.5;
  applyAction(w, { type: 'sheep.send', role: 'B', sheepId: s.id, x: 8, y: 15 });
  run(w, 60);
  assert.ok(s.x > 19, 'she is still on the far bank');
  assert.ok(w.notices.some(n => n.id === 'sheep_far'), 'and the world says why');

  w.players.A.res.plank = 5; w.players.A.res.stone = 4;
  applyAction(w, { type: 'bridge.build', role: 'A', planks: 5, stone: 4, quality: 3 });
  applyAction(w, { type: 'sheep.send', role: 'B', sheepId: s.id, x: 8, y: 15 });
  run(w, 2200);
  assert.ok(s.x < 19, 'she crossed the bridge');
});

test('teaching hands a capability across, once', () => {
  const w = createWorld(29);
  assert.equal(!!w.players.B.caps.fell, false);
  assert.equal(applyAction(w, { type: 'teach', from: 'A', to: 'B', cap: 'fell' }), true);
  assert.equal(w.players.B.caps.fell, 1);
  assert.equal(applyAction(w, { type: 'teach', from: 'A', to: 'B', cap: 'fell' }), false);
  assert.equal(applyAction(w, { type: 'teach', from: 'B', to: 'A', cap: 'road' }), true);
});

test('a play block ends by itself and nothing is lost', () => {
  const w = createWorld(31);
  applyAction(w, { type: 'block.start' });
  const before = run(w, BLOCK_TICKS - 2).block.active;
  assert.equal(before, true);
  run(w, 4);
  assert.equal(w.block.active, false);
  assert.ok(w.block.endedAt > 0);
  assert.equal(w.villagers.length, 4, 'the world is still all there');
  assert.equal(w.buildings.length, 4);
});

test('the world stops handing out new problems near the end of a block', () => {
  const w = createWorld(37);
  applyAction(w, { type: 'block.start' });
  w.bridge.built = true; w.bridge.quality = 2;
  w.journal.push({ icon: '🏠', text: 'built a house', tick: 0 });
  w.tick = w.block.startTick + Math.floor(BLOCK_TICKS * 0.9);
  w.lastEventTick = 0;
  let fired = 0;
  for (let i = 0; i < 500; i++) { if (maybeEvent(w)) fired++; w.tick++; }
  assert.equal(fired, 0);
});

test('the world does keep handing out problems in the middle of a block', () => {
  const w = createWorld(37);
  applyAction(w, { type: 'block.start' });
  w.bridge.built = true; w.bridge.quality = 2;
  w.tick = w.block.startTick + Math.floor(BLOCK_TICKS * 0.3);
  w.lastEventTick = 0;
  let fired = 0;
  for (let i = 0; i < 2000; i++) { if (maybeEvent(w)) fired++; w.tick++; }
  assert.ok(fired > 0 && fired <= 3, 'some, but never many: got ' + fired);
});

test('nothing decays while nobody is playing', () => {
  const w = createWorld(41);
  const saved = serialize(w);
  const later = deserialize(saved);
  assert.equal(serialize(later), saved);
});
