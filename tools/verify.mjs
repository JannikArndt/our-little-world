// Everything that has to pass before a push, in one command.
//
//   npm run verify          format + lint + unit tests, the play-through, German, the lobby, /stats
//   npm run verify -- quick just check and a shortened play-through
//   npm run verify -- only=german   one pass on its own, against a fresh server
//
// `only=` is for the middle of a fix: a failing pass can be run again in its
// own minute instead of sitting through the other four. It is never the gate —
// it says so at the end, so a run of one is never mistaken for a run of all.
//
// It brings up its own server on a free port and takes it down again, so no
// stray server is left listening and nothing has to be killed by hand — a
// broad `pkill` has taken a running browser with it before now.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const quick = process.argv.slice(2).some(a => /quick/.test(a));
const only = (process.argv.slice(2).find(a => /^only=/.test(a)) || '').split('=')[1] || '';

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function run(cmd, args, env) {
  return new Promise(resolve => {
    const p = spawn(cmd, args, {
      stdio: 'inherit',
      env: Object.assign({}, process.env, env || {}),
    });
    p.on('exit', code => resolve(code === 0));
  });
}

async function waitForServer(base, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(base + '/version');
      if (r.ok) return await r.json();
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}

const port = await freePort();
const base = 'http://localhost:' + port;
// its own world directory, thrown away afterwards: a run must not depend on
// what an earlier run left lying about, or leave anything of its own behind
const data = mkdtempSync(join(tmpdir(), 'olw-verify-'));
const server = spawn('node', ['server/serve.mjs'], {
  stdio: 'ignore',
  env: Object.assign({}, process.env, { PORT: String(port), DATA_DIR: data }),
});
const stop = () => {
  try {
    server.kill();
  } catch {
    /* already gone */
  }
  try {
    rmSync(data, { recursive: true, force: true });
  } catch {
    /* fine */
  }
};
process.on('exit', stop);
process.on('SIGINT', () => {
  stop();
  process.exit(130);
});

const info = await waitForServer(base);
if (!info) {
  stop();
  console.error('the server never came up');
  process.exit(1);
}
console.log('server on ' + base + '  v' + info.version + '  build ' + info.build + '\n');

const steps = [
  ['format, lint and unit tests', () => run('npm', ['run', 'check']), 'check'],
  [
    'a whole morning in a browser',
    () => run('node', ['tools/smoke.mjs'], { BASE: base, QUICK: quick ? '1' : '' }),
    'smoke',
  ],
];
if (!quick)
  steps.push([
    'the same in German',
    () => run('node', ['tools/german.mjs'], { BASE: base }),
    'german',
  ]);
if (!quick)
  steps.push([
    'two browsers finding each other',
    () => run('node', ['tools/lobby.mjs'], { BASE: base }),
    'lobby',
  ]);
if (!quick)
  steps.push([
    'the page at /stats',
    () => run('node', ['tools/stats.mjs'], { BASE: base }),
    'stats',
  ]);

// `only=smoke` keeps the step whose name or script matches, and nothing else.
const chosen = only ? steps.filter(st => st[2] && st[2].includes(only)) : steps;
if (only && !chosen.length) {
  stop();
  console.error('no pass called "' + only + '". There is: ' + steps.map(st => st[2]).join(', '));
  process.exit(1);
}

// smoke is the long pole and German is a minute of its own against a different
// world, so they run together. The lobby and /stats both read the directory as
// a whole and would see each other's worlds, so those stay in single file.
const together = chosen.filter(st => st[2] === 'smoke' || st[2] === 'german');
const alone = chosen.filter(st => st[2] !== 'smoke' && st[2] !== 'german' && st[2] !== 'check');
const first = chosen.filter(st => st[2] === 'check');

let ok = true;
if (first.length) {
  console.log('\n──── ' + first[0][0] + ' ────');
  ok = await first[0][1]();
  if (!ok) console.error('\n' + first[0][0] + ': FAILED');
}
if (ok && together.length) {
  console.log('\n──── ' + together.map(st => st[0]).join('  +  ') + ' ────');
  const results = await Promise.all(together.map(st => st[1]()));
  results.forEach((passed, i) => {
    if (!passed) {
      ok = false;
      console.error('\n' + together[i][0] + ': FAILED');
    }
  });
}
for (const [name, go] of ok ? alone : []) {
  console.log('\n──── ' + name + ' ────');
  const passed = await go();
  if (!passed) {
    ok = false;
    console.error('\n' + name + ': FAILED');
    break;
  }
}

stop();
// One last line, always in the same shape, so whoever is reading this at the
// end of five minutes can find it without scrolling — and so a run of one pass
// can never be mistaken for the gate.
console.log(
  '\n' +
    (ok
      ? only
        ? 'verify (' + only + ' only): all good — this is NOT the gate, run the full one'
        : quick
          ? 'quick verify: all good (run the full one before pushing)'
          : 'verify: all good'
      : 'verify: something is broken'),
);
process.exit(ok ? 0 : 1);
