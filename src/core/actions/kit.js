// The small things every action needs: how to pay for something, how to make a
// number float up, how to write a line in the journal, and who to credit it to.
//
// These used to live at the top of one long file with the actions themselves.
// They are here now so that each group of actions can be read on its own
// without the helpers scrolling past first — and so there is exactly one place
// that knows about `actingRole`, which is the trickiest of them.

import { inBounds, walkable } from '../grid.js';
import { newId, RESOURCES } from '../world.js';
import { findPath } from '../pathfind.js';
import { rndInt } from '../rng.js';

export function fx(w, kind, x, y, text, colour) {
  w.fx = w.fx || [];
  if (w.fx.length > 40) w.fx.shift();
  w.fx.push({
    kind,
    x,
    y,
    text: text || '',
    colour: colour || null,
    born: w.tick,
    id: newId('fx'),
  });
}

/**
 * Notices and the journal are stored as a key plus values, never as a finished
 * sentence, so each player reads them in their own language.
 */
export function note(w, id, icon, key, vars, kind) {
  if (w.notices.some(n => n.id === id)) return;
  if (w.notices.length > 3) w.notices.shift();
  w.notices.push({ id, icon, key, vars: vars || null, kind: kind || 'calm', born: w.tick });
}

export function journal(w, icon, key, vars) {
  w.journal.push({ icon, key, vars: vars || null, tick: w.tick });
  if (w.journal.length > 40) w.journal.shift();
  addSince(w, icon, key, vars);
}

const SINCE_CAP = 12; // the anti-list: nothing grows the more you play

// Whichever role is behind the action being applied right now, so journal()
// — called deep inside an action — knows who to credit without every one of
// its call sites having to say so itself. Set by withActing() below and read
// from nowhere else.
let actingRole = null;

/**
 * Run something as a role, and put back exactly what was found rather than
 * simply clearing it: a boat is a project.build underneath, so these nest. And
 * between actions the village journals things of its own — somebody moving
 * into a house — which belong to nobody and must not be credited to whoever
 * happened to act last.
 */
export function withActing(role, fn) {
  const wasActing = actingRole;
  actingRole = role;
  try {
    return fn();
  } finally {
    actingRole = wasActing;
  }
}

/**
 * The welcome-back screen's own memory (law 10). The journal is cleared every
 * in-game day, so it cannot tell somebody what happened while they were away —
 * this can, because it lives in `w.ext` and nobody empties it but the `seen`
 * action. `actingRole` says whose doing this was; a fact with nobody behind it
 * (the simulation, not a player) goes on nobody's list, and a role never gets
 * told about its own doing.
 */
function addSince(w, icon, key, vars) {
  if (!actingRole) return;
  for (const role in w.players) {
    if (role === actingRole) continue;
    pushSince(w, role, { icon, key, vars: vars || null, by: actingRole, tick: w.tick });
  }
}

/**
 * The same list, for something nobody did. The village gets on with things
 * while both of you are away (law 9), and there is no seat to credit it to —
 * so it goes on everybody's list rather than nobody's, which is what
 * `addSince` would do with `actingRole` empty.
 */
export function addSinceAll(w, icon, key, vars) {
  for (const role in w.players)
    pushSince(w, role, { icon, key, vars: vars || null, by: null, tick: w.tick });
}

function pushSince(w, role, entry) {
  if (!w.ext.since || typeof w.ext.since !== 'object') w.ext.since = {};
  if (!Array.isArray(w.ext.since[role])) w.ext.since[role] = [];
  const list = w.ext.since[role];
  list.push(entry);
  if (list.length > SINCE_CAP) list.shift();
}

/**
 * What a villager is up to right now, purely for the telling — a dance, a
 * chat, an answer to a tap. `until` is the tick it wears off; `with` names
 * the other villager for the two-person ones. Additive, so an older saved
 * world just has none of these yet.
 */
export function setAct(w, v, kind, ticks, withId) {
  v.act = { kind, until: w.tick + ticks, with: withId || null };
  return v.act;
}
export function clearAct(v) {
  v.act = null;
}

/** A few tiles off, wherever the ground allows it. Used to send someone shy scurrying away. */
export function trotAway(w, v, tiles) {
  const sx = Math.floor(v.x),
    sy = Math.floor(v.y);
  for (let i = 0; i < 10; i++) {
    const x = sx + rndInt(w, tiles * 2 + 1) - tiles;
    const y = sy + rndInt(w, tiles * 2 + 1) - tiles;
    if (!inBounds(x, y) || !walkable(w, x, y)) continue;
    const p = findPath(w, sx, sy, x, y);
    if (p?.length) {
      v.path = p;
      return true;
    }
  }
  return false;
}

export function pay(w, role, cost) {
  const res = w.players[role].res;
  for (const k in cost) if ((res[k] || 0) < cost[k]) return false;
  for (const k in cost) res[k] -= cost[k];
  return true;
}
export function canPay(w, role, cost) {
  const res = w.players[role].res;
  for (const k in cost) if ((res[k] || 0) < cost[k]) return false;
  return true;
}
export function gain(w, role, key, n) {
  w.players[role].res[key] = (w.players[role].res[key] || 0) + n;
}

/** The picture for a resource, for the little number that floats up. */
export function iconOf(key) {
  return (RESOURCES.find(r => r.key === key) || {}).icon || '';
}

/**
 * A running count of what somebody has actually done. It teaches — two of a
 * thing and you can show the other player how — and it is also the tally the
 * role's own menu reads back to them at the end of a long afternoon. Sowing
 * and reaping are both farming, so they add to `farm` *and* to a name of their
 * own; nothing here ever resets.
 */
export function tally(w, role, what) {
  const d = w.players[role].done;
  d[what] = (d[what] || 0) + 1;
}
