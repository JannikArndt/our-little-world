// Which code is this, exactly?
//
// There is no build step to stamp a version into, so the answer is the code
// itself: a hash of every file that ships — the page, its sources, and the
// server that hands them out. It changes when anything
// the browser downloads changes and not otherwise, which makes it the honest
// answer to "is what I just pushed actually live?" — ask a running server for
// /version and compare it with the same hash taken here.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));

/** Everything the deployed thing is made of: the page, and what serves it. */
const SERVED = ['index.html', 'src', 'styles', 'server'];

function walk(dir, out) {
  const s = statSync(dir, { throwIfNoEntry: false });
  if (!s) return out;
  if (!s.isDirectory()) { out.push(dir); return out; }
  for (const name of readdirSync(dir).sort()) walk(join(dir, name), out);
  return out;
}

export function buildId(root) {
  const base = root || ROOT;
  const files = [];
  for (const part of SERVED) walk(join(base, part), files);
  const h = createHash('sha1');
  for (const f of files) {
    h.update(relative(base, f).split('\\').join('/'));
    h.update(readFileSync(f));
  }
  return h.digest('hex').slice(0, 12);
}

// node server/buildid.mjs -> prints the id of the working tree
if (import.meta.url === 'file://' + process.argv[1]) console.log(buildId());
