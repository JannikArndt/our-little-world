// Every change to the world happens here, as a named action.
// applyAction() is pure with respect to time: given the same world and the
// same action it always produces the same result. That is what lets two
// browsers share one world, and what lets the tests be meaningful.

import { T, inBounds, setTile, tileAt, rebuildBlocked } from './grid.js';
import { addBuilding, byId, newId, CAPS, capName, BLOCK_TICKS } from './world.js';

/* ---- small helpers -------------------------------------------------- */

export function fx(w, kind, x, y, text, colour) {
  w.fx = w.fx || [];
  if (w.fx.length > 40) w.fx.shift();
  w.fx.push({ kind, x, y, text: text || '', colour: colour || null, born: w.tick, id: newId('fx') });
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
function tally(w, role, what) {
  const d = w.players[role].done;
  d[what] = (d[what] || 0) + 1;
}
function clearAsk(w, cap, targetId) {
  w.asks = w.asks.filter(a => !(a.cap === cap && (!targetId || a.targetId === targetId)));
}

/* ---- the reducer ---------------------------------------------------- */

export function applyAction(w, a) {
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
        let lx = Math.max(0, Math.min(39, tree.x + dx)), ly = Math.max(0, Math.min(23, tree.y + dy));
        if (tileAt(w, lx, ly) === T.WATER) { lx = tree.x; ly = tree.y; }
        w.logs.push({ id: newId('log'), x: lx + 0.5, y: ly + 0.5, owner: a.role, claimed: null, wood: a.logs });
      }
      tally(w, a.role, 'fell');
      journal(w, '🌳', 'j.felled');
      clearAsk(w, 'fell', a.treeId);
      return true;
    }

    /* ---------------- sawmill ---------------- */
    case 'saw.run': {
      if (!pay(w, a.role, { wood: a.wood })) return false;
      gain(w, a.role, 'plank', a.planks);
      const ws = w.buildings.find(b => b.type === 'workshop');
      if (ws) { ws.spin = w.tick; fx(w, 'float', ws.x + 2, ws.y - 0.2, '+' + a.planks + ' 🪚'); }
      tally(w, a.role, 'saw');
      if (a.planks > 0) journal(w, '🪚', 'j.sawed', { n: a.planks });
      clearAsk(w, 'saw', null);
      return true;
    }

    /* ---------------- the mill ---------------- */
    case 'mill.run': {
      if (!pay(w, a.role, { wheat: a.wheat })) return false;
      gain(w, a.role, 'food', a.food);
      const ws = w.buildings.find(b => b.type === 'workshop');
      if (ws) { ws.spin = w.tick; fx(w, 'float', ws.x + 2, ws.y - 0.2, '+' + a.food + ' 🍞'); }
      tally(w, a.role, 'mill');
      journal(w, '🍞', 'j.baked', { n: a.food });
      clearAsk(w, 'mill', null);
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
      clearAsk(w, 'bridge', null);
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
    case 'house.build': {
      const site = byId(w.buildings, a.siteId);
      if (!site || site.state !== 'site') return false;
      if (!pay(w, a.role, { plank: a.planks, stone: a.stone })) return false;
      site.type = 'house';
      site.state = 'built';
      site.plan = a.plan;
      site.beds = a.beds;
      site.warm = a.warm;
      site.light = a.light;
      site.roomy = a.roomy;
      site.reachable = a.reachable;
      site.name = 'a new house';
      site.builtTick = w.tick;
      rebuildBlocked(w);
      fx(w, 'sparkle', site.x + site.w / 2, site.y);
      tally(w, a.role, 'house');
      journal(w, '🏠', 'j.house', { n: a.beds });
      clearAsk(w, 'house', a.siteId);
      return true;
    }

    /* ---------------- roads ---------------- */
    case 'road.build': {
      const tiles = (a.tiles || []).filter(t => inBounds(t.x, t.y) &&
        tileAt(w, t.x, t.y) !== T.WATER && tileAt(w, t.x, t.y) !== T.ROAD && tileAt(w, t.x, t.y) !== T.BRIDGE);
      if (!tiles.length) return false;
      const cost = Math.ceil(tiles.length / 2);
      if (!pay(w, a.role, { stone: cost })) return false;
      for (const t of tiles) setTile(w, t.x, t.y, T.ROAD);
      rebuildBlocked(w);
      for (const v of w.villagers) v.path = [];      // everybody re-plans on the new road
      for (const s of w.sheep) s.path = [];
      tally(w, a.role, 'road');
      journal(w, '🛤️', 'j.road', { n: tiles.length });
      clearAsk(w, 'road', null);
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
      if (a.item === 'hay')   s.hunger = Math.max(0, s.hunger - 70);
      if (a.item === 'water') s.thirst = Math.max(0, s.thirst - 80);
      if (a.item === 'shear') { const got = s.fluff > 60 ? 2 : 1; s.fluff = 0; gain(w, a.role, 'wool', got); fx(w, 'float', s.x, s.y - 0.6, '+' + got + ' 🧶'); }
      if (a.item === 'pet')   s.hearts = w.tick;
      s.hearts = w.tick;
      fx(w, 'hearts', s.x, s.y - 0.7);
      tally(w, a.role, 'care');
      journal(w, '🐑', 'j.sheep', { name: s.name });
      clearAsk(w, 'care', a.sheepId);
      return true;
    }

    /* ---------------- the field ---------------- */
    case 'plot.plant': {
      const p = byId(w.plots, a.plotId);
      if (!p || p.state !== 'empty') return false;
      p.state = 'growing'; p.growth = 0; p.water = a.watered ? 100 : 0; p.nibbled = 0;
      fx(w, 'float', p.x + 1, p.y, '🌱');
      tally(w, a.role, 'farm');
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
      p.state = 'empty'; p.growth = 0; p.water = 0; p.nibbled = 0;
      gain(w, a.role, 'wheat', n);
      fx(w, 'float', p.x + 1, p.y, '+' + n + ' 🌾');
      tally(w, a.role, 'farm');
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
      const from = w.players[a.from], to = w.players[a.to];
      if (!from || !to) return false;
      const n = Math.min(a.n, from.res[a.res] || 0);
      if (n <= 0) return false;
      from.res[a.res] -= n;
      to.res[a.res] = (to.res[a.res] || 0) + n;
      journal(w, '🤝', 'j.shared', { n: n });
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
      return true;
    }

    /* ---------------- talking to each other ---------------- */
    case 'ask': {
      if (w.asks.length > 3) w.asks.shift();
      if (w.asks.some(x => x.cap === a.cap && x.targetId === a.targetId)) return false;
      w.asks.push({ id: newId('ask'), from: a.from, to: a.to, cap: a.cap, targetId: a.targetId || null, born: w.tick });
      return true;
    }
    case 'ask.clear': {
      w.asks = w.asks.filter(x => x.id !== a.id);
      return true;
    }
    case 'teach': {
      if (!CAPS[a.cap]) return false;
      if (!w.players[a.from].caps[a.cap]) return false;
      if (w.players[a.to].caps[a.cap]) return false;
      w.players[a.to].caps[a.cap] = 1;
      w.asks = w.asks.filter(x => x.cap !== a.cap);
      journal(w, '👐', 'j.taught');
      note(w, 'taught_' + a.cap, CAPS[a.cap].icon, 'teach.notice', { what: capName(a.cap) }, 'calm');
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
    case 'world.event': {                    // emitted by events.js, replayed identically
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
      const b = addBuilding(w, { id: 'site_east', type: 'site', x: 26, y: 6, w: 3, h: 2, state: 'site', name: 'a marked-out plot' });
      b.newFamily = true;
      note(w, 'newfamily', '👨‍👩‍👧', 'notice.newFamily', null, 'ask');
      journal(w, '👨‍👩‍👧', 'j.family');
      return true;
    }
    case 'critter': {
      w.visitors = w.visitors || [];
      if (w.visitors.length) return false;
      w.visitors.push({ id: newId('cr'), kind: a.kind || 'deer', x: 2.5, y: 9.5, path: [], wait: 0, life: 1400 });
      note(w, 'critter', '🦌', 'notice.critter', null, 'calm');
      journal(w, '🦌', 'j.deer');
      return true;
    }
    case 'goodharvest': {
      let n = 0;
      for (const p of w.plots) if (p.state === 'growing' && p.growth > 30) { p.growth = Math.min(100, p.growth + 25); n++; }
      if (!n) return false;
      note(w, 'goodharvest', '☀️', 'notice.goodHarvest', null, 'calm');
      return true;
    }
    default: return false;
  }
}
