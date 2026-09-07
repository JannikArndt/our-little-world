// Serves the game and the relay on one port, with no dependencies.
//   node server/serve.mjs           -> http://localhost:8080
//   node server/serve.mjs 3000

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { attachRelay, roomSizes } from './relay.mjs';
import { Worlds } from './worlds.mjs';
import { createApi } from './api.mjs';
import { buildId } from './buildid.mjs';
import { VERSION } from '../src/core/changelog.js';
import { SCHEMA } from '../src/core/world.js';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
// Where the world directory lives. A world is ~9 KB, so a family's worth of
// them is nothing; see README for what it costs at scale.
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'data');
const TTL_DAYS = Number(process.env.WORLD_TTL_DAYS || 14);

const worlds = new Worlds({ dir: DATA_DIR, ttlMs: TTL_DAYS * 24 * 60 * 60 * 1000 });
await worlds.load();
worlds.startWriting();
const api = createApi(worlds);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

// worked out once, at boot: what this server is actually serving
const BUILD = buildId();
const STARTED = new Date().toISOString();

/**
 * Write the build id into the page on the way out.
 *
 * A page saved to a Home Screen has no address bar and no reload button, and
 * iOS keeps it alive in the background for days — so it can be a fortnight old
 * and have no way of knowing. Knowing which build it is lets it ask /version
 * whether there is a newer one. A plain static host does not do this, and the
 * page copes: it just never claims anything is out of date.
 */
function stamp(html) {
  return html.replace(/(<meta name="olw-build" content=")[^"]*(">)/, '$1' + BUILD + '$2');
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (await api(req, res)) return;
    // "is what I pushed live?" — compare `build` with `node server/buildid.mjs`
    if (url.pathname === '/version') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ version: VERSION, schema: SCHEMA, build: BUILD, startedAt: STARTED }));
      return;
    }
    if (url.pathname === '/rooms') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(roomSizes()));
      return;
    }
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('no'); return; }
    const s = await stat(file).catch(() => null);
    if (!s || !s.isFile()) { res.writeHead(404); res.end('not found'); return; }
    let body = await readFile(file);
    const type = TYPES[extname(file)] || 'application/octet-stream';
    // the page is told which build it is, so it can notice when it is old
    if (type.indexOf('text/html') === 0) body = Buffer.from(stamp(body.toString('utf8')));

    // `no-cache` means "ask me first", not "do not keep it". With a tag to ask
    // with, coming back costs one small question per file instead of the whole
    // game again — and a stale copy can never quietly win.
    const tag = '"' + BUILD + '-' + body.length + '"';
    const asked = String(req.headers['if-none-match'] || '').replace(/^W\//, '');
    res.setHeader('etag', tag);
    res.setHeader('cache-control', 'no-cache');
    if (asked === tag) { res.writeHead(304); res.end(); return; }
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  } catch (e) {
    res.writeHead(500); res.end('error');
  }
});

attachRelay(server, '/relay');

server.listen(PORT, () => {
  const nets = networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets))
    for (const n of nets[name] || [])
      if (n.family === 'IPv4' && !n.internal) addrs.push(n.address);
  console.log('Our Little World  v' + VERSION + '  build ' + BUILD);
  console.log('  http://localhost:' + PORT);
  for (const a of addrs) console.log('  http://' + a + ':' + PORT + '   <- open this on the iPad');
  const s = worlds.stats();
  console.log('  ' + s.worlds + ' world(s) remembered in ' + DATA_DIR + ', forgotten after ' + TTL_DAYS + ' days');
});

// Whatever happens, the worlds people were playing in get written down first.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    worlds.close().then(() => process.exit(0), () => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
