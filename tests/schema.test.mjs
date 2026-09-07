import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createWorld, serialize, deserialize, ensureWorld, SCHEMA, freeBed, project, otherRoles,
} from '../src/core/world.js';
import { findPath } from '../src/core/pathfind.js';
import { walkable } from '../src/core/grid.js';
import { MIGRATIONS, runMigrations } from '../src/core/migrate.js';
import { SCENARIOS, DEFAULT_SCENARIO, ROLES } from '../src/core/content.js';
import { applyAction } from '../src/core/actions.js';
import { tick } from '../src/core/sim.js';

const run = (w, n) => { for (let i = 0; i < n; i++) tick(w); return w; };

/** A world as an older build would have saved it. */
function asVersion(w, schema, strip) {
  const old = JSON.parse(serialize(w));
  old.schema = schema;
  if (strip) strip(old);
  return JSON.stringify(old);
}

test('a world saved by this build comes back exactly as it was', () => {
  const w = run(createWorld(11), 300);
  assert.equal(serialize(deserialize(serialize(w))), serialize(w));
});

test('a world from an older build is brought up to date, not thrown away', () => {
  const now = createWorld(5);
  // version 6: no children, no plans, and houses built for the grown-ups only
  const before = asVersion(now, 6, (o) => {
    o.villagers = o.villagers.filter(v => !v.kid);
    o.buildings = o.buildings.filter(b => b.state !== 'plan');
    const houses = o.buildings.filter(b => b.type === 'house');
    houses[0].beds = 2; houses[1].beds = 1;
    houses[0].residents = houses[0].residents.slice(0, 2);
    houses[1].residents = houses[1].residents.slice(0, 1);
    for (const v of o.villagers) delete v.kid;
    delete o.scenario; delete o.flags; delete o.ext; delete o.visitors;
  });

  const w = deserialize(before);
  assert.ok(w, 'an old world still loads');
  assert.equal(w.schema, SCHEMA);
  assert.equal(w.scenario, DEFAULT_SCENARIO);

  // the children arrive, with beds, and nobody is turned out of theirs
  const kids = w.villagers.filter(v => v.kid);
  assert.equal(kids.length, 2, 'the children moved in');
  assert.ok(kids.every(k => k.homeId), 'and they have somewhere to sleep');
  assert.equal(w.villagers.filter(v => !v.homeId).length, 1, 'Ted still has not');
  assert.equal(freeBed(w), null, 'and no bed is going spare');

  // the projects turn up as plans, on the ground, in the way of nobody
  assert.ok(project(w, 'boat'), 'the landing is there');
  assert.ok(project(w, 'play'), 'so is the green');
  assert.equal(project(w, 'boat').state, 'plan');

  // and the world still runs
  run(w, 400);
  assert.equal(w.villagers.length, 6);
});

test('what an old world already had is left alone', () => {
  const now = createWorld(7);
  now.players.A.res.plank = 9; now.players.A.res.stone = 9;
  applyAction(now, { type: 'bridge.build', role: 'A', planks: 5, stone: 4, quality: 3 });
  applyAction(now, { type: 'boat.build', role: 'A' });
  const before = asVersion(now, 6);

  const w = deserialize(before);
  assert.equal(w.bridge.built, true, 'the bridge they built is still there');
  assert.equal(project(w, 'boat').state, 'built', 'and so is the boat');
  assert.equal(w.buildings.filter(b => b.type === 'boat').length, 1, 'and only one of it');
});

test('anything an extension put in the world survives a round trip', () => {
  const w = createWorld(13);
  w.ext.weather = { kind: 'rain', until: 400 };
  w.flags.sawTheDeer = true;
  const back = deserialize(serialize(w));
  assert.deepEqual(back.ext.weather, { kind: 'rain', until: 400 });
  assert.equal(back.flags.sawTheDeer, true);
});

test('a world from a newer build is refused rather than half-understood', () => {
  const w = createWorld(3);
  const future = asVersion(w, SCHEMA + 1);
  assert.equal(deserialize(future), null);
  assert.equal(deserialize('{"nonsense":true}'), null);
  assert.equal(deserialize('not json at all'), null);
});

test('every migration step moves exactly one version', () => {
  for (const from of Object.keys(MIGRATIONS)) {
    const n = Number(from);
    assert.ok(n >= 1 && n < SCHEMA, 'a step from ' + from + ' has nowhere to go');
    assert.equal(typeof MIGRATIONS[from], 'function');
  }
  const w = JSON.parse(serialize(createWorld(3)));
  w.schema = SCHEMA;
  assert.ok(runMigrations(w, SCHEMA), 'a current world needs no steps');
});

test('ensureWorld is safe to run twice', () => {
  const w = createWorld(17);
  const once = serialize(ensureWorld(w));
  const twice = serialize(ensureWorld(w));
  assert.equal(twice, once, 'nothing is added a second time');
});

test('a scenario is a recipe the world remembers', () => {
  const w = createWorld(19, 'valley');
  assert.equal(w.scenario, 'valley');
  const scen = SCENARIOS.valley;
  assert.equal(w.villagers.length, scen.villagers.length);
  assert.equal(w.plots.length, scen.plots.length);
  assert.equal(w.sheep.length, scen.sheep.length);
  for (const p of scen.plans) assert.ok(w.buildings.some(b => b.id === p.id), p.id + ' is marked out');
  // an unknown scenario falls back rather than making an empty world
  assert.equal(createWorld(19, 'atlantis').scenario, DEFAULT_SCENARIO);
});

test('a part of the map can be somewhere the world has not got to yet', () => {
  const w = createWorld(23);
  // the valley is all here, so nothing is out of bounds
  assert.deepEqual(w.regionBoxes, []);
  assert.ok(findPath(w, 4, 4, 10, 8, { within: 1 }), 'the forest is walkable');

  // a scenario that keeps part of itself back behaves like weather, not a wall
  SCENARIOS.valley.regions.push({ id: 'hills', box: [30, 0, 39, 10], open: false });
  try {
    const later = createWorld(23);
    assert.equal(later.regions.hills, 'later');
    assert.deepEqual(later.regionBoxes, [[30, 0, 39, 10]]);
    assert.equal(walkable(later, 35, 5), false, 'nobody wanders into it');
    assert.ok(walkable(later, 2, 21), 'and the rest of the world is untouched');

    assert.equal(applyAction(later, { type: 'region.open', id: 'hills' }), true);
    assert.equal(walkable(later, 35, 5), true, 'until the day it opens');
    assert.equal(applyAction(later, { type: 'region.open', id: 'hills' }), false, 'and only once');

    // and it survives being saved and read back
    const back = deserialize(serialize(later));
    assert.equal(back.regions.hills, 'open');
  } finally {
    SCENARIOS.valley.regions = SCENARIOS.valley.regions.filter(r => r.id !== 'hills');
  }
});

test('a role that joins the table later gets a seat', () => {
  const w = createWorld(29);
  assert.deepEqual(Object.keys(w.players).sort(), ['A', 'B']);
  // pretend a Cook has been added to the catalogue since this world was saved
  ROLES.C = { id: 'C', emoji: '🍲', colour: '#b07a4a', caps: { mill: 1 }, res: { food: 1 } };
  SCENARIOS.valley.roles.push('C');
  try {
    const back = deserialize(serialize(w));
    assert.ok(back.players.C, 'the new role has a place at the table');
    assert.equal(back.players.C.caps.mill, 1);
    assert.equal(back.players.A.res.wood, w.players.A.res.wood, 'and nobody else is disturbed');
    assert.deepEqual(otherRoles(back, 'A').sort(), ['B', 'C']);
  } finally {
    delete ROLES.C;
    SCENARIOS.valley.roles = SCENARIOS.valley.roles.filter(r => r !== 'C');
  }
});
