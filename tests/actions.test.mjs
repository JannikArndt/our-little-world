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
import { MINIGAMES } from '../src/minigames/list.js';
import { en } from '../src/i18n/en.js';
import { CONCERNS, allProblems, currentProblem } from '../src/core/guide.js';
import { createWorld } from '../src/core/world.js';
import { applyAction } from '../src/core/actions.js';

const rows = Object.values(ACTIONS);
const real = Object.entries(ACTIONS).filter(([, r]) => !r.aliasOf);
const aliases = Object.entries(ACTIONS).filter(([, r]) => r.aliasOf);
const resKeys = RESOURCES.map(r => r.key);
// the sentinels: "the project decides", "the skill decides", "the piece decides"
const BY = ['byProject', 'bySkill', 'byFurniture'];

// the files on disk, so a mini-game nobody can open and a row pointing at a
// file that has gone both fail
const onDisk = readdirSync(new URL('../src/minigames/', import.meta.url)).filter(f =>
  f.endsWith('.js'),
);

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
      assert.ok(MINIGAMES[row.minigame], type + ' opens no such mini-game: ' + row.minigame);
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

/**
 * Between them these three worlds have everything wrong that can be wrong, so
 * every card the guide can draw gets drawn. Two worlds rather than one because
 * a broken bridge and no bridge at all cannot both be true.
 */
function everyCard() {
  const cards = [];
  const bad = createWorld(42);
  bad.players.A.res.plank = 9;
  bad.players.A.res.stone = 9;
  applyAction(bad, { type: 'bridge.build', role: 'A', planks: 5, stone: 4, quality: 1 });
  bad.bridge.damaged = true;
  bad.villagers[0].hunger = 90;
  bad.larder.food = 0;
  bad.larder.fish = 0;
  bad.villagers[1].poorly = 100;
  bad.plots[0].state = 'ripe';
  bad.plots[0].nibbled = 1;
  bad.sheep[0].mood = 'sad';
  bad.sheep[0].x = 28;
  bad.sheep[0].y = 18;
  for (const t of bad.trees.slice(0, 4)) t.state = 'stump';
  cards.push(...allProblems(bad));

  // a world with the river still in the way
  cards.push(...allProblems(createWorld(42)));

  // and one where nothing is wrong at all, which is the floor and not a finish
  const calm = createWorld(3);
  cards.push(currentProblem(calm), calmOf(calm));
  return cards;
}

/** The calm card, reached the way the guide reaches it when the queue is empty. */
function calmOf(w) {
  return CONCERNS.find(c => c.id === 'calm').card(w);
}

test('every step the guide asks for names an action that exists', () => {
  // A card's step used to identify itself only by the sentence it shows, so
  // "which action is this asking for" was guesswork — and guesswork that got it
  // wrong twice, because "give the wheat over" is `give` and "fill the basket"
  // is `larder.give`. Now it says, and this is what keeps it saying something true.
  const cards = everyCard();
  const ids = new Set(cards.map(c => c.id));
  assert.equal(ids.size, 14, 'not every card got drawn: ' + [...ids].sort().join(', '));
  let steps = 0;
  for (const c of cards)
    for (const s of c.steps) {
      steps++;
      assert.ok('does' in s, 'a step of ' + c.id + ' does not say what it asks for');
      assert.ok('role' in s, 'a step of ' + c.id + ' does not say whose job it is');
      assert.ok(['A', 'B', 'either'].includes(s.role), c.id + ' has a step for nobody');
      if (!s.does) continue;
      const [type, what] = s.does.split(':');
      assert.ok(ACTIONS[type], c.id + ' asks for an action that does not exist: ' + type);
      if (what)
        assert.ok(PROJECTS[what], c.id + ' asks for a project that does not exist: ' + what);
    }
  assert.ok(steps > 30, 'only ' + steps + ' steps were checked — did the cards change shape?');
});

test('every mini-game is one function in one file that really exports it', () => {
  // A file name is not the name of a game: modes.js holds three and sawmill.js
  // and bridge.js hold two each. So a row names the function, and this is what
  // stops a rename leaving it pointing at nothing.
  for (const [key, m] of Object.entries(MINIGAMES)) {
    assert.ok(onDisk.includes(m.file), key + ' names a file that is not there: ' + m.file);
    const src = readFileSync(new URL('../src/minigames/' + m.file, import.meta.url), 'utf8');
    assert.ok(
      src.includes('export function ' + m.opens) || src.includes('export const ' + m.opens),
      m.file + ' does not export ' + m.opens + ', which ' + key + ' says opens it',
    );
    assert.ok(m.what && m.what.length > 20, key + ' does not say what a player does in it');
  }
  // the other direction: a file no row names is a game nobody can reach
  for (const f of onDisk) {
    if (f === 'list.js') continue; // this table itself
    assert.ok(
      Object.values(MINIGAMES).some(m => m.file === f),
      'no mini-game in src/minigames/' + f + ' — is it reachable?',
    );
  }
  // and every game in the table is opened by an action, or nothing opens it
  for (const key in MINIGAMES)
    assert.ok(
      real.some(([, row]) => row.minigame === key),
      'no action opens the ' + key + ' mini-game',
    );
});
