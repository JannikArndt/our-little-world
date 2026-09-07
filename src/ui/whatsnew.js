// What has changed, wherever somebody asks for it: from the start screen, and
// from the 📜 history once you are in the world. One panel, two ways in.

import { el, openPanel } from './overlay.js';
import { tr, currentLang } from '../core/i18n.js';
import { changelog, VERSION } from '../core/changelog.js';

export { VERSION };

/** `onClose` puts back whatever the changelog was opened from. */
export function showChangelog(onClose) {
  const p = openPanel({ title: tr('log.title'), lead: tr('log.lead') });
  for (const e of changelog(currentLang())) {
    const head = el('div', 'log-v');
    head.appendChild(el('b', '', 'v' + e.v));
    head.appendChild(el('span', 'log-date', e.date));
    p.body.appendChild(head);
    for (const line of e.lines) p.body.appendChild(el('p', 'log-line', line));
  }
  const r = p.row();
  r.appendChild(p.button(tr('ui.close'), 'soft', () => { p.close(); if (onClose) onClose(); }));
  return p;
}
