// Is what I pushed live — asked once, answered now.
//
//   npm run shipped
//
// Not a poll. `deployed` waits for a build to appear, which is right when you
// have just pushed and are willing to sit there; this is for every other time,
// when the question is simply "where are we?" and a quarter of an hour of dots
// is the wrong answer. It says what is live, what is here, and whether they
// are the same thing.

import { buildId } from '../server/buildid.mjs';
import { execSync } from 'node:child_process';

const url = (
  process.argv.slice(2).find(a => a.startsWith('http')) ||
  process.env.DEPLOY_URL ||
  'https://ourlittleworld.timpanini.com'
).replace(/\/$/, '');

const mine = buildId();
const head = execSync('git rev-parse --short HEAD').toString().trim();
const dirty = execSync('git status --porcelain').toString().trim().length > 0;

let live = null;
try {
  const r = await fetch(url + '/version', { cache: 'no-store' });
  live = await r.json();
} catch (e) {
  console.log('the site did not answer: ' + e.message);
  process.exit(2);
}

const same = live.build === mine;
console.log('here:  ' + mine + '  (' + head + (dirty ? ', uncommitted changes' : '') + ')');
console.log('there: ' + live.build + '  v' + live.version + '  up since ' + live.startedAt);
console.log(
  '\n' +
    (same
      ? url + ' is serving exactly this.'
      : 'NOT live yet. Either the gate is still running, or it went red and ' +
        'nothing deployed — the old build is still what people are playing.'),
);
process.exit(same ? 0 : 1);
