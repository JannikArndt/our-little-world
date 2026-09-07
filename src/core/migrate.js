// Bringing an old world up to date. A saved world is never thrown away.
//
// Two mechanisms, and the second is the one that does most of the work:
//
//   1. MIGRATIONS — one numbered step per shape change. A step takes a world
//      from version n to version n+1 and only has to deal with what actually
//      changed meaning. Bump SCHEMA in the same commit as the step.
//   2. ensureWorld() — runs on every load, whatever the version, and fills in
//      anything the world is missing: new fields with their defaults, new
//      entities from the content tables, new containers. Anything purely
//      additive belongs here and needs no version bump at all.
//
// The only world that is refused is one saved by a *newer* build than this one,
// because we cannot know what it means.

import { scenarioOf, DEFAULT_SCENARIO } from './content.js';

/** version n -> n + 1. Keep them small, and never delete one. */
export const MIGRATIONS = {
  // 6 -> 7: children moved into the village. The houses they live in were
  // built for the grown-ups, so make room for them; ensureWorld puts the
  // children themselves in.
  6(w) {
    const houses = w.buildings.filter(b => b.type === 'house' && b.state === 'built');
    const scen = scenarioOf(w);
    for (let i = 0; i < scen.houses.length && i < houses.length; i++) {
      if ((houses[i].beds || 0) < scen.houses[i].beds) houses[i].beds = scen.houses[i].beds;
    }
  },
};

/**
 * Walk a world up to the current shape. Returns the world, or null if it came
 * from a newer build or from nowhere we understand.
 */
export function runMigrations(w, schema) {
  if (!w || typeof w.schema !== 'number') return null;
  if (w.schema > schema) return null;              // saved by a newer version
  let guard = 64;
  while (w.schema < schema && guard-- > 0) {
    const step = MIGRATIONS[w.schema];
    if (step) step(w);
    w.schema++;
  }
  return w.schema === schema ? w : null;
}
