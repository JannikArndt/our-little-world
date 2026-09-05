import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, PROJECT, SAPLING_TICKS, REPLANT_GOAL, byId, project } from '../src/core/world.js';
import { applyAction } from '../src/core/actions.js';
import { tick } from '../src/core/sim.js';
import { currentProblem } from '../src/core/guide.js';
import { walkable } from '../src/core/grid.js';
import { findPath } from '../src/core/pathfind.js';
import { setLang } from '../src/core/i18n.js';

const run = (w, n) => { for (let i = 0; i < n; i++) tick(w); return w; };

/** Get the world past everything urgent so the quiet tasks come up. */
function settled(seed) {
  const w = createWorld(seed);
  w.players.A.res.plank = 9; w.players.A.res.stone = 9;
  applyAction(w, { type: 'bridge.build', role: 'A', planks: 5, stone: 4, quality: 3 });
  const site = w.buildings.find(b => b.state === 'site');
  w.players.A.res.plank = 9; w.players.A.res.stone = 9;
  applyAction(w, {
    type: 'house.build', role: 'A', siteId: site.id, plan: {},
    beds: 3, warm: true, light: true, roomy: true, reachable: true, planks: 5, stone: 3,
  });
  run(w, 900);
  for (const v of w.villagers) v.hunger = 10;
  for (const s of w.sheep) { s.hunger = 10; s.thirst = 10; s.fluff = 10; s.mood = 'ok'; }
  w.larder.food = 5;
  return w;
}

test('a card says what to do, not what is sad', () => {
  setLang('en');
  const w = createWorld(42);
  const pr = currentProblem(w);
  assert.equal(pr.id, 'homeless');
  assert.match(pr.title, /^Build a house for \w+!$/, 'got: ' + pr.title);
});

test('anybody the card names is somebody it can point at', () => {
  const w = createWorld(42);
  const pr = currentProblem(w);
  assert.ok(pr.subject, 'the card knows who it is about');
  assert.ok(byId(w.villagers, pr.subject.id), 'and that person is in the world');
  assert.ok(pr.points.length >= 1, 'and it knows where to look');
});

test('every countable step carries its count, and the tick follows the count', () => {
  const w = createWorld(42);
  w.players.A.res.wood = 0; w.players.A.res.plank = 0; w.players.A.res.stone = 0;
  w.players.B.res.stone = 0;
  let pr = currentProblem(w);
  const stones = pr.steps.find(s => s.count && s.count.icon === '🪨');
  assert.deepEqual({ have: stones.count.have, need: stones.count.need, done: stones.done },
                   { have: 0, need: 3, done: false });

  w.players.B.res.stone = 4;                       // more than enough, from either side
  pr = currentProblem(w);
  const after = pr.steps.find(s => s.count && s.count.icon === '🪨');
  assert.deepEqual({ have: after.count.have, need: after.count.need, done: after.done },
                   { have: 3, need: 3, done: true }, 'a count never reads more than it needs');

  for (const s of pr.steps) {
    if (!s.count) continue;
    assert.equal(s.done, s.count.have >= s.count.need, 'tick and count disagree: ' + s.text);
  }
});

test('the projects queue up in the order a village would want them', () => {
  const w = settled(5);
  const order = ['boat', 'play', 'well', 'privy'];
  assert.equal(currentProblem(w).id, order[0], 'got: ' + currentProblem(w).id);

  for (const what of order) {
    w.players.A.res.plank = 9; w.players.A.res.stone = 9;
    assert.equal(applyAction(w, { type: 'project.build', role: 'A', what }), true, what);
  }
  // the fence waits until a sheep has actually been at the wheat
  assert.equal(currentProblem(w).id, 'calm');
});

test('the fence is only worth mentioning once a sheep has found the wheat', () => {
  const w = settled(5);
  assert.ok(currentProblem(w).id !== 'fence');
  w.plots[0].nibbled = 1;
  const pr = currentProblem(w);
  assert.equal(pr.id, 'fence', 'got: ' + pr.id);
  assert.equal(pr.steps[0].count.need, PROJECT.fence.plank);

  w.players.A.res.plank = 9;
  assert.equal(applyAction(w, { type: 'project.build', role: 'A', what: 'fence' }), true);
  assert.ok(currentProblem(w).id !== 'fence', 'and then it stops being mentioned');
});

test('a felled forest asks to be replanted before anything else quiet', () => {
  const w = settled(5);
  for (let i = 0; i < REPLANT_GOAL; i++) {
    const t = w.trees.filter(t => t.state === 'standing')[i];
    applyAction(w, { type: 'tree.fell', role: 'A', treeId: t.id, dir: 'S', wood: 2, logs: 0 });
  }
  const pr = currentProblem(w);
  assert.equal(pr.id, 'replant');
  assert.equal(pr.steps[0].count.need, REPLANT_GOAL);
  assert.equal(pr.steps[0].count.have, 0);
});

test('a sapling grows back into a tree while you play', () => {
  const w = createWorld(5);
  const t = w.trees.find(t => t.state === 'standing');
  applyAction(w, { type: 'tree.fell', role: 'A', treeId: t.id, dir: 'S', wood: 2, logs: 0 });
  assert.equal(applyAction(w, { type: 'tree.plant', role: 'B', treeId: t.id }), true);
  assert.equal(t.state, 'sapling');
  assert.ok(walkable(w, t.x, t.y), 'a sapling is not in anybody\'s way');
  assert.equal(applyAction(w, { type: 'tree.plant', role: 'B', treeId: t.id }), false, 'only once');

  run(w, SAPLING_TICKS + 40);
  assert.equal(t.state, 'standing', 'it is a tree again');
  assert.equal(walkable(w, t.x, t.y), false, 'and it takes up its tile again');
});

test('the boat costs what it says and then feeds people', () => {
  const w = settled(7);
  assert.equal(applyAction(w, { type: 'fish.catch', role: 'B', n: 2 }), false, 'no boat, no fish');

  w.players.A.res.plank = PROJECT.boat.plank - 1; w.players.A.res.stone = PROJECT.boat.stone;
  assert.equal(applyAction(w, { type: 'boat.build', role: 'A' }), false, 'and no boat without planks');

  w.players.A.res.plank = PROJECT.boat.plank; w.players.A.res.stone = PROJECT.boat.stone;
  assert.equal(applyAction(w, { type: 'boat.build', role: 'A' }), true);
  assert.equal(w.players.A.res.plank, 0);
  assert.equal(w.players.A.res.stone, 0);

  const food = w.players.B.res.food;
  applyAction(w, { type: 'fish.catch', role: 'B', n: 2 });
  assert.equal(w.players.B.res.food, food + 2);
  applyAction(w, { type: 'fish.catch', role: 'B', n: 99 });
  assert.equal(w.players.B.res.food, food + 6, 'never more than a boatful, however it is asked');
});

test('the children use the playground once it is there', () => {
  const w = settled(9);
  w.players.A.res.plank = PROJECT.play.plank; w.players.A.res.stone = PROJECT.play.stone;
  applyAction(w, { type: 'play.build', role: 'A' });
  const pg = project(w, 'play');
  const little = w.villagers.filter(v => v.kid);
  assert.equal(little.length, 2);

  let seen = false;
  for (let i = 0; i < 3000 && !seen; i++) {
    tick(w);
    seen = little.some(v => v.x >= pg.x - 1 && v.x <= pg.x + pg.w + 1 &&
                            v.y >= pg.y - 1 && v.y <= pg.y + pg.h + 1);
  }
  assert.ok(seen, 'somebody small turned up to play');
});

test('the landing is on the bank, at the water', () => {
  const w = createWorld(3);
  const landing = project(w, 'boat');
  assert.ok(landing, 'there is a landing');
  assert.equal(landing.state, 'plan');
  let nearWater = false;
  for (let dx = 0; dx <= landing.w + 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      if (!walkable(w, landing.x + dx, landing.y + dy)) nearWater = true;
  assert.ok(nearWater, 'and the river is right there');
});

test('a plan is not a building site, and nothing stands in it', () => {
  const w = createWorld(3);
  const sites = w.buildings.filter(b => b.state === 'site');
  assert.equal(sites.length, 1, 'only the house plot is a site');
  for (const plan of w.buildings.filter(b => b.state === 'plan'))
    assert.ok(walkable(w, plan.x, plan.y), 'a plan can be walked over: ' + plan.id);
});

test('river water is why somebody gets a poorly tummy, and clean water is the cure', () => {
  const w = settled(31);
  w.tick = 3000;
  applyAction(w, { type: 'block.start' });
  w.block.startTick = w.tick;

  // left alone, sooner or later somebody drinks the wrong water
  let ill = null;
  for (let i = 0; i < 20000 && !ill; i++) { tick(w); ill = w.villagers.find(v => v.poorly > 0); }
  assert.ok(ill, 'somebody eventually gets a poorly tummy');
  assert.ok(!ill.kid, 'and it is never one of the children');
  assert.ok(w.notices.some(n => n.id === 'poorly'), 'and the world says why');

  const pr = currentProblem(w);
  assert.equal(pr.id, 'poorly');
  assert.match(pr.title, /clean water/i, 'got: ' + pr.title);
  assert.equal(pr.subject.id, ill.id, 'and it is about them');

  // a well settles it at once, and it cannot happen again
  w.players.B.res.plank = 9; w.players.B.res.stone = 9;
  assert.equal(applyAction(w, { type: 'project.build', role: 'B', what: 'well' }), true);
  assert.equal(ill.poorly, 0, 'they feel better straight away');
  run(w, 3000);
  assert.equal(w.villagers.filter(v => v.poorly > 0).length, 0, 'and nobody else takes ill');
});

test('the little house keeps the river clean, which the fish notice', () => {
  const w = settled(33);
  w.tick = 3000;
  applyAction(w, { type: 'block.start' });
  w.block.startTick = w.tick;
  w.players.A.res.plank = 9; w.players.A.res.stone = 9;
  assert.equal(applyAction(w, { type: 'project.build', role: 'A', what: 'privy' }), true);
  run(w, 6000);
  assert.equal(w.villagers.filter(v => v.poorly > 0).length, 0, 'a clean river is a safe river');
});

test('a fenced field is one the sheep leave alone', () => {
  const w = settled(37);
  const sheep = w.sheep[0];
  w.players.A.res.plank = 9;
  applyAction(w, { type: 'project.build', role: 'A', what: 'fence' });
  const inField = (s) => s.x > 25 && s.x < 35 && s.y > 15 && s.y < 22;

  // she still goes where she is taken — a fence is not a wall
  applyAction(w, { type: 'sheep.send', role: 'B', sheepId: sheep.id, x: 29, y: 17 });
  let arrived = false;
  for (let i = 0; i < 1200 && !arrived; i++) { tick(w); arrived = inField(sheep); }
  assert.ok(arrived, 'led in, she goes in');
  assert.ok(findPath(w, 24, 18, 33, 18, { within: 1 }), 'and people walk through the gap');

  // left to herself she keeps to the meadow
  sheep.x = 23.5; sheep.y = 12.5; sheep.path = []; sheep.led = null;
  for (const s2 of w.sheep) { s2.x = 23.5; s2.y = 12.5; s2.path = []; s2.led = null; }
  let strayed = false;
  for (let i = 0; i < 6000 && !strayed; i++) { tick(w); strayed = w.sheep.some(inField); }
  assert.equal(strayed, false, 'nobody wandered into the wheat');
});
