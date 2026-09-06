// The world directory, from the browser's side.
//
// Every call answers with null rather than throwing when there is no server —
// the game runs from a static host too, and there it simply falls back to
// "both of you type the same name", which is how it worked before.

const TIMEOUT = 5000;

/** Where the directory is: next to the page, unless a relay elsewhere was named. */
export function apiBase(qs) {
  const given = qs && qs.get ? qs.get('server') : null;
  if (given) {
    // ws://host/relay -> http://host
    try {
      const u = new URL(given);
      return (u.protocol === 'wss:' ? 'https://' : 'http://') + u.host;
    } catch (e) { /* fall through to same origin */ }
  }
  return '';
}

export class Directory {
  constructor(base) {
    this.base = base || '';
    this.reachable = null;                 // null = not asked yet
  }

  url(path) { return this.base + '/api' + path; }

  /**
   * Is there a directory (and therefore a relay) on this host? Remembered per
   * host, so a static host is asked once and never again.
   */
  probe() {
    const key = 'olw.api.' + this.base + location.host;
    try {
      const seen = localStorage.getItem(key);
      if (seen === 'yes') { this.reachable = true; return Promise.resolve(true); }
      if (seen === 'no') { this.reachable = false; return Promise.resolve(false); }
    } catch (e) { /* no storage: ask every time */ }
    return this.get('/health').then((r) => {
      const ok = !!(r && r.ok);
      this.reachable = ok;
      try { localStorage.setItem(key, ok ? 'yes' : 'no'); } catch (e) { /* fine */ }
      return ok;
    });
  }

  /* ---- the calls the game makes ---- */

  list() { return this.get('/worlds').then((r) => (r && r.worlds) || []); }
  world(name) { return this.get('/worlds/' + encodeURIComponent(name)).then((r) => (r && r.world) || null); }
  create(device, role) { return this.post('/worlds', { device, role }); }
  /** `start` turns "join this" into "join this, or begin it if nobody has". */
  join(name, device, role, start) {
    return this.post('/worlds/' + encodeURIComponent(name) + '/join', { device, role, start: !!start });
  }
  seen(name, device, role) { return this.post('/worlds/' + encodeURIComponent(name) + '/seen', { device, role }); }
  leave(name, device) { return this.post('/worlds/' + encodeURIComponent(name) + '/leave', { device }); }

  snapshot(name) { return this.get('/worlds/' + encodeURIComponent(name) + '/snapshot'); }
  putSnapshot(name, device, tick, world) {
    return this.post('/worlds/' + encodeURIComponent(name) + '/snapshot', { device, tick, world });
  }

  /**
   * The last word before the tab closes. sendBeacon is the only thing a
   * browser promises to finish once the page is gone; if it is missing we
   * simply lose the last few seconds, which the next snapshot puts right.
   */
  beaconSnapshot(name, device, tick, world) {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
    try {
      const body = new Blob([JSON.stringify({ device, tick, world })], { type: 'application/json' });
      return navigator.sendBeacon(this.url('/worlds/' + encodeURIComponent(name) + '/snapshot'), body);
    } catch (e) { return false; }
  }

  /* ---- plumbing ---- */

  get(path) { return this.fetch(path, null); }
  post(path, body) { return this.fetch(path, body || {}); }

  fetch(path, body) {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    const opts = body
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : { method: 'GET' };
    const call = fetch(this.url(path), opts)
      .then((r) => (r.status === 204 ? {} : r.json().then((j) => {
        if (j && typeof j === 'object') j.status = r.status;
        return j;
      })))
      .catch(() => null);
    const giveUp = new Promise((r) => setTimeout(() => r(null), TIMEOUT));
    return Promise.race([call, giveUp]);
  }
}
