// The rules a machine can keep, and no more. See CLAUDE.md: "never add a rule
// the existing code violates without fixing the code in the same change."

import globals from 'globals';

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
};

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
    rules,
  },
];
