// Everything that has to pass before a push, in one command.
//
//   npm run verify          unit tests, the browser play-through, and German
//   npm run verify -- quick just the unit tests and a shortened play-through
//
// It brings up its own server on a free port and takes it down again, so no
// stray server is left listening and nothing has to be killed by hand — a
// broad `pkill` has taken a running browser with it before now.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const quick = process.argv.slice(2).some(a => /quick/.test(a));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

function run(cmd, args, env) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'inherit', env: Object.assign({}, process.env, env || {}) });
    p.on('exit', (code) => resolve(code === 0));
  });
}

async function waitForServer(base, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(base + '/version');
      if (r.ok) return await r.json();
    } catch (e) { /* not up yet */ }
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
  stdio: 'ignore', env: Object.assign({}, process.env, { PORT: String(port), DATA_DIR: data }),
});
const stop = () => {
  try { server.kill(); } catch (e) { /* already gone */ }
  try { rmSync(data, { recursive: true, force: true }); } catch (e) { /* fine */ }
};
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

const info = await waitForServer(base);
if (!info) { stop(); console.error('the server never came up'); process.exit(1); }
console.log('server on ' + base + '  v' + info.version + '  build ' + info.build + '\n');

const steps = [
  ['unit tests', () => run('node', ['--test'].concat(
      readdirSync('tests').filter(f => f.endsWith('.test.mjs')).sort().map(f => 'tests/' + f)))],
  ['a whole morning in a browser', () => run('node', ['tools/smoke.mjs'], { BASE: base, QUICK: quick ? '1' : '' })],
];
if (!quick) steps.push(['the same in German', () => run('node', ['tools/german.mjs'], { BASE: base })]);
if (!quick) steps.push(['two browsers finding each other', () => run('node', ['tools/lobby.mjs'], { BASE: base })]);

let ok = true;
for (const [name, go] of steps) {
  console.log('\n──── ' + name + ' ────');
  const passed = await go();
  if (!passed) { ok = false; console.error('\n' + name + ': FAILED'); break; }
}

stop();
console.log('\n' + (ok ? (quick ? 'quick verify: all good (run the full one before pushing)' : 'verify: all good')
                       : 'verify: something is broken'));
process.exit(ok ? 0 : 1);
