// The actions are the whole of what anybody can do, and each of them says the
// same few things about itself. These tests are about that promise, not about
// what any one action does — sim, skills and schema cover the doing.
//
// The direction that matters is the forgetful one: add an action, forget its
// row, and this goes red in seconds. A list that nothing checks is a list that
// is already wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ACTIONS, GROUPS, EVENTS } from '../src/core/actions/index.js';
import { CAPS, RESOURCES } from '../src/core/world.js';
import { PROJECTS, VILLAGER_SKILLS } from '../src/core/content.js';
import { en } from '../src/i18n/en.js';

const rows = Object.values(ACTIONS);
const real = Object.entries(ACTIONS).filter(([, r]) => !r.aliasOf);
const aliases = Object.entries(ACTIONS).filter(([, r]) => r.aliasOf);
const resKeys = RESOURCES.map(r => r.key);
// the sentinels: "the project decides", "the skill decides", "the piece decides"
const BY = ['byProject', 'bySkill', 'byFurniture'];

// found on disk rather than listed here, so a mini-game nobody can open and an
// action pointing at a file that has gone both fail
const minigames = readdirSync(new URL('../src/minigames/', import.meta.url))
  .filter(f => f.endsWith('.js'))
  .map(f => f.slice(0, -3));

test('every action is in a group, and every group names its own file', () => {
  for (const [type, row] of Object.entries(ACTIONS)) {
    assert.ok(GROUPS[row.group], type + ' is in no group');
    assert.equal(row.file, GROUPS[row.group].file, type + ' disagrees about its file');
    const src = readFileSync(new URL('../' + row.file, import.meta.url), 'utf8');
    assert.ok(src.includes(type), type + ' is not in ' + row.file);
  }
});

test('every action says why applying it twice is safe — law 12', () => {
  for (const [type, row] of real) {
    assert.equal(typeof row.twice, 'string', type + ' does not say why twice is safe');
    assert.ok(row.twice.length > 15, type + "'s reason is too short to be one");
  }
});

test('every action answers all of it, and null is an answer', () => {
  const fields = ['cap', 'minigame', 'costs', 'yields', 'tallies', 'journal', 'needs'];
  for (const [type, row] of real)
    for (const f of fields) assert.ok(f in row, type + ' does not say anything about ' + f);
});

test('what an action asks for and gives back is named in the real tables', () => {
  for (const [type, row] of real) {
    if (row.cap !== null && !BY.includes(row.cap))
      assert.ok(CAPS[row.cap], type + ' wants a capability that does not exist: ' + row.cap);
    if (row.needs !== null && !BY.includes(row.needs))
      assert.ok(PROJECTS[row.needs], type + ' needs a project that does not exist: ' + row.needs);
    if (row.minigame !== null)
      assert.ok(minigames.includes(row.minigame), type + ' opens no such mini-game');
    for (const side of ['costs', 'yields']) {
      const v = row[side];
      if (v === null || BY.includes(v)) continue;
      for (const k in v)
        assert.ok(resKeys.includes(k), type + "'s " + side + ' names no real thing: ' + k);
    }
    assert.ok(Array.isArray(row.tallies), type + ' does not list what it counts');
  }
});

test('every line an action writes in the journal is a string the game has', () => {
  for (const [type, row] of real) {
    if (row.journal === null || BY.includes(row.journal)) continue;
    assert.ok(en[row.journal], type + ' writes a journal line nobody has translated');
  }
});

test('the counts a villager skill is taught from are really written by an action', () => {
  const written = new Set();
  for (const [, row] of real) for (const t of row.tallies) written.add(t);
  // project.build counts each project under its own type
  for (const k in PROJECTS) written.add(PROJECTS[k].type);
  for (const key in VILLAGER_SKILLS) {
    const tally = VILLAGER_SKILLS[key].tally;
    assert.ok(
      written.has(tally),
      'nothing counts "' + tally + '", so ' + key + ' can never be shown',
    );
  }
});

test('an older name for an action points at one that is still here', () => {
  for (const [type, row] of aliases) {
    assert.ok(ACTIONS[row.aliasOf], type + ' is an older name for nothing');
    assert.equal(typeof row.as, 'function', type + ' does not say how to rewrite itself');
  }
  assert.ok(aliases.length >= 1, 'the two project aliases should still be listed');
});

test('every world happening is one of the four, and each says what it raises', () => {
  for (const [name, ev] of Object.entries(EVENTS)) {
    assert.equal(typeof ev.apply, 'function', name + ' does nothing');
    assert.ok(en[ev.notice], name + ' raises a notice nobody has translated');
    assert.ok(ev.icon, name + ' has no picture');
  }
});

test('the capability the world gates on is one some action claims', () => {
  // The gate itself is in the interface (see the note in actions/index.js), so
  // this is the check that the two halves are talking about the same nine caps.
  const src = readFileSync(new URL('../src/ui/interact.js', import.meta.url), 'utf8');
  const gated = new Set([...src.matchAll(/can\(w, r, '([a-z]+)'\)/g)].map(m => m[1]));
  assert.ok(gated.size >= 8, 'found almost no capability gates — did interact.js change shape?');
  const claimed = new Set();
  for (const [, row] of real) if (row.cap && !BY.includes(row.cap)) claimed.add(row.cap);
  for (const k in PROJECTS) claimed.add(PROJECTS[k].cap);
  for (const k in VILLAGER_SKILLS) if (VILLAGER_SKILLS[k].cap) claimed.add(VILLAGER_SKILLS[k].cap);
  for (const cap of gated)
    assert.ok(claimed.has(cap), 'the world gates on "' + cap + '" but no action claims it');
});

test('there are no more actions than there are, and no fewer', () => {
  // A number in a test is usually a smell. This one is the point: it is the
  // thing that makes adding an action a deliberate act rather than a drift.
  assert.equal(rows.length, 35, 'the list of actions changed — was that meant?');
  assert.equal(Object.keys(EVENTS).length, 4, 'the world happenings changed — was that meant?');
});
