// The forest, and the things lying about in it: felling a tree, putting one
// back, and picking up what is on the ground.
//
// Law 9 hangs on the second one. A tree is never simply taken — it becomes a
// stump, and a stump is something anybody can plant again, which is why the
// wood never runs out however many afternoons go by.

import { GW, GH, T, tileAt, rebuildBlocked } from '../grid.js';
import { byId, newId } from '../world.js';
import { fx, gain, journal, tally } from './kit.js';

export const forest = {
  'tree.fell': {
    cap: 'fell',
    minigame: 'chop',
    costs: null,
    yields: { wood: '*' }, // however many the axe earned, plus a log to carry
    tallies: ['fell'],
    journal: 'j.felled',
    needs: null,
    twice: 'a felled tree is not standing, so the second one finds a stump',
    apply(w, a) {
      const tree = byId(w.trees, a.treeId);
      if (!tree || tree.state !== 'standing') return false;
      tree.state = 'stump';
      tree.fellDir = a.dir;
      tree.fellTick = w.tick;
      rebuildBlocked(w);
      gain(w, a.role, 'wood', a.wood);
      fx(w, 'thump', tree.x + 0.5, tree.y + 0.5);
      fx(w, 'float', tree.x + 0.5, tree.y - 0.2, '+' + a.wood + ' 🪵');
      if (a.logs > 0) {
        const dx = a.dir === 'W' ? -2 : a.dir === 'E' ? 2 : 0;
        const dy = a.dir === 'N' ? -2 : a.dir === 'S' ? 2 : 0;
        let lx = Math.max(0, Math.min(GW - 1, tree.x + dx)),
          ly = Math.max(0, Math.min(GH - 1, tree.y + dy));
        if (tileAt(w, lx, ly) === T.WATER) {
          lx = tree.x;
          ly = tree.y;
        }
        w.logs.push({
          id: newId('log'),
          x: lx + 0.5,
          y: ly + 0.5,
          owner: a.role,
          claimed: null,
          wood: a.logs,
        });
      }
      tally(w, a.role, 'fell');
      journal(w, '🌳', 'j.felled');
      return true;
    },
  },

  'tree.plant': {
    cap: 'farm',
    minigame: null,
    costs: null,
    yields: null,
    tallies: ['plant'],
    journal: 'j.planted',
    needs: null,
    twice: 'only a stump can be planted, and a sapling is no longer one',
    apply(w, a) {
      const t = byId(w.trees, a.treeId);
      if (!t || t.state !== 'stump') return false;
      t.state = 'sapling';
      t.plantedTick = w.tick;
      t.kind = 1 + (Math.abs(t.x * 7 + t.y * 13) % 3);
      fx(w, 'float', t.x + 0.5, t.y, '🌱');
      tally(w, a.role, 'plant');
      journal(w, '🌱', 'j.planted');
      return true;
    },
  },

  'log.collect': {
    cap: null,
    minigame: null,
    costs: null,
    yields: { wood: '*' },
    tallies: [],
    journal: null,
    needs: null,
    twice: 'the log is gone from w.logs, so the second time there is none to find',
    apply(w, a) {
      const l = byId(w.logs, a.id);
      if (!l) return false;
      w.logs = w.logs.filter(x => x.id !== l.id);
      gain(w, a.role, 'wood', l.wood);
      fx(w, 'float', l.x, l.y, '+' + l.wood + ' 🪵');
      return true;
    },
  },

  'stone.take': {
    cap: null,
    minigame: null,
    costs: null,
    yields: { stone: 1 },
    // picking stones up is the one thing either of you can show a villager,
    // so it needs a count of its own to be shown twice from
    tallies: ['stone'],
    journal: null,
    needs: null,
    twice: 'the pile is one smaller, and an empty pile is a no',
    apply(w, a) {
      const b = byId(w.stones, a.id);
      if (!b || b.count <= 0) return false;
      b.count -= 1;
      gain(w, a.role, 'stone', 1);
      fx(w, 'float', b.x + 0.5, b.y, '+1 🪨');
      tally(w, a.role, 'stone');
      return true;
    },
  },
};
