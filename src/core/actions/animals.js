// The sheep, and the boat that goes out for fish. Both are kind: a sheep is
// never worse off for being looked after, and the river keeps bringing fish.

import { byId, project } from '../world.js';
import { fx, gain, journal, tally } from './kit.js';

export const animals = {
  'sheep.send': {
    cap: 'herd',
    minigame: 'sheep',
    costs: null,
    yields: null,
    tallies: [],
    journal: null,
    needs: null,
    twice: 'it sets where the sheep is headed rather than adding to it',
    apply(w, a) {
      const s = byId(w.sheep, a.sheepId);
      if (!s) return false;
      s.led = { x: a.x, y: a.y };
      s.path = [];
      s.wait = 0;
      s.gaveUp = false;
      return true;
    },
  },

  'sheep.care': {
    cap: 'care',
    minigame: 'care',
    costs: null,
    yields: { wool: '*' }, // only for a shear, and only if there is fluff on
    tallies: ['care', 'shear'],
    journal: 'j.sheep',
    needs: null,
    twice: 'hunger and thirst floor at zero and a shorn sheep has no fluff left',
    apply(w, a) {
      const s = byId(w.sheep, a.sheepId);
      if (!s) return false;
      if (a.item === 'hay') s.hunger = Math.max(0, s.hunger - 70);
      if (a.item === 'water') s.thirst = Math.max(0, s.thirst - 80);
      if (a.item === 'shear') {
        const got = s.fluff > 60 ? 2 : 1;
        s.fluff = 0;
        gain(w, a.role, 'wool', got);
        fx(w, 'float', s.x, s.y - 0.6, '+' + got + ' 🧶');
        tally(w, a.role, 'shear');
      }
      if (a.item === 'pet') s.hearts = w.tick;
      s.hearts = w.tick;
      fx(w, 'hearts', s.x, s.y - 0.7);
      tally(w, a.role, 'care');
      journal(w, '🐑', 'j.sheep', { name: s.name });
      return true;
    },
  },

  'fish.catch': {
    cap: 'farm',
    minigame: 'fish',
    costs: null,
    yields: { fish: '*' }, // up to four, however the float went
    tallies: ['fish'],
    journal: 'j.fished',
    needs: 'boat',
    twice: 'the fish are already in the basket; a second one just goes out again',
    apply(w, a) {
      const boat = project(w, 'boat');
      if (!boat || boat.state !== 'built') return false;
      const n = Math.max(0, Math.min(4, a.n | 0));
      boat.fishedTick = w.tick;
      if (n > 0) {
        gain(w, a.role, 'fish', n);
        fx(w, 'float', boat.x + boat.w, boat.y - 0.2, '+' + n + ' 🐟');
        journal(w, '🎣', 'j.fished', { n: n });
      }
      tally(w, a.role, 'fish');
      return true;
    },
  },
};
