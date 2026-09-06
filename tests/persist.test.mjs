// Saving, and above all what happens to a save this build cannot read.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createWorld, serialize, deserialize, migrate,
  SCHEMA, OLDEST_SCHEMA, MIGRATIONS,
} from '../src/core/world.js';

/* ---------------- the ladder ---------------- */

test('every schema we claim to read has a way up to the current one', () => {
  for (let n = OLDEST_SCHEMA; n < SCHEMA; n++)
    assert.equal(typeof MIGRATIONS[n], 'function',
      'SCHEMA is ' + SCHEMA + ' but nothing carries a save from schema ' + n +
      ' to ' + (n + 1) + ' — add MIGRATIONS[' + n + '], or raise OLDEST_SCHEMA on purpose');
});

test('a world at the current schema needs no migration', () => {
  const w = createWorld(5);
  assert.equal(migrate(w), w);
});

test('a world from a newer build is refused rather than guessed at', () => {
  const w = createWorld(5);
  w.schema = SCHEMA + 1;
  assert.equal(migrate(w), null);
});

test('a world too old for the ladder is refused', () => {
  const w = createWorld(5);
  w.schema = OLDEST_SCHEMA - 1;
  assert.equal(migrate(w), null);
});

test('nonsense is refused without throwing', () => {
  assert.equal(deserialize('not json at all'), null);
  assert.equal(deserialize('{}'), null);
  assert.equal(deserialize('null'), null);
  assert.equal(migrate(null), null);
});

/* ---------------- additive changes are free ---------------- */

test('a save that predates a field, a resource or a capability still loads', () => {
  const w = createWorld(9);
  const old = JSON.parse(serialize(w));
  delete old.journal;                       // a whole field added later
  delete old.players.A.res.wool;            // a resource added later
  delete old.players.B.caps.farm;           // a capability added later
  delete old.players.A.seen;

  const back = deserialize(JSON.stringify(old));
  assert.ok(back, 'the world should survive');
  assert.deepEqual(back.journal, w.journal);
  assert.equal(back.players.A.res.wool, w.players.A.res.wool);
  assert.equal(back.players.B.caps.farm, w.players.B.caps.farm);
  assert.equal(back.players.A.seen, w.players.A.seen);
});

test('filling in defaults never overwrites what the save already had', () => {
  const w = createWorld(9);
  w.players.A.res.wood = 41;
  w.day = 12;
  const back = deserialize(serialize(w));
  assert.equal(back.players.A.res.wood, 41);
  assert.equal(back.day, 12);
});

/* ---------------- an unreadable save is kept, not lost ---------------- */

/** The smallest localStorage that behaves like the real one. */
function fakeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => Array.from(map.keys())[i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

async function freshPersist() {
  globalThis.localStorage = fakeStorage();
  // a new module instance each time, so its localStorage check runs again
  return import('../src/core/persist.js?' + Math.random());
}

test('a save from a newer build is put aside instead of being written over', async () => {
  const { save, load, kept } = await freshPersist();
  const w = createWorld(4);
  w.day = 7;
  save('home', w);

  // the same world, but stamped by a build we do not know
  const ahead = JSON.parse(serialize(w));
  ahead.schema = SCHEMA + 1;
  globalThis.localStorage.setItem('olw.world.home', JSON.stringify(ahead));

  assert.equal(load('home'), null, 'it must not pretend to understand it');

  const aside = kept('home');
  assert.equal(aside.length, 1);
  assert.equal(aside[0].schema, String(SCHEMA + 1));
  assert.equal(JSON.parse(globalThis.localStorage.getItem(aside[0].key)).day, 7);
});

test('the first save put aside is the one that is kept', async () => {
  const { load, kept } = await freshPersist();
  const first = { schema: SCHEMA + 1, day: 1 };
  const second = { schema: SCHEMA + 1, day: 2 };

  globalThis.localStorage.setItem('olw.world.test', JSON.stringify(first));
  load('test');
  globalThis.localStorage.setItem('olw.world.test', JSON.stringify(second));
  load('test');

  const aside = kept('test');
  assert.equal(aside.length, 1);
  assert.equal(JSON.parse(globalThis.localStorage.getItem(aside[0].key)).day, 1);
});

test('a save that reads fine is never put aside', async () => {
  const { save, load, kept } = await freshPersist();
  save('home', createWorld(4));
  assert.ok(load('home'));
  assert.deepEqual(kept('home'), []);
});

test('forgetting a world clears that world and no other', async () => {
  const { save, load, forget } = await freshPersist();
  save('home', createWorld(1));
  save('test', createWorld(2));

  forget('test');
  assert.equal(load('test'), null);
  assert.ok(load('home'), 'the world we play in is untouched');
});
