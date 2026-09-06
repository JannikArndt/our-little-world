// Persistence. The world is saved as it is; nothing decays while you are away
// and nothing is lost if you never come back.
//
// A save that this build cannot read is never simply dropped. It is kept
// aside under its own key, so a schema change that goes wrong costs a reload
// rather than the world. See `kept` below and "Recovering a world" in the
// README.

import { serialize, deserialize } from './world.js';

const KEY  = (room) => 'olw.world.' + room;
const KEPT = (room, schema) => 'olw.world.' + room + '.kept.' + schema;

function available() {
  try { const k = '__olw'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; }
  catch (e) { return false; }
}
const OK = typeof localStorage !== 'undefined' && available();

export function save(room, w) {
  if (!OK) return false;
  try { localStorage.setItem(KEY(room), serialize(w)); return true; }
  catch (e) { return false; }
}

export function load(room) {
  if (!OK) return null;
  let text = null;
  try { text = localStorage.getItem(KEY(room)); } catch (e) { return null; }
  if (!text) return null;

  const w = deserialize(text);
  if (w) return w;

  // Unreadable: too old for the migrations we have, or written by a newer
  // build. Put it somewhere safe before the fresh world saves over it.
  keepAside(room, text);
  return null;
}

/** Park a save we cannot read under its own key. Never overwrites an older one. */
function keepAside(room, text) {
  let schema = 'unknown';
  try { const n = JSON.parse(text).schema; if (typeof n === 'number') schema = String(n); }
  catch (e) { /* keep it as 'unknown' */ }
  const key = KEPT(room, schema);
  try {
    if (localStorage.getItem(key) !== null) return;   // the first one aside is the original
    localStorage.setItem(key, text);
  } catch (e) { /* out of room: losing the copy beats failing to start */ }
}

/** The saves of this room that were put aside, newest schema first. */
export function kept(room) {
  if (!OK) return [];
  const prefix = 'olw.world.' + room + '.kept.';
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf(prefix) === 0) out.push({ key, schema: key.slice(prefix.length) });
    }
  } catch (e) { return []; }
  return out.sort((a, b) => Number(b.schema) - Number(a.schema));
}

export function forget(room) {
  if (!OK) return;
  try { localStorage.removeItem(KEY(room)); } catch (e) { /* nothing to do */ }
}

export function rememberRole(role) {
  if (!OK) return;
  try { localStorage.setItem('olw.role', role); } catch (e) { /* ignore */ }
}
export function recallRole() {
  if (!OK) return null;
  try { return localStorage.getItem('olw.role'); } catch (e) { return null; }
}
