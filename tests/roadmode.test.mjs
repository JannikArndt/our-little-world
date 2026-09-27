// Planning a road is the one place in the game where a tap means two things
// depending on what is already there. The mistakes that makes easy are worth
// a test: a line that crosses its own path rubbing itself out, and the count
// drifting away from the squares actually drawn.
import test from 'node:test';
import assert from 'node:assert';

import { GW, T, idx } from '../src/core/grid.js';
import { createWorld } from '../src/core/world.js';
import { roadMode } from '../src/minigames/modes.js';

/**
 * A planner over open ground with plenty of stone, so that what a tap does
 * is the only thing the test is measuring. The row at y=20 is cleared of
 * everything — water, paving, whatever was standing on it.
 */
function planner() {
  const world = createWorld(3);
  for (let x = 0; x < GW; x++) {
    world.terrain[idx(x, 20)] = T.GRASS;
    world.blocked[idx(x, 20)] = 0;
  }
  world.players.A.res.stone = 50;
  return roadMode({ world, role: 'A', dispatch() {}, setMode() {} });
}

const tap = (m, x, y) => {
  m.down(x, y);
  m.up();
};

test('a tap plans a square and a second tap takes it back', () => {
  const m = planner();
  tap(m, 20, 20);
  assert.equal(m.costItems()[0].need, 1, 'one square planned costs a stone');
  tap(m, 20, 20);
  assert.equal(m.costItems(), null, 'and tapping it again leaves nothing planned');
});

test('a line that crosses its own path does not rub itself out', () => {
  // the mistake this catches: treating every touch of a planned square as a
  // tap, so drawing a loop erases the squares the finger comes back over
  const m = planner();
  m.down(20, 20);
  for (let x = 21; x <= 24; x++) m.drag(x, 20);
  for (let x = 24; x >= 20; x--) m.drag(x, 20); // back along the same line
  m.up();
  assert.equal(m.costItems()[0].need, 3, 'five squares, still five squares');
});

test('a finger that wobbles without leaving the square still takes it back', () => {
  // a real finger sends a move event or two without ever reaching another tile
  const m = planner();
  tap(m, 20, 20);
  m.down(20, 20);
  m.drag(20, 20);
  m.drag(20, 20);
  m.up();
  assert.equal(m.costItems(), null, 'it was a tap, not a drag');
});

test('a drag begun on a planned square does not lay road from nowhere', () => {
  // the mistake this catches: filling in from the end of the list rather than
  // from where the finger actually was, which draws a line across the village
  const m = planner();
  tap(m, 20, 20);
  tap(m, 30, 20);
  m.down(20, 20); // back to the first one, and drag off it
  m.drag(21, 20);
  m.up();
  assert.equal(m.costItems()[0].need, 2, 'three squares, not the ten in between');
});
