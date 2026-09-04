// Emergent problems. Not a mission list: these only fire when the world is
// already in a state where they make sense, they are spaced far apart, and
// they stop entirely near the end of a play block so the world can settle.

import { rnd, rndInt } from './rng.js';
import { blockProgress } from './world.js';

const QUIET_AFTER = 0.72;      // no new problems in the last quarter of a block
const WARMUP       = 0.10;
const GAP_TICKS    = 520;      // at least ~52 s between events
const MAX_PER_BLOCK = 3;

export function maybeEvent(w) {
  if (!w.block.active) return null;
  const p = blockProgress(w);
  if (p < WARMUP || p > QUIET_AFTER) return null;
  if (w.tick - (w.lastEventTick || 0) < GAP_TICKS) return null;
  if ((w.eventsThisBlock || 0) >= MAX_PER_BLOCK) return null;

  const options = [];

  // the wind picks at a bridge that was built in a hurry
  if (w.bridge.built && !w.bridge.damaged && w.bridge.quality < 3)
    options.push({ event: 'storm', weight: 3 });

  // word gets around that there are houses being built here
  if (w.journal.some(j => j.icon === '🏠') && !w.buildings.some(b => b.id === 'site_east'))
    options.push({ event: 'newfamily', weight: 4 });

  // something wanders out of the forest
  if (!(w.visitors && w.visitors.length) && w.trees.some(t => t.state === 'stump'))
    options.push({ event: 'critter', weight: 3 });

  // a good growing night
  if (w.plots.filter(pl => pl.state === 'growing' && pl.growth > 30).length >= 2)
    options.push({ event: 'goodharvest', weight: 2 });

  if (!options.length) return null;
  if (rnd(w) > 0.55) return null;             // most checks pass quietly

  let total = 0; for (const o of options) total += o.weight;
  let r = rnd(w) * total;
  let chosen = options[0];
  for (const o of options) { r -= o.weight; if (r <= 0) { chosen = o; break; } }

  w.lastEventTick = w.tick;
  w.eventsThisBlock = (w.eventsThisBlock || 0) + 1;
  return { type: 'world.event', event: chosen.event };
}

export function resetEventBudget(w) {
  w.eventsThisBlock = 0;
  w.lastEventTick = w.tick;
}

/** What the world would like to say at the end of a block. One loose thread. */
export function nextTimeHint(w) {
  const growing = w.plots.filter(p => p.state === 'growing').length;
  const ripe = w.plots.filter(p => p.state === 'ripe').length;
  const noBed = w.villagers.filter(v => !v.homeId).length;
  const sites = w.buildings.filter(b => b.state === 'site').length;
  const woolly = w.sheep.filter(s => s.fluff > 70).length;

  if (ripe) return { icon: '🌾', text: 'The wheat is still standing in the field, waiting to be cut.' };
  if (growing) return { icon: '🌱', text: 'The wheat will be taller next time.' };
  if (noBed) return { icon: '🛏️', text: 'Somebody is still sleeping by the fire.' };
  if (!w.bridge.built) return { icon: '🌉', text: 'The river is still uncrossed.' };
  if (sites) return { icon: '📐', text: 'There is still a plot marked out and empty.' };
  if (woolly) return { icon: '🧶', text: 'The sheep are getting woolly again.' };
  return { icon: '🌤️', text: 'The little world will be here, just like this.' };
}
