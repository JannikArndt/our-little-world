// The paths are not drawn from the road tiles; they are worked out from the
// doors. So the questions worth asking are about the working out, not about
// the painting: does every door get a path to it, and is the way everybody
// walks drawn as busier than the way one person walks?
import test from 'node:test';
import assert from 'node:assert';

import { TILE, T, idx } from '../src/core/grid.js';
import { createWorld } from '../src/core/world.js';
import { pathNetwork, roadRuns } from '../src/render/paths.js';

/** A village with everything standing, which is when it has the most doors. */
function village(seed) {
  const w = createWorld(seed);
  for (const b of w.buildings) {
    b.state = 'built';
    b.builtTick = 0;
  }
  return w;
}

const near = (a, b, how) => Math.hypot(a.x - b.x, a.y - b.y) <= how;

test('every door has a path that reaches it', () => {
  const w = village(3);
  const net = pathNetwork(w);
  assert.ok(net.length > 0, 'the village has paths at all');
  for (const b of w.buildings) {
    // a fence has no inside, so nobody walks to the middle of one
    if (b.type === 'fence') continue;
    const door = { x: (b.x + b.w / 2) * TILE, y: (b.y + b.h) * TILE };
    const found = net.some(p => near(p.pts[0], door, TILE) || near(p.pts.at(-1), door, TILE));
    assert.ok(found, `nothing walks to the door of the ${b.type} at ${b.x},${b.y}`);
  }
});

test('the way everybody walks is busier than the way one person walks', () => {
  const net = pathNetwork(village(4));
  const busiest = Math.max(...net.map(p => p.use));
  const quietest = Math.min(...net.map(p => p.use));
  assert.equal(busiest, 1, 'the trunk carries the whole village');
  assert.ok(quietest < busiest, 'and a spur to one door carries less than the trunk');
});

test('a path is a curve, not a row of tiles', () => {
  const net = pathNetwork(village(5));
  const p = net.find(q => q.pts.length > 12);
  assert.ok(p, 'at least one path is long enough to bend');
  // corner-cut points sit between tile centres, never on the grid they came from
  const onGrid = p.pts.filter(q => (q.x - TILE / 2) % TILE === 0 && (q.y - TILE / 2) % TILE === 0);
  assert.ok(onGrid.length <= 2, 'the line is not made of tile centres');
});

test('a village with nowhere to walk to has no paths', () => {
  const w = village(6);
  for (const b of w.buildings) b.state = 'site';
  assert.deepEqual(pathNetwork(w), [], 'nothing is built, so nobody has worn anything in');
});

test('a road you paid a stone for is a road you can see', () => {
  // the regression this catches: paths were worked out from the doors, and a
  // road laid anywhere nobody happened to walk took the stone and drew nothing
  const w = village(7);
  const far = [
    [34, 3],
    [35, 3],
    [36, 3],
  ];
  for (const [x, y] of far) w.terrain[idx(x, y)] = T.ROAD;
  const runs = roadRuns(w);
  for (const [x, y] of far) {
    const mid = { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
    assert.ok(
      runs.some(r => r.pts.some(p => near(p, mid, TILE))),
      `nothing is drawn over the road tile at ${x},${y}`,
    );
  }
});

test('a single tile of road is still drawn', () => {
  const w = village(8);
  w.terrain[idx(33, 8)] = T.ROAD;
  const runs = roadRuns(w);
  const mid = { x: 33 * TILE + TILE / 2, y: 8 * TILE + TILE / 2 };
  assert.ok(
    runs.some(r => r.pts.some(p => near(p, mid, TILE))),
    'one tile on its own is still a stone somebody spent',
  );
});
