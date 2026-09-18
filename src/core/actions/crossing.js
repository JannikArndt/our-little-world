// Getting across, and getting about: the bridge over the river, mending it
// after a storm, and the roads that make everything else quicker.
//
// All three repaint the ground, so all three rebuild the blocked map and tear
// up everybody's plans — a villager halfway along an old route would otherwise
// keep walking it.

import { T, inBounds, setTile, tileAt, rebuildBlocked } from '../grid.js';
import { fx, journal, pay, tally } from './kit.js';

/** Everybody works out where they were going again. */
function repath(w) {
  for (const v of w.villagers) v.path = [];
  for (const s of w.sheep) s.path = [];
}

/** The middle of the crossing, where a sparkle or a crack belongs. */
export function bridgeMid(w) {
  const s = w.bridge.site;
  return [(s.x0 + s.x1) / 2 + 0.5, s.row + 1];
}

export const crossing = {
  'bridge.build': {
    cap: 'bridge',
    minigame: 'bridge',
    costs: { plank: '*', stone: '*' },
    yields: null,
    tallies: ['bridge'],
    journal: 'j.bridge',
    needs: null,
    twice: 'it is paid for again, so a second one needs the planks and stone for it',
    apply(w, a) {
      const cost = { plank: a.planks, stone: a.stone };
      if (!pay(w, a.role, cost)) return false;
      const s = w.bridge.site;
      w.bridge.built = true;
      w.bridge.quality = a.quality;
      w.bridge.damaged = false;
      w.bridge.tiles = [];
      for (let y = s.row; y < s.row + s.rows; y++)
        for (let x = s.x0; x <= s.x1; x++) {
          setTile(w, x, y, T.BRIDGE);
          w.bridge.tiles.push({ x, y });
        }
      rebuildBlocked(w);
      fx(w, 'sparkle', ...bridgeMid(w));
      tally(w, a.role, 'bridge');
      journal(w, '🌉', 'j.bridge');
      w.notices = w.notices.filter(n => n.id !== 'sheep_far' && n.id !== 'bridge_broken');
      return true;
    },
  },

  'bridge.repair': {
    cap: 'bridge',
    minigame: 'bridge',
    costs: { plank: 1 },
    yields: null,
    tallies: [],
    journal: 'j.mended',
    needs: null,
    twice: 'a mended bridge is not damaged, so the second one is refused',
    apply(w, a) {
      if (!w.bridge.damaged) return false;
      if (!pay(w, a.role, { plank: 1 })) return false;
      w.bridge.damaged = false;
      rebuildBlocked(w);
      fx(w, 'sparkle', ...bridgeMid(w));
      journal(w, '🔧', 'j.mended');
      w.notices = w.notices.filter(n => n.id !== 'bridge_broken');
      return true;
    },
  },

  'road.build': {
    cap: 'road',
    minigame: 'modes',
    costs: { stone: '*' }, // one stone for every two tiles, rounded up
    yields: null,
    tallies: ['road'],
    journal: 'j.road',
    needs: null,
    twice: 'a tile that is already road is filtered out, and no tiles left is a no',
    apply(w, a) {
      const tiles = (a.tiles || []).filter(
        t =>
          inBounds(t.x, t.y) &&
          tileAt(w, t.x, t.y) !== T.WATER &&
          tileAt(w, t.x, t.y) !== T.ROAD &&
          tileAt(w, t.x, t.y) !== T.BRIDGE,
      );
      if (!tiles.length) return false;
      const cost = Math.ceil(tiles.length / 2);
      if (!pay(w, a.role, { stone: cost })) return false;
      for (const t of tiles) setTile(w, t.x, t.y, T.ROAD);
      rebuildBlocked(w);
      repath(w); // everybody re-plans on the new road
      tally(w, a.role, 'road');
      journal(w, '🛤️', 'j.road', { n: tiles.length });
      return true;
    },
  },
};
