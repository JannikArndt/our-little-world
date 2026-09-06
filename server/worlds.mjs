// The world directory: which worlds exist, who has taken which spot in them,
// and the last snapshot each one sent us.
//
// It is a lobby, not an account system. There are no passwords and no personal
// data — a world is a random two word name and at most one line per player
// saying "a device was here". Anything a device knows the name of, it may
// read; the point of the spots is to stop a third person walking into a game
// that is already two people, not to keep anybody out of anything.
//
// Worlds are kept on disk so a redeploy does not wipe the weekend, and are
// forgotten again once nobody has opened them for TTL_DAYS.

import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomName, worldEmoji } from '../src/core/names.js';

export const DEFAULT_ROLES = ['A', 'B'];

const DAY = 24 * 60 * 60 * 1000;
const MAX_SNAPSHOT = 512 * 1024;        // a whole world is ~9 KB; this is a wall, not a target

export class Worlds {
  /**
   * dir          where to keep the files (null keeps everything in memory)
   * ttlMs        forget a world nobody has opened for this long
   * staleSlotMs  a spot whose device has not been seen for this long can be
   *              taken over — a reinstalled iPad gets its role back
   * now          injectable clock, for the tests
   */
  constructor(opts) {
    const o = opts || {};
    this.dir = o.dir === undefined ? null : o.dir;
    this.ttlMs = o.ttlMs || 14 * DAY;
    this.staleSlotMs = o.staleSlotMs || 3 * DAY;
    this.now = o.now || (() => Date.now());
    this.worlds = new Map();
    this.dirty = new Set();
    this.timer = null;
  }

  /* ---------------- disk ---------------- */

  async load() {
    if (!this.dir) return this;
    await mkdir(this.dir, { recursive: true }).catch(() => {});
    const files = await readdir(this.dir).catch(() => []);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const w = JSON.parse(await readFile(join(this.dir, f), 'utf8'));
        if (w && w.name) this.worlds.set(w.name, normalise(w));
      } catch (e) { /* a half-written file is not worth a crash */ }
    }
    await this.sweep();
    return this;
  }

  /** Write out everything that changed since the last time. */
  async flush() {
    if (!this.dir || !this.dirty.size) return;
    const names = [...this.dirty];
    this.dirty.clear();
    for (const name of names) {
      const w = this.worlds.get(name);
      const file = join(this.dir, name + '.json');
      try {
        if (!w) { await unlink(file).catch(() => {}); continue; }
        const tmp = file + '.' + process.pid + '.tmp';
        await writeFile(tmp, JSON.stringify(w));
        await rename(tmp, file);
      } catch (e) {
        // a read-only or full disk means this run is memory-only; the game
        // itself keeps working, so say it once and carry on
        if (!this.warned) { this.warned = true; console.warn('worlds: cannot write to ' + this.dir + ' (' + e.code + ')'); }
      }
    }
  }

  /** Flush every few seconds and sweep every hour, without holding the process open. */
  startWriting(flushMs = 4000, sweepMs = 60 * 60 * 1000) {
    if (this.timer || !this.dir) return this;
    this.timer = setInterval(() => { this.flush(); }, flushMs);
    this.sweeper = setInterval(() => { this.sweep(); }, sweepMs);
    this.timer.unref(); this.sweeper.unref();
    return this;
  }

  async close() {
    clearInterval(this.timer); clearInterval(this.sweeper);
    this.timer = null; this.sweeper = null;
    await this.flush();
  }

  touchFile(name) { this.dirty.add(name); }

  /* ---------------- the worlds themselves ---------------- */

  /** Forget worlds nobody has opened in a fortnight. */
  async sweep() {
    const cutoff = this.now() - this.ttlMs;
    let gone = 0;
    for (const [name, w] of this.worlds) {
      if (w.seen < cutoff) { this.worlds.delete(name); this.dirty.add(name); gone++; }
    }
    if (gone) await this.flush();
    return gone;
  }

  get(name) { return this.worlds.get(name) || null; }

  /** A brand new world with one spot already taken by whoever asked. */
  create(opts) {
    const o = opts || {};
    const t = this.now();
    const name = o.name && !this.worlds.has(o.name) ? o.name : randomName(this.worlds);
    const roles = o.roles && o.roles.length ? o.roles.slice() : DEFAULT_ROLES.slice();
    const w = {
      name,
      created: t,
      seen: t,
      roles,
      slots: {},
      snapshot: null,
    };
    this.worlds.set(name, w);
    this.dirty.add(name);
    const role = this.claim(w, o.device, o.role);
    return { world: w, role };
  }

  /**
   * Take a spot in an existing world. A device that already has one gets it
   * back — that is what makes rejoining after a week free of ceremony.
   * Returns { world, role, full } with role null when there was nothing free.
   */
  join(name, opts) {
    const o = opts || {};
    const w = this.worlds.get(name);
    if (!w) return null;
    w.seen = this.now();
    this.dirty.add(name);
    const role = this.claim(w, o.device, o.role);
    return { world: w, role, full: role === null };
  }

  claim(w, device, wanted) {
    const t = this.now();
    const dev = device || 'anon';
    for (const r of w.roles) {
      const s = w.slots[r];
      if (s && s.device === dev) { s.seen = t; return r; }
    }
    const free = w.roles.filter((r) => !w.slots[r]);
    let role = null;
    if (wanted && free.indexOf(wanted) >= 0) role = wanted;
    else if (free.length) role = free[0];
    else {
      // nothing free: a spot nobody has used for days is fair game again
      const stale = w.roles
        .filter((r) => t - w.slots[r].seen > this.staleSlotMs)
        .sort((a, b) => w.slots[a].seen - w.slots[b].seen);
      if (wanted && stale.indexOf(wanted) >= 0) role = wanted;
      else if (stale.length) role = stale[0];
    }
    if (!role) return null;
    w.slots[role] = { device: dev, seen: t };
    return role;
  }

  /** A player says they are still there. Keeps the world (and the spot) alive. */
  touch(name, opts) {
    const o = opts || {};
    const w = this.worlds.get(name);
    if (!w) return null;
    const t = this.now();
    w.seen = t;
    const s = o.role ? w.slots[o.role] : null;
    if (s && (!o.device || s.device === o.device)) s.seen = t;
    this.dirty.add(name);
    return w;
  }

  /** Give up a spot, so the other side stops waiting for somebody who left. */
  leave(name, opts) {
    const o = opts || {};
    const w = this.worlds.get(name);
    if (!w) return null;
    for (const r of w.roles) {
      const s = w.slots[r];
      if (s && s.device === o.device) delete w.slots[r];
    }
    w.seen = this.now();
    this.dirty.add(name);
    return w;
  }

  /**
   * The worlds somebody could join: a free spot, and opened recently enough to
   * still mean something. Newest first, because "the one my son just started"
   * is nearly always the one at the top.
   */
  open(opts) {
    const o = opts || {};
    const limit = Math.min(o.limit || 24, 100);
    const since = this.now() - (o.withinMs || 7 * DAY);
    const out = [];
    for (const w of this.worlds.values()) {
      if (w.seen < since) continue;
      if (!free(w).length) continue;
      out.push(w);
    }
    out.sort((a, b) => b.seen - a.seen);
    return out.slice(0, limit).map(publicView);
  }

  /* ---------------- the world's own state ---------------- */

  /**
   * Keep the last snapshot a host sent, so whoever opens the page next gets
   * the real world back instead of whatever their own device remembers.
   * An older tick than the one we hold is refused — that is a device coming
   * back with a stale save, and it gets ours in the answer.
   */
  putSnapshot(name, opts) {
    const o = opts || {};
    const w = this.worlds.get(name);
    if (!w) return { ok: false, reason: 'no-world' };
    const text = String(o.world || '');
    if (!text || text.length > MAX_SNAPSHOT) return { ok: false, reason: 'size' };
    const tick = Number(o.tick) || 0;
    if (w.snapshot && tick < w.snapshot.tick) return { ok: false, reason: 'older', snapshot: w.snapshot };
    w.snapshot = { tick, at: this.now(), world: text };
    w.seen = this.now();
    this.dirty.add(name);
    return { ok: true };
  }

  getSnapshot(name) {
    const w = this.worlds.get(name);
    return w && w.snapshot ? w.snapshot : null;
  }

  stats() {
    let snapshots = 0, bytes = 0;
    for (const w of this.worlds.values()) {
      if (w.snapshot) { snapshots++; bytes += w.snapshot.world.length; }
    }
    return { worlds: this.worlds.size, snapshots, snapshotBytes: bytes };
  }
}

/** Which spots nobody has taken. */
export function free(w) { return w.roles.filter((r) => !w.slots[r]); }

/** What a browser is allowed to know about a world: no devices, no snapshot. */
export function publicView(w) {
  return {
    name: w.name,
    emoji: worldEmoji(w.name),
    created: w.created,
    seen: w.seen,
    roles: w.roles.slice(),
    taken: w.roles.filter((r) => !!w.slots[r]),
    free: free(w),
    started: !!w.snapshot,
  };
}

function normalise(w) {
  return {
    name: String(w.name),
    created: Number(w.created) || Date.now(),
    seen: Number(w.seen) || Number(w.created) || Date.now(),
    roles: Array.isArray(w.roles) && w.roles.length ? w.roles.map(String) : DEFAULT_ROLES.slice(),
    slots: w.slots && typeof w.slots === 'object' ? w.slots : {},
    snapshot: w.snapshot && w.snapshot.world ? w.snapshot : null,
  };
}
