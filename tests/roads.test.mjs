// A road is meant to read as one path you could walk along. It stopped doing
// that once — every tile drew its own rounded patch of ground, so a road that
// stepped diagonally came out as a row of disconnected blobs. These ask the
// question that catches it: is the village's road actually joined up?
import test from 'node:test';
import assert from 'node:assert';

import { GW, GH, T, idx } from '../src/core/grid.js';
import { createWorld } from '../src/core/world.js';
import { roadLegs } from '../src/render/renderer.js';

/** A bare world with nothing on it but the road tiles asked for. */
function paved(tiles) {
  const terrain = new Array(GW * GH).fill(T.GRASS);
  for (const [x, y] of tiles) terrain[idx(x, y)] = T.ROAD;
  return { terrain };
}

/** How many separate pieces the legs fall into — one means one path. */
function pieces(w) {
  const { legs } = roadLegs(w);
  const near = new Map();
  for (const l of legs) {
    if (!near.has(l.a)) near.set(l.a, []);
    if (!near.has(l.b)) near.set(l.b, []);
    near.get(l.a).push(l.b);
    near.get(l.b).push(l.a);
  }
  const seen = new Set();
  let found = 0;
  for (const from of near.keys()) {
    if (seen.has(from)) continue;
    found++;
    const todo = [from];
    seen.add(from);
    while (todo.length) {
      for (const to of near.get(todo.pop())) {
        if (seen.has(to)) continue;
        seen.add(to);
        todo.push(to);
      }
    }
  }
  return found;
}

test('a road that steps diagonally is still one path', () => {
  // the shape a scenario road really comes out as: a staircase, where two
  // tiles meet at a corner and nothing joins them along a square side
  const w = paved([
    [5, 5],
    [6, 5],
    [7, 6],
    [8, 6],
  ]);
  assert.equal(pieces(w), 1, 'the two stretches are drawn as one path');
});

test('a corner is only cut when there is no way round', () => {
  // a filled block is a yard, and a diagonal drawn across it would put a bar
  // through the middle of ground that is already all road
  const w = paved([
    [5, 5],
    [6, 5],
    [5, 6],
    [6, 6],
  ]);
  const { legs } = roadLegs(w);
  const corner = legs.some(l => {
    const ax = l.a % GW,
      ay = (l.a - ax) / GW,
      bx = l.b % GW,
      by = (l.b - bx) / GW;
    return Math.abs(ax - bx) === 1 && Math.abs(ay - by) === 1;
  });
  assert.equal(corner, false, 'no diagonal is drawn across a square of road');
  assert.equal(pieces(w), 1, 'and the yard is still one piece');
});

test('the village a player starts in has one road, not a scatter', () => {
  const w = createWorld(7);
  const laid = w.terrain.filter(t => t === T.ROAD).length;
  assert.ok(laid > 0, 'the village starts with a road at all');
  assert.equal(pieces(w), 1, 'and it is drawn as a single path through the village');
});

test('a tile on its own is still given ground to stand on', () => {
  const { legs } = roadLegs(paved([[20, 10]]));
  assert.equal(legs.length, 1, 'a lone tile gets a leg of its own, or it draws nothing');
  assert.equal(legs[0].a, legs[0].b, 'and it goes nowhere, because there is nowhere to go');
});
