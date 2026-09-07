import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/i18n/en.js';
import { de } from '../src/i18n/de.js';
import { tr, trn, setLang } from '../src/core/i18n.js';

test('both languages say the same things', () => {
  const missing = Object.keys(en).filter(k => !(k in de));
  const extra = Object.keys(de).filter(k => !(k in en));
  assert.deepEqual(missing, [], 'German is missing: ' + missing.join(', '));
  assert.deepEqual(extra, [], 'German has strings English does not: ' + extra.join(', '));
});

test('every value that takes a name or a number takes the same ones in both', () => {
  const slots = (s) => (String(s).match(/\{(\w+)\}/g) || []).sort().join(',');
  for (const k of Object.keys(en)) {
    assert.equal(slots(de[k]), slots(en[k]), 'placeholders differ for ' + k);
  }
});

test('plural pairs come in twos', () => {
  for (const table of [en, de])
    for (const k of Object.keys(table)) {
      if (k.endsWith('_one')) assert.ok(table[k.slice(0, -4) + '_other'], 'no _other for ' + k);
      if (k.endsWith('_other')) assert.ok(table[k.slice(0, -6) + '_one'], 'no _one for ' + k);
    }
});

test('nothing is left in English inside the German table', () => {
  // a rough check: German sentences should not read like the English ones
  const same = Object.keys(en).filter(k => en[k] === de[k] && /[a-z]{4,} [a-z]{4,}/.test(en[k]));
  assert.deepEqual(same, [], 'untranslated: ' + same.join(', '));
});

test('translating falls back rather than blowing up', () => {
  setLang('de');
  assert.equal(tr('sum.stop'), 'Hier aufhören');
  assert.equal(tr('nope.not.a.key'), 'nope.not.a.key');
  assert.equal(tr('notice.hungry', { name: 'Bo' }), 'Bo ist hungrig — der Brotkorb müsste gefüllt werden.');
  assert.equal(trn('sum.felled', 1), 'einen Baum gefällt');
  assert.equal(trn('sum.felled', 3, { n: 3 }), '3 Bäume gefällt');
  setLang('en');
  assert.equal(tr('sum.stop'), 'Stop here');
});
