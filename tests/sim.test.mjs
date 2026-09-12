import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createWorld,
  serialize,
  deserialize,
  BLOCK_TICKS,
  freeBed,
  dayPhase,
  isDusk,
} from '../src/core/world.js';
import { SCENARIOS } from '../src/core/content.js';
import { applyAction } from '../src/core/actions.js';
import { tick } from '../src/core/sim.js';
import { maybeEvent } from '../src/core/events.js';
import { findPath } from '../src/core/pathfind.js';
import { T, tileAt, walkable } from '../src/core/grid.js';

const run = (w, n) => {
  for (let i = 0; i < n; i++) tick(w);
  return w;
};

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
  w.players.A.res.plank = 5;
  w.players.A.res.stone = 4;
  assert.equal(findPath(w, 8, 13, 27, 13, { within: 1 }), null);
  applyAction(w, { type: 'bridge.build', role: 'A', planks: 5, stone: 4, quality: 3 });
  assert.ok(findPath(w, 8, 13, 27, 13, { within: 1 }), 'the far bank should be reachable');
});

test('a broken bridge stops people, and mending it lets them through again', () => {
  const w = createWorld(3);
  w.players.A.res.plank = 9;
  w.players.A.res.stone = 9;
  applyAction(w, { type: 'bridge.build', role: 'A', planks: 5, stone: 4, quality: 2 });
  applyAction(w, { type: 'world.event', event: 'storm' });
  assert.equal(findPath(w, 8, 13, 27, 13, { within: 1 }), null);
  applyAction(w, { type: 'bridge.repair', role: 'A' });
  assert.ok(findPath(w, 8, 13, 27, 13, { within: 1 }));
});

test('building a bridge costs exactly what it says', () => {
  const w = createWorld(3);
  w.players.A.res.plank = 5;
  w.players.A.res.stone = 4;
  assert.equal(
    applyAction(w, { type: 'bridge.build', role: 'A', planks: 6, stone: 4, quality: 3 }),
    false,
    'should refuse when the planks are not there',
  );
  assert.equal(w.bridge.built, false);
  assert.equal(
    applyAction(w, { type: 'bridge.build', role: 'A', planks: 5, stone: 4, quality: 3 }),
    true,
  );
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
  const tiles = [
    { x: 26, y: 22 },
    { x: 27, y: 22 },
    { x: 28, y: 22 },
    { x: 29, y: 22 },
  ];
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
  w.players.A.res.plank = 9;
  w.players.A.res.stone = 9;
  assert.ok(
    w.villagers.some(v => !v.homeId),
    'somebody starts without a bed',
  );
  applyAction(w, {
    type: 'house.build',
    role: 'A',
    siteId: site.id,
    plan: {},
    beds: 2,
    warm: true,
    light: true,
    roomy: true,
    reachable: true,
    planks: 5,
    stone: 3,
  });
  assert.ok(freeBed(w));
  run(w, 900);
  assert.ok(
    w.villagers.every(v => v.homeId),
    'everybody has a bed after a while',
  );
});

test('hungry people eat from the basket and cheer up', () => {
  const w = createWorld(13);
  w.larder.food = 8;
  for (const v of w.villagers) v.hunger = 90;
  run(w, 900);
  assert.ok(w.larder.food < 8, 'bread was eaten');
  assert.ok(
    w.villagers.some(v => v.hunger < 40),
    'somebody is properly fed again',
  );
});

test('wheat grows when watered and stalls when it is dry', () => {
  const w = createWorld(18);
  const p1 = w.plots[0],
    p2 = w.plots[1];
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
  p.state = 'ripe';
  p.growth = 100;
  assert.equal(applyAction(w, { type: 'plot.harvest', role: 'B', plotId: p.id }), true);
  assert.equal(w.players.B.res.wheat, 3);
  assert.equal(applyAction(w, { type: 'plot.harvest', role: 'B', plotId: p.id }), false);
});

test('a sheep will not walk to a place it cannot reach', () => {
  const w = createWorld(23);
  const s = w.sheep[0];
  s.x = 27.5;
  s.y = 6.5;
  applyAction(w, { type: 'sheep.send', role: 'B', sheepId: s.id, x: 8, y: 15 });
  run(w, 60);
  assert.ok(s.x > 19, 'she is still on the far bank');
  assert.ok(
    w.notices.some(n => n.id === 'sheep_far'),
    'and the world says why',
  );

  w.players.A.res.plank = 5;
  w.players.A.res.stone = 4;
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
  const scen = SCENARIOS.valley;
  assert.equal(w.villagers.length, scen.villagers.length, 'the world is still all there');
  assert.equal(
    w.buildings.length,
    scen.houses.length + scen.sites.length + scen.works.length + scen.plans.length,
  );
});

test('the world stops handing out new problems near the end of a block', () => {
  const w = createWorld(37);
  applyAction(w, { type: 'block.start' });
  w.bridge.built = true;
  w.bridge.quality = 2;
  w.journal.push({ icon: '🏠', text: 'built a house', tick: 0 });
  w.tick = w.block.startTick + Math.floor(BLOCK_TICKS * 0.9);
  w.lastEventTick = 0;
  let fired = 0;
  for (let i = 0; i < 500; i++) {
    if (maybeEvent(w)) fired++;
    w.tick++;
  }
  assert.equal(fired, 0);
});

test('the world does keep handing out problems in the middle of a block', () => {
  const w = createWorld(37);
  applyAction(w, { type: 'block.start' });
  w.bridge.built = true;
  w.bridge.quality = 2;
  w.tick = w.block.startTick + Math.floor(BLOCK_TICKS * 0.3);
  w.lastEventTick = 0;
  let fired = 0;
  for (let i = 0; i < 2000; i++) {
    if (maybeEvent(w)) fired++;
    w.tick++;
  }
  assert.ok(fired > 0 && fired <= 3, 'some, but never many: got ' + fired);
});

test('nothing decays while nobody is playing', () => {
  const w = createWorld(41);
  const saved = serialize(w);
  const later = deserialize(saved);
  assert.equal(serialize(later), saved);
});

test('the people who already live somewhere are holding their beds', () => {
  const w = createWorld(2024);
  const taken = w.buildings.reduce((n, b) => n + (b.residents ? b.residents.length : 0), 0);
  assert.equal(taken, 5, 'both families, children included, fill their beds');
  assert.equal(freeBed(w), null, 'there is no spare bed at the start');
  run(w, BLOCK_TICKS);
  assert.equal(
    w.villagers.filter(v => !v.homeId).length,
    1,
    'somebody is still sleeping by the fire until a house gets built',
  );
});

test('the same thing does not happen twice in one morning', () => {
  const w = createWorld(37);
  applyAction(w, { type: 'block.start' });
  w.bridge.built = true;
  w.bridge.quality = 2;
  w.journal.push({ icon: '🏠', text: 'built a house', tick: 0 });
  w.trees[0].state = 'stump';
  w.tick = w.block.startTick + Math.floor(BLOCK_TICKS * 0.2);
  const seen = [];
  for (let i = 0; i < 3000; i++) {
    const e = maybeEvent(w);
    if (e) {
      seen.push(e.event);
      applyAction(w, e);
    }
    w.tick++;
  }
  assert.equal(new Set(seen).size, seen.length, 'no event repeated: ' + seen.join(','));
});

/* --------------------------------------------------------------------- */
/* the day                                                               */
/* --------------------------------------------------------------------- */

test('the day is told by its phases, not by a clock', () => {
  const w = createWorld(51);
  assert.equal(dayPhase(w), 'dawn', 'a world nobody has started is at dawn');
  applyAction(w, { type: 'block.start' });
  const at = p => {
    w.tick = w.block.startTick + Math.floor(BLOCK_TICKS * p);
    return dayPhase(w);
  };
  assert.equal(at(0.02), 'dawn');
  assert.equal(at(0.2), 'morning');
  assert.equal(at(0.5), 'midday');
  assert.equal(at(0.7), 'afternoon');
  assert.equal(at(0.9), 'evening');
  assert.equal(isDusk(w), true);
  applyAction(w, { type: 'block.end' });
  assert.equal(dayPhase(w), 'night');
});

test('in the evening the people go in, and a new day brings them out again', () => {
  const w = createWorld(53);
  applyAction(w, { type: 'block.start' });
  run(w, Math.floor(BLOCK_TICKS * 0.7));
  assert.equal(
    w.villagers.some(v => v.inside),
    false,
    'still out while the day is on',
  );

  run(w, BLOCK_TICKS); // through the evening and past the end of the day
  const housed = w.villagers.filter(v => v.homeId);
  assert.ok(housed.length > 0);
  assert.equal(
    housed.every(v => v.inside),
    true,
    'everybody with a bed is indoors',
  );
  assert.equal(
    w.villagers.filter(v => !v.homeId).every(v => !v.inside),
    true,
    'the one without a bed is still outside, which is the point',
  );

  const home = w.buildings.find(b => b.id === housed[0].homeId);
  assert.equal(home.lamp, 1, 'the window is lit once somebody is home');

  applyAction(w, { type: 'block.start', newDay: true });
  assert.equal(w.day, 2);
  assert.equal(
    w.villagers.some(v => v.inside),
    false,
    'the morning brings everybody out',
  );
  run(w, 200);
  assert.equal(
    w.villagers.some(v => v.path && v.path.length),
    true,
    'and they get on with the day',
  );
});

/* --------------------------------------------------------------------- */
/* filling the basket, and the things people do                          */
/* --------------------------------------------------------------------- */

test('filling the basket sends the hungry to it right away', () => {
  const w = createWorld(61);
  w.larder.food = 0;
  const v = w.villagers[0];
  v.hunger = 50; // not hungry enough for a bare basket…
  v.path = [{ x: 2, y: 2 }]; // …but pretend they are off pottering somewhere
  v.task = null;
  w.players.A.res.food = 3;
  applyAction(w, { type: 'larder.give', from: 'A', n: 3 });
  assert.equal(v.path.length, 0, 'the pottering is dropped at once');
  assert.equal(v.wait, 0);
  run(w, 400);
  assert.ok(w.larder.food < 3, 'and they actually went and ate');
});

test('a full basket does not pull somebody off something that matters', () => {
  const w = createWorld(62);
  w.larder.food = 0;
  const v = w.villagers[0];
  v.hunger = 90;
  v.carrying = { wood: 2, owner: 'A' };
  v.path = [{ x: 3, y: 3 }];
  v.task = { kind: 'deliver' };
  w.players.A.res.food = 2;
  applyAction(w, { type: 'larder.give', from: 'A', n: 2 });
  assert.equal(v.path.length, 1, 'still carrying the log there');
  assert.equal(v.task.kind, 'deliver');
});

test('a loaf feeds one villager once, and the basket never goes below zero', () => {
  const w = createWorld(63);
  w.larder.food = 1;
  for (const v of w.villagers) {
    v.hunger = 90;
    v.path = [];
    v.task = null;
    v.wait = 0;
  }
  run(w, 1500);
  assert.equal(w.larder.food, 0, 'exactly the one loaf was eaten, never less than zero');
  assert.equal(
    w.villagers.filter(v => v.hunger < 40).length,
    1,
    'only the one who actually got the loaf is properly fed',
  );
});

test('villagers pick up a life of their own', () => {
  const w = createWorld(65);
  applyAction(w, { type: 'block.start', length: 30000 }); // long enough that dusk never gets in the way
  const seen = new Set();
  for (let i = 0; i < 6000; i++) {
    tick(w);
    for (const v of w.villagers) if (v.act) seen.add(v.act.kind);
  }
  for (const kind of ['dance', 'run', 'chat', 'sit'])
    assert.ok(seen.has(kind), 'somebody should have done "' + kind + '" by now');
});

test('a squabble is rare, gentle, and always between two of an age', () => {
  // squabbles need luck as well as two willing, idle villagers of an age
  // standing close together, so the test supplies the standing-close-together
  // part (the way two grown-ups pausing on the same path might) and waits for
  // the rare roll to land — the roll and the age-matching are what is
  // actually under test here, not how often somebody happens to wander by.
  const w = createWorld(92);
  applyAction(w, { type: 'block.start', length: 100000 });
  const [a, b] = w.villagers.filter(v => !v.kid);
  let found = null;
  for (let i = 0; i < 15000 && !found; i++) {
    if (!a.act && !a.task && (!a.path || !a.path.length)) {
      a.x = 10.5;
      a.y = 10.5;
      a.poorly = 0;
      a.carrying = null;
    }
    if (!b.act && !b.task && (!b.path || !b.path.length)) {
      b.x = 11.5;
      b.y = 10.5;
      b.poorly = 0;
      b.carrying = null;
    }
    tick(w);
    found = w.villagers.find(v => v.act && v.act.kind === 'squabble');
  }
  assert.ok(found, 'a squabble should have happened by now');
  const other = w.villagers.find(o => o.id === found.act.with);
  assert.ok(other, 'the other side of it exists');
  assert.equal(other.kid, found.kid, 'never a grown-up against a child');
  assert.ok(
    w.notices.some(n => n.key === 'notice.squabble'),
    'and the world says so',
  );
});

test('tapping either side of a squabble breaks it up', () => {
  const w = createWorld(67);
  const [a, b] = w.villagers;
  a.act = { kind: 'squabble', until: w.tick + 100, with: b.id };
  b.act = { kind: 'squabble', until: w.tick + 100, with: a.id };

  assert.equal(applyAction(w, { type: 'villager.poke', role: 'A', id: a.id }), true);
  assert.equal(a.act, null, 'the one tapped calms down');
  assert.equal(b.act, null, 'and so does the other one');
  assert.equal(a.hearts, w.tick);
  assert.equal(b.hearts, w.tick);

  // and from the other side too
  a.act = { kind: 'squabble', until: w.tick + 100, with: b.id };
  b.act = { kind: 'squabble', until: w.tick + 100, with: a.id };
  assert.equal(applyAction(w, { type: 'villager.poke', role: 'B', id: b.id }), true);
  assert.equal(a.act, null);
  assert.equal(b.act, null);
});

test('a poke answers, unless there is something that matters more', () => {
  const w = createWorld(68);
  const v = w.villagers[0];
  const answers = new Set();
  for (let seed = 100; seed < 140; seed++) {
    const w2 = createWorld(seed);
    applyAction(w2, { type: 'villager.poke', role: 'A', id: w2.villagers[0].id });
    answers.add(w2.villagers[0].act.kind);
  }
  assert.ok(answers.size > 1, 'the answer varies: ' + [...answers].join(','));
  for (const a of answers) assert.ok(['wave', 'wink', 'hop', 'shy'].includes(a));

  // busy in a way that matters: a wave at most, and nothing dropped
  v.carrying = { wood: 1, owner: 'A' };
  v.path = [{ x: 5, y: 5 }];
  v.task = { kind: 'deliver' };
  applyAction(w, { type: 'villager.poke', role: 'A', id: v.id });
  assert.equal(v.act.kind, 'wave');
  assert.equal(v.path.length, 1);
  assert.equal(v.task.kind, 'deliver');

  assert.equal(applyAction(w, { type: 'villager.poke', role: 'A', id: 'not_a_real_id' }), false);
});

test("the village's own life stays just as deterministic", () => {
  const play = () => {
    const w = createWorld(83);
    applyAction(w, { type: 'block.start' });
    run(w, 400);
    applyAction(w, { type: 'villager.poke', role: 'A', id: w.villagers[2].id });
    run(w, 2000);
    w.players.B.res.food = 2;
    applyAction(w, { type: 'larder.give', from: 'B', n: 2 });
    run(w, 1000);
    return serialize(w);
  };
  assert.equal(play(), play());
});

test('a day only ever begins because somebody asked for one', () => {
  const w = createWorld(57);
  run(w, 400);
  assert.equal(w.block.active, false, 'nothing starts a day by itself');
  applyAction(w, { type: 'block.start' });
  run(w, BLOCK_TICKS + 5);
  assert.equal(w.block.active, false);
  run(w, 600);
  assert.equal(w.block.active, false, 'and nothing starts the next one by itself either');
});
