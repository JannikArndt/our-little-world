// Is what I pushed actually live?
//
//   npm run deployed                     checks the usual address
//   npm run deployed -- https://other/    checks another one
//
// The workflow going green means CapRover accepted the deploy, not that the
// new code is being served. This asks the site itself: /version reports the
// hash of the files it is serving, and that is compared with the same hash
// taken from the working tree.

import { buildId } from '../server/buildid.mjs';

const url = (process.argv.slice(2).find(a => a.startsWith('http')) ||
             process.env.DEPLOY_URL || 'https://world.timpanini.com').replace(/\/$/, '');
const waitFor = Number((process.argv.find(a => /^--wait=/.test(a)) || '--wait=180').split('=')[1]);

const mine = buildId();
console.log('here:  ' + mine);

const until = Date.now() + waitFor * 1000;
let last = null;
for (;;) {
  try {
    const r = await fetch(url + '/version', { cache: 'no-store' });
    const v = await r.json();
    last = v;
    if (v.build === mine) {
      console.log('there: ' + v.build + '  v' + v.version + '  up since ' + v.startedAt);
      console.log('\n' + url + ' is serving exactly this.');
      process.exit(0);
    }
  } catch (e) {
    last = { error: e.message };
  }
  if (Date.now() > until) break;
  process.stdout.write('.');
  await new Promise(r => setTimeout(r, 5000));
}

console.log('\nthere: ' + JSON.stringify(last));
console.error('\n' + url + ' is not serving this build (yet). Check the deploy workflow.');
process.exit(1);
