import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { en } from '../src/i18n/en.js';
import { tr, trn, setLang, LANGUAGES } from '../src/core/i18n.js';

// Every language, found on disk rather than listed here, so a new one is
// checked the moment it exists — see law 14: nothing ships half-translated,
// and there is no runtime fallback to English to hide a gap behind.
const files = readdirSync(new URL('../src/i18n/', import.meta.url))
  .filter((f) => f.endsWith('.js'))
  .map((f) => f.slice(0, -3))
  .sort();

// English is the reference every other table is measured against.
const others = files.filter((id) => id !== 'en');

const tables = {};
for (const id of files) {
  const mod = await import('../src/i18n/' + id + '.js');
  tables[id] = mod[id];
}

test('every language file is a table named after itself', () => {
  for (const id of files)
    assert.ok(tables[id] && typeof tables[id] === 'object', id + '.js should export `' + id + '`');
});

test('every language file is offered, and everything offered exists', () => {
  const offered = LANGUAGES.map((l) => l.id).sort();
  assert.deepEqual(
    offered,
    files,
    'LANGUAGES and src/i18n/ disagree — a language nobody can pick, or a flag with no table',
  );
});

test('every language says the same things', () => {
  for (const id of others) {
    const missing = Object.keys(en).filter((k) => !(k in tables[id]));
    const extra = Object.keys(tables[id]).filter((k) => !(k in en));
    assert.deepEqual(missing, [], id + ' is missing: ' + missing.join(', '));
    assert.deepEqual(extra, [], id + ' has strings English does not: ' + extra.join(', '));
  }
});

test('every value that takes a name or a number takes the same ones everywhere', () => {
  const slots = (s) =>
    (String(s).match(/\{(\w+)\}/g) || []).sort().join(',');
  for (const id of others)
    for (const k of Object.keys(en))
      assert.equal(slots(tables[id][k]), slots(en[k]), 'placeholders differ for ' + k + ' in ' + id);
});

test('plural pairs come in twos', () => {
  for (const id of files)
    for (const k of Object.keys(tables[id])) {
      if (k.endsWith('_one'))
        assert.ok(tables[id][k.slice(0, -4) + '_other'], 'no _other for ' + k + ' in ' + id);
      if (k.endsWith('_other'))
        assert.ok(tables[id][k.slice(0, -6) + '_one'], 'no _one for ' + k + ' in ' + id);
    }
});

test('nothing is left in English inside another table', () => {
  // a rough check: a translated sentence should not read like the English one
  for (const id of others) {
    const same = Object.keys(en).filter(
      (k) => en[k] === tables[id][k] && /[a-z]{4,} [a-z]{4,}/.test(en[k]),
    );
    assert.deepEqual(same, [], 'untranslated in ' + id + ': ' + same.join(', '));
  }
});

test('translating falls back rather than blowing up', () => {
  setLang('de');
  assert.equal(tr('ui.later'), 'Später');
  assert.equal(tr('nope.not.a.key'), 'nope.not.a.key');
  assert.equal(
    tr('notice.hungry', { name: 'Bo' }),
    'Bo ist hungrig — der Brotkorb müsste gefüllt werden.',
  );
  assert.equal(trn('deed.fell', 1), 'einen Baum gefällt');
  assert.equal(trn('deed.fell', 3, { n: 3 }), '3 Bäume gefällt');
  setLang('en');
  assert.equal(tr('ui.later'), 'Later');
});
