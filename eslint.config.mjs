// The rules a machine can keep, and no more. See CLAUDE.md: "never add a rule
// the existing code violates without fixing the code in the same change."

import globals from 'globals';

/**
 * The modern-syntax floor, kept by a machine rather than by somebody
 * remembering it. The code was once written down to Safari 12 and wrote around
 * optional chaining and `??`; that floor is gone, and these two say so.
 *
 * Both are deliberately narrow. They flag only the shapes where the old way
 * and the new way are the same value in every case, because a lint rule that
 * is sometimes wrong is a lint rule somebody switches off. `v.task &&
 * v.task.kind !== 'gohome'` is NOT `v.task?.kind !== 'gohome'` — undefined is
 * not 'gohome', so the new one is true where the old one was false — and
 * nothing here will ever tell anybody otherwise.
 */

/** An expression that can be written twice without anything happening twice. */
function plain(node) {
  if (!node) return false;
  if (node.type === 'Identifier' || node.type === 'ThisExpression') return true;
  if (node.type === 'MemberExpression' && !node.computed && !node.optional)
    return plain(node.object);
  return false;
}

/** Everything a member-or-call chain hangs off, working outwards in. */
function hangsOff(node) {
  const out = [];
  let n = node;
  while (n) {
    if (n.type === 'MemberExpression') n = n.object;
    else if (n.type === 'CallExpression') n = n.callee;
    else break;
    out.push(n);
  }
  return out;
}

const preferOptionalChaining = {
  meta: {
    type: 'suggestion',
    docs: { description: 'write a?.b rather than a && a.b' },
    schema: [],
    messages: {
      chain: '`{{left}} && …` is how this was written for Safari 12. Use `{{left}}?.` instead.',
    },
  },
  create(context) {
    const src = context.sourceCode;
    return {
      LogicalExpression(node) {
        if (node.operator !== '&&' || !plain(node.left)) return;
        const left = src.getText(node.left);
        // only when the whole right-hand side is the read itself: anything
        // else (a comparison, a negation) may not mean the same thing
        if (!hangsOff(node.right).some(o => src.getText(o) === left)) return;
        context.report({ node, messageId: 'chain', data: { left } });
      },
    };
  },
};

const preferNullish = {
  meta: {
    type: 'suggestion',
    docs: { description: 'write a ?? b rather than a == null ? b : a' },
    schema: [],
    messages: {
      nullish: '`{{what}} == null ? … : {{what}}` is `{{what}} ?? …` now.',
    },
  },
  create(context) {
    const src = context.sourceCode;
    return {
      ConditionalExpression(node) {
        const t = node.test;
        if (t.type !== 'BinaryExpression' || !plain(t.left)) return;
        // `== null` and `!= null` catch null and undefined both, which is
        // exactly what ?? does. `=== undefined` does not, so it is left alone.
        if (t.operator !== '==' && t.operator !== '!=') return;
        if (t.right.type !== 'Literal' || t.right.value !== null) return;
        const what = src.getText(t.left);
        const kept = t.operator === '==' ? node.alternate : node.consequent;
        if (src.getText(kept) !== what) return;
        context.report({ node, messageId: 'nullish', data: { what } });
      },
    };
  },
};

const olw = { rules: { 'optional-chaining': preferOptionalChaining, nullish: preferNullish } };

const rules = {
  // an unused parameter named _thing is a real, deliberate part of a shared
  // call signature (every draw() takes the same (ctx, obj, time)) — not a
  // mistake the rule should catch.
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-var': 'error',
  'no-undef': 'error',
  // 'smart' allows `x == null` for "null or undefined", used throughout —
  // everywhere else it still demands ===.
  eqeqeq: ['error', 'smart'],
  // the modern-syntax floor, which used to live only in CLAUDE.md
  'olw/optional-chaining': 'error',
  'olw/nullish': 'error',
};

const plugins = { olw };

export default [
  { ignores: ['node_modules/**', 'data/**', 'tools/shots/**', 'icons/**'] },
  {
    // the game itself: runs in the browser
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    plugins,
    rules,
  },
  {
    // the server and the unit tests: runs under Node
    files: ['server/**/*.mjs', 'tests/**/*.mjs', '*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    plugins,
    rules,
  },
  {
    // the browser passes: Node scripts that also carry literal
    // page.evaluate() callbacks Playwright runs in the browser, so both
    // sets of globals are genuinely in play in the same file.
    files: ['tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    plugins,
    rules,
  },
];
