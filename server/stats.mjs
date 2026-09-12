// How much this gets played, and how far people get — counted, and nothing else.
//
// Two questions worth being able to answer: does anybody play this, and how far
// do they get before they stop. Neither of them needs to know anything about
// anybody, so neither of them is told anything about anybody. That is why the
// answer can simply be public: there is nothing in it to protect.
//
//   counted      worlds, spots taken, minutes played, the day a world reached,
//                what got built, what got done
//   not counted  no addresses, no device ids, no world names, no times of day.
//                A world that is forgotten leaves its numbers behind, and its
//                name is not among them.
//
// Two shapes do the work. The ledger holds one small row per calendar day and
// lives for ever, because it is a handful of integers. Each world carries its
// own `active` (which days it has already been counted on, so a world is not
// counted twice on the same day) and `far` (the furthest it ever got), and when
// a world is forgotten the second of those is folded into the ledger's
// histograms — the only thing that outlives the world itself.

import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECTS } from '../src/core/content.js';

const KEEP_DAYS = 500; // daily rows kept: well over a year, a few KB
const ACTIVE_DAYS = 40; // days remembered per world; it only lives for 14
const TICKS_PER_MIN = 600; // 100 ms a tick
const DAY_CAP = 30; // days-reached histogram: 30 and then "30+"
const MIN_BUCKETS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];

// A project added to the table is a milestone from then on, without a line
// changing here. The workshop and the mill are not: the village starts with
// them, and something everybody has is not something anybody reached.
const PROJECT_TYPES = Object.keys(PROJECTS).map(k => PROJECTS[k].type);

/** The calendar day (UTC) a moment falls in. Nothing finer is ever kept. */
export function dayKey(t) {
  return new Date(t).toISOString().slice(0, 10);
}

export class Stats {
  /**
   * dir   where stats.json goes (null keeps the ledger in memory)
   * now   injectable clock, for the tests
   */
  constructor(opts) {
    const o = opts || {};
    this.file = o.dir ? join(o.dir, 'stats.json') : null;
    this.now = o.now || (() => Date.now());
    this.ledger = emptyLedger();
    this.dirty = false;
  }

  /* ---------------- disk ---------------- */

  async load() {
    if (!this.file) return this;
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8'));
      if (raw && raw.days) this.ledger = normalise(raw);
    } catch {
      /* no ledger yet, or half a ledger: start counting again */
    }
    return this;
  }

  async flush() {
    if (!this.file || !this.dirty) return;
    this.dirty = false;
    const tmp = this.file + '.' + process.pid + '.tmp';
    try {
      await writeFile(tmp, JSON.stringify(this.ledger));
      await rename(tmp, this.file);
    } catch (e) {
      // the same read-only disk the worlds cope with. Counting is the least
      // important thing here, so it fails quietly and the game carries on.
      await unlink(tmp).catch(() => {});
      if (!this.warned) {
        this.warned = true;
        console.warn('stats: cannot write ' + this.file + ' (' + e.code + ')');
      }
    }
  }

  /* ---------------- while people are playing ---------------- */

  /** A world was just started. */
  started() {
    row(this.ledger, dayKey(this.now())).started++;
    this.dirty = true;
  }

  /**
   * Somebody was in this world today. Counted once per world per day, and once
   * per spot per day — which is the closest thing to "people" that exists here
   * without knowing who anybody is.
   */
  mark(w, role) {
    const k = dayKey(this.now());
    if (!w.active) w.active = {};
    const r = row(this.ledger, k);
    if (w.active[k] === undefined) {
      w.active[k] = '';
      r.played++;
    }
    if (role && w.active[k].indexOf(role) < 0) {
      w.active[k] += role;
      r.spots++;
    }
    trim(w.active, ACTIVE_DAYS);
    trim(this.ledger.days, KEEP_DAYS);
    this.dirty = true;
  }

  /**
   * A snapshot arrived, so we know how far this world has got. The world's own
   * clock is the honest measure of time played: the difference since the last
   * snapshot is time that passed today.
   */
  learn(w, world) {
    if (!world || typeof world !== 'object') return;
    const far = w.far || (w.far = { day: 0, tick: 0, marks: {}, done: {} });
    const tick = num(world.tick);
    if (tick > far.tick) {
      row(this.ledger, dayKey(this.now())).ticks += tick - far.tick;
      far.tick = tick;
    }
    if (num(world.day) > far.day) far.day = num(world.day);
    const m = marksOf(world);
    for (const k in m) far.marks[k] = 1;
    // a world that was started over keeps its old deeds: they still happened
    far.done = mergeMax(far.done, deedsOf(world));
    this.dirty = true;
  }

  /** This world is being forgotten. Its numbers stay; its name does not. */
  fold(w) {
    const far = w.far;
    if (!far || (!far.day && !far.tick)) return;
    const g = this.ledger.gone;
    g.worlds++;
    bump(g.days, far.day > DAY_CAP ? DAY_CAP + '+' : String(far.day || 1));
    bump(g.minutes, minuteBucket(far.tick / TICKS_PER_MIN));
    for (const k in far.marks) bump(g.marks, k);
    for (const k in far.done) bump(g.deeds, k, far.done[k]);
    this.dirty = true;
  }

  /* ---------------- the answer ---------------- */

  /**
   * Everything the ledger knows, plus everything the worlds that still exist
   * know, added together. A world is in exactly one of the two, so nothing is
   * counted twice.
   *
   * worlds  the live ones, as the directory holds them
   * live    optional: how many rooms have somebody in them right now
   */
  report(worlds, live) {
    const today = dayKey(this.now());
    const days = [];
    const keys = Object.keys(this.ledger.days).sort();
    for (const k of keys.slice(-90)) {
      const r = this.ledger.days[k];
      days.push({
        d: k,
        started: r.started,
        played: r.played,
        spots: r.spots,
        minutes: Math.round(r.ticks / TICKS_PER_MIN),
      });
    }

    const week = { started: 0, played: 0, spots: 0, minutes: 0 };
    const since = dayKey(this.now() - 6 * 86400000);
    for (const d of days) {
      if (d.d < since) continue;
      week.started += d.started;
      week.played += d.played;
      week.spots += d.spots;
      week.minutes += d.minutes;
    }

    // how far worlds got: the ones already forgotten, and the ones still here
    const far = {
      worlds: this.ledger.gone.worlds,
      days: copy(this.ledger.gone.days),
      minutes: copy(this.ledger.gone.minutes),
    };
    const marks = copy(this.ledger.gone.marks);
    const deeds = copy(this.ledger.gone.deeds);
    let openSpots = 0,
      alive = 0;
    for (const w of worlds || []) {
      alive++;
      openSpots += w.roles.filter(r => !w.slots[r]).length;
      const f = w.far;
      if (!f || (!f.day && !f.tick)) continue;
      far.worlds++;
      bump(far.days, f.day > DAY_CAP ? DAY_CAP + '+' : String(f.day || 1));
      bump(far.minutes, minuteBucket(f.tick / TICKS_PER_MIN));
      for (const k in f.marks) bump(marks, k);
      for (const k in f.done) bump(deeds, k, f.done[k]);
    }

    return {
      generated: today,
      now: {
        worlds: alive,
        openSpots,
        playingNow: live === undefined || live === null ? null : live,
      },
      week,
      days,
      howFar: {
        worlds: far.worlds,
        medianDays: median(far.days),
        medianMinutes: median(far.minutes),
        days: far.days,
        minutes: far.minutes,
      },
      milestones: marks,
      deeds,
      about: {
        counts: 'worlds and spots, never people. A spot is one role in one world on one day.',
        keeps: 'no addresses, no device ids, no world names, no times of day.',
      },
    };
  }
}

/* ---------------- what a snapshot says ---------------- */

/** The things worth knowing a world reached, read off the world itself. */
export function marksOf(w) {
  const m = {};
  if (w.bridge && w.bridge.built) m.bridge = 1;
  const bs = Array.isArray(w.buildings) ? w.buildings : [];
  for (const b of bs) {
    if (b.state !== 'built') continue;
    // a house somebody put up carries the tick it went up on, which can be
    // tick zero on the first morning; the ones the village started with have
    // no such field at all
    if (b.type === 'house') {
      if (b.builtTick !== undefined) m.house = 1;
    } else if (PROJECT_TYPES.indexOf(b.type) >= 0) m[b.type] = 1;
  }
  const vs = Array.isArray(w.villagers) ? w.villagers : [];
  if (vs.length && vs.every(v => !!v.homeId)) m.housed = 1;
  return m;
}

/** What the players have actually done, both sides of the table together. */
export function deedsOf(w) {
  const out = {};
  const ps = w.players && typeof w.players === 'object' ? w.players : {};
  for (const r in ps) {
    const done = ps[r] && ps[r].done;
    for (const k in done || {}) out[k] = (out[k] || 0) + num(done[k]);
  }
  return out;
}

/* ---------------- small things ---------------- */

function emptyLedger() {
  return { v: 1, days: {}, gone: { worlds: 0, days: {}, minutes: {}, marks: {}, deeds: {} } };
}

function normalise(raw) {
  const l = emptyLedger();
  for (const k in raw.days || {}) {
    const r = raw.days[k];
    l.days[k] = {
      started: num(r.started),
      played: num(r.played),
      spots: num(r.spots),
      ticks: num(r.ticks),
    };
  }
  const g = raw.gone || {};
  l.gone.worlds = num(g.worlds);
  for (const part of ['days', 'minutes', 'marks', 'deeds'])
    for (const k in g[part] || {}) l.gone[part][String(k)] = num(g[part][k]);
  return l;
}

function row(l, k) {
  if (!l.days[k]) l.days[k] = { started: 0, played: 0, spots: 0, ticks: 0 };
  return l.days[k];
}

function bump(o, k, by) {
  o[k] = (o[k] || 0) + (by === undefined ? 1 : by);
}
function copy(o) {
  const out = {};
  for (const k in o) out[k] = o[k];
  return out;
}
function num(n) {
  n = Number(n);
  return isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function mergeMax(a, b) {
  const out = a || {};
  for (const k in b) if (!(k in out) || b[k] > out[k]) out[k] = b[k];
  return out;
}

/** Keep the newest n keys of a date-keyed object. */
function trim(o, n) {
  const keys = Object.keys(o);
  if (keys.length <= n) return;
  keys.sort();
  for (const k of keys.slice(0, keys.length - n)) delete o[k];
}

function minuteBucket(mins) {
  let last = MIN_BUCKETS[0];
  for (const b of MIN_BUCKETS) {
    if (mins < b) break;
    last = b;
  }
  const next = MIN_BUCKETS[MIN_BUCKETS.indexOf(last) + 1];
  return next === undefined ? last + '+' : last + '-' + (next - 1);
}

/** The middle of a histogram whose keys are numbers or "n+" / "a-b" ranges. */
function median(hist) {
  const keys = Object.keys(hist).sort(byLow);
  let total = 0;
  for (const k of keys) total += hist[k];
  if (!total) return 0;
  let seen = 0;
  for (const k of keys) {
    seen += hist[k];
    if (seen * 2 >= total) return low(k);
  }
  return 0;
}

function low(k) {
  return parseInt(String(k), 10) || 0;
}
function byLow(a, b) {
  return low(a) - low(b);
}
