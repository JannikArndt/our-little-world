// Passing things across the table: to the other player, into the bread basket
// everybody eats from, or off the pile by the workshop door.
//
// Law 7 lives here. The cost of things is split across the roles on purpose, so
// these three are how a village gets anything done at all.

import { isDusk, PILE_KEYS } from '../world.js';
import { EAGER_AT, FOODS } from '../content.js';
import { fx, gain, iconOf, journal } from './kit.js';

export const sharing = {
  give: {
    cap: null,
    minigame: null,
    costs: null, // it moves rather than spends: out of one pair of hands, into the other
    yields: null,
    tallies: [],
    journal: 'j.shared',
    needs: null,
    once: false,
    twice: 'it can only move what is really there, and by then it has moved',
    apply(w, a) {
      const from = w.players[a.from],
        to = w.players[a.to];
      if (!from || !to) return false;
      const n = Math.min(a.n, from.res[a.res] || 0);
      if (n <= 0) return false;
      from.res[a.res] -= n;
      to.res[a.res] = (to.res[a.res] || 0) + n;
      journal(w, '🤝', 'j.shared', { n: n, res: a.res });
      return true;
    },
  },

  'larder.give': {
    cap: null,
    minigame: null,
    costs: { food: '*', fish: '*' }, // FOODS: bread or fish, out of somebody's own store
    yields: null,
    tallies: [],
    journal: 'j.basket',
    needs: null,
    once: false,
    twice: 'it can only move what is really there, and by then it has moved',
    apply(w, a) {
      const from = w.players[a.from];
      const key = a.res || 'food';
      if (!FOODS.some(f => f.key === key)) return false;
      const n = Math.min(a.n, from.res[key] || 0);
      if (n <= 0) return false;
      from.res[key] -= n;
      w.larder[key] = (w.larder[key] || 0) + n;
      const icon = FOODS.find(f => f.key === key).icon;
      fx(w, 'float', w.larder.x, w.larder.y - 0.6, '+' + n + ' ' + icon);
      journal(w, '🧺', 'j.basket', { n: n });
      w.notices = w.notices.filter(x => x.id !== 'hungry');
      // the hungry come at once, rather than however long it takes them to
      // wander past the basket on their own — unless they are in the middle
      // of something that matters more than a snack
      for (const v of w.villagers) {
        if (v.hunger <= EAGER_AT) continue;
        if (v.poorly > 0 || v.carrying || isDusk(w)) continue;
        v.path = [];
        v.task = null;
        v.wait = 0;
      }
      return true;
    },
  },

  /** The pile by the workshop door, where what the villagers haul ends up. */
  'pile.take': {
    cap: null,
    minigame: null,
    costs: null,
    yields: { wood: '*', wheat: '*' }, // PILE_KEYS: whatever is stacked up
    tallies: [],
    journal: null,
    needs: null,
    once: false,
    twice: 'the pile is empty by then, and an empty pile is a no',
    apply(w, a) {
      if (!w.pile || !w.players[a.role]) return false;
      const ws = w.buildings.find(b => b.type === 'workshop');
      const keys = a.res ? [a.res] : PILE_KEYS;
      let took = 0;
      for (const k of keys) {
        if (!PILE_KEYS.includes(k)) continue;
        const n = w.pile[k] || 0;
        if (n <= 0) continue;
        w.pile[k] = 0;
        gain(w, a.role, k, n);
        if (ws) fx(w, 'float', ws.x + 2, ws.y - 0.2, '+' + n + ' ' + iconOf(k));
        took += n;
      }
      return took > 0;
    },
  },
};
