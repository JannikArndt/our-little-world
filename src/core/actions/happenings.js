// Things the world does rather than a player: a storm over the crossing, a new
// family arriving, a deer wandering through, a week of good weather.
//
// Law 6 and law 9 both bear on these. A storm is the only unkind one and it is
// fixable the same afternoon with one plank; the rest only ever add. None of
// them ever happens while nobody is watching — events.js raises them during a
// play block, and `catchUp` never does.

import { rebuildBlocked } from '../grid.js';
import { addBuilding, newId } from '../world.js';
import { newFamilySite } from '../content.js';
import { fx, journal, note } from './kit.js';
import { bridgeMid } from './crossing.js';

export const EVENTS = {
  /** The one unkind thing in the game, and it is one plank to put right. */
  storm: {
    icon: '💨',
    notice: 'notice.bridgeBroken',
    raises: 'bridge_broken',
    apply(w) {
      if (!w.bridge.built || w.bridge.damaged) return false;
      w.bridge.damaged = true;
      rebuildBlocked(w);
      for (const v of w.villagers) v.path = [];
      for (const sh of w.sheep) sh.path = [];
      const [mx] = bridgeMid(w);
      fx(w, 'crack', mx, w.bridge.site.row + 0.6);
      note(w, 'bridge_broken', '💨', 'notice.bridgeBroken', null, 'ask');
      return true;
    },
  },

  /** Somebody new marks out a plot. Where it goes is the scenario's business. */
  newfamily: {
    icon: '👨‍👩‍👧',
    notice: 'notice.newFamily',
    raises: 'newfamily',
    apply(w) {
      const plot = newFamilySite(w);
      if (!plot) return false;
      if (w.buildings.some(b => b.id === plot.key)) return false;
      const b = addBuilding(w, {
        id: plot.key,
        type: 'site',
        x: plot.x,
        y: plot.y,
        w: plot.w,
        h: plot.h,
        state: 'site',
        name: plot.name,
      });
      b.newFamily = true;
      note(w, 'newfamily', '👨‍👩‍👧', 'notice.newFamily', null, 'ask');
      journal(w, '👨‍👩‍👧', 'j.family');
      return true;
    },
  },

  critter: {
    icon: '🦌',
    notice: 'notice.critter',
    raises: 'critter',
    apply(w, a) {
      w.visitors = w.visitors || [];
      if (w.visitors.length) return false;
      w.visitors.push({
        id: newId('cr'),
        kind: a.kind || 'deer',
        x: 2.5,
        y: 9.5,
        path: [],
        wait: 0,
        life: 1400,
      });
      note(w, 'critter', '🦌', 'notice.critter', null, 'calm');
      journal(w, '🦌', 'j.deer');
      return true;
    },
  },

  goodharvest: {
    icon: '☀️',
    notice: 'notice.goodHarvest',
    raises: 'goodharvest',
    apply(w) {
      let n = 0;
      for (const p of w.plots)
        if (p.state === 'growing' && p.growth > 30) {
          p.growth = Math.min(100, p.growth + 25);
          n++;
        }
      if (!n) return false;
      note(w, 'goodharvest', '☀️', 'notice.goodHarvest', null, 'calm');
      return true;
    },
  },
};

export const happenings = {
  /** Emitted by events.js, replayed identically on the other screen. */
  'world.event': {
    cap: null,
    minigame: null,
    costs: null,
    yields: null,
    tallies: [],
    journal: null,
    needs: null,
    twice: 'each event refuses when what it would add is already there',
    apply(w, a) {
      const ev = EVENTS[a.event];
      return ev ? ev.apply(w, a) : false;
    },
  },
};
