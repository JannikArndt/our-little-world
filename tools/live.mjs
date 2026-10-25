// Is this tree's build what the live app serves?
//   npm run live                         answers now (exit 1 if not)
//   npm run live -- --wait               polls every 5 s, up to 10 min
//   npm run live -- --url <base>         dev instead of prod (or any host)
// Last line: `LIVE: <build>` or `NOT LIVE: want <a>, <url> serves <b>`.
//
// The workflow going green means CapRover accepted the upload, not that the
// new code is served: /version reports the hash of the files it is serving,
// compared here with the same hash of the working tree. CI runs this same
// script after each deploy (dev first, then prod).

import { buildId } from '../server/buildid.mjs';

const arg = name => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const base = (
  arg('--url') ||
  process.env.APP_URL ||
  'https://ourlittleworld.timpanini.com'
).replace(/\/$/, '');
const wait = process.argv.includes('--wait');
const want = buildId();
const started = Date.now();

async function served() {
  try {
    const res = await fetch(base + '/version', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => ({}));
    return body.build || 'HTTP ' + res.status;
  } catch (err) {
    return err.cause?.code || err.name;
  }
}

let last = '';
for (;;) {
  const got = await served();
  if (got === want) {
    console.log('LIVE: ' + want);
    process.exit(0);
  }
  const secs = Math.round((Date.now() - started) / 1000);
  if (!wait || secs > 600) {
    console.log('NOT LIVE: want ' + want + ', ' + base + ' serves ' + got);
    process.exit(1);
  }
  if (got !== last) {
    console.log('  ' + secs + ' s: ' + base + ' serves ' + got);
    last = got;
  }
  await new Promise(r => setTimeout(r, 5000));
}
