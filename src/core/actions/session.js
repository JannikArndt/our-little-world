// Housekeeping: the play block starting and ending, who is here, a notice put
// away, a welcome-back list read, and the map opening up.
//
// None of these is something a player decides to do in the world. They are the
// bookkeeping around a sitting, which is why they cost nothing and need nobody
// in particular.

import { rebuildBlocked } from '../grid.js';
import { byId, BLOCK_TICKS, cacheRegions } from '../world.js';
import { journal } from './kit.js';

export const session = {
  'block.start': {
    cap: null,
    minigame: null,
    costs: null,
    yields: null,
    tallies: [],
    journal: null,
    needs: null,
    twice: 'it sets the block up from scratch rather than adding to it',
    apply(w, a) {
      w.block.active = true;
      w.block.startTick = w.tick;
      w.block.length = a.length || BLOCK_TICKS;
      w.block.endedAt = null;
      w.journal = [];
      w.eventsThisBlock = 0;
      w.eventsSeen = [];
      w.lastEventTick = w.tick;
      w.day = a.newDay ? w.day + 1 : w.day;
      // morning: everybody steps out of their door, a few seconds apart, so
      // the village wakes up rather than appearing all at once
      let n = 0;
      for (const v of w.villagers) {
        if (!v.inside) continue;
        const b = byId(w.buildings, v.homeId);
        v.inside = false;
        v.path = [];
        v.task = null;
        v.wait = 6 + n++ * 9;
        if (b) {
          v.x = b.door.x + 0.5;
          v.y = b.door.y + 0.9;
        }
      }
      return true;
    },
  },

  'block.end': {
    cap: null,
    minigame: null,
    costs: null,
    yields: null,
    tallies: [],
    journal: null,
    needs: null,
    twice: 'an ended block is not active, so the second one is refused',
    apply(w) {
      if (!w.block.active) return false;
      w.block.active = false;
      w.block.endedAt = w.tick;
      return true;
    },
  },

  presence: {
    cap: null,
    minigame: null,
    costs: null,
    yields: null,
    tallies: [],
    journal: null,
    needs: null,
    twice: 'it sets what somebody is up to rather than adding to it',
    apply(w, a) {
      const p = w.players[a.role];
      if (!p) return false;
      p.busy = a.busy || null;
      p.seen = w.tick;
      return true;
    },
  },

  'notice.dismiss': {
    cap: null,
    minigame: null,
    costs: null,
    yields: null,
    tallies: [],
    journal: null,
    needs: null,
    twice: 'the notice is already gone, and filtering an absent one changes nothing',
    apply(w, a) {
      w.notices = w.notices.filter(n => n.id !== a.id);
      return true;
    },
  },

  /** The welcome-back screen has been read: empty that seat's list. */
  seen: {
    cap: null,
    minigame: null,
    costs: null,
    yields: null,
    tallies: [],
    journal: null,
    needs: null,
    twice: 'an empty list has nothing left to clear, which is a no',
    apply(w, a) {
      const list = w.ext.since?.[a.role];
      if (!list || !list.length) return false;
      w.ext.since[a.role] = [];
      return true;
    },
  },

  /** The hills stop being a rumour. */
  'region.open': {
    cap: null,
    minigame: null,
    costs: null,
    yields: null,
    tallies: [],
    journal: 'j.region',
    needs: null,
    twice: 'only a region that is still "later" can open',
    apply(w, a) {
      if (!w.regions || w.regions[a.id] !== 'later') return false;
      w.regions[a.id] = 'open';
      cacheRegions(w);
      rebuildBlocked(w);
      for (const v of w.villagers) v.path = [];
      for (const sh of w.sheep) sh.path = [];
      journal(w, '🗺️', 'j.region', { id: a.id });
      return true;
    },
  },
};
