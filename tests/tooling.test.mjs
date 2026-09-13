// The rules are only worth anything if they fire on the thing they are for and
// stay quiet on the thing they are not. Both halves matter here: the quiet half
// is what stops a future session widening `olw/optional-chaining` until it
// "fixes" `v.task && v.task.kind !== 'gohome'` and sends somebody off at dusk
// with no task at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';

const eslint = new ESLint();
const complaints = async code => {
  const [r] = await eslint.lintText('const _ = () => {\n' + code + '\n};\n', {
    filePath: 'src/probe.js',
  });
  return r.messages.filter(m => String(m.ruleId).startsWith('olw/')).map(m => m.ruleId);
};

test('the modern-syntax rule catches the old way of writing a read', async () => {
  for (const code of [
    'if (a && a.b) return 1;',
    'if (a && a.b.c) return 1;',
    'const x = a && a.b();',
    'const y = (a && a.b) || 0;',
    'if (o.p && o.p.q) return 1;',
  ])
    assert.deepEqual(await complaints(code), ['olw/optional-chaining'], code);
});

test('and leaves alone every shape that does not mean the same thing', async () => {
  for (const code of [
    // the trap: undefined !== 'x' is true where the old one was false
    "if (v.task && v.task.kind !== 'gohome') return 1;",
    // a comparison, not a read — safe to convert by hand, not by a rule
    "if (pg && pg.state === 'built') return 1;",
    // reads backwards as `!held?.from`, and we would rather it did not
    'if (held && !held.from && held.kind === 1) return 1;',
    // the right-hand side compares against something else entirely
    'if (a && b.c) return 1;',
    // already modern
    'if (a?.b) return 1;',
  ])
    assert.deepEqual(await complaints(code), [], code);
});

test('the nullish rule catches the ternary that ?? was made for', async () => {
  assert.deepEqual(await complaints('const x = a == null ? 1 : a;'), ['olw/nullish']);
  assert.deepEqual(await complaints('const x = a != null ? a : 1;'), ['olw/nullish']);
  // `=== undefined` is not `== null`: it lets null through, and ?? does not
  assert.deepEqual(await complaints('const x = a === undefined ? 1 : a;'), []);
  // and the value kept has to be the thing that was tested
  assert.deepEqual(await complaints('const x = a == null ? 1 : b;'), []);
});

// The same floor, written in CSS. These are the 2009 -webkit-box draft and the
// 2011 -ms-flexbox one, and current iOS Safari has wanted neither for years.
// Prefixes that a phone still needs — the tap highlight, appearance,
// text-size-adjust, font-smoothing, user-select — are none of this rule's
// business and are not listed.
test('the stylesheet carries no flexbox from before the floor moved', () => {
  const css = readFileSync(new URL('../styles/main.css', import.meta.url), 'utf8');
  const gone = [
    'display: -webkit-box',
    'display: -ms-flexbox',
    '-webkit-box-flex',
    '-webkit-box-align',
    '-webkit-box-pack',
    '-webkit-box-orient',
    '-webkit-box-direction',
    '-ms-flex',
  ];
  for (const p of gone) assert.ok(!css.includes(p), p + ' is back in the stylesheet');
});
