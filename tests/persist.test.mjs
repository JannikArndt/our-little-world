import { test } from 'node:test';
import assert from 'node:assert/strict';

// A pocket localStorage, put in place before the module that asks whether
// there is one. Nothing here touches a real browser's storage.
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

const { rememberWorld, recentWorlds, forgetWorld } = await import('../src/core/persist.js');

test('an afternoon on one screen does not cost this device its seat', () => {
  // This is how a shared village quietly became a one-screen village for
  // good: the role was forgotten, so the card at the front door offered
  // nothing but one screen ever after, and nothing reached the other player.
  rememberWorld('sunny-otter', 'B');
  rememberWorld('sunny-otter', null); // both of us, one screen, for an hour
  assert.equal(recentWorlds()[0].role, 'B');
  forgetWorld('sunny-otter');
});

test('a world this device has never had a seat in stays a one-screen world', () => {
  rememberWorld('quiet-bear', null);
  assert.equal(recentWorlds()[0].role, null);
  forgetWorld('quiet-bear');
});

test('taking the other seat in a world moves this device to it', () => {
  rememberWorld('windy-hill', 'A');
  rememberWorld('windy-hill', 'B');
  assert.equal(recentWorlds()[0].role, 'B');
  forgetWorld('windy-hill');
});
