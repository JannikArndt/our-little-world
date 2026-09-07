// The living part of the world. Runs in fixed 100 ms steps so that the same
// number of ticks always produces the same world, on any device.

import { T, COST, GW, GH, tileAt, walkable, inBounds, rebuildBlocked } from './grid.js';
import { findPath } from './pathfind.js';
import {
  byId, freeBed, blockProgress, project, hasWell, riverClean, fieldFenced,
  SAPLING_TICKS,
} from './world.js';
import { POORLY_TICKS, POORLY_CHANCE } from './content.js';
import { rnd, rndInt } from './rng.js';
import { fx, journal, note } from './actions.js';

const DT = 0.1;                      // seconds per tick
const BASE_SPEED = 2.2;              // tiles per second on a road

/* --------------------------------------------------------------------- */
/* movement                                                              */
/* --------------------------------------------------------------------- */

function speedAt(w, e, mult) {
  const c = COST[tileAt(w, Math.floor(e.x), Math.floor(e.y))] || 2.4;
  return (BASE_SPEED / c) * (mult || 1);
}

/** Step an entity along its path. Returns true when it has arrived. */
function advance(w, e, mult) {
  if (!e.path || !e.path.length) return true;
  const step = e.path[0];
  const tx = step.x + 0.5, ty = step.y + 0.5;
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const v = speedAt(w, e, mult) * DT;
  e.facing = dx < -0.02 ? -1 : dx > 0.02 ? 1 : (e.facing || 1);
  if (d <= v) {
    e.x = tx; e.y = ty;
    e.path.shift();
    return e.path.length === 0;
  }
  e.x += (dx / d) * v;
  e.y += (dy / d) * v;
  e.moving = w.tick;
  return false;
}

function goTo(w, e, tx, ty, within, avoid) {
  const p = findPath(w, Math.floor(e.x), Math.floor(e.y), tx, ty,
                     { within: within || 0, avoid: avoid == null ? -1 : avoid });
  if (!p) { e.path = []; return false; }
  e.path = p;
  return true;
}

/**
 * A sheep and a fence. She will not cross the wheat to get somewhere else, but
 * she goes wherever she is taken — including in, if that is where you take her.
 */
function sheepAvoid(w, tx, ty) {
  if (!fieldFenced(w)) return -1;
  return tileAt(w, tx, ty) === T.FIELD ? -1 : T.FIELD;
}

function randomNearbyTile(w, e, r) {
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(e.x) + rndInt(w, r * 2 + 1) - r;
    const y = Math.floor(e.y) + rndInt(w, r * 2 + 1) - r;
    if (inBounds(x, y) && walkable(w, x, y)) return { x, y };
  }
  return null;
}

function say(w, e, text, ticks) { e.said = text; e.saidUntil = w.tick + (ticks || 30); }

/* --------------------------------------------------------------------- */
/* villagers                                                             */
/* --------------------------------------------------------------------- */

const CURIOUS = [{ x: 27, y: 8 }, { x: 30, y: 17 }, { x: 24, y: 12 }];

function villagerMood(w, v) {
  if (v.poorly > 0) return 'poorly';
  if (v.hunger > 72) return 'hungry';
  if (!v.homeId) return 'sad';
  if (w.tick - (v.hearts || -999) < 30) return 'happy';
  if (v.hunger < 35 && v.homeId) return 'happy';
  return 'ok';
}

function chooseVillagerTask(w, v) {
  // 0. a poorly tummy: go home, sit down, and wait for it to pass
  if (v.poorly > 0 && v.homeId) {
    const home = byId(w.buildings, v.homeId);
    if (home && goTo(w, v, home.door.x, home.door.y, 1)) { v.task = { kind: 'rest' }; return; }
  }
  // 1. hungry, and there is bread in the basket
  if (v.hunger > 62) {
    if (w.larder.food > 0) {
      if (goTo(w, v, Math.floor(w.larder.x), Math.floor(w.larder.y), 1)) { v.task = { kind: 'eat' }; return; }
    } else if (rnd(w) < 0.25) {
      say(w, v, 'say.emptyBasket', 40);
    }
  }
  // 2. nowhere to sleep, and a bed has appeared
  if (!v.homeId) {
    const b = freeBed(w);
    if (b && goTo(w, v, b.door.x, b.door.y, 1)) { v.task = { kind: 'movein', id: b.id }; return; }
  }
  // 3. a felled log is lying about — carry it to the workshop
  if (!v.carrying) {
    const log = w.logs.find(l => !l.claimed || l.claimed === v.id);
    if (log && goTo(w, v, Math.floor(log.x), Math.floor(log.y), 1)) {
      log.claimed = v.id;
      v.task = { kind: 'pickup', id: log.id };
      return;
    }
  }
  // 4. the children go and play, because there is a playground now
  if (v.kid) {
    const pg = project(w, 'play');
    if (pg && pg.state === 'built' && rnd(w) < 0.4) {
      const px = pg.x + rndInt(w, pg.w), py = pg.y + rndInt(w, pg.h);
      if (goTo(w, v, px, py, 1)) { v.task = { kind: 'play' }; return; }
    }
  }
  // 5. curiosity: try to visit the far bank
  if (rnd(w) < 0.16) {
    const spot = CURIOUS[rndInt(w, CURIOUS.length)];
    if (goTo(w, v, spot.x, spot.y, 1)) { v.task = { kind: 'visit' }; return; }
    // no way across — walk to the water's edge and look at it
    const bank = nearestBank(w, v);
    if (bank && goTo(w, v, bank.x, bank.y, 0)) { v.task = { kind: 'stare' }; return; }
  }
  // 6. potter about
  const t = randomNearbyTile(w, v, 5);
  if (t && goTo(w, v, t.x, t.y)) v.task = { kind: 'wander' };
  else v.wait = 10 + rndInt(w, 20);
}

function nearestBank(w, v) {
  let best = null, bd = 1e9;
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      if (tileAt(w, x, y) !== T.SAND) continue;
      const d = Math.abs(x - v.x) + Math.abs(y - v.y);
      if (d < bd && walkable(w, x, y)) { bd = d; best = { x, y }; }
    }
  return best;
}

function finishVillagerTask(w, v) {
  const t = v.task;
  v.task = null;
  if (!t) return;
  switch (t.kind) {
    case 'eat':
      if (w.larder.food > 0) {
        w.larder.food -= 1;
        v.hunger = Math.max(0, v.hunger - 70);
        v.hearts = w.tick;
        fx(w, 'hearts', v.x, v.y - 0.7);
        say(w, v, 'say.mmm', 25);
      }
      v.wait = 15;
      break;
    case 'movein': {
      const b = byId(w.buildings, t.id);
      if (b && b.state === 'built' && b.residents.length < b.beds) {
        b.residents.push(v.id);
        v.homeId = b.id;
        v.hearts = w.tick;
        fx(w, 'sparkle', b.x + b.w / 2, b.y);
        say(w, v, 'say.home', 40);
        journal(w, '🔑', 'j.movedIn', { name: v.name });
        note(w, 'movedin_' + v.id, '🔑', 'notice.movedIn', { name: v.name }, 'calm');
        w.notices = w.notices.filter(n => n.id !== 'homeless');
      }
      v.wait = 20;
      break;
    }
    case 'pickup': {
      const log = byId(w.logs, t.id);
      if (log) {
        w.logs = w.logs.filter(l => l.id !== log.id);
        v.carrying = { wood: log.wood, owner: log.owner };
        const ws = w.buildings.find(b => b.type === 'workshop');
        if (ws && goTo(w, v, ws.door.x, ws.door.y, 1)) { v.task = { kind: 'deliver' }; return; }
      }
      v.wait = 10;
      break;
    }
    case 'deliver': {
      if (v.carrying) {
        const p = w.players[v.carrying.owner] || w.players.A;
        p.res.wood += v.carrying.wood;
        fx(w, 'float', v.x, v.y - 0.6, '+' + v.carrying.wood + ' 🪵');
        say(w, v, 'say.delivered', 25);
        v.carrying = null;
      }
      v.wait = 15;
      break;
    }
    case 'rest':
      say(w, v, 'say.restingUp', 60);
      v.wait = 90;
      break;
    case 'play':
      v.hearts = w.tick;
      fx(w, 'hearts', v.x, v.y - 0.7);
      say(w, v, 'say.wheee', 40);
      v.wait = 40 + rndInt(w, 60);
      break;
    case 'stare':
      say(w, v, rnd(w) < 0.5 ? 'say.wishAcross' : 'say.niceOverThere', 55);
      v.wait = 45;
      break;
    case 'visit':
      say(w, v, 'say.madeIt', 35);
      v.wait = 30 + rndInt(w, 30);
      break;
    default:
      v.wait = 5 + rndInt(w, 25);
  }
}

function tickVillager(w, v) {
  v.hunger = Math.min(100, v.hunger + 0.012);
  if (v.poorly > 0) v.poorly--;
  v.mood = villagerMood(w, v);
  if (v.saidUntil && w.tick > v.saidUntil) { v.said = null; v.saidUntil = 0; }

  if (v.path && v.path.length) {
    if (advance(w, v, v.poorly > 0 ? 0.6 : 1)) finishVillagerTask(w, v);
    return;
  }
  if (v.wait > 0) { v.wait--; return; }
  if (v.task) { finishVillagerTask(w, v); return; }
  chooseVillagerTask(w, v);
}

/* --------------------------------------------------------------------- */
/* sheep                                                                 */
/* --------------------------------------------------------------------- */

function sheepMood(s) {
  if (s.thirst > 70) return 'thirsty';
  if (s.hunger > 70) return 'hungry';
  if (s.fluff > 88) return 'woolly';
  return 'ok';
}

/** Somewhere to drink: the river, or the trough beside the well. */
function drinkAt(w, x, y) {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (tileAt(w, x + dx, y + dy) === T.WATER) return true;
  const well = project(w, 'well');
  if (well && well.state === 'built') {
    if (Math.abs(x - well.x) <= 1 && Math.abs(y - well.y) <= 1) return true;
  }
  return false;
}

function nearWater(w, s) {
  return drinkAt(w, Math.floor(s.x), Math.floor(s.y));
}

function tickSheep(w, s) {
  const tile = tileAt(w, Math.floor(s.x), Math.floor(s.y));
  s.hunger = Math.min(100, s.hunger + 0.045);
  s.thirst = Math.min(100, s.thirst + 0.016);
  s.fluff = Math.min(100, s.fluff + 0.012);

  if (tile === T.GRASS || tile === T.FOREST) s.hunger = Math.max(0, s.hunger - 0.062);
  if (tile === T.FIELD) {
    s.hunger = Math.max(0, s.hunger - 0.12);
    const p = w.plots.find(p => p.state !== 'empty' &&
      Math.floor(s.x) >= p.x && Math.floor(s.x) < p.x + 2 &&
      Math.floor(s.y) >= p.y && Math.floor(s.y) < p.y + 2);
    if (p) {
      if (p.state === 'growing') p.growth = Math.max(0, p.growth - 0.28);
      if (!p.nibbled) { p.nibbled = 1; }
      if (w.tick % 40 === 0 && !(w.block.active && blockProgress(w) > 0.85)) note(w, 'sheep_in_field', '🐑', 'notice.sheepField', null, 'ask');
    }
  }
  if (nearWater(w, s)) s.thirst = Math.max(0, s.thirst - 0.5);
  s.mood = sheepMood(s);

  if (s.path && s.path.length) { advance(w, s, 0.62); return; }

  if (s.led) {
    const ok = goTo(w, s, s.led.x, s.led.y, 1, sheepAvoid(w, s.led.x, s.led.y));
    if (!ok) {
      // it wants to go, but it cannot get there from here
      s.gaveUp = true;
      const acrossRiver = (s.x < 19) !== (s.led.x < 19);
      if (acrossRiver && !w.bridge.built) note(w, 'sheep_far', '🐑', 'notice.sheepFar', null, 'ask');
      else if (acrossRiver && w.bridge.damaged) note(w, 'bridge_broken', '🐑', 'notice.sheepBroken', null, 'ask');
      s.led = null;
      s.wait = 30;
    } else {
      s.led = null;      // path found; follow it to the end
      s.wait = 0;
    }
    return;
  }

  if (s.wait > 0) { s.wait--; return; }

  // a thirsty sheep goes looking for the river by herself
  if (s.thirst > 62) {
    const drink = nearestDrink(w, s);
    if (drink && goTo(w, s, drink.x, drink.y, 0, sheepAvoid(w, drink.x, drink.y))) { s.wait = 0; return; }
  }
  const t = randomNearbyTile(w, s, 3);
  // a fence is a fence: she does not wander into the wheat, or through it
  const intoField = t && fieldFenced(w) && tileAt(w, t.x, t.y) === T.FIELD;
  if (t && !intoField && tileAt(w, t.x, t.y) !== T.BRIDGE) goTo(w, s, t.x, t.y, 0, sheepAvoid(w, t.x, t.y));
  s.wait = 20 + rndInt(w, 60);
}

/* --------------------------------------------------------------------- */
/* the rest of the world                                                 */
/* --------------------------------------------------------------------- */

/** The closest bit of bank she can stand on and reach the water from. */
function nearestDrink(w, s) {
  const sx = Math.floor(s.x), sy = Math.floor(s.y);
  let best = null, bd = 1e9;
  for (let r = 1; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = sx + dx, y = sy + dy;
        if (!inBounds(x, y) || !walkable(w, x, y)) continue;
        if (tileAt(w, x, y) === T.BRIDGE) continue;
        if (!drinkAt(w, x, y)) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = { x, y }; }
      }
    if (best) return best;
  }
  return best;
}

function tickPlots(w) {
  for (const p of w.plots) {
    if (p.state === 'growing') {
      if (p.water > 0) { p.growth += 0.062; p.water -= 0.09; }
      else p.growth += 0.004;
      if (p.growth >= 100) {
        p.state = 'ripe'; p.growth = 100;
        note(w, 'wheat_ready', '🌾', 'notice.wheatReady', null, 'calm');
      }
    }
  }
}

function tickVisitors(w) {
  if (!w.visitors || !w.visitors.length) return;
  for (const c of w.visitors) {
    c.life--;
    if (c.path && c.path.length) { advance(w, c, 0.8); continue; }
    if (c.wait > 0) { c.wait--; continue; }
    const t = randomNearbyTile(w, c, 4);
    if (t) goTo(w, c, t.x, t.y);
    c.wait = 20 + rndInt(w, 50);
  }
  w.visitors = w.visitors.filter(c => c.life > 0);
}

/**
 * Where the water comes from. Everybody drinks; if there is no well the water
 * comes out of the river, and if there is no little house at the bottom of the
 * garden the river is not what it should be. Then somebody, sooner or later,
 * gets a poorly tummy: a slow walk home, a sit down, and it passes. Nobody is
 * ever really ill here — it is a reason to build something, not a punishment.
 */
function tickWater(w) {
  if (w.tick % 100 !== 0) return;
  if (!w.block.active || blockProgress(w) > 0.8) return;
  if (w.tick < 1500) return;                       // never on a first quiet morning
  if (hasWell(w) || riverClean(w)) {
    w.notices = w.notices.filter(n => n.id !== 'poorly');
    return;
  }
  if (w.villagers.some(v => v.poorly > 0)) return;  // one at a time, and only just
  if (rnd(w) > POORLY_CHANCE) return;

  const grown = w.villagers.filter(v => !v.kid);
  if (!grown.length) return;
  const who = grown[rndInt(w, grown.length)];
  who.poorly = POORLY_TICKS;
  who.path = [];
  who.task = null;
  who.wait = 0;
  fx(w, 'float', who.x, who.y - 0.8, '🤒');
  note(w, 'poorly', '🤒', 'notice.poorly', { name: who.name }, 'ask');
}

/** A planted sapling quietly becomes a tree again while you play. */
function tickSaplings(w) {
  if (w.tick % 10 !== 0) return;
  let grown = false;
  for (const t of w.trees) {
    if (t.state !== 'sapling') continue;
    if (w.tick - (t.plantedTick || 0) < SAPLING_TICKS) continue;
    // never close a tile somebody is standing on
    const busy = w.villagers.some(v => Math.floor(v.x) === t.x && Math.floor(v.y) === t.y) ||
                 w.sheep.some(sh => Math.floor(sh.x) === t.x && Math.floor(sh.y) === t.y);
    if (busy) continue;
    t.state = 'standing';
    t.grownTick = w.tick;
    grown = true;
    fx(w, 'sparkle', t.x + 0.5, t.y + 0.5);
    note(w, 'grown_' + t.id, '🌳', 'notice.treeGrown', null, 'calm');
  }
  if (grown) {
    rebuildBlocked(w);
    for (const v of w.villagers) v.path = [];
    for (const sh of w.sheep) sh.path = [];
  }
}

function tickPlaces(w) {
  if (w.tick % 300 === 0) for (const b of w.stones) if (b.count < 6) b.count++;
  for (const b of w.buildings) {
    if (b.state !== 'built') continue;
    const lived = b.residents && b.residents.length;
    b.smoke = b.warm && lived ? 1 : 0;
  }
}

function pruneFx(w) {
  if (!w.fx) return;
  w.fx = w.fx.filter(f => w.tick - f.born < 26);
}

/* --------------------------------------------------------------------- */

export function tick(w) {
  w.tick++;
  for (const v of w.villagers) tickVillager(w, v);
  for (const s of w.sheep) tickSheep(w, s);
  tickPlots(w);
  tickWater(w);
  tickSaplings(w);
  tickVisitors(w);
  tickPlaces(w);
  pruneFx(w);

  // notices that describe the world rather than an event.
  // Near the end of a block the world stops raising new ones and settles.
  const settling = w.block.active && blockProgress(w) > 0.85;
  if (w.tick % 50 === 0 && !settling) {
    const starving = w.villagers.filter(v => v.hunger > 72);
    if (starving.length && w.larder.food <= 0)
      note(w, 'hungry', '🍞', 'notice.hungry', { name: starving[0].name }, 'ask');
    else if (!starving.length) w.notices = w.notices.filter(n => n.id !== 'hungry');

    const noBed = w.villagers.filter(v => !v.homeId);
    if (noBed.length && !freeBed(w))
      note(w, 'homeless', '🛏️', 'notice.homeless', { name: noBed[0].name }, 'ask');

    if (!w.villagers.some(v => v.poorly > 0)) w.notices = w.notices.filter(n => n.id !== 'poorly');
    if (!w.plots.some(p => p.state === 'ripe')) w.notices = w.notices.filter(n => n.id !== 'wheat_ready');
    if (!noBed.length) w.notices = w.notices.filter(n => n.id !== 'homeless');
    if (!w.buildings.some(b => b.id === 'site_east' && b.state === 'site'))
      w.notices = w.notices.filter(n => n.id !== 'newfamily');
    if (!w.sheep.some(s => tileAt(w, Math.floor(s.x), Math.floor(s.y)) === T.FIELD))
      w.notices = w.notices.filter(n => n.id !== 'sheep_in_field');
  }

  // notices fade after a while so the screen stays calm
  w.notices = w.notices.filter(n => n.kind === 'ask' || w.tick - n.born < 400);
  // an unanswered request quietly stops nagging after a couple of minutes
  if (w.asks.length) w.asks = w.asks.filter(a => w.tick - a.born < 1200);

  if (w.block.active && w.tick - w.block.startTick >= w.block.length) {
    w.block.active = false;
    w.block.endedAt = w.tick;
    return 'block-ended';
  }
  return null;
}
