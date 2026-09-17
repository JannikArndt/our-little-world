// Villagers gather; the two of you make. These are the mistakes that are easy
// to make here: a skill that stacks, a job that takes more than it gives, a
// pile that grows for ever, and an action that hands the goods over twice.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, serialize, deserialize, knows, project } from '../src/core/world.js';
import { BAG_CAP, PILE_CAP, TREE_FLOOR, MAX_SKILLS, SAPLING_TICKS } from '../src/core/content.js';
import { applyAction } from '../src/core/actions.js';
import { tick } from '../src/core/sim.js';

const run = (w, n) => {
  for (let i = 0; i < n; i++) tick(w);
  return w;
};

/** A world with a day running, both players practised, and nobody hungry. */
function village(seed) {
  const w = createWorld(seed);
  applyAction(w, { type: 'block.start', length: 1000000 });
  for (const id in w.players)
    Object.assign(w.players[id].done, { fell: 3, stone: 3, farm: 3, care: 3, fish: 3 });
  for (const v of w.villagers) v.hunger = 10;
  return w;
}

/** Somebody with a bed, so they are all right enough to get on with a job. */
const housed = w => w.villagers.filter(v => v.homeId && !v.kid);

/* --------------------------------------------------------------------- */
/* showing somebody how                                                  */
/* --------------------------------------------------------------------- */

test('a villager holds two jobs, and only ever two', () => {
  const w = village(41);
  const v = housed(w)[0];

  assert.equal(applyAction(w, { type: 'villager.teach', role: 'A', id: v.id, what: 'fell' }), true);
  assert.equal(
    applyAction(w, { type: 'villager.teach', role: 'A', id: v.id, what: 'fell' }),
    false,
    'showing the same thing again does not stack it',
  );
  assert.equal(v.skills.length, 1);

  assert.equal(applyAction(w, { type: 'villager.teach', role: 'B', id: v.id, what: 'care' }), true);
  assert.equal(v.skills.length, MAX_SKILLS);

  // a third needs one of the two to stop, and `instead` has to name a real one
  assert.equal(
    applyAction(w, { type: 'villager.teach', role: 'B', id: v.id, what: 'farm' }),
    false,
    'a third job cannot just be added',
  );
  assert.equal(
    applyAction(w, { type: 'villager.teach', role: 'B', id: v.id, what: 'farm', instead: 'fish' }),
    false,
    'and cannot replace something they never held',
  );
  assert.equal(
    applyAction(w, { type: 'villager.teach', role: 'B', id: v.id, what: 'farm', instead: 'care' }),
    true,
  );
  assert.equal(v.skills.length, MAX_SKILLS, 'still two, never three');
  assert.equal(knows(v, 'care'), false, 'the one that stopped really stopped');
  assert.equal(knows(v, 'farm'), true);
});

test('you cannot show somebody a thing you cannot do', () => {
  const w = village(42);
  const v = housed(w)[0];

  assert.equal(
    applyAction(w, { type: 'villager.teach', role: 'B', id: v.id, what: 'fell' }),
    false,
    'the Keeper does not fell trees',
  );

  w.players.A.done.fell = 1;
  assert.equal(
    applyAction(w, { type: 'villager.teach', role: 'A', id: v.id, what: 'fell' }),
    false,
    'once is not twice',
  );
  w.players.A.done.fell = 2;
  assert.equal(applyAction(w, { type: 'villager.teach', role: 'A', id: v.id, what: 'fell' }), true);

  // stone is the one either of you can pass on, and it has a count of its own
  const u = housed(w)[1];
  w.players.B.done.stone = 0;
  assert.equal(
    applyAction(w, { type: 'villager.teach', role: 'B', id: u.id, what: 'stone' }),
    false,
  );
  applyAction(w, { type: 'stone.take', role: 'B', id: w.stones[0].id });
  applyAction(w, { type: 'stone.take', role: 'B', id: w.stones[0].id });
  assert.equal(w.players.B.done.stone, 2, 'picking one up is a thing you have done');
  assert.equal(
    applyAction(w, { type: 'villager.teach', role: 'B', id: u.id, what: 'stone' }),
    true,
  );
});

test('the workshop stays the players’ — a villager cannot be shown it', () => {
  const w = village(43);
  const v = housed(w)[0];
  w.players.A.done.saw = 9;
  w.players.A.done.house = 9;
  for (const what of ['saw', 'mill', 'bridge', 'house', 'road']) {
    assert.equal(
      applyAction(w, { type: 'villager.teach', role: 'A', id: v.id, what }),
      false,
      what + ' is not a villager’s to learn',
    );
  }
  assert.equal(v.skills.length, 0);
});

test('fishing waits for a boat to fish from', () => {
  const w = village(44);
  const v = housed(w)[0];
  assert.equal(
    applyAction(w, { type: 'villager.teach', role: 'B', id: v.id, what: 'fish' }),
    false,
    'there is no boat yet',
  );
  w.players.A.res.plank = 9;
  w.players.A.res.stone = 9;
  w.players.A.res.wool = 9;
  applyAction(w, { type: 'project.build', role: 'A', what: 'boat' });
  assert.equal(applyAction(w, { type: 'villager.teach', role: 'B', id: v.id, what: 'fish' }), true);
});

/* --------------------------------------------------------------------- */
/* handing the goods over                                                */
/* --------------------------------------------------------------------- */

test('taking what somebody is holding gives it once, however often it is asked', () => {
  const w = village(45);
  const v = housed(w)[0];
  v.bag.stone = 3;
  v.bag.wool = 2;
  const had = { stone: w.players.B.res.stone, wool: w.players.B.res.wool };

  assert.equal(applyAction(w, { type: 'villager.unload', role: 'B', id: v.id }), true);
  assert.equal(w.players.B.res.stone, had.stone + 3);
  assert.equal(w.players.B.res.wool, had.wool + 2);
  assert.equal(
    applyAction(w, { type: 'villager.unload', role: 'B', id: v.id }),
    false,
    'a second go at empty arms does nothing at all',
  );
  assert.equal(w.players.B.res.stone, had.stone + 3, 'and gives nothing a second time');
});

test('the pile by the door empties once, and only once', () => {
  const w = village(46);
  w.pile.wood = 5;
  w.pile.wheat = 2;
  const had = { wood: w.players.A.res.wood, wheat: w.players.A.res.wheat };

  assert.equal(applyAction(w, { type: 'pile.take', role: 'A' }), true);
  assert.equal(w.players.A.res.wood, had.wood + 5);
  assert.equal(w.players.A.res.wheat, had.wheat + 2);
  assert.deepEqual(w.pile, { wood: 0, wheat: 0 });
  assert.equal(applyAction(w, { type: 'pile.take', role: 'A' }), false);
  assert.equal(w.players.A.res.wood, had.wood + 5);
});

/* --------------------------------------------------------------------- */
/* a villager at work                                                    */
/* --------------------------------------------------------------------- */

test('a villager fells nothing once the forest is down to its floor', () => {
  const w = village(47);
  const v = housed(w)[0];
  applyAction(w, { type: 'villager.teach', role: 'A', id: v.id, what: 'fell' });

  // exactly the floor left standing, and the rest too young to touch
  const standing = w.trees.filter(t => t.state === 'standing');
  for (const t of standing.slice(TREE_FLOOR)) {
    t.state = 'sapling';
    t.plantedTick = w.tick;
  }
  assert.equal(w.trees.filter(t => t.state === 'standing').length, TREE_FLOOR);

  run(w, SAPLING_TICKS - 100); // long enough for several jobs, short of a new tree
  assert.equal(
    w.trees.filter(t => t.state === 'standing').length,
    TREE_FLOOR,
    'the floor holds: not one of the last few came down',
  );
  assert.equal(w.logs.length, 0, 'and nothing was felled to leave a log behind');
});

test('a felled tree is replanted in the same step, so there is never a stump', () => {
  const w = village(48);
  const v = housed(w)[0];
  applyAction(w, { type: 'villager.teach', role: 'A', id: v.id, what: 'fell' });
  run(w, 4000);
  assert.ok(w.players.A.done.fell === 3, 'the felling was the villager’s, not a player’s');
  assert.ok(
    w.trees.some(t => t.state === 'sapling' || t.grownTick),
    'somebody has been at the forest',
  );
  assert.equal(
    w.trees.filter(t => t.state === 'stump').length,
    0,
    'a villager never leaves a stump',
  );
});

test('what a villager brings in is nobody’s until somebody takes it', () => {
  const w = village(49);
  const v = housed(w)[0];
  applyAction(w, { type: 'villager.teach', role: 'A', id: v.id, what: 'fell' });
  const had = w.players.A.res.wood;
  run(w, 6000);
  assert.equal(w.players.A.res.wood, had, 'nothing landed on a player’s side of the table');
  assert.ok(w.pile.wood > 0, 'it went on the pile by the workshop door');
  assert.ok(w.pile.wood <= PILE_CAP, 'and the pile stops at its cap');
});

test('a log a player felled still belongs to the player who felled it', () => {
  const w = village(50);
  const tree = w.trees.find(t => t.state === 'standing');
  applyAction(w, { type: 'tree.fell', role: 'A', treeId: tree.id, dir: 'S', wood: 1, logs: 2 });
  const had = w.players.A.res.wood;
  run(w, 3000);
  assert.equal(w.pile.wood, 0, 'a player’s log never goes on the pile');
  assert.ok(w.players.A.res.wood > had, 'it was carried in and credited to them');
});

test('a pair of arms only holds so much', () => {
  const w = village(51);
  const v = housed(w)[0];
  applyAction(w, { type: 'villager.teach', role: 'B', id: v.id, what: 'stone' });
  run(w, 12000);
  assert.equal(v.bag.stone, BAG_CAP, 'they filled their arms');
  assert.ok(
    w.stones.some(b => b.count > 0),
    'and then stopped, rather than clearing the bank',
  );
});

test('nobody is put to work who is hungry, poorly or sleeping outside', () => {
  const w = village(52);
  const [a, b] = housed(w);
  const ted = w.villagers.find(v => !v.homeId);
  for (const v of [a, b, ted])
    applyAction(w, { type: 'villager.teach', role: 'B', id: v.id, what: 'stone' });
  a.hunger = 95;
  b.poorly = 400;
  for (let i = 0; i < 4000; i++) {
    a.hunger = 95;
    b.poorly = 400;
    tick(w);
  }
  assert.equal(a.bag.stone, 0, 'a hungry villager has something better to do');
  assert.equal(b.bag.stone, 0, 'so has a poorly one');
  assert.equal(ted.bag.stone, 0, 'and so has somebody with nowhere to sleep');
});

/* --------------------------------------------------------------------- */
/* a world from before any of this                                       */
/* --------------------------------------------------------------------- */

test('a world saved before villagers could work loads, and still delivers', () => {
  const now = createWorld(53);
  const old = JSON.parse(serialize(now));
  delete old.pile;
  for (const v of old.villagers) {
    delete v.skills;
    delete v.bag;
    delete v.workedAt;
  }
  // somebody was halfway to the workshop with a log when it was saved
  const carrier = old.villagers.find(v => v.homeId);
  carrier.carrying = { wood: 2, owner: 'A' };

  const w = deserialize(JSON.stringify(old));
  assert.ok(w, 'it still loads');
  assert.deepEqual(w.pile, { wood: 0, wheat: 0 }, 'the pile is there and empty');
  for (const v of w.villagers) {
    assert.deepEqual(v.skills, [], 'nobody has been shown anything yet');
    assert.deepEqual(v.bag, { stone: 0, wool: 0 });
    assert.equal(v.workedAt, 0);
  }

  const v = w.villagers.find(o => o.carrying);
  assert.deepEqual(v.carrying, { res: 'wood', n: 2, owner: 'A' }, 'the log is still a log');
  const had = w.players.A.res.wood;
  applyAction(w, { type: 'block.start', length: 1000000 });
  v.task = { kind: 'deliver' };
  v.path = [];
  v.wait = 0;
  run(w, 5);
  assert.equal(w.players.A.res.wood, had + 2, 'and it was delivered to the player who felled it');
});

test('a villager can be shown the field, and sows it', () => {
  const w = village(54);
  w.players.A.res.plank = 20;
  w.players.A.res.stone = 20;
  applyAction(w, { type: 'bridge.build', role: 'A', planks: 5, stone: 4, quality: 3 });
  const v = housed(w)[0];
  applyAction(w, { type: 'villager.teach', role: 'B', id: v.id, what: 'farm' });
  assert.equal(
    w.plots.every(p => p.state === 'empty'),
    true,
  );
  run(w, 8000);
  assert.ok(
    w.plots.some(p => p.state !== 'empty'),
    'the field was sown by somebody who lives here',
  );
  assert.equal(project(w, 'boat').state, 'plan', 'and nothing else was quietly built');
});
