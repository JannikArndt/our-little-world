// Two languages, chosen once and remembered.
//
// Anything the world stores and sends to the other player — notices, the
// journal, what a villager is saying — is kept as a key plus values, never as
// a finished sentence. That way a parent playing in English and a child
// playing in German each read their own language in the same world.

import { en } from '../i18n/en.js';
import { de } from '../i18n/de.js';

const TABLES = { en, de };
export const LANGUAGES = [
  { id: 'en', name: 'English', flag: '🇬🇧' },
  { id: 'de', name: 'Deutsch', flag: '🇩🇪' },
];

let lang = 'en';

export function currentLang() { return lang; }

export function setLang(l) {
  lang = TABLES[l] ? l : 'en';
  try { localStorage.setItem('olw.lang', lang); } catch (e) { /* fine */ }
  return lang;
}

/** Remembered choice, otherwise whatever the device is set to. */
export function detectLang() {
  let saved = null;
  try { saved = localStorage.getItem('olw.lang'); } catch (e) { /* fine */ }
  if (saved && TABLES[saved]) return setLang(saved);
  const nav = (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) || 'en';
  return setLang(nav.toLowerCase().indexOf('de') === 0 ? 'de' : 'en');
}

function fill(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

/** tr('house.title') — falls back to English, then to the key itself. */
export function tr(key, vars) {
  const table = TABLES[lang] || en;
  let text = table[key];
  if (text == null) text = en[key];
  if (text == null) return key;
  return fill(text, vars);
}

/** Plurals: looks for key_one / key_other. German and English both need it. */
export function trn(key, n, vars) {
  const v = Object.assign({ n: n }, vars || {});
  return tr(key + (n === 1 ? '_one' : '_other'), v);
}

/** For a stored {key, vars} pair. */
export function tk(o) { return o && o.key ? tr(o.key, o.vars) : (o && o.text) || ''; }
