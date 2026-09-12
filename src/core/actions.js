// Every change to the world happens here, as a named action.
// applyAction() is pure with respect to time: given the same world and the
// same action it always produces the same result. That is what lets two
// browsers share one world, and what lets the tests be meaningful.

import { GW, GH, T, inBounds, setTile, tileAt, rebuildBlocked, walkable } from './grid.js';
import {
  addBuilding,
  byId,
  newId,
  CAPS,
  capName,
  BLOCK_TICKS,
  cacheRegions,
  isDusk,
  houseFit,
  newHouseStuff,
  slotFits,
} from './world.js';
import { PROJECTS, EAGER_AT, HOUSE_SHELL, HOUSE_STUFF } from './content.js';
import { findPath } from './pathfind.js';
import { rndInt } from './rng.js';

/* ---- small helpers -------------------------------------------------- */

export function fx(w, kind, x, y, text, colour) {
  w.fx = w.fx || [];
  if (w.fx.length > 40) w.fx.shift();
  w.fx.push({
    kind,
    x,
    y,
    text: text || '',
    colour: colour || null,
    born: w.tick,
    id: newId('fx'),
  });
}

/**
 * Notices and the journal are stored as a key plus values, never as a finished
 * sentence, so each player reads them in their own language.
 */
function note(w, id, icon, key, vars, kind) {
  if (w.notices.some(n => n.id === id)) return;
  if (w.notices.length > 3) w.notices.shift();
  w.notices.push({ id, icon, key, vars: vars || null, kind: kind || 'calm', born: w.tick });
}
export { note };

export function journal(w, icon, key, vars) {
  w.journal.push({ icon, key, vars: vars || null, tick: w.tick });
  if (w.journal.length > 40) w.journal.shift();
  addSince(w, icon, key, vars);
}

const SINCE_CAP = 12; // the anti-list: nothing grows the more you play

/**
 * The welcome-back screen's own memory (law 10). The journal is cleared every
 * in-game day, so it cannot tell somebody what happened while they were away —
 * this can, because it lives in `w.ext` and nobody empties it but the `seen`
 * action below. `actingRole`, stashed once per `applyAction()` call, says
 * whose doing this was; a fact with nobody behind it (the simulation, not a
 * player) goes on nobody's list, and a role never gets told about its own
 * doing.
 */
function addSince(w, icon, key, vars) {
  if (!actingRole) return;
  if (!w.ext.since || typeof w.ext.since !== 'object') w.ext.since = {};
  for (const role in w.players) {
    if (role === actingRole) continue;
    if (!Array.isArray(w.ext.since[role])) w.ext.since[role] = [];
    const list = w.ext.since[role];
    list.push({ icon, key, vars: vars || null, by: actingRole, tick: w.tick });
    if (list.length > SINCE_CAP) list.shift();
  }
}

// Whichever role is behind the action being applied right now, so journal()
// — called deep inside the reducer — knows who to credit without every one of
// its call sites having to say so itself. Set once at the top of
// applyAction() and read from nowhere else.
let actingRole = null;

/**
 * What a villager is up to right now, purely for the telling — a dance, a
 * chat, an answer to a tap. `until` is the tick it wears off; `with` names
 * the other villager for the two-person ones. Additive, so an older saved
 * world just has none of these yet.
 */
export function setAct(w, v, kind, ticks, withId) {
  v.act = { kind, until: w.tick + ticks, with: withId || null };
  return v.act;
}
export function clearAct(v) {
  v.act = null;
}

/** A few tiles off, wherever the ground allows it. Used to send someone shy scurrying away. */
function trotAway(w, v, tiles) {
  const sx = Math.floor(v.x),
    sy = Math.floor(v.y);
  for (let i = 0; i < 10; i++) {
    const x = sx + rndInt(w, tiles * 2 + 1) - tiles;
    const y = sy + rndInt(w, tiles * 2 + 1) - tiles;
    if (!inBounds(x, y) || !walkable(w, x, y)) continue;
    const p = findPath(w, sx, sy, x, y);
    if (p && p.length) {
      v.path = p;
      return true;
    }
  }
  return false;
}

function pay(w, role, cost) {
  const res = w.players[role].res;
  for (const k in cost) if ((res[k] || 0) < cost[k]) return false;
  for (const k in cost) res[k] -= cost[k];
  return true;
}
export function canPay(w, role, cost) {
  const res = w.players[role].res;
  for (const k in cost) if ((res[k] || 0) < cost[k]) return false;
  return true;
}
function gain(w, role, key, n) {
  w.players[role].res[key] = (w.players[role].res[key] || 0) + n;
}
/**
 * A running count of what somebody has actually done. It teaches — two of a
 * thing and you can show the other player how — and it is also the tally the
 * role's own menu reads back to them at the end of a long afternoon. Sowing
 * and reaping are both farming, so they add to `farm` *and* to a name of their
 * own; nothing here ever resets.
 */
function tally(w, role, what) {
  const d = w.players[role].done;
  d[what] = (d[what] || 0) + 1;
}
const POKE_TICKS = 25; // about two and a half seconds
const POKE_ANSWERS = ['wave', 'wink', 'hop', 'shy'];

/* ---- the reducer ---------------------------------------------------- */

export function applyAction(w, a) {
  // Put back exactly what was found rather than simply cleared: a boat is a
  // project.build underneath, so these nest. And between actions the village
  // journals things of its own — somebody moving into a house — which belong
  // to nobody and must not be credited to whoever happened to act last.
  const wasActing = actingRole;
  actingRole = a.role || a.from || null;
  try {
    return applyOne(w, a);
  } finally {
    actingRole = wasActing;
  }
}

function applyOne(w, a) {
  switch (a.type) {
    /* ---------------- the play block ---------------- */
    case 'block.start': {
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
    }
    case 'block.end': {
      if (!w.block.active) return false;
      w.block.active = false;
      w.block.endedAt = w.tick;
      return true;
    }

    /* ---------------- forestry ---------------- */
    case 'tree.fell': {
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
    }

    /* ---------------- sawmill ---------------- */
    case 'saw.run': {
      if (!pay(w, a.role, { wood: a.wood })) return false;
      gain(w, a.role, 'plank', a.planks);
      const ws = w.buildings.find(b => b.type === 'workshop');
      if (ws) {
        ws.spin = w.tick;
        fx(w, 'float', ws.x + 2, ws.y - 0.2, '+' + a.planks + ' 🪚');
      }
      tally(w, a.role, 'saw');
      // A perfectly cut log — every piece the size that was ordered — is what
      // teaches the next level of the sawmill: see LEVEL2_AT in sawmill.js.
      if (a.pieces && a.planks === a.pieces) tally(w, a.role, 'sawPerfect');
      if (a.planks > 0) journal(w, '🪚', 'j.sawed', { n: a.planks });
      return true;
    }

    /* ---------------- the mill ---------------- */
    case 'mill.run': {
      if (!pay(w, a.role, { wheat: a.wheat })) return false;
      gain(w, a.role, 'food', a.food);
      const ws = w.buildings.find(b => b.type === 'workshop');
      if (ws) {
        ws.spin = w.tick;
        fx(w, 'float', ws.x + 2, ws.y - 0.2, '+' + a.food + ' 🍞');
      }
      tally(w, a.role, 'mill');
      journal(w, '🍞', 'j.baked', { n: a.food });
      return true;
    }

    /* ---------------- bridge ---------------- */
    case 'bridge.build': {
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
      fx(w, 'sparkle', (s.x0 + s.x1) / 2 + 0.5, s.row + 1);
      tally(w, a.role, 'bridge');
      journal(w, '🌉', 'j.bridge');
      w.notices = w.notices.filter(n => n.id !== 'sheep_far' && n.id !== 'bridge_broken');
      return true;
    }
    case 'bridge.repair': {
      if (!w.bridge.damaged) return false;
      if (!pay(w, a.role, { plank: 1 })) return false;
      w.bridge.damaged = false;
      rebuildBlocked(w);
      const s = w.bridge.site;
      fx(w, 'sparkle', (s.x0 + s.x1) / 2 + 0.5, s.row + 1);
      journal(w, '🔧', 'j.mended');
      w.notices = w.notices.filter(n => n.id !== 'bridge_broken');
      return true;
    }

    /* ---------------- houses ---------------- */
    /**
     * Raising the shell. One price, no design: four walls, a door, a window
     * and a bed, so somebody can move in this afternoon. Everything better
     * than that is bought a piece at a time afterwards, by either of you.
     */
    case 'house.build': {
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
    }

    /**
     * One thing into one empty place in a house. Anybody may — the Builder has
     * the planks and the Keeper has the wool and the flowers, and a house the
     * two of them furnished together is the point of the whole game.
     *
     * The slot has to be empty, which is also what makes this safe to apply
     * twice: the second time there is already something standing there.
     */
    case 'house.put': {
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
    }

    /**
     * Moving something you already own costs nothing. Pieces are named by the
     * slot they stand in rather than an id of their own, because an id handed
     * out on one device would not be the same id on the other.
     */
    case 'house.move': {
      const b = byId(w.buildings, a.houseId);
      if (!b || !Array.isArray(b.stuff) || a.from === a.to) return false;
      const piece = b.stuff.filter(s => s.slot === a.from)[0];
      if (!piece) return false;
      const def = HOUSE_STUFF[piece.kind];
      if (!def || !slotFits(a.to, def.where)) return false;
      if (b.stuff.some(s => s.slot === a.to)) return false;
      piece.slot = a.to;
      return true;
    }

    /* ---------------- the things a village builds for itself ---------------- */
    // One action for all of them: what a project costs, who can make it and
    // what it changes all live in the content tables, so a new project is a
    // row there and nothing here.
    case 'project.build': {
      const def = PROJECTS[a.what];
      if (!def) return false;
      const plan = w.buildings.find(b => b.type === def.type);
      if (!plan || plan.state !== 'plan') return false;
      if (!pay(w, a.role, def.cost)) return false;
      plan.state = 'built';
      plan.builtTick = w.tick;
      if (def.type === 'boat') plan.fishedTick = -9999;
      rebuildBlocked(w);
      fx(w, 'sparkle', plan.x + plan.w / 2, plan.y + plan.h / 2);
      // the children hear the swing go up and go straight to it
      if (def.type === 'play')
        for (const v of w.villagers)
          if (v.kid) {
            v.path = [];
            v.task = null;
            v.wait = 0;
          }
      // clean water means nobody has to feel poorly about the river
      if (def.type === 'well' || def.type === 'privy')
        for (const v of w.villagers)
          if (v.poorly > 0) {
            v.poorly = 0;
            v.hearts = w.tick;
          }
      tally(w, a.role, def.type);
      journal(w, def.journal, 'j.' + def.type);
      w.notices = w.notices.filter(n => n.id !== 'poorly' && n.id !== 'sheep_in_field');
      return true;
    }
    // the two projects that shipped before there was one action for all of them
    case 'boat.build':
      return applyAction(w, { type: 'project.build', role: a.role, what: 'boat' });
    case 'play.build':
      return applyAction(w, { type: 'project.build', role: a.role, what: 'play' });

    case 'fish.catch': {
      const boat = byId(w.buildings, 'plan_boat');
      if (!boat || boat.state !== 'built') return false;
      const n = Math.max(0, Math.min(4, a.n | 0));
      boat.fishedTick = w.tick;
      if (n > 0) {
        gain(w, a.role, 'food', n);
        fx(w, 'float', boat.x + boat.w, boat.y - 0.2, '+' + n + ' 🐟');
        journal(w, '🎣', 'j.fished', { n: n });
      }
      tally(w, a.role, 'fish');
      return true;
    }

    /* ---------------- the map opening up ---------------- */
    case 'region.open': {
      if (!w.regions || w.regions[a.id] !== 'later') return false;
      w.regions[a.id] = 'open';
      cacheRegions(w);
      rebuildBlocked(w);
      for (const v of w.villagers) v.path = [];
      for (const sh of w.sheep) sh.path = [];
      journal(w, '🗺️', 'j.region', { id: a.id });
      return true;
    }

    /* ---------------- putting the forest back ---------------- */
    case 'tree.plant': {
      const t = byId(w.trees, a.treeId);
      if (!t || t.state !== 'stump') return false;
      t.state = 'sapling';
      t.plantedTick = w.tick;
      t.kind = 1 + (Math.abs(t.x * 7 + t.y * 13) % 3);
      fx(w, 'float', t.x + 0.5, t.y, '🌱');
      tally(w, a.role, 'plant');
      journal(w, '🌱', 'j.planted');
      return true;
    }

    /* ---------------- roads ---------------- */
    case 'road.build': {
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
      for (const v of w.villagers) v.path = []; // everybody re-plans on the new road
      for (const s of w.sheep) s.path = [];
      tally(w, a.role, 'road');
      journal(w, '🛤️', 'j.road', { n: tiles.length });
      return true;
    }

    /* ---------------- animals ---------------- */
    case 'sheep.send': {
      const s = byId(w.sheep, a.sheepId);
      if (!s) return false;
      s.led = { x: a.x, y: a.y };
      s.path = [];
      s.wait = 0;
      s.gaveUp = false;
      return true;
    }
    case 'sheep.care': {
      const s = byId(w.sheep, a.sheepId);
      if (!s) return false;
      if (a.item === 'hay') s.hunger = Math.max(0, s.hunger - 70);
      if (a.item === 'water') s.thirst = Math.max(0, s.thirst - 80);
      if (a.item === 'shear') {
        const got = s.fluff > 60 ? 2 : 1;
        s.fluff = 0;
        gain(w, a.role, 'wool', got);
        fx(w, 'float', s.x, s.y - 0.6, '+' + got + ' 🧶');
      }
      if (a.item === 'pet') s.hearts = w.tick;
      s.hearts = w.tick;
      fx(w, 'hearts', s.x, s.y - 0.7);
      tally(w, a.role, 'care');
      journal(w, '🐑', 'j.sheep', { name: s.name });
      return true;
    }

    /* ---------------- a tap on somebody ---------------- */
    case 'villager.poke': {
      const v = byId(w.villagers, a.id);
      if (!v) return false;

      // squabbling, and somebody tapped either one of them: that is the end of it
      if (v.act && v.act.kind === 'squabble') {
        const other = byId(w.villagers, v.act.with);
        clearAct(v);
        v.hearts = w.tick;
        fx(w, 'hearts', v.x, v.y - 0.7);
        if (other) {
          clearAct(other);
          other.hearts = w.tick;
          fx(w, 'hearts', other.x, other.y - 0.7);
        }
        return true;
      }

      // poorly, carrying a log, or walking home at dusk: a wave, and nothing dropped
      if (v.poorly > 0 || v.carrying || isDusk(w)) {
        setAct(w, v, 'wave', POKE_TICKS);
        v.hearts = w.tick;
        fx(w, 'hearts', v.x, v.y - 0.7);
        return true;
      }

      // otherwise, an answer — the same one on both screens, since it comes
      // from the world's own seeded rng rather than anything local
      const answer = POKE_ANSWERS[rndInt(w, POKE_ANSWERS.length)];
      v.path = [];
      v.task = null;
      v.wait = POKE_TICKS;
      setAct(w, v, answer, POKE_TICKS);
      v.hearts = w.tick;
      fx(w, 'hearts', v.x, v.y - 0.7);
      if (answer === 'shy') trotAway(w, v, 4);
      return true;
    }

    /* ---------------- the field ---------------- */
    case 'plot.plant': {
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
    }
    case 'plot.water': {
      const p = byId(w.plots, a.plotId);
      if (!p || p.state === 'empty') return false;
      p.water = 100;
      fx(w, 'splash', p.x + 1, p.y + 1);
      return true;
    }
    case 'plot.harvest': {
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
    }

    /* ---------------- gathering ---------------- */
    case 'stone.take': {
      const b = byId(w.stones, a.id);
      if (!b || b.count <= 0) return false;
      b.count -= 1;
      gain(w, a.role, 'stone', 1);
      fx(w, 'float', b.x + 0.5, b.y, '+1 🪨');
      return true;
    }
    case 'log.collect': {
      const l = byId(w.logs, a.id);
      if (!l) return false;
      w.logs = w.logs.filter(x => x.id !== l.id);
      gain(w, a.role, 'wood', l.wood);
      fx(w, 'float', l.x, l.y, '+' + l.wood + ' 🪵');
      return true;
    }

    /* ---------------- sharing ---------------- */
    case 'give': {
      const from = w.players[a.from],
        to = w.players[a.to];
      if (!from || !to) return false;
      const n = Math.min(a.n, from.res[a.res] || 0);
      if (n <= 0) return false;
      from.res[a.res] -= n;
      to.res[a.res] = (to.res[a.res] || 0) + n;
      journal(w, '🤝', 'j.shared', { n: n, res: a.res });
      return true;
    }
    case 'larder.give': {
      const from = w.players[a.from];
      const n = Math.min(a.n, from.res.food || 0);
      if (n <= 0) return false;
      from.res.food -= n;
      w.larder.food += n;
      fx(w, 'float', w.larder.x, w.larder.y - 0.6, '+' + n + ' 🍞');
      journal(w, '🧺', 'j.basket', { n: n });
      w.notices = w.notices.filter(x => x.id !== 'hungry');
      // the hungry notice at once, rather than however long it takes them to
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
    }

    /* ---------------- talking to each other ---------------- */
    case 'teach': {
      if (!CAPS[a.cap]) return false;
      if (!w.players[a.from].caps[a.cap]) return false;
      if (w.players[a.to].caps[a.cap]) return false;
      w.players[a.to].caps[a.cap] = 1;
      journal(w, '👐', 'j.taught');
      note(
        w,
        'taught_' + a.cap,
        CAPS[a.cap].icon,
        'teach.notice',
        { what: capName(a.cap) },
        'calm',
      );
      return true;
    }

    /* ---------------- presence & housekeeping ---------------- */
    case 'presence': {
      const p = w.players[a.role];
      if (!p) return false;
      p.busy = a.busy || null;
      p.seen = w.tick;
      return true;
    }
    case 'notice.dismiss': {
      w.notices = w.notices.filter(n => n.id !== a.id);
      return true;
    }
    /**
     * The welcome-back screen has been read: empty that seat's list. Safe to
     * apply twice — an empty list has nothing left to clear — which is what
     * law 12 asks of every action here.
     */
    case 'seen': {
      const list = w.ext.since && w.ext.since[a.role];
      if (!list || !list.length) return false;
      w.ext.since[a.role] = [];
      return true;
    }
    case 'world.event': {
      // emitted by events.js, replayed identically
      return applyWorldEvent(w, a);
    }
    default:
      return false;
  }
}

/* ---- world-driven events ------------------------------------------- */

function applyWorldEvent(w, a) {
  switch (a.event) {
    case 'storm': {
      if (!w.bridge.built || w.bridge.damaged) return false;
      w.bridge.damaged = true;
      rebuildBlocked(w);
      for (const v of w.villagers) v.path = [];
      for (const sh of w.sheep) sh.path = [];
      const s = w.bridge.site;
      fx(w, 'crack', (s.x0 + s.x1) / 2 + 0.5, s.row + 0.6);
      note(w, 'bridge_broken', '💨', 'notice.bridgeBroken', null, 'ask');
      return true;
    }
    case 'newfamily': {
      if (w.buildings.some(b => b.id === 'site_east')) return false;
      const b = addBuilding(w, {
        id: 'site_east',
        type: 'site',
        x: 26,
        y: 6,
        w: 3,
        h: 2,
        state: 'site',
        name: 'a marked-out plot',
      });
      b.newFamily = true;
      note(w, 'newfamily', '👨‍👩‍👧', 'notice.newFamily', null, 'ask');
      journal(w, '👨‍👩‍👧', 'j.family');
      return true;
    }
    case 'critter': {
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
    }
    case 'goodharvest': {
      let n = 0;
      for (const p of w.plots)
        if (p.state === 'growing' && p.growth > 30) {
          p.growth = Math.min(100, p.growth + 25);
          n++;
        }
      if (!n) return false;
      note(w, 'goodharvest', '☀️', 'notice.goodHarvest', null, 'calm');
      return true;
    }
    default:
      return false;
  }
}
