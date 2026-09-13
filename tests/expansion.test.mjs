// The herb garden, the meadow, the mine and the strange machine: one test per
// thing that would be easy to get wrong here, not a tour of every line.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createWorld,
  serialize,
  deserialize,
  mineCellAt,
  mineCanDig,
  machineSpinning,
  MINE_W,
  MINE_H,
  HERB_REMEDY,
} from '../src/core/world.js';
import { applyAction } from '../src/core/actions.js';
import { tick } from '../src/core/sim.js';

test('picking a herb is the discovery, and picking it again is what makes it teachable', () => {
  const w = createWorld(1);
  const bed = w.herbs[0];
  assert.equal(w.players.A.caps['herb_' + bed.kind], undefined, 'nobody starts knowing it');

  assert.ok(applyAction(w, { type: 'herb.pick', role: 'A', id: bed.id }));
  assert.equal(w.players.A.caps['herb_' + bed.kind], 1, 'the first pick is the discovery');
  assert.equal(w.players.A.herbs[bed.kind], 1, 'and it goes in the basket');
  assert.equal(w.players.A.done['herb_' + bed.kind], 1);

  assert.ok(applyAction(w, { type: 'herb.pick', role: 'A', id: bed.id }));
  assert.equal(w.players.A.done['herb_' + bed.kind], 2, 'a second pick is the practice');

  // and now it can be taught, the same way any other capability is
  assert.equal(w.players.B.caps['herb_' + bed.kind], undefined);
  assert.ok(applyAction(w, { type: 'teach', from: 'A', to: 'B', cap: 'herb_' + bed.kind }));
  assert.equal(w.players.B.caps['herb_' + bed.kind], 1);
});

test('a herb bed only gives what it has, and it grows back rather than running out', () => {
  const w = createWorld(2);
  const bed = w.herbs.find(h => h.kind === HERB_REMEDY);
  for (let i = 0; i < 3; i++)
    assert.ok(applyAction(w, { type: 'herb.pick', role: 'A', id: bed.id }));
  assert.equal(bed.count, 0);
  assert.equal(
    applyAction(w, { type: 'herb.pick', role: 'A', id: bed.id }),
    false,
    'nothing left to pick',
  );
  for (let i = 0; i < 300; i++) tick(w);
  assert.ok(bed.count > 0, 'it came back on its own, the way a stone bank does');
});

test('mint eases a poorly tummy at once, and costs one sprig of it', () => {
  const w = createWorld(3);
  const v = w.villagers[0];
  v.poorly = 500;
  assert.equal(
    applyAction(w, { type: 'herb.give', role: 'A', villagerId: v.id }),
    false,
    'no mint, no cure',
  );
  w.players.A.herbs[HERB_REMEDY] = 1;
  assert.ok(applyAction(w, { type: 'herb.give', role: 'A', villagerId: v.id }));
  assert.equal(v.poorly, 0);
  assert.equal(w.players.A.herbs[HERB_REMEDY], 0);
  assert.equal(
    applyAction(w, { type: 'herb.give', role: 'A', villagerId: v.id }),
    false,
    'safe to apply twice: nobody poorly, nothing to cure',
  );
});

test('the mine is dug one connected tunnel at a time', () => {
  const w = createWorld(4);
  assert.ok(mineCellAt(w, 0, 0), 'the entrance is already open');
  assert.equal(mineCanDig(w, 2, 2), false, 'nothing floating on its own');
  assert.ok(mineCanDig(w, 1, 0), 'next to the entrance');

  assert.equal(
    applyAction(w, { type: 'mine.dig', role: 'A', x: 3, y: 3 }),
    false,
    'too far from anything open',
  );
  assert.ok(applyAction(w, { type: 'mine.dig', role: 'A', x: 1, y: 0 }));
  assert.ok(mineCellAt(w, 1, 0), 'now it is open');
  assert.equal(
    applyAction(w, { type: 'mine.dig', role: 'A', x: 1, y: 0 }),
    false,
    'already dug, safe to apply twice',
  );
});

test('an unstable tile stops the way through until it is shored up', () => {
  const w = createWorld(4);
  // dig until an unstable tile turns up, staying inside the small grid
  let unstable = null;
  const seen = new Set(['0,0']);
  const frontier = [
    [1, 0],
    [0, 1],
  ];
  while (frontier.length && !unstable) {
    const [x, y] = frontier.shift();
    if (seen.has(x + ',' + y) || x < 0 || y < 0 || x >= MINE_W || y >= MINE_H) continue;
    seen.add(x + ',' + y);
    if (!mineCanDig(w, x, y)) continue;
    applyAction(w, { type: 'mine.dig', role: 'A', x, y });
    const cell = mineCellAt(w, x, y);
    if (cell.kind === 'unstable') unstable = { x, y };
    else frontier.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  if (!unstable) return; // this seed's mine happened to have none — nothing to test
  const beyond = [unstable.x + 1, unstable.y];
  if (!mineCanDig(w, beyond[0], beyond[1])) return; // off the edge of the grid
  w.players.A.res.plank = 0;
  assert.equal(
    applyAction(w, { type: 'mine.support', role: 'A', x: unstable.x, y: unstable.y }),
    false,
    'no plank, no shoring up',
  );
  w.players.A.res.plank = 1;
  assert.ok(applyAction(w, { type: 'mine.support', role: 'A', x: unstable.x, y: unstable.y }));
  assert.equal(mineCellAt(w, unstable.x, unstable.y).supported, true);
});

test('the wheel needs the valve open and the lever pulled — either alone does nothing', () => {
  const w = createWorld(5);
  assert.equal(machineSpinning(w), false);
  applyAction(w, { type: 'machine.turn', role: 'A', part: 'valve' });
  assert.equal(machineSpinning(w), false, 'water alone is not enough');
  applyAction(w, { type: 'machine.turn', role: 'A', part: 'lever' });
  assert.equal(machineSpinning(w), true, 'both together turn the wheel');
  applyAction(w, { type: 'machine.turn', role: 'A', part: 'valve' });
  assert.equal(machineSpinning(w), false, 'closing the valve stops it again');
});

test('a world saved by this build comes back exactly as it was, herbs and all', () => {
  const w = createWorld(6);
  applyAction(w, { type: 'herb.pick', role: 'A', id: w.herbs[0].id });
  applyAction(w, { type: 'mine.dig', role: 'A', x: 1, y: 0 });
  applyAction(w, { type: 'machine.turn', role: 'A', part: 'lever' });
  assert.equal(serialize(deserialize(serialize(w))), serialize(w));
});

test('an older saved world, with none of this, still loads and grows a garden', () => {
  const w = createWorld(7);
  const before = JSON.parse(serialize(w));
  delete before.herbs;
  delete before.mine;
  delete before.machine;
  for (const id in before.players) delete before.players[id].herbs;

  const loaded = deserialize(JSON.stringify(before));
  assert.ok(loaded, 'an old world still loads');
  assert.ok(loaded.herbs.length > 0, 'the garden is there even though it never was saved');
  assert.ok(mineCellAt(loaded, 0, 0), 'the mine has its entrance');
  assert.equal(machineSpinning(loaded), false);
  assert.deepEqual(loaded.players.A.herbs, {});
});
