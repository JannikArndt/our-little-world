// Persistence. The world is saved as it is; nothing decays while you are away
// and nothing is lost if you never come back.

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
    if (!text) return null;
    const w = deserialize(text);
    // A world we cannot read is a world somebody else's newer browser saved.
    // Put it aside rather than letting the next checkpoint write over it.
    if (!w) { try { localStorage.setItem(KEY(room) + '.kept', text); } catch (e) { /* full, never mind */ } }
    return w;
  } catch (e) { return null; }
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
