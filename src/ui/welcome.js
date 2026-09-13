// The welcome-back screen (law 10). It says what the other player did while
// you were away — facts, never a message — and it is not a summons: it shows
// itself once, on the way into a world that has something to tell, and one
// tap puts it away for good. It is not reachable again during play.

import { el, openPanel } from './overlay.js';
import { tr } from '../core/i18n.js';
import { resName } from '../core/world.js';

/**
 * One entry, in whichever language is being played. Entries are stored as a
 * key plus values, never a finished sentence (law 14's reasoning again), so a
 * `res` value — a resource key like `wool` — is turned into its name before
 * the sentence is built, rather than shown raw.
 */
function line(entry) {
  const vars = entry.vars ? Object.assign({}, entry.vars) : null;
  if (vars?.res) vars.res = resName(vars.res);
  return tr(entry.key, vars);
}

/**
 * `since` is `w.ext.since[role]` — capped, oldest first, and never touched by
 * showing it. Only the button does that, by dispatching `seen`, so a panel
 * that never gets closed costs nobody a fact.
 */
export function showWelcomeBack(game, since) {
  const p = openPanel({ title: tr('since.title') });
  for (const entry of since)
    p.body.appendChild(el('p', 'log-line', entry.icon + ' ' + line(entry)));
  const r = p.row();
  r.appendChild(
    p.button(tr('since.button'), 'go', () => {
      p.close();
      game.dispatch({ type: 'seen', role: game.role });
    }),
  );
  return p;
}
