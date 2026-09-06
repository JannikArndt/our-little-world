// The HTTP side of the world directory. Small JSON endpoints, no library, and
// nothing that needs a session cookie:
//
//   GET  /api/health                     is there a directory here at all
//   GET  /api/worlds                     the worlds with a free spot
//   POST /api/worlds                     start one; the server picks the name
//   GET  /api/worlds/:name               one world, or 404
//   POST /api/worlds/:name/join          take the free spot (or get yours back);
//                                        with { start: true } it also starts a
//                                        world of that name if there is none
//   POST /api/worlds/:name/seen          still here — keeps the world alive
//   POST /api/worlds/:name/leave         give the spot back
//   GET  /api/worlds/:name/snapshot      the world as the last host left it
//                                        ({ world: null } if nobody has played it)
//   POST /api/worlds/:name/snapshot      here is the world as it is now
//
// A "device" is a random string a browser made up for itself and kept in
// localStorage. It is how an iPad recognises its own spot a week later. It is
// not a login and it is not treated as one.

import { cleanName } from '../src/core/names.js';
import { publicView } from './worlds.mjs';

const MAX_BODY = 1024 * 1024;
const CREATE_PER_HOUR = 30;             // per address; a family needs a handful

export function createApi(store, opts) {
  const o = opts || {};
  const now = o.now || (() => Date.now());
  const buckets = new Map();

  function allowedToCreate(req) {
    const ip = (req.socket && req.socket.remoteAddress) || 'local';
    const t = now();
    const b = buckets.get(ip) || { n: 0, until: t + 3600000 };
    if (t > b.until) { b.n = 0; b.until = t + 3600000; }
    b.n++;
    buckets.set(ip, b);
    if (buckets.size > 5000) buckets.clear();
    return b.n <= CREATE_PER_HOUR;
  }

  /** true when this request was ours to answer. */
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.indexOf('/api/') !== 0) return false;

    // no cookies, no credentials, so a relay on another host is no drama
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }

    const parts = url.pathname.split('/').filter((p) => p.length);   // ['api','worlds',name,what]
    try {
      if (parts[1] === 'health' && parts.length === 2) {
        return send(res, 200, Object.assign({ ok: true, relay: true }, store.stats()));
      }

      if (parts[1] !== 'worlds') return send(res, 404, { error: 'no-such-endpoint' });

      /* ---- the list, and starting a new world ---- */
      if (parts.length === 2) {
        if (req.method === 'GET') return send(res, 200, { worlds: store.open({ limit: Number(url.searchParams.get('limit')) || 24 }) });
        if (req.method === 'POST') {
          if (!allowedToCreate(req)) return send(res, 429, { error: 'too-many-worlds' });
          const body = await readJson(req);
          if (body === null) return send(res, 400, { error: 'bad-body' });
          const wanted = cleanName(body.name);
          const made = store.create({ device: device(body), role: role(body), name: wanted || null });
          return send(res, 201, { world: publicView(made.world), role: made.role });
        }
        return send(res, 405, { error: 'method' });
      }

      const name = cleanName(parts[2]);
      if (!name) return send(res, 400, { error: 'bad-name' });
      const what = parts[3] || '';

      /* ---- one world ---- */
      if (!what && req.method === 'GET') {
        const w = store.get(name);
        return w ? send(res, 200, { world: publicView(w) }) : send(res, 404, { error: 'no-such-world' });
      }

      if (what === 'snapshot' && req.method === 'GET') {
        // a world nobody has played yet is not an error, and a 404 here would
        // only paint the browser console red on every first visit
        const s = store.getSnapshot(name);
        return send(res, 200, s || { tick: 0, world: null });
      }

      if (req.method !== 'POST') return send(res, 405, { error: 'method' });
      const body = await readJson(req);
      if (body === null) return send(res, 400, { error: 'bad-body' });

      if (what === 'join') {
        const r = store.join(name, { device: device(body), role: role(body) });
        if (r) return send(res, 200, { world: publicView(r.world), role: r.role, full: r.full });
        // somebody typed a name, or followed a link to a world that has since
        // been forgotten: starting it is what they meant either way
        if (!body.start) return send(res, 404, { error: 'no-such-world' });
        if (!allowedToCreate(req)) return send(res, 429, { error: 'too-many-worlds' });
        const made = store.create({ device: device(body), role: role(body), name });
        return send(res, 201, { world: publicView(made.world), role: made.role, full: false });
      }

      if (what === 'seen') {
        const w = store.touch(name, { device: device(body), role: role(body) });
        if (!w) return send(res, 404, { error: 'no-such-world' });
        return send(res, 200, { world: publicView(w) });
      }

      if (what === 'leave') {
        const w = store.leave(name, { device: device(body) });
        if (!w) return send(res, 404, { error: 'no-such-world' });
        return send(res, 200, { world: publicView(w) });
      }

      if (what === 'snapshot') {
        const r = store.putSnapshot(name, { device: device(body), tick: body.tick, world: body.world });
        if (r.ok) return send(res, 200, { ok: true });
        if (r.reason === 'no-world') return send(res, 404, { error: 'no-such-world' });
        if (r.reason === 'older') return send(res, 409, { error: 'older', snapshot: r.snapshot });
        return send(res, 413, { error: 'too-big' });
      }

      return send(res, 404, { error: 'no-such-endpoint' });
    } catch (e) {
      return send(res, 500, { error: 'server' });
    }
  };
}

function device(body) { return String(body.device || '').slice(0, 64) || null; }
function role(body) { return body.role ? String(body.role).slice(0, 8) : null; }

function send(res, code, obj) {
  const text = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(text);
  return true;
}

/** Reads a JSON body, however it was sent — fetch and sendBeacon disagree
 *  about content types and neither of them matters here. */
function readJson(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { resolve(null); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) { resolve({}); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}
