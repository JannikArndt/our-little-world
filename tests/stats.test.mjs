// What the counting says, and — just as much — what it never says.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Worlds } from '../server/worlds.mjs';
import { Stats, dayKey, marksOf, deedsOf } from '../server/stats.mjs';

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 4, 4, 9, 0, 0);

/** A store with a clock we can wind on. */
function store(opts) {
  const o = opts || {};
  const clock = { t: o.at || START };
  const s = new Worlds({ dir: o.dir === undefined ? null : o.dir, now: () => clock.t });
  return { s, clock, on: (ms) => { clock.t += ms; } };
}

/** A snapshot of a world that has got somewhere. */
function snap(over) {
  return JSON.stringify(Object.assign({
    tick: 1800, day: 2,
    bridge: { built: true },
    buildings: [
      { type: 'house', state: 'built' },                    // one the village started with
      { type: 'house', state: 'built', builtTick: 900 },    // one somebody put up
      { type: 'well', state: 'built' },
      { type: 'site', state: 'site' },
    ],
    villagers: [{ homeId: 'h1' }, { homeId: 'h2' }],
    players: { A: { done: { fell: 3, saw: 2 } }, B: { done: { road: 4 } } },
  }, over || {}));
}

test('a day is a day, and a spot is counted once on it', async () => {
  const { s, on } = store();
  const { world } = s.create({ device: 'kid', role: 'A' });
  s.join(world.name, { device: 'parent', role: 'B' });
  s.touch(world.name, { device: 'kid', role: 'A' });      // still here, again and again
  s.touch(world.name, { device: 'kid', role: 'A' });

  let r = s.report();
  assert.equal(r.days.length, 1);
  assert.equal(r.days[0].started, 1);
  assert.equal(r.days[0].played, 1, 'one world, however many times it was touched');
  assert.equal(r.days[0].spots, 2, 'two spots, and not four');

  on(DAY);
  s.touch(world.name, { device: 'kid', role: 'A' });
  r = s.report();
  assert.equal(r.days.length, 2);
  assert.equal(r.days[1].played, 1);
  assert.equal(r.days[1].spots, 1, 'only one of them came back the next day');
  assert.equal(r.week.spots, 3);
});

test('minutes come from the world clock, and only the new ones count', () => {
  const { s } = store();
  const { world } = s.create({ device: 'kid', role: 'A' });

  s.putSnapshot(world.name, { tick: 1800, world: snap({ tick: 1800 }) });   // three minutes
  assert.equal(s.report().days[0].minutes, 3);

  s.putSnapshot(world.name, { tick: 3600, world: snap({ tick: 3600 }) });   // three more
  assert.equal(s.report().days[0].minutes, 6, 'the difference, not the total again');
});

test('how far a world got, and what got built in it', () => {
  const { s } = store();
  const { world } = s.create({ device: 'kid', role: 'A' });
  s.putSnapshot(world.name, { tick: 1800, world: snap() });

  const r = s.report();
  assert.equal(r.howFar.worlds, 1);
  assert.equal(r.howFar.medianDays, 2);
  assert.deepEqual(r.howFar.days, { 2: 1 });
  assert.equal(r.milestones.bridge, 1);
  assert.equal(r.milestones.well, 1);
  assert.equal(r.milestones.house, 1, 'the house somebody built, not the ones already there');
  assert.equal(r.milestones.housed, 1);
  assert.equal(r.milestones.site, undefined, 'an empty plot is not a milestone');
  assert.deepEqual(r.deeds, { fell: 3, saw: 2, road: 4 });
});

test('a world that is forgotten leaves its numbers and takes its name', async () => {
  const { s, on } = store();
  const { world } = s.create({ device: 'kid', role: 'A' });
  s.putSnapshot(world.name, { tick: 1800, world: snap() });

  const before = s.report();
  assert.equal(before.howFar.worlds, 1);

  on(15 * DAY);
  assert.equal(await s.sweep(), 1, 'a fortnight later it is gone');

  const after = s.report();
  assert.equal(after.now.worlds, 0);
  assert.equal(after.howFar.worlds, 1, 'how far it got outlives it');
  assert.equal(after.milestones.bridge, 1);
  assert.equal(after.deeds.fell, 3);
  assert.equal(JSON.stringify(after).indexOf(world.name), -1, 'and its name does not');
});

test('nothing in the report belongs to anybody', () => {
  const { s } = store();
  const { world } = s.create({ device: 'an-ipad-in-a-kitchen', role: 'A' });
  s.join(world.name, { device: 'a-phone-on-a-train', role: 'B' });
  s.putSnapshot(world.name, { tick: 1800, world: snap() });

  const text = JSON.stringify(s.report(1));
  for (const secret of ['an-ipad-in-a-kitchen', 'a-phone-on-a-train', world.name])
    assert.equal(text.indexOf(secret), -1, secret + ' has no business being here');
  // and nothing finer than a calendar day
  assert.match(text, /"generated":"\d{4}-\d\d-\d\d"/);
  assert.equal(/\d\d:\d\d/.test(text), false, 'no times of day');
});

test('the counting survives a restart', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'olw-stats-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const first = store({ dir });
  await first.s.load();
  const { world } = first.s.create({ device: 'kid', role: 'A' });
  first.s.putSnapshot(world.name, { tick: 1800, world: snap() });
  await first.s.close();

  const again = new Worlds({ dir, now: () => START });
  await again.load();
  const r = again.report();
  assert.equal(r.days[0].started, 1);
  assert.equal(r.days[0].minutes, 3);
  assert.equal(r.howFar.worlds, 1, 'the world itself is still here, so it is counted live');
  await again.close();
});

test('a world started over keeps what was done in it', () => {
  const { s } = store();
  const { world } = s.create({ device: 'kid', role: 'A' });
  s.putSnapshot(world.name, { tick: 3000, world: snap({ tick: 3000, day: 4 }) });
  // "start this world over": a fresh world at tick 0 in the same room
  s.putSnapshot(world.name, {
    tick: 0, reset: true,
    world: snap({ tick: 0, day: 1, bridge: { built: false }, buildings: [], villagers: [], players: { A: { done: {} } } }),
  });

  const r = s.report();
  assert.equal(r.howFar.days['4'], 1, 'it got to day four, whatever came after');
  assert.equal(r.deeds.fell, 3);
  assert.equal(r.milestones.bridge, 1);
});

test('the pieces on their own', () => {
  assert.equal(dayKey(Date.UTC(2026, 0, 2, 23, 59)), '2026-01-02');
  assert.deepEqual(deedsOf({ players: { A: { done: { fell: 1 } }, B: { done: { fell: 2, road: 1 } } } }), { fell: 3, road: 1 });
  assert.deepEqual(marksOf({ bridge: { built: false }, buildings: [], villagers: [] }), {});
  // a village with nobody in it is not a village where everybody has a bed
  assert.equal(marksOf({ buildings: [], villagers: [] }).housed, undefined);

  const memory = new Stats({});
  memory.started();
  assert.equal(memory.report([]).week.started, 1);
});
