// The living part of the world. Runs in fixed 100 ms steps so that the same
// number of ticks always produces the same world, on any device.

import { T, COST, GW, GH, tileAt, walkable, inBounds, rebuildBlocked } from './grid.js';
import { findPath } from './pathfind.js';
import {
  byId,
  newId,
  freeBed,
  blockProgress,
  isDusk,
  project,
  hasWell,
  riverClean,
  fieldFenced,
  SAPLING_TICKS,
  larderTotal,
  eatFromLarder,
  bagRoom,
  pileRoom,
} from './world.js';
import {
  POORLY_TICKS,
  POORLY_CHANCE,
  HUNGER_RISE,
  HUNGRY_AT,
  EAGER_AT,
  LOAF_RELIEF,
  PLOT_GROW_WET,
  PLOT_GROW_DRY,
  PLOT_DRINK,
  FLUFF_RISE,
  AWAY_TICKS_PER_HOUR,
  AWAY_CAP_TICKS,
  AWAY_MIN_MS,
  AWAY_JOBS_CAP,
  WORK_EVERY,
  WORK_TICKS,
  TREE_FLOOR,
  FISH_REST,
  VILLAGER_SKILLS,
} from './content.js';
import { rnd, rndInt } from './rng.js';
import { addSinceAll, fx, iconOf, journal, note, setAct, clearAct } from './actions.js';

const DT = 0.1; // seconds per tick
const BASE_SPEED = 2.2; // tiles per second on a road
const RUN_SPEED = 1.6; // a trot is faster than a wander

// A life of their own: how often each thing happens, and how long it lasts.
// All rare enough that the village still reads as calm, not as a fairground.
const DANCE_CHANCE = 0.03;
const DANCE_CHANCE_HAPPY = 0.08; // happier feet dance more often
const DANCE_TICKS = 30; // plus a little more, picked at random
const RUN_CHANCE = 0.04;
const RUN_CHANCE_KID = 0.1; // children run about more than the grown-ups
const RUN_RADIUS = 11; // further off than an ordinary wander
const RUN_SAFETY_TICKS = 150; // clears the act if the trot never quite arrives
const CHAT_CHANCE = 0.15;
const CHAT_TICKS = 40;
const SIT_CHANCE = 0.2;
const SIT_TICKS = 80;
const SQUABBLE_CHANCE = 0.01; // rare on purpose — this is not that kind of village
const SQUABBLE_TICKS = 40;
const EAT_TICKS = 18; // a bite or two before the loaf is gone

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
  const tx = step.x + 0.5,
    ty = step.y + 0.5;
  const dx = tx - e.x,
    dy = ty - e.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const v = speedAt(w, e, mult) * DT;
  e.facing = dx < -0.02 ? -1 : dx > 0.02 ? 1 : e.facing || 1;
  if (d <= v) {
    e.x = tx;
    e.y = ty;
    e.path.shift();
    return e.path.length === 0;
  }
  e.x += (dx / d) * v;
  e.y += (dy / d) * v;
  e.moving = w.tick;
  return false;
}

function goTo(w, e, tx, ty, within, avoid) {
  const p = findPath(w, Math.floor(e.x), Math.floor(e.y), tx, ty, {
    within: within || 0,
    avoid: avoid ?? -1,
  });
  if (!p) {
    e.path = [];
    return false;
  }
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

function say(w, e, text, ticks) {
  e.said = text;
  e.saidUntil = w.tick + (ticks || 30);
}

/* --------------------------------------------------------------------- */
/* villagers                                                             */
/* --------------------------------------------------------------------- */

const CURIOUS = [
  { x: 27, y: 8 },
  { x: 30, y: 17 },
  { x: 24, y: 12 },
];

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
    if (home && goTo(w, v, home.door.x, home.door.y, 1)) {
      v.task = { kind: 'rest' };
      return;
    }
  }
  // 1. a full basket is worth walking over for; a bare one only gets a look
  if (v.hunger > HUNGRY_AT || (larderTotal(w) > 0 && v.hunger > EAGER_AT)) {
    if (larderTotal(w) > 0) {
      if (goTo(w, v, Math.floor(w.larder.x), Math.floor(w.larder.y), 1)) {
        v.task = { kind: 'eat' };
        return;
      }
    } else if (rnd(w) < 0.25) {
      say(w, v, 'say.emptyBasket', 40);
    }
  }
  // 2. nowhere to sleep, and a bed has appeared
  if (!v.homeId) {
    const b = freeBed(w);
    if (b && goTo(w, v, b.door.x, b.door.y, 1)) {
      v.task = { kind: 'movein', id: b.id };
      return;
    }
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
  // 4. a job they have been shown how to do — never instead of eating, going
  //    home or carrying a log in, and never more than one every WORK_EVERY
  if (chooseVillagerWork(w, v)) return;

  // 5. the children go and play, because there is a playground now
  if (v.kid) {
    const pg = project(w, 'play');
    if (pg?.state === 'built' && rnd(w) < 0.4) {
      const px = pg.x + rndInt(w, pg.w),
        py = pg.y + rndInt(w, pg.h);
      if (goTo(w, v, px, py, 1)) {
        v.task = { kind: 'play' };
        return;
      }
    }
  }
  // 6. curiosity: try to visit the far bank
  if (rnd(w) < 0.16) {
    const spot = CURIOUS[rndInt(w, CURIOUS.length)];
    if (goTo(w, v, spot.x, spot.y, 1)) {
      v.task = { kind: 'visit' };
      return;
    }
    // no way across — walk to the water's edge and look at it
    const bank = nearestBank(w, v);
    if (bank && goTo(w, v, bank.x, bank.y, 0)) {
      v.task = { kind: 'stare' };
      return;
    }
  }
  // 7. a life of their own, once the day is actually under way — never
  //    instead of anything above, never as likely as any of it
  if (w.block.active && livingItUp(w, v)) return;

  // 8. potter about
  const t = randomNearbyTile(w, v, 5);
  if (t && goTo(w, v, t.x, t.y)) v.task = { kind: 'wander' };
  else v.wait = 10 + rndInt(w, 20);
}

/* --------------------------------------------------------------------- */
/* a villager with a job                                                  */
/* --------------------------------------------------------------------- */

/**
 * Villagers gather; the two of you make. Somebody who has been shown how goes
 * and does it, about once every WORK_EVERY — a third of the pace a player
 * keeps, so a village of six is a hand, never a factory.
 *
 * It only ever happens to somebody who is all right: fed, housed, well, and
 * with the day actually running. A hungry or homeless villager has something
 * more pressing to be doing, and that is the whole of the check — nobody is
 * ever made to work their way out of trouble.
 */
function chooseVillagerWork(w, v) {
  if (!w.block.active || !v.skills?.length || v.carrying) return false;
  if (v.poorly > 0 || !v.homeId || v.hunger >= HUNGRY_AT) return false;
  if (w.tick - (v.workedAt ?? -9999) < WORK_EVERY) return false;

  // whichever of their jobs has something real at the end of the walk, and
  // then the world's own dice rather than a preference, so both screens send
  // them to the same place
  const jobs = [];
  for (const s of v.skills) {
    const job = workTarget(w, v, s.what);
    if (job) jobs.push(job);
  }
  if (!jobs.length) return false;
  const job = jobs[rndInt(w, jobs.length)];
  if (!goTo(w, v, job.x, job.y, 1)) return false;
  v.task = { kind: 'work', job: job.what, id: job.id };
  return true;
}

/** Something worth walking to for this job, or nothing at all. */
function workTarget(w, v, what) {
  switch (what) {
    case 'fell': {
      // the floor: a villager never takes the forest below TREE_FLOOR trees,
      // and never touches a sapling somebody planted
      const standing = w.trees.filter(t => t.state === 'standing');
      if (standing.length - 1 < TREE_FLOOR || pileRoom(w, 'wood') <= 0) return null;
      const t = standing[rndInt(w, standing.length)];
      return { what, id: t.id, x: t.x, y: t.y };
    }
    case 'stone': {
      if (bagRoom(v, 'stone') <= 0) return null;
      const spots = w.stones.filter(b => b.count > 0);
      if (!spots.length) return null;
      const b = spots[rndInt(w, spots.length)];
      return { what, id: b.id, x: b.x, y: b.y };
    }
    case 'farm': {
      const ripe = w.plots.filter(p => p.state === 'ripe');
      if (ripe.length && pileRoom(w, 'wheat') > 0) {
        const p = ripe[rndInt(w, ripe.length)];
        return { what, id: p.id, x: p.x, y: p.y };
      }
      const bare = w.plots.filter(p => p.state === 'empty');
      if (!bare.length) return null;
      const p = bare[rndInt(w, bare.length)];
      return { what, id: p.id, x: p.x, y: p.y };
    }
    case 'care': {
      if (bagRoom(v, 'wool') <= 0) return null;
      const woolly = w.sheep.filter(s => s.fluff > 60);
      if (!woolly.length) return null;
      const s = woolly[rndInt(w, woolly.length)];
      return { what, id: s.id, x: Math.floor(s.x), y: Math.floor(s.y) };
    }
    case 'fish': {
      const boat = project(w, 'boat');
      if (!boat || boat.state !== 'built') return null;
      if (w.tick - (boat.fishedTick ?? -9999) < FISH_REST) return null;
      return { what, id: boat.id, x: boat.x, y: boat.y };
    }
    default:
      return null;
  }
}

/**
 * The doing of it, once they have walked there. Everything here is a thing
 * that grows back: the tree is replanted in the same step, the river brings
 * more stones, wool and wheat and fish all come again on their own. Returns
 * false when whatever they walked over for has gone — somebody else got there
 * first — and then it is not a job done and the clock does not start again.
 */
function doVillagerJob(w, v, t) {
  switch (t.job) {
    case 'fell': {
      const tree = byId(w.trees, t.id);
      if (!tree || tree.state !== 'standing') return false;
      if (w.trees.filter(x => x.state === 'standing').length - 1 < TREE_FLOOR) return false;
      // felled and replanted in one step, so nobody ever comes back to a stump
      tree.state = 'sapling';
      tree.plantedTick = w.tick;
      tree.kind = 1 + (Math.abs(tree.x * 7 + tree.y * 13) % 3);
      rebuildBlocked(w);
      w.logs.push({
        id: newId('log'),
        x: tree.x + 0.5,
        y: tree.y + 0.5,
        owner: null, // nobody's: it goes on the pile by the workshop door
        claimed: null,
        wood: 2,
      });
      fx(w, 'thump', tree.x + 0.5, tree.y + 0.5);
      fx(w, 'float', tree.x + 0.5, tree.y - 0.2, '🌱');
      say(w, v, 'say.timber', 30);
      return true;
    }
    case 'stone': {
      const b = byId(w.stones, t.id);
      if (!b || b.count <= 0 || bagRoom(v, 'stone') <= 0) return false;
      b.count -= 1;
      v.bag.stone += 1;
      fx(w, 'float', v.x, v.y - 0.6, '+1 🪨');
      say(w, v, 'say.goodStone', 30);
      return true;
    }
    case 'farm': {
      const p = byId(w.plots, t.id);
      if (!p) return false;
      if (p.state === 'ripe') {
        if (pileRoom(w, 'wheat') <= 0) return false;
        const n = Math.max(1, 3 - p.nibbled);
        p.state = 'empty';
        p.growth = 0;
        p.water = 0;
        p.nibbled = 0;
        v.carrying = { res: 'wheat', n, owner: null };
        fx(w, 'float', p.x + 1, p.y, '+' + n + ' 🌾');
        say(w, v, 'say.wheatIn', 30);
        w.notices = w.notices.filter(x => x.id !== 'wheat_ready');
        const ws = w.buildings.find(b => b.type === 'workshop');
        if (ws && goTo(w, v, ws.door.x, ws.door.y, 1)) v.task = { kind: 'deliver' };
        return true;
      }
      if (p.state !== 'empty') return false;
      p.state = 'growing';
      p.growth = 0;
      p.water = 0;
      p.nibbled = 0;
      fx(w, 'float', p.x + 1, p.y, '🌱');
      say(w, v, 'say.sown', 30);
      return true;
    }
    case 'care': {
      const s = byId(w.sheep, t.id);
      if (!s || s.fluff <= 60 || bagRoom(v, 'wool') <= 0) return false;
      if (Math.abs(s.x - v.x) + Math.abs(s.y - v.y) > 3) return false; // she wandered off
      s.fluff = 0;
      s.hearts = w.tick;
      v.bag.wool += 1;
      fx(w, 'float', s.x, s.y - 0.6, '+1 🧶');
      fx(w, 'hearts', s.x, s.y - 0.7);
      say(w, v, 'say.snipSnip', 30);
      return true;
    }
    case 'fish': {
      const boat = byId(w.buildings, t.id);
      if (!boat || boat.state !== 'built') return false;
      if (w.tick - (boat.fishedTick ?? -9999) < FISH_REST) return false;
      boat.fishedTick = w.tick;
      // straight into the basket: a villager fishes for the village, not for
      // a player's own side of the table
      w.larder.fish = (w.larder.fish || 0) + 1;
      fx(w, 'float', boat.x + boat.w, boat.y - 0.2, '+1 🐟');
      say(w, v, 'say.oneForTheBasket', 30);
      w.notices = w.notices.filter(x => x.id !== 'hungry');
      return true;
    }
    default:
      return false;
  }
}

/** Two villagers, close enough and neither already busy with something. */
function nearbyFree(w, v, dist) {
  return w.villagers.filter(
    o =>
      o.id !== v.id &&
      !o.act &&
      !o.task &&
      !o.carrying &&
      !o.inside &&
      o.poorly <= 0 &&
      (!o.path || !o.path.length) &&
      Math.abs(o.x - v.x) + Math.abs(o.y - v.y) <= dist,
  );
}

/** Somewhere nice to sit: the playground, the well, or your own front door. */
function sitSpot(w, v) {
  const spots = [];
  const pg = project(w, 'play');
  if (pg?.state === 'built') spots.push({ x: pg.x + 1, y: pg.y + pg.h });
  const well = project(w, 'well');
  if (well?.state === 'built') spots.push({ x: well.x, y: well.y + 1 });
  if (v.homeId) {
    const home = byId(w.buildings, v.homeId);
    if (home) spots.push({ x: home.door.x, y: home.door.y });
  }
  if (!spots.length) return null;
  const s = spots[rndInt(w, spots.length)];
  return inBounds(s.x, s.y) && walkable(w, s.x, s.y) ? s : null;
}

/**
 * The village's own life, once nothing more pressing needs doing: a dance, a
 * run, a natter, a sit down, and every now and then a little squabble that a
 * tap breaks up. Returns true when it has set something going, so
 * chooseVillagerTask knows not to fall through to a plain potter.
 */
function livingItUp(w, v) {
  // a squabble: rare, gentle, and never a grown-up against a child
  if (rnd(w) < SQUABBLE_CHANCE) {
    const other = nearbyFree(w, v, 2).find(o => o.kid === v.kid);
    if (other) {
      const ticks = SQUABBLE_TICKS + rndInt(w, SQUABBLE_TICKS);
      setAct(w, v, 'squabble', ticks, other.id);
      setAct(w, other, 'squabble', ticks, v.id);
      v.path = [];
      v.task = null;
      v.wait = ticks;
      other.path = [];
      other.task = null;
      other.wait = ticks;
      note(
        w,
        'squabble_' + v.id,
        '💢',
        'notice.squabble',
        { name: v.name, other: other.name },
        'calm',
      );
      return true;
    }
  }
  // a natter: two of them standing close enough to talk
  if (rnd(w) < CHAT_CHANCE) {
    const other = nearbyFree(w, v, 2)[0];
    if (other) {
      const ticks = CHAT_TICKS + rndInt(w, CHAT_TICKS);
      setAct(w, v, 'chat', ticks, other.id);
      setAct(w, other, 'chat', ticks, v.id);
      v.path = [];
      v.task = null;
      v.wait = ticks;
      other.path = [];
      other.task = null;
      other.wait = ticks;
      say(w, v, 'say.natter', ticks);
      return true;
    }
  }
  // a sit down somewhere that invites it
  if (rnd(w) < SIT_CHANCE) {
    const spot = sitSpot(w, v);
    if (spot && goTo(w, v, spot.x, spot.y, 1)) {
      v.task = { kind: 'sitdown' };
      return true;
    }
  }
  // a dance, more often when the day is going well
  if (rnd(w) < (v.mood === 'happy' ? DANCE_CHANCE_HAPPY : DANCE_CHANCE)) {
    const ticks = DANCE_TICKS + rndInt(w, DANCE_TICKS);
    setAct(w, v, 'dance', ticks);
    v.wait = ticks;
    say(w, v, 'say.laLa', ticks);
    return true;
  }
  // a run — the children more than the grown-ups
  if (rnd(w) < (v.kid ? RUN_CHANCE_KID : RUN_CHANCE)) {
    const t = randomNearbyTile(w, v, RUN_RADIUS);
    if (t && goTo(w, v, t.x, t.y)) {
      setAct(w, v, 'run', RUN_SAFETY_TICKS);
      v.task = { kind: 'run' };
      return true;
    }
  }
  return false;
}

function nearestBank(w, v) {
  let best = null,
    bd = 1e9;
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      if (tileAt(w, x, y) !== T.SAND) continue;
      const d = Math.abs(x - v.x) + Math.abs(y - v.y);
      if (d < bd && walkable(w, x, y)) {
        bd = d;
        best = { x, y };
      }
    }
  return best;
}

function finishVillagerTask(w, v) {
  const t = v.task;
  v.task = null;
  if (!t) return;
  switch (t.kind) {
    case 'eat':
      // arrived at the basket — a moment of actually eating before the
      // loaf is gone, so it never happens instantly on arrival
      if (larderTotal(w) > 0) {
        setAct(w, v, 'eat', EAT_TICKS);
        v.task = { kind: 'eatDone' };
        v.wait = EAT_TICKS;
      } else {
        v.wait = 10; // the basket ran out while they were walking over
      }
      break;
    case 'eatDone':
      // only now does the serving actually leave the basket, so two people
      // arriving together can never both take the last one
      if (eatFromLarder(w)) {
        v.hunger = Math.max(0, v.hunger - LOAF_RELIEF);
        v.hearts = w.tick;
        fx(w, 'hearts', v.x, v.y - 0.7);
        say(w, v, 'say.mmm', 25);
      }
      clearAct(v);
      v.wait = 15;
      break;
    case 'sitdown': {
      // No line above their head for this one: they are sitting on the
      // playground step or their own front door, which is the whole of what
      // there is to say, and a caption hanging there for ten seconds only
      // gets in the way of the village behind it.
      const ticks = SIT_TICKS + rndInt(w, SIT_TICKS);
      setAct(w, v, 'sit', ticks);
      v.wait = ticks;
      break;
    }
    case 'run':
      clearAct(v);
      v.wait = 20 + rndInt(w, 30);
      break;
    case 'movein': {
      const b = byId(w.buildings, t.id);
      if (b?.state === 'built' && b.residents.length < b.beds) {
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
        v.carrying = { res: 'wood', n: log.wood, owner: log.owner ?? null };
        const ws = w.buildings.find(b => b.type === 'workshop');
        if (ws && goTo(w, v, ws.door.x, ws.door.y, 1)) {
          v.task = { kind: 'deliver' };
          return;
        }
      }
      v.wait = 10;
      break;
    }
    case 'deliver': {
      const c = v.carrying;
      if (c) {
        const owner = c.owner ? w.players[c.owner] : null;
        if (owner) {
          // somebody felled that tree: it is theirs, and always was
          owner.res[c.res] = (owner.res[c.res] || 0) + c.n;
          fx(w, 'float', v.x, v.y - 0.6, '+' + c.n + ' ' + iconOf(c.res));
        } else {
          // nobody's: it goes on the pile by the door, for either of you.
          // A full pile takes what fits — the hauling stops before this, so
          // getting here at all means the pile filled up on the way over.
          const n = Math.min(pileRoom(w, c.res), c.n);
          if (n > 0) {
            w.pile[c.res] = (w.pile[c.res] || 0) + n;
            fx(w, 'float', v.x, v.y - 0.6, '+' + n + ' ' + iconOf(c.res));
          }
        }
        say(w, v, 'say.delivered', 25);
        v.carrying = null;
      }
      v.wait = 15;
      break;
    }
    case 'work': {
      // a moment of actually doing it before anything changes, the way eating
      // takes a moment — and it is what the 👥 list and the world both show
      const act = setAct(w, v, 'work', WORK_TICKS);
      act.job = t.job;
      v.task = { kind: 'workDone', job: t.job, id: t.id };
      v.wait = WORK_TICKS;
      break;
    }
    case 'workDone': {
      clearAct(v);
      const done = doVillagerJob(w, v, t);
      if (done) v.workedAt = w.tick; // the clock starts when the job is finished
      if (v.task) return; // reaping sends them straight on to the pile
      v.wait = done ? 15 : 20;
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

/**
 * Evening. Everybody who has a bed walks to their own door and goes in; the
 * one who has none stays out, which is the whole point of noticing them.
 */
function goToBed(w, v) {
  if (v.inside) return true;
  if (!v.homeId) return false;
  const b = byId(w.buildings, v.homeId);
  if (!b) return false;
  if (v.path?.length) return false;
  if (Math.abs(v.x - (b.door.x + 0.5)) < 1.2 && Math.abs(v.y - (b.door.y + 0.5)) < 1.2) {
    v.inside = true;
    v.path = [];
    v.task = null;
    v.carrying = null;
    v.said = null;
    return true;
  }
  if (!goTo(w, v, b.door.x, b.door.y, 0)) {
    v.inside = true;
    return true;
  }
  v.task = { kind: 'gohome' };
  return false;
}

function tickVillager(w, v) {
  if (v.inside) {
    // A night indoors is a rest, and how much of a rest depends on the room.
    // A blanket and a lit stove are the difference between waking up hungry
    // and waking up ready — which is the whole reason for furnishing a house
    // rather than just putting a bed in it. No rng anywhere: the same room on
    // the same tick eases the same amount on both screens.
    const home = v.homeId ? byId(w.buildings, v.homeId) : null;
    const ease = home ? Math.min(0.6, (home.comfort || 0) * 0.04) : 0;
    v.hunger = Math.min(100, v.hunger + 0.004 * (1 - ease));
    if (v.poorly > 0 && home?.warm) v.poorly -= 2; // warm beats a chill
    return;
  }

  v.hunger = Math.min(100, v.hunger + HUNGER_RISE);
  if (v.poorly > 0) v.poorly--;
  v.mood = villagerMood(w, v);
  if (v.saidUntil && w.tick > v.saidUntil) {
    v.said = null;
    v.saidUntil = 0;
  }
  // an act runs its course on its own once its time is up
  if (v.act && w.tick > v.act.until) clearAct(v);

  if (isDusk(w)) {
    if (v.task && v.task.kind !== 'gohome') {
      v.task = null;
      v.path = [];
    }
    if (v.act) clearAct(v); // bedtime outranks a dance
    if (goToBed(w, v)) return;
    if (v.path?.length) {
      if (advance(w, v, 1.15)) goToBed(w, v);
      return;
    }
    return;
  }

  if (v.path?.length) {
    const mult = v.poorly > 0 ? 0.6 : v.task?.kind === 'run' ? RUN_SPEED : 1;
    if (advance(w, v, mult)) finishVillagerTask(w, v);
    return;
  }
  if (v.wait > 0) {
    v.wait--;
    return;
  }
  if (v.task) {
    finishVillagerTask(w, v);
    return;
  }
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
    for (let dx = -1; dx <= 1; dx++) if (tileAt(w, x + dx, y + dy) === T.WATER) return true;
  const well = project(w, 'well');
  if (well?.state === 'built') {
    if (Math.abs(x - well.x) <= 1 && Math.abs(y - well.y) <= 1) return true;
  }
  return false;
}

function nearWater(w, s) {
  return drinkAt(w, Math.floor(s.x), Math.floor(s.y));
}

function tickSheep(w, s) {
  if (!w.block.active && w.block.endedAt !== null) {
    s.path = [];
    s.wait = 20;
    return;
  }
  const tile = tileAt(w, Math.floor(s.x), Math.floor(s.y));
  s.hunger = Math.min(100, s.hunger + 0.045);
  s.thirst = Math.min(100, s.thirst + 0.016);
  s.fluff = Math.min(100, s.fluff + FLUFF_RISE);

  if (tile === T.GRASS || tile === T.FOREST) s.hunger = Math.max(0, s.hunger - 0.062);
  if (tile === T.FIELD) {
    s.hunger = Math.max(0, s.hunger - 0.12);
    const p = w.plots.find(
      p =>
        p.state !== 'empty' &&
        Math.floor(s.x) >= p.x &&
        Math.floor(s.x) < p.x + 2 &&
        Math.floor(s.y) >= p.y &&
        Math.floor(s.y) < p.y + 2,
    );
    if (p) {
      if (p.state === 'growing') p.growth = Math.max(0, p.growth - 0.28);
      if (!p.nibbled) {
        p.nibbled = 1;
      }
      if (w.tick % 40 === 0 && !(w.block.active && blockProgress(w) > 0.85))
        note(w, 'sheep_in_field', '🐑', 'notice.sheepField', null, 'ask');
    }
  }
  if (nearWater(w, s)) s.thirst = Math.max(0, s.thirst - 0.5);
  s.mood = sheepMood(s);

  if (s.path?.length) {
    advance(w, s, 0.62);
    return;
  }

  if (s.led) {
    const ok = goTo(w, s, s.led.x, s.led.y, 1, sheepAvoid(w, s.led.x, s.led.y));
    if (!ok) {
      // it wants to go, but it cannot get there from here
      s.gaveUp = true;
      const acrossRiver = s.x < 19 !== s.led.x < 19;
      if (acrossRiver && !w.bridge.built)
        note(w, 'sheep_far', '🐑', 'notice.sheepFar', null, 'ask');
      else if (acrossRiver && w.bridge.damaged)
        note(w, 'bridge_broken', '🐑', 'notice.sheepBroken', null, 'ask');
      s.led = null;
      s.wait = 30;
    } else {
      s.led = null; // path found; follow it to the end
      s.wait = 0;
    }
    return;
  }

  if (s.wait > 0) {
    s.wait--;
    return;
  }

  // a thirsty sheep goes looking for the river by herself
  if (s.thirst > 62) {
    const drink = nearestDrink(w, s);
    if (drink && goTo(w, s, drink.x, drink.y, 0, sheepAvoid(w, drink.x, drink.y))) {
      s.wait = 0;
      return;
    }
  }
  const t = randomNearbyTile(w, s, 3);
  // a fence is a fence: she does not wander into the wheat, or through it
  const intoField = t && fieldFenced(w) && tileAt(w, t.x, t.y) === T.FIELD;
  if (t && !intoField && tileAt(w, t.x, t.y) !== T.BRIDGE)
    goTo(w, s, t.x, t.y, 0, sheepAvoid(w, t.x, t.y));
  s.wait = 20 + rndInt(w, 60);
}

/* --------------------------------------------------------------------- */
/* the rest of the world                                                 */
/* --------------------------------------------------------------------- */

/** The closest bit of bank she can stand on and reach the water from. */
function nearestDrink(w, s) {
  const sx = Math.floor(s.x),
    sy = Math.floor(s.y);
  let best = null,
    bd = 1e9;
  for (let r = 1; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = sx + dx,
          y = sy + dy;
        if (!inBounds(x, y) || !walkable(w, x, y)) continue;
        if (tileAt(w, x, y) === T.BRIDGE) continue;
        if (!drinkAt(w, x, y)) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = { x, y };
        }
      }
    if (best) return best;
  }
  return best;
}

function tickPlots(w) {
  for (const p of w.plots) {
    if (p.state === 'growing') {
      if (p.water > 0) {
        p.growth += PLOT_GROW_WET;
        p.water -= PLOT_DRINK;
      } else p.growth += PLOT_GROW_DRY;
      if (p.growth >= 100) {
        p.state = 'ripe';
        p.growth = 100;
        note(w, 'wheat_ready', '🌾', 'notice.wheatReady', null, 'calm');
      }
    }
  }
}

function tickVisitors(w) {
  if (!w.visitors || !w.visitors.length) return;
  for (const c of w.visitors) {
    c.life--;
    if (c.path?.length) {
      advance(w, c, 0.8);
      continue;
    }
    if (c.wait > 0) {
      c.wait--;
      continue;
    }
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
  if (w.tick < 1500) return; // never on a first quiet morning
  if (hasWell(w) || riverClean(w)) {
    w.notices = w.notices.filter(n => n.id !== 'poorly');
    return;
  }
  if (w.villagers.some(v => v.poorly > 0)) return; // one at a time, and only just
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
    const busy =
      w.villagers.some(v => Math.floor(v.x) === t.x && Math.floor(v.y) === t.y) ||
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
    const lived = b.residents?.length;
    b.smoke = b.warm && lived ? 1 : 0;
    // a window is only warm once somebody is home and the light has gone
    // a candle or a lit stove is what makes the windows glow at dusk, so
    // the thing you bought is the thing you can see from outside
    b.lamp = lived && isDusk(w) && b.flame ? 1 : 0;
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
    if (starving.length && larderTotal(w) <= 0)
      note(w, 'hungry', '🍞', 'notice.hungry', { name: starving[0].name }, 'ask');
    else if (!starving.length) w.notices = w.notices.filter(n => n.id !== 'hungry');

    const noBed = w.villagers.filter(v => !v.homeId);
    if (noBed.length && !freeBed(w))
      note(w, 'homeless', '🛏️', 'notice.homeless', { name: noBed[0].name }, 'ask');

    if (!w.villagers.some(v => v.poorly > 0)) w.notices = w.notices.filter(n => n.id !== 'poorly');
    if (!w.plots.some(p => p.state === 'ripe'))
      w.notices = w.notices.filter(n => n.id !== 'wheat_ready');
    if (!noBed.length) w.notices = w.notices.filter(n => n.id !== 'homeless');
    if (!w.buildings.some(b => b.id === 'site_east' && b.state === 'site'))
      w.notices = w.notices.filter(n => n.id !== 'newfamily');
    if (!w.sheep.some(s => tileAt(w, Math.floor(s.x), Math.floor(s.y)) === T.FIELD))
      w.notices = w.notices.filter(n => n.id !== 'sheep_in_field');
  }

  // notices fade after a while so the screen stays calm
  // 'ask' here is a notice that waits to be dealt with rather than fading —
  // nothing to do with one player asking the other, which the game no longer has
  w.notices = w.notices.filter(n => n.kind === 'ask' || w.tick - n.born < 400);
  // an unanswered request quietly stops nagging after a couple of minutes

  if (w.block.active && w.tick - w.block.startTick >= w.block.length) {
    w.block.active = false;
    w.block.endedAt = w.tick;
    return 'block-ended';
  }
  return null;
}

/* --------------------------------------------------------------------- */
/* kind things while nobody is there                                      */
/* --------------------------------------------------------------------- */

/**
 * Law 9. Saplings come on towards being trees, wheat ripens, wool grows back
 * — and nothing else at all. Never hunger, nobody poorly, nothing out of
 * events.js, no problem that arrived on its own. Coming back is a small gift
 * and only ever a gift.
 *
 * The clock is `w.ext.awayAt`, the moment somebody was last watching, which
 * travels with the world through save, load and the network. Only whoever is
 * running the clock does this, once, before the first tick — the other player
 * is handed the result in a snapshot, so the two screens cannot disagree
 * about how long the village was on its own. It uses the stamp up, so doing
 * it twice does nothing the second time (law 12).
 *
 * Two devices' clocks do not agree to the second and one of them may be
 * plainly wrong, which costs nothing here: a stamp in the future is no gift
 * at all, and a stamp from long ago is the cap, which is three days.
 *
 * Returns the ticks it gave, which is only of interest to a test.
 */
export function catchUp(w, now) {
  if (!w.ext || typeof w.ext !== 'object') w.ext = {};
  const was = w.ext.awayAt;
  w.ext.awayAt = now;
  if (typeof was !== 'number') return 0; // a world saved before any of this existed
  const ms = now - was;
  if (ms < AWAY_MIN_MS) return 0;
  const ticks = Math.min(AWAY_CAP_TICKS, Math.floor((ms / 3600000) * AWAY_TICKS_PER_HOUR));
  if (ticks <= 0) return 0;

  // A sapling is measured from the tick it was planted on, so the away time
  // goes to the sapling rather than to w.tick — the day is told by w.tick and
  // moving it would end one. tickSaplings then turns it into a tree on the
  // first tick somebody is watching, with its sparkle and its notice, and
  // without ever closing a tile somebody is standing on.
  for (const t of w.trees) if (t.state === 'sapling') t.plantedTick = (t.plantedTick || 0) - ticks;

  // the sum tickPlots does one tick at a time, done once for all of them
  for (const p of w.plots) {
    if (p.state !== 'growing') continue;
    const wet = Math.min(ticks, Math.max(0, p.water || 0) / PLOT_DRINK);
    p.growth += wet * PLOT_GROW_WET + (ticks - wet) * PLOT_GROW_DRY;
    p.water = Math.max(0, (p.water || 0) - ticks * PLOT_DRINK);
    if (p.growth >= 100) {
      p.state = 'ripe';
      p.growth = 100;
    }
  }

  // Wool comes in. Hunger and thirst deliberately do not: nobody is ever
  // worse off for having been left alone.
  for (const s of w.sheep) s.fluff = Math.min(100, s.fluff + ticks * FLUFF_RISE);

  // and the people who have been shown a job get on with it — after the
  // growing, so what they gather is what actually grew
  awayWork(w, ticks);

  return ticks;
}

/**
 * Law 9, with hands. Somebody who has been shown a job does it while nobody
 * is there, at the same pace they would with you watching and no faster, and
 * never more than AWAY_JOBS_CAP jobs however long the village was alone.
 *
 * Four rules, and every one of them has a test:
 *
 *   1. Nothing is ever taken. Nobody eats, no hunger moves, the larder only
 *      goes up, and no player's own resources are touched at all.
 *   2. No mess is left. A felled tree is replanted in the same step, so there
 *      is never a stump waiting — and `allProblems()` can hold nothing on
 *      your return that it did not hold when you left.
 *   3. Only renewables. The tree floor holds; stone, wool, wheat and fish all
 *      come again on their own.
 *   4. As you left them. Somebody hungry, homeless or poorly when you closed
 *      the page brought nothing in, because nobody here works their way out
 *      of trouble.
 *
 * Every choice comes out of the world's own dice, and this runs once, on
 * whoever is keeping the clock — the other player is handed the snapshot.
 */
function awayWork(w, ticks) {
  const jobs = Math.min(AWAY_JOBS_CAP, Math.floor(ticks / WORK_EVERY));
  if (jobs <= 0) return;
  let felled = false;

  for (const v of w.villagers) {
    if (!v.skills?.length) continue;
    // exactly the check a villager passes with you watching, read from the
    // state you left them in
    if (v.poorly > 0 || !v.homeId || v.hunger >= HUNGRY_AT) continue;

    const got = {}; // what they brought in, to say once on the way back
    let sown = 0,
      icon = null;
    for (let i = 0; i < jobs; i++) {
      const can = v.skills.filter(s => awayCan(w, v, s.what));
      if (!can.length) break;
      const what = can[rndInt(w, can.length)].what;
      const done = awayJob(w, v, what, got);
      if (!done) break;
      if (!icon) icon = VILLAGER_SKILLS[what].icon;
      if (done === 'sown') sown++;
      if (what === 'fell') felled = true;
      v.workedAt = w.tick;
    }

    // one line each, summarised — never one per job, or the cap swallows
    // whatever the other player did while you were away (law 10)
    const brought = Object.keys(got)
      .map(k => got[k] + ' ' + iconOf(k))
      .join(' + ');
    if (brought) addSinceAll(w, icon || '👐', 'j.villagerWork', { name: v.name, what: brought });
    else if (sown) addSinceAll(w, '🌱', 'j.villagerSowed', { name: v.name, n: sown });
  }

  // a tree that came down is a sapling now, and the tile it stood on is open
  if (felled) rebuildBlocked(w);
}

/** Is there anything at the end of this job, with nobody about to walk there? */
function awayCan(w, v, what) {
  switch (what) {
    case 'fell':
      return (
        w.trees.filter(t => t.state === 'standing').length - 1 >= TREE_FLOOR &&
        pileRoom(w, 'wood') > 0
      );
    case 'stone':
      return bagRoom(v, 'stone') > 0 && w.stones.some(b => b.count > 0);
    case 'farm':
      return (
        (w.plots.some(p => p.state === 'ripe') && pileRoom(w, 'wheat') > 0) ||
        w.plots.some(p => p.state === 'empty')
      );
    case 'care':
      return bagRoom(v, 'wool') > 0 && w.sheep.some(s => s.fluff > 60);
    case 'fish': {
      const boat = project(w, 'boat');
      return !!(boat?.state === 'built');
    }
    default:
      return false;
  }
}

/**
 * One job, with no walking and nothing to watch: no `fx`, nothing said, no
 * notice raised. Everything it does only ever adds. Returns what happened, so
 * the line on the way back can say it.
 */
function awayJob(w, v, what, got) {
  const add = (res, n) => {
    got[res] = (got[res] || 0) + n;
  };
  switch (what) {
    case 'fell': {
      const standing = w.trees.filter(t => t.state === 'standing');
      const t = standing[rndInt(w, standing.length)];
      t.state = 'sapling';
      t.plantedTick = w.tick; // planted now, so it takes its full growing
      t.kind = 1 + (Math.abs(t.x * 7 + t.y * 13) % 3);
      const n = Math.min(pileRoom(w, 'wood'), 2);
      w.pile.wood += n;
      add('wood', n);
      return 'brought';
    }
    case 'stone': {
      const spots = w.stones.filter(b => b.count > 0);
      const b = spots[rndInt(w, spots.length)];
      b.count -= 1;
      v.bag.stone += 1;
      add('stone', 1);
      return 'brought';
    }
    case 'farm': {
      const ripe = w.plots.filter(p => p.state === 'ripe');
      if (ripe.length && pileRoom(w, 'wheat') > 0) {
        const p = ripe[rndInt(w, ripe.length)];
        const n = Math.min(pileRoom(w, 'wheat'), Math.max(1, 3 - p.nibbled));
        p.state = 'empty';
        p.growth = 0;
        p.water = 0;
        p.nibbled = 0;
        w.pile.wheat += n;
        add('wheat', n);
        return 'brought';
      }
      const bare = w.plots.filter(p => p.state === 'empty');
      const p = bare[rndInt(w, bare.length)];
      p.state = 'growing';
      p.growth = 0;
      p.water = 0;
      p.nibbled = 0;
      return 'sown';
    }
    case 'care': {
      const woolly = w.sheep.filter(s => s.fluff > 60);
      const s = woolly[rndInt(w, woolly.length)];
      s.fluff = 0;
      v.bag.wool += 1;
      add('wool', 1);
      return 'brought';
    }
    case 'fish': {
      // the boat's own rest is a minute; a village is never left alone for
      // less than a quarter of an hour before any of this happens at all
      const boat = project(w, 'boat');
      boat.fishedTick = w.tick;
      w.larder.fish = (w.larder.fish || 0) + 1;
      add('fish', 1);
      return 'brought';
    }
    default:
      return null;
  }
}
