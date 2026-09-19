// A house: raising the shell, and then furnishing it one piece at a time.
//
// Nothing here ever writes a house's beds, warmth, light or comfort — those are
// derived from the furniture actually in the room by houseFit(), so they can
// never drift from what is standing there.

import { rebuildBlocked } from '../grid.js';
import { byId, houseFit, newHouseStuff, slotFits } from '../world.js';
import { HOUSE_SHELL, HOUSE_STUFF } from '../content.js';
import { fx, journal, pay, tally } from './kit.js';

export const home = {
  /**
   * Raising the shell. One price, no design: four walls, a door, a window
   * and a bed, so somebody can move in this afternoon. Everything better
   * than that is bought a piece at a time afterwards, by either of you.
   */
  'house.build': {
    cap: 'house',
    minigame: 'raise',
    costs: HOUSE_SHELL,
    yields: null,
    tallies: ['house'],
    journal: 'j.house',
    needs: null,
    twice: 'a built house is no longer a site',
    apply(w, a) {
      const site = byId(w.buildings, a.siteId);
      if (!site || site.state !== 'site') return false;
      if (!pay(w, a.role, HOUSE_SHELL)) return false;
      site.type = 'house';
      site.state = 'built';
      site.stuff = newHouseStuff();
      houseFit(site);
      site.name = 'a new house';
      site.builtTick = w.tick;
      rebuildBlocked(w);
      fx(w, 'sparkle', site.x + site.w / 2, site.y);
      tally(w, a.role, 'house');
      journal(w, '🏠', 'j.house', { n: site.beds });
      return true;
    },
  },

  /**
   * One thing into one empty place in a house. Anybody may — the Builder has
   * the planks and the Keeper has the wool and the flowers, and a house the
   * two of them furnished together is the point of the whole game.
   */
  'house.put': {
    cap: null,
    minigame: 'trace',
    costs: 'byFurniture', // HOUSE_STUFF[kind].cost — the piece decides
    yields: null,
    tallies: ['furnish'],
    journal: null,
    needs: null,
    twice: 'the slot has to be empty, and the second time something stands there',
    apply(w, a) {
      const b = byId(w.buildings, a.houseId);
      if (!b || b.type !== 'house' || b.state !== 'built') return false;
      const def = HOUSE_STUFF[a.kind];
      if (!def || !slotFits(a.slot, def.where)) return false;
      if (!Array.isArray(b.stuff)) b.stuff = [];
      if (b.stuff.some(s => s.slot === a.slot)) return false;
      if (!pay(w, a.role, def.cost)) return false;
      b.stuff.push({ kind: a.kind, slot: a.slot });
      houseFit(b);
      tally(w, a.role, 'furnish');
      fx(w, 'sparkle', b.x + b.w / 2, b.y);
      return true;
    },
  },

  /**
   * Moving something you already own costs nothing. Pieces are named by the
   * slot they stand in rather than an id of their own, because an id handed
   * out on one device would not be the same id on the other.
   */
  'house.move': {
    cap: null,
    minigame: null,
    costs: null,
    yields: null,
    tallies: [],
    journal: null,
    needs: null,
    twice: 'the slot it moved to is occupied by then — by the piece itself',
    apply(w, a) {
      const b = byId(w.buildings, a.houseId);
      if (!b || !Array.isArray(b.stuff) || a.from === a.to) return false;
      const piece = b.stuff.filter(s => s.slot === a.from)[0];
      if (!piece) return false;
      const def = HOUSE_STUFF[piece.kind];
      if (!def || !slotFits(a.to, def.where)) return false;
      if (b.stuff.some(s => s.slot === a.to)) return false;
      piece.slot = a.to;
      return true;
    },
  },
};
