// Persistence. The world is saved as it is; nothing decays while you are away
// and nothing is lost if you never come back.
//
// This device also remembers which worlds it belongs to and which role it
// plays in each, so that coming back a fortnight later is one tap and not a
// conversation about what the world was called.

import { serialize, deserialize } from './world.js';

const KEY = (room) => 'olw.world.' + room;

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
  try {
    const text = localStorage.getItem(KEY(room));
    return text ? deserialize(text) : null;
  } catch (e) { return null; }
}

export function forget(room) {
  if (!OK) return;
  try { localStorage.removeItem(KEY(room)); } catch (e) { /* nothing to do */ }
}


/* ------------------------------------------------------------------ */
/* which worlds this device belongs to                                */
/* ------------------------------------------------------------------ */

const WORLDS_KEY = 'olw.worlds';
const DEVICE_KEY = 'olw.device';
const KEEP_WORLDS = 8;

/**
 * A name this browser made up for itself, so the server can hand it back the
 * same spot next time. It is not a login: it says "this iPad again", nothing
 * more, and clearing the browser simply loses it.
 */
export function deviceId() {
  if (!OK) return 'anon';
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = 'd' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (e) { return 'anon'; }
}

/** The worlds this device has played in, the most recent first. */
export function recentWorlds() {
  if (!OK) return [];
  try {
    const list = JSON.parse(localStorage.getItem(WORLDS_KEY) || '[]');
    if (!Array.isArray(list)) return [];
    return list.filter(w => w && typeof w.name === 'string').slice(0, KEEP_WORLDS);
  } catch (e) { return []; }
}

/** Put a world at the top of that list, with the role we play in it. */
export function rememberWorld(name, role) {
  if (!OK || !name) return;
  const list = recentWorlds().filter(w => w.name !== name);
  list.unshift({ name, role: role || null, at: Date.now() });
  try { localStorage.setItem(WORLDS_KEY, JSON.stringify(list.slice(0, KEEP_WORLDS))); } catch (e) { /* fine */ }
}

export function forgetWorld(name) {
  if (!OK) return;
  const list = recentWorlds().filter(w => w.name !== name);
  try { localStorage.setItem(WORLDS_KEY, JSON.stringify(list)); } catch (e) { /* fine */ }
  forget(name);
}
