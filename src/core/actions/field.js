// The field: sowing a row, carrying water to it, and reaping it when it stands
// up golden. Sowing and reaping both count as farming *and* as a name of their
// own, because farming is one skill and sowing twice is what teaches it.

import { byId } from '../world.js';
import { fx, gain, journal, tally } from './kit.js';

export const field = {
  'plot.plant': {
    cap: 'farm',
    minigame: null,
    costs: null,
    yields: null,
    tallies: ['farm', 'sow'],
    journal: null,
    needs: null,
    twice: 'a sown row is not empty, so the second one is refused',
    apply(w, a) {
      const p = byId(w.plots, a.plotId);
      if (!p || p.state !== 'empty') return false;
      p.state = 'growing';
      p.growth = 0;
      p.water = a.watered ? 100 : 0;
      p.nibbled = 0;
      fx(w, 'float', p.x + 1, p.y, '🌱');
      tally(w, a.role, 'farm');
      tally(w, a.role, 'sow');
      return true;
    },
  },

  'plot.water': {
    cap: 'farm',
    minigame: null,
    costs: null,
    yields: null,
    tallies: [],
    journal: null,
    needs: null,
    twice: 'water is set to full rather than added to, so twice is once',
    apply(w, a) {
      const p = byId(w.plots, a.plotId);
      if (!p || p.state === 'empty') return false;
      p.water = 100;
      fx(w, 'splash', p.x + 1, p.y + 1);
      return true;
    },
  },

  'plot.harvest': {
    cap: 'farm',
    minigame: null,
    costs: null,
    yields: { wheat: '*' }, // three a row, one fewer for every sheep that got in
    tallies: ['farm', 'reap'],
    journal: 'j.wheat',
    needs: null,
    twice: 'a reaped row is empty, and an empty row is not ripe',
    apply(w, a) {
      const p = byId(w.plots, a.plotId);
      if (!p || p.state !== 'ripe') return false;
      const n = Math.max(1, 3 - p.nibbled);
      p.state = 'empty';
      p.growth = 0;
      p.water = 0;
      p.nibbled = 0;
      gain(w, a.role, 'wheat', n);
      fx(w, 'float', p.x + 1, p.y, '+' + n + ' 🌾');
      tally(w, a.role, 'farm');
      tally(w, a.role, 'reap');
      journal(w, '🌾', 'j.wheat', { n: n });
      w.notices = w.notices.filter(x => x.id !== 'wheat_ready');
      return true;
    },
  },
};
