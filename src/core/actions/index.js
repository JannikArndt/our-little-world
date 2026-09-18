// Every change to the world happens here, as a named action.
//
// applyAction() is pure with respect to time: given the same world and the same
// action it always produces the same result. That is what lets two browsers
// share one world, and what lets the tests be meaningful.
//
// ACTIONS is the whole list, in groups, and each row says the same few things
// about itself: who may do it, what it costs, what it gives back, which of the
// counts in `done` it adds to, which mini-game stands in the way, and — the one
// that matters most — why applying it twice is safe.
//
// **That last line is law 12.** A guest applies its own actions at once so the
// game feels instant, and the host is still the authority, so an action can
// arrive twice in the race window. Every row here holds `twice`: the sentence
// saying why the second one changes nothing. If you add an action and cannot
// write that sentence, the action is wrong, not the field.
//
// `cap` is what the world's rules *mean*, not what the reducer enforces: the
// gate that stops a Keeper felling a tree is in src/ui/interact.js, and moving
// it in here would change what a guest is allowed to apply optimistically.
// tests/actions.test.mjs checks the two agree.

import { forest } from './forest.js';
import { workshop } from './workshop.js';
import { crossing } from './crossing.js';
import { home } from './home.js';
import { projects } from './projects.js';
import { field } from './field.js';
import { animals } from './animals.js';
import { people } from './people.js';
import { sharing } from './sharing.js';
import { session } from './session.js';
import { happenings } from './happenings.js';
import { withActing } from './kit.js';

/** Which file each group is in, so anything reading this list can say where. */
export const GROUPS = {
  forest: { file: 'src/core/actions/forest.js', rows: forest },
  workshop: { file: 'src/core/actions/workshop.js', rows: workshop },
  crossing: { file: 'src/core/actions/crossing.js', rows: crossing },
  home: { file: 'src/core/actions/home.js', rows: home },
  projects: { file: 'src/core/actions/projects.js', rows: projects },
  field: { file: 'src/core/actions/field.js', rows: field },
  animals: { file: 'src/core/actions/animals.js', rows: animals },
  people: { file: 'src/core/actions/people.js', rows: people },
  sharing: { file: 'src/core/actions/sharing.js', rows: sharing },
  session: { file: 'src/core/actions/session.js', rows: session },
  happenings: { file: 'src/core/actions/happenings.js', rows: happenings },
};

/**
 * Every action there is, by name. Assembled from the groups rather than written
 * out again, so a new action is one row in one group file and nothing here.
 */
export const ACTIONS = {};
for (const group in GROUPS) {
  const { file, rows } = GROUPS[group];
  for (const type in rows) ACTIONS[type] = { type, group, file, ...rows[type] };
}

/** The one way the world ever changes. Returns false when the world says no. */
export function applyAction(w, a) {
  return withActing(a.role || a.from || null, () => dispatch(w, a));
}

function dispatch(w, a) {
  const row = ACTIONS[a.type];
  if (!row) return false;
  // An older name for something that is now one action among many: rewrite it
  // and go again. The role is already stashed, so nothing is credited twice.
  if (row.aliasOf) return dispatch(w, { type: row.aliasOf, ...row.as(a) });
  return row.apply(w, a);
}

// The helpers that live with the actions because they are how an action says
// what happened. The simulation and the mini-games use them too.
export { addSinceAll, canPay, clearAct, fx, iconOf, journal, note, setAct } from './kit.js';
export { EVENTS } from './happenings.js';
