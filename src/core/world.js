// The shared world. Plain JSON-serialisable data only — no Maps, Sets or
// typed arrays — so that a whole world fits in one network message and in
// localStorage without any conversion step.

import { GW, GH, T, idx, inBounds, rebuildBlocked } from './grid.js';
import { rnd, rndInt, rndRange } from './rng.js';
import { tr } from './i18n.js';
import {
  SCENARIOS,
  DEFAULT_SCENARIO,
  scenarioOf,
  ROLES,
  HUNGER_RISE,
  LOAF_RELIEF,
  HOUSE_STUFF,
  HOUSE_WALL,
  HOUSE_ALL,
  FOODS,
  VILLAGER_SKILLS,
  MAX_SKILLS,
  TEACH_TIMES,
  BAG_CAP,
  PILE_CAP,
} from './content.js';
import { runMigrations } from './migrate.js';

// The shape of a saved world. It only goes up when an existing field changes
// meaning — anything new and additive is handled by ensureWorld(), so adding
// to the world does not cost anybody their village. See migrate.js.
export const SCHEMA = 7;
export const TICK_MS = 100; // one simulation step
export const BLOCK_TICKS = 5 * 60 * 10; // a five minute play block

export const RESOURCES = [
  { key: 'wood', icon: '🪵' },
  { key: 'plank', icon: '🪚' },
  { key: 'stone', icon: '🪨' },
  { key: 'wheat', icon: '🌾' },
  ...FOODS,
  { key: 'wool', icon: '🧶' },
];

// what things cost and how fast they grow lives with the rest of the content
export { PROJECT, PROJECTS, SAPLING_TICKS, REPLANT_GOAL, SCENARIOS, FOODS } from './content.js';
export { VILLAGER_SKILLS, SKILL_ORDER, MAX_SKILLS, TEACH_TIMES } from './content.js';

/** The roles in play, drawn from the catalogue. */
export const ROLE = ROLES;

// The order they stand in along the top bar. Everything that walks the roles
// walks this, so a third one — a cook, say — is one more entry in the
// catalogue and nothing here changes at all.
export const ROLE_ORDER = Object.keys(ROLES);

export const CAPS = {
  fell: { icon: '🪓', owner: 'A' },
  saw: { icon: '🪚', owner: 'A' },
  bridge: { icon: '🌉', owner: 'A' },
  house: { icon: '🏠', owner: 'A' },
  mill: { icon: '🌀', owner: 'A' },
  herd: { icon: '🐑', owner: 'B' },
  care: { icon: '💚', owner: 'B' },
  road: { icon: '🛤️', owner: 'B' },
  farm: { icon: '🌱', owner: 'B' },
};

/**
 * What a villager can hold in their arms, and what can be stacked by the
 * workshop door. Two short lists rather than one: stone and wool stay with
 * whoever picked them up until a player takes them, while wood and wheat are
 * hauled to the pile where either of you can.
 */
export const BAG_KEYS = ['stone', 'wool'];
export const PILE_KEYS = ['wood', 'wheat'];

/** How much is in a pair of arms, or on the pile. */
export function bagTotal(v) {
  return BAG_KEYS.reduce((n, k) => n + (v?.bag?.[k] || 0), 0);
}
export function pileTotal(w) {
  return PILE_KEYS.reduce((n, k) => n + (w.pile?.[k] || 0), 0);
}
export function bagRoom(v, res) {
  return Math.max(0, BAG_CAP - (v?.bag?.[res] || 0));
}
export function pileRoom(w, res) {
  return Math.max(0, PILE_CAP - (w.pile?.[res] || 0));
}

/** Does this villager know how to do that? */
export function knows(v, what) {
  return !!v.skills?.some(s => s.what === what);
}

/**
 * What somebody is carrying, in one shape. It used to be `{ wood, owner }`,
 * because wood was the only thing anybody ever carried; a villager coming
 * home with wheat needed it to say which. A world saved mid-delivery keeps
 * its log and still delivers it.
 */
export function carried(c) {
  if (!c || typeof c !== 'object') return null;
  if (c.res) return { res: c.res, n: c.n || 0, owner: c.owner ?? null };
  if (c.wood != null) return { res: 'wood', n: c.wood, owner: c.owner ?? null };
  return null;
}

/** Names live in the language tables, not in the world. */
export function roleName(id) {
  return tr('role.' + id + '.short');
}
export function capName(key) {
  return tr('cap.' + key);
}
export function resName(key) {
  return tr('res.' + key);
}
export function skillName(key) {
  return tr('skill.' + key);
}

/**
 * A stored line, read in whichever language is reading it. Notices, the
 * journal and the welcome-back list keep a key and plain values rather than a
 * finished sentence (law 14), so a value that names a thing — a resource, a
 * job somebody has been shown — is turned into a word here, at the last
 * moment, instead of being written into the world in the acting player's
 * language.
 */
export function said(o) {
  if (!o?.key) return o?.text || '';
  let vars = o.vars;
  if (vars && (vars.res || vars.skill)) {
    vars = Object.assign({}, vars);
    if (vars.res) vars.res = resName(vars.res);
    if (vars.skill) vars.skill = skillName(vars.skill);
  }
  return tr(o.key, vars);
}

let nextId = 1;
export function newId(prefix) {
  return prefix + '_' + nextId++;
}

/* --------------------------------------------------------------------- */
/* terrain                                                               */
/* --------------------------------------------------------------------- */

function riverCentre(y) {
  return 18.6 + Math.sin(y * 0.4) * 1.9;
}

/**
 * How wide the river is at a row: an hourglass, narrowest at the crossing and
 * opening out towards both ends of the map.
 *
 * It used to be a plain wave, which pinched tighter at the top and the bottom
 * of the map than it did at the crossing — so the one place the village is
 * told to build a bridge was visibly not the easiest place to build one, and
 * that is a fair thing for somebody to notice and object to. Now the narrowest
 * water really is where the bridge goes, and the river is widest where it runs
 * off the map, which is also how a river usually looks.
 *
 * The wiggle that gives the banks their character fades out towards the
 * crossing, so it can never quietly pinch the river somewhere else instead.
 */
function riverHalfWidth(y, crossY) {
  const d = Math.abs(y - crossY) / (GH / 2); // 0 at the crossing, about 1 at the edge
  return 1.8 + 2.0 * d * d + 0.5 * d * Math.sin(y * 0.85 + 1);
}

const PAINTERS = { valley: paintValley };

function paintValley(w, scen) {
  const t = w.terrain;
  for (let i = 0; i < GW * GH; i++) t[i] = T.GRASS;

  // forest in the north west
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 13; x++) if (y + x * 0.35 < 11) t[idx(x, y)] = T.FOREST;

  // the river, north to south, at its narrowest where the bridge belongs
  const crossY = (scen?.crossingRow ?? 12) + 0.5;
  for (let y = 0; y < GH; y++) {
    const cx = riverCentre(y),
      hw = riverHalfWidth(y, crossY);
    for (let x = 0; x < GW; x++) {
      const d = Math.abs(x + 0.5 - cx);
      if (d < hw) t[idx(x, y)] = T.WATER;
      else if (d < hw + 1.1) t[idx(x, y)] = T.SAND;
    }
  }

  // the field on the east bank
  for (let y = 15; y <= 21; y++)
    for (let x = 25; x <= 34; x++) if (t[idx(x, y)] === T.GRASS) t[idx(x, y)] = T.FIELD;
}

function paintRoad(w, ax, ay, bx, by) {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(ax + (bx - ax) * (i / steps));
    const y = Math.round(ay + (by - ay) * (i / steps));
    if (inBounds(x, y) && w.terrain[idx(x, y)] !== T.WATER) w.terrain[idx(x, y)] = T.ROAD;
  }
}

/* --------------------------------------------------------------------- */
/* world creation                                                        */
/* --------------------------------------------------------------------- */

export function createWorld(seed, scenarioId) {
  nextId = 1;
  const id = SCENARIOS[scenarioId] ? scenarioId : DEFAULT_SCENARIO;
  const scen = SCENARIOS[id];
  const w = {
    schema: SCHEMA,
    scenario: id,
    seed: seed >>> 0,
    rng: seed >>> 0,
    tick: 0,
    day: 1,
    block: { active: false, startTick: 0, length: BLOCK_TICKS, endedAt: null },
    terrain: new Array(GW * GH).fill(T.GRASS),
    blocked: new Array(GW * GH).fill(0),
    trees: [],
    logs: [],
    buildings: [],
    plots: [],
    sheep: [],
    villagers: [],
    stones: [],
    visitors: [],
    bridge: { built: false, tiles: [], quality: 0, damaged: false },
    larder: { x: scen.larder.x, y: scen.larder.y, food: scen.larder.food },
    pile: { wood: 0, wheat: 0 },
    players: {},
    regions: {},
    notices: [],
    journal: [],
    flags: {}, // one-off switches: what has been seen, what is unlocked
    ext: {}, // room for anything a later version wants to keep
    seq: 0,
  };

  for (const id of scen.roles) w.players[id] = newPlayer(id);
  for (const r of scen.regions || []) w.regions[r.id] = r.open === false ? 'later' : 'open';

  (PAINTERS[scen.terrain] || paintValley)(w, scen);

  // ---- what stands in the village ------------------------------------
  for (const h of scen.houses)
    addBuilding(w, {
      key: h.key,
      type: 'house',
      x: h.x,
      y: h.y,
      w: h.w,
      h: h.h,
      state: 'built',
      name: h.name,
      beds: h.beds,
      warm: true,
      light: true,
    });
  for (const st of scen.sites)
    addBuilding(w, {
      key: st.key,
      type: 'site',
      x: st.x,
      y: st.y,
      w: st.w,
      h: st.h,
      state: 'site',
      name: st.name,
    });
  for (const b of scen.works)
    addBuilding(w, {
      key: b.key,
      type: b.type,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      state: 'built',
      name: b.name,
    });
  for (const r of scen.roads) paintRoad(w, r[0], r[1], r[2], r[3]);

  // ---- the forest ----------------------------------------------------
  const f = scen.forest;
  const spots = [];
  for (let i = 0; i < 60 && spots.length < f.count; i++) {
    const x = f.x + rndInt(w, f.w),
      y = f.y + rndInt(w, f.h);
    if (w.terrain[idx(x, y)] !== T.FOREST) continue;
    if (spots.some(s => Math.abs(s.x - x) + Math.abs(s.y - y) < f.apart)) continue;
    spots.push({ x, y });
  }
  for (const s of spots) addTree(w, s.x, s.y, 1 + rndInt(w, 3));
  for (const t of scen.extraTrees) addTree(w, t[0], t[1], t[2]);

  // ---- the field -----------------------------------------------------
  for (const [x, y] of scen.plots)
    w.plots.push({ id: newId('plot'), x, y, state: 'empty', water: 0, growth: 0, nibbled: 0 });

  // ---- animals -------------------------------------------------------
  for (const spec of scen.sheep) {
    w.sheep.push({
      id: newId('sheep'),
      name: spec.name,
      x: spec.at[0] + 0.5,
      y: spec.at[1] + 0.5,
      path: [],
      pathI: 0,
      hunger: 20 + rndInt(w, 25),
      thirst: 15 + rndInt(w, 30),
      fluff: 40 + rndInt(w, 30),
      mood: 'ok',
      wait: rndInt(w, 40),
      led: null,
      hearts: 0,
    });
  }
  // each one starts wanting a different thing, so there is something to notice
  for (let i = 0; i < scen.sheep.length; i++) {
    const spec = scen.sheep[i],
      sh = w.sheep[i];
    if (spec.fluff != null) sh.fluff = spec.fluff;
    if (spec.thirst != null) sh.thirst = spec.thirst;
    if (spec.hunger != null) sh.hunger = spec.hunger;
  }

  // ---- people --------------------------------------------------------
  for (const spec of scen.villagers) {
    w.villagers.push(makeVillager(w, spec));
  }
  // the people who already live somewhere take up their beds, so the one
  // without a home really does have nowhere to go
  for (const v of w.villagers) if (v.homeId) byId(w.buildings, v.homeId).residents.push(v.id);

  // ---- stones you can pick up along the river ------------------------
  for (const [sx, sy] of scen.stones) {
    const p = findSandNear(w, sx, sy);
    if (p) w.stones.push({ id: newId('sb'), x: p.x, y: p.y, count: 6, regrow: 0 });
  }

  // ---- the crossing --------------------------------------------------
  w.bridge.site = findCrossing(w, scen.crossingRow);

  ensureWorld(w);
  rebuildBlocked(w);
  return w;
}

/** A player's side of the table, as their role starts out. */
function newPlayer(id) {
  const role = ROLES[id] || {};
  const res = {},
    caps = {};
  for (const k in role.res || {}) res[k] = role.res[k];
  for (const k in role.caps || {}) caps[k] = role.caps[k];
  return { res, caps, done: {}, busy: null, seen: 0 };
}

/** Somebody from the roster, at home if their house has room for them. */
function makeVillager(w, spec) {
  const home = spec.home != null ? houseFor(w, spec.home) : null;
  return {
    id: newId('v'),
    key: spec.key,
    name: spec.name,
    colour: spec.colour,
    kid: !!spec.kid,
    x: spec.at[0] + 0.5,
    y: spec.at[1] + 0.5,
    path: [],
    pathI: 0,
    task: null,
    wait: rndInt(w, 30),
    hunger: 28 + rndInt(w, 26),
    homeId: home ? home.id : null,
    carrying: null,
    mood: 'ok',
    hearts: 0,
    said: null,
    saidUntil: 0,
  };
}

/** The nth house of the scenario, found by where it stands. */
function houseFor(w, n) {
  const spec = scenarioOf(w).houses[n];
  if (!spec) return null;
  return (
    w.buildings.find(b => b.key === spec.key) ||
    w.buildings.find(b => b.x === spec.x && b.y === spec.y) ||
    null
  );
}

/* --------------------------------------------------------------------- */
/* keeping a world up to date                                            */
/* --------------------------------------------------------------------- */

/**
 * Everything a world must have, whatever version it was saved at. This runs on
 * every load as well as on creation, so anything added to the content tables
 * turns up in worlds that were saved before it existed — no reset, no
 * migration step, nothing for a player to notice except the new thing.
 */
export function ensureWorld(w) {
  w.scenario = SCENARIOS[w.scenario] ? w.scenario : DEFAULT_SCENARIO;
  const scen = scenarioOf(w);

  for (const k of [
    'trees',
    'logs',
    'buildings',
    'plots',
    'sheep',
    'villagers',
    'stones',
    'visitors',
    'notices',
    'journal',
  ]) {
    if (!Array.isArray(w[k])) w[k] = [];
  }
  if (!w.flags || typeof w.flags !== 'object') w.flags = {};
  if (!w.ext || typeof w.ext !== 'object') w.ext = {};
  if (!w.players || typeof w.players !== 'object') w.players = {};
  if (!w.regions || typeof w.regions !== 'object') w.regions = {};

  // a role the scenario plays that this world has never heard of gets a seat
  for (const id of scen.roles || ['A', 'B']) if (!w.players[id]) w.players[id] = newPlayer(id);
  // the welcome-back screen's own memory: one list per seat of things it has
  // not shown yet. It cannot use the journal — block.start clears that every
  // day — so it keeps its own, in w.ext where nothing bumps the schema.
  // Walking w.players rather than the role list means a third role gets a
  // list for free too.
  if (!w.ext.since || typeof w.ext.since !== 'object') w.ext.since = {};
  for (const id in w.players) if (!Array.isArray(w.ext.since[id])) w.ext.since[id] = [];
  for (const r of scen.regions || [])
    if (!w.regions[r.id]) w.regions[r.id] = r.open === false ? 'later' : 'open';
  cacheRegions(w);
  if (!w.block) w.block = { active: false, startTick: 0, length: BLOCK_TICKS, endedAt: null };

  // fields that later versions expect to find on things that already exist
  for (const t of w.trees) {
    if (!t.state) t.state = 'standing';
  }
  for (const b of w.buildings) {
    if (!b.residents) b.residents = [];
    if (b.beds == null) b.beds = 0;
  }
  // a house has furniture now, and an old one keeps what it was already doing
  for (const b of w.buildings) {
    if (b.type !== 'house' || b.state !== 'built') continue;
    if (!Array.isArray(b.stuff)) b.stuff = inheritedStuff(b);
    houseFit(b);
  }
  for (const v of w.villagers) {
    if (v.kid === undefined) v.kid = false;
    if (!v.poorly) v.poorly = 0;
    // what they have been shown how to do, what is in their arms, and when
    // they last finished a job — all new, all empty in a world saved before
    // anybody thought to teach anybody anything
    if (!Array.isArray(v.skills)) v.skills = [];
    v.skills = v.skills.filter(s => s && VILLAGER_SKILLS[s.what]).slice(0, MAX_SKILLS);
    if (!v.bag || typeof v.bag !== 'object') v.bag = {};
    for (const k of BAG_KEYS) if (typeof v.bag[k] !== 'number') v.bag[k] = 0;
    if (typeof v.workedAt !== 'number') v.workedAt = 0;
    v.carrying = carried(v.carrying);
  }
  // the pile by the workshop door, where a villager puts what nobody owns
  if (!w.pile || typeof w.pile !== 'object') w.pile = {};
  for (const k of PILE_KEYS) if (typeof w.pile[k] !== 'number') w.pile[k] = 0;
  // a food nobody had caught yet when this world was saved starts at none
  for (const f of FOODS) {
    if (w.larder[f.key] == null) w.larder[f.key] = 0;
    for (const id in w.players) {
      const res = w.players[id].res;
      if (res[f.key] == null) res[f.key] = 0;
    }
  }

  ensurePeople(w, scen);
  ensurePlans(w, scen);
  return w;
}

/** Anybody in the roster who is not in this world yet moves in. */
function ensurePeople(w, scen) {
  for (const spec of scen.villagers) {
    const there = w.villagers.find(v => (v.key && v.key === spec.key) || v.name === spec.name);
    if (there) {
      if (!there.key) there.key = spec.key;
      continue;
    }
    const v = makeVillagerPlain(spec);
    w.villagers.push(v);
    const home = spec.home != null ? houseFor(w, spec.home) : null;
    if (home && home.residents.length < home.beds) {
      home.residents.push(v.id);
      v.homeId = home.id;
    }
  }
}

/** Like makeVillager, but for a world that is already running (no dice). */
function makeVillagerPlain(spec) {
  return {
    id: newId('v'),
    key: spec.key,
    name: spec.name,
    colour: spec.colour,
    kid: !!spec.kid,
    x: spec.at[0] + 0.5,
    y: spec.at[1] + 0.5,
    path: [],
    pathI: 0,
    task: null,
    wait: 20,
    hunger: 30,
    homeId: null,
    carrying: null,
    mood: 'ok',
    hearts: 0,
    said: null,
    saidUntil: 0,
  };
}

/**
 * Every project the scenario knows about has its place marked out.
 *
 * A plan the scenario has since moved — the well and the outhouse both did,
 * once, for being too close together — follows it here, on every load, so a
 * village saved before the move is not stuck with the old spot forever. Only
 * while it is still `state === 'plan'`: something standing there is
 * something somebody built, and law 12 says that never moves. A plan holds
 * nothing but where it is and its name, so nothing is lost by moving it —
 * this is additive content, not a change to what an existing field means,
 * and needs no schema bump (see "Never reset somebody's world" in CLAUDE.md).
 */
function ensurePlans(w, scen) {
  for (const spec of scen.plans) {
    const existing = w.buildings.find(b => b.id === spec.id);
    if (existing) {
      if (existing.state === 'plan') {
        const at = resolveAnchor(w, spec.anchor);
        if (at && (existing.x !== at.x || existing.y !== at.y)) {
          existing.x = at.x;
          existing.y = at.y;
          // the door is derived from x/y/w/h (see addBuilding) and has to
          // move with it, or the old tile stays the way in
          existing.door = {
            x: existing.x + ((existing.w / 2) | 0),
            y: existing.y + existing.h - 1,
          };
        }
        existing.name = spec.name; // kept true of wherever it ends up standing
      }
      continue;
    }
    const at = resolveAnchor(w, spec.anchor);
    if (!at) continue;
    addBuilding(w, {
      id: spec.id,
      type: spec.type,
      x: at.x,
      y: at.y,
      w: spec.w,
      h: spec.h,
      state: 'plan',
      name: spec.name,
      walkable: !!spec.walkable,
    });
  }
}

/* --------------------------------------------------------------------- */
/* what is in a house                                                    */
/* --------------------------------------------------------------------- */

/** Is this a slot that exists, and is it the right sort for this thing? */
export function slotFits(slot, where) {
  if (!(slot >= 0 && slot < HOUSE_ALL) || slot !== (slot | 0)) return false;
  return where === 'wall' ? slot < HOUSE_WALL : slot >= HOUSE_WALL;
}

/**
 * Everything a house is comes from what is standing in it. Beds are what you
 * can sleep in, a stove is what makes it warm, a window or a lamp is what
 * makes it light — and comfort is everything added up, because a room somebody
 * keeps bringing things to really is a nicer place to be.
 *
 * Nothing else writes these fields, so they can never drift from the furniture.
 */
export function houseFit(b) {
  if (!Array.isArray(b.stuff)) b.stuff = [];
  let beds = 0,
    warm = false,
    light = false,
    flame = false,
    comfort = 0;
  for (const s of b.stuff) {
    const def = HOUSE_STUFF[s.kind];
    if (!def) continue;
    comfort += def.comfort || 0;
    if (def.gives === 'bed') beds++;
    if (def.gives === 'warm') {
      warm = true;
      flame = true;
    }
    if (def.gives === 'light') {
      light = true;
      if (s.kind === 'lamp') flame = true;
    }
  }
  b.beds = beds;
  b.warm = warm;
  b.light = light;
  // whether there is anything in here to light. `lamp` is the simulation's,
  // and means one is burning this minute — it needs something to burn.
  b.flame = flame;
  b.comfort = comfort;
  return b;
}

/** Put a list of things in the first slots that will take them. */
export function placeStuff(kinds) {
  const out = [],
    taken = {};
  for (const kind of kinds) {
    const def = HOUSE_STUFF[kind];
    if (!def) continue;
    const from = def.where === 'wall' ? 0 : HOUSE_WALL;
    const to = def.where === 'wall' ? HOUSE_WALL : HOUSE_ALL;
    for (let i = from; i < to; i++) {
      if (taken[i]) continue;
      taken[i] = 1;
      out.push({ kind: kind, slot: i });
      break;
    }
  }
  return out;
}

/** What a house has the day it goes up: light to see by and a bed to sleep in. */
export function newHouseStuff() {
  return placeStuff(['window', 'bed']);
}

/**
 * A house built before there was anything to put in one. It keeps exactly what
 * it already behaved as though it had — every bed it was sleeping people in,
 * its window, its stove — so nobody opens their village to find it emptied.
 */
function inheritedStuff(b) {
  const plan = b.plan && typeof b.plan === 'object' ? b.plan : null;
  const inPlan = kind => {
    let n = 0;
    for (const k in plan || {}) if (plan[k] === kind) n++;
    return n;
  };
  const want = [];
  for (let i = 0; i < Math.max(1, b.beds || 0); i++) want.push('bed');
  for (let i = 0; i < Math.max(b.light === false ? 0 : 1, inPlan('window')); i++)
    want.push('window');
  if (b.warm !== false || inPlan('stove')) want.push('stove');
  for (let i = 0; i < inPlan('table'); i++) want.push('table');
  return placeStuff(want);
}

/** Where a plan goes: a plain tile, or the nearest river bank to one. */
function resolveAnchor(w, a) {
  if (!a) return null;
  if (a.tile) return { x: a.tile[0], y: a.tile[1] };
  if (a.sandNear) {
    const p = findSandNear(w, a.sandNear[0], a.sandNear[1]);
    if (!p) return null;
    const o = a.offset || [0, 0];
    return { x: p.x + o[0], y: p.y + o[1] };
  }
  return null;
}

export function addTree(w, x, y, kind) {
  w.trees.push({ id: newId('t'), x, y, kind, state: 'standing', sway: rndInt(w, 100) });
  return w.trees[w.trees.length - 1];
}

export function addBuilding(w, b) {
  b.id = b.id || newId('b');
  b.door = b.door || { x: b.x + ((b.w / 2) | 0), y: b.y + b.h - 1 };
  b.residents = b.residents || [];
  b.beds = b.beds || 0;
  b.smoke = 0;
  w.buildings.push(b);
  return b;
}

/** Nearest walkable sand tile — the river bank, where loose stones collect. */
function findSandNear(w, cx, cy) {
  for (let r = 0; r < 8; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx,
          y = cy + dy;
        if (inBounds(x, y) && w.terrain[idx(x, y)] === T.SAND) return { x, y };
      }
  return null;
}

/** The two rows where a bridge can be built, plus the water span. */
function findCrossing(w, row) {
  let x0 = GW,
    x1 = -1;
  for (const y of [row, row + 1])
    for (let x = 0; x < GW; x++)
      if (w.terrain[idx(x, y)] === T.WATER) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
  return { row, rows: 2, x0, x1, span: x1 - x0 + 1 };
}

/* --------------------------------------------------------------------- */
/* lookups                                                               */
/* --------------------------------------------------------------------- */

export const byId = (list, id) => list.find(o => o.id === id) || null;
export function otherRole(r) {
  return r === 'A' ? 'B' : 'A';
}
export function can(w, role, cap) {
  return !!w.players[role]?.caps[cap];
}

/**
 * Showing a villager how. The same gate as showing the other player: you have
 * to be able to do the thing, and to have done it twice — a count you can see
 * rather than a door that is simply shut. `stone` has no capability behind it,
 * so either of you can pass that one on once you have picked a couple up.
 */
export function teachTally(w, role, what) {
  const def = VILLAGER_SKILLS[what];
  return def ? w.players[role]?.done[def.tally] || 0 : 0;
}
export function canTeach(w, role, what) {
  const def = VILLAGER_SKILLS[what];
  if (!def || !w.players[role]) return false;
  if (def.cap && !can(w, role, def.cap)) return false;
  if (def.needs && !hasProject(w, def.needs)) return false;
  return teachTally(w, role, what) >= TEACH_TIMES;
}

export function freeBed(w) {
  for (const b of w.buildings)
    if (b.type === 'house' && b.state === 'built' && b.residents.length < b.beds) return b;
  return null;
}
export function homeless(w) {
  return w.villagers.filter(v => !v.homeId);
}

/**
 * How much bread the village gets through in a day, and how long what is in
 * the basket will last at that rate.
 *
 * Worked out from the very numbers the simulation runs on rather than a guess,
 * so it cannot quietly drift away from what actually happens: everybody's
 * hunger climbs by HUNGER_RISE every tick they are up and about, one loaf takes
 * LOAF_RELIEF off it, and a day is BLOCK_TICKS long. More people therefore
 * means fewer days out of the same basket, which is the part worth seeing.
 */
export function loavesPerDay(w) {
  const perPerson = (BLOCK_TICKS * HUNGER_RISE) / LOAF_RELIEF;
  return w.villagers.length * perPerson;
}

/** Everything in the basket, bread and fish and whatever joins them, as one number. */
export function larderTotal(w) {
  return FOODS.reduce((n, f) => n + (w.larder[f.key] || 0), 0);
}

/** Days the basket holds out, or null when there is nobody to eat it. */
export function basketDays(w) {
  const eaten = loavesPerDay(w);
  if (eaten <= 0) return null;
  return larderTotal(w) / eaten;
}

/**
 * One villager, fed: takes a single serving from the basket, bread first and
 * whatever else is there after, and says which it was — or null if the
 * basket was already bare. `finishVillagerTask()` uses this so a fish and a
 * loaf relieve the same hunger without either of them meaning something
 * different in the simulation.
 */
export function eatFromLarder(w) {
  for (const f of FOODS) {
    if ((w.larder[f.key] || 0) > 0) {
      w.larder[f.key] -= 1;
      return f.key;
    }
  }
  return null;
}
export function poorly(w) {
  return w.villagers.filter(v => v.poorly > 0);
}

/** Whose turn it is not: everybody else at the table. */
export function otherRoles(w, id) {
  return Object.keys(w.players).filter(r => r !== id);
}

/** Whether anybody at all has ever done this — a tally never goes back to zero. */
function everDone(w, what) {
  for (const id in w.players) if ((w.players[id].done[what] || 0) > 0) return true;
  return false;
}

/** Fish and wool earn their place on the resource bar only once they exist. */
export function hasFished(w) {
  return everDone(w, 'fish');
}
export function hasSheared(w) {
  return everDone(w, 'shear');
}

/** Clean water to drink, and a river nobody has spoiled. */
export function hasWell(w) {
  return hasProject(w, 'well');
}
export function riverClean(w) {
  return hasProject(w, 'privy');
}
export function fieldFenced(w) {
  return hasProject(w, 'fence');
}

/**
 * The boxes the pathfinder should treat as not-there-yet, worked out once and
 * kept on the world so rebuildBlocked() does not have to think about it.
 */
export function cacheRegions(w) {
  const out = [];
  for (const r of scenarioOf(w).regions || []) if (w.regions[r.id] === 'later') out.push(r.box);
  w.regionBoxes = out;
  return out;
}

/** Which part of the map a tile is in, and whether that part is there yet. */
export function regionAt(w, x, y) {
  const list = scenarioOf(w).regions || [];
  for (const r of list) {
    const b = r.box;
    if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) return r;
  }
  return null;
}
export function regionOpen(w, id) {
  return (w.regions || {})[id] !== 'later';
}
export function kids(w) {
  return w.villagers.filter(v => v.kid);
}

/** The house plot people are waiting on — never one of the project plans. */
export function openSite(w) {
  return w.buildings.find(b => b.state === 'site') || null;
}

/** A project: 'plan' while it is only an idea, 'built' once it is there. */
export function project(w, type) {
  return w.buildings.find(b => b.type === type) || null;
}
export function hasProject(w, type) {
  const b = project(w, type);
  return !!(b?.state === 'built');
}
export function stumps(w) {
  return w.trees.filter(t => t.state === 'stump');
}
export function saplings(w) {
  return w.trees.filter(t => t.state === 'sapling');
}

export function blockProgress(w) {
  if (!w.block.active) return w.block.endedAt !== null ? 1 : 0;
  return Math.min(1, (w.tick - w.block.startTick) / w.block.length);
}

/* --------------------------------------------------------------------- */
/* the day                                                               */
/* --------------------------------------------------------------------- */
// One day is one play block. Nobody is told how much of it is left; the light
// says it instead, and the people go to bed when it is over.

export const PHASES = [
  { at: 0.0, id: 'dawn' },
  { at: 0.12, id: 'morning' },
  { at: 0.4, id: 'midday' },
  { at: 0.66, id: 'afternoon' },
  { at: 0.84, id: 'evening' },
];

/** Where in the day we are: 'dawn' … 'evening', or 'night' once it is over. */
export function dayPhase(w) {
  if (!w.block.active) return w.block.endedAt !== null ? 'night' : 'dawn';
  const p = blockProgress(w);
  let id = PHASES[0].id;
  for (const ph of PHASES) if (p >= ph.at) id = ph.id;
  return id;
}

/** True once the people should be making their way home. */
export function isDusk(w) {
  const ph = dayPhase(w);
  return ph === 'evening' || ph === 'night';
}

/* --------------------------------------------------------------------- */
/* serialisation                                                         */
/* --------------------------------------------------------------------- */

export function serialize(w) {
  return JSON.stringify(w);
}

/**
 * Read a world back. An older world is brought up to date rather than thrown
 * away; only a world from a newer build than this one is refused, because we
 * cannot know what its fields mean.
 */
export function deserialize(text) {
  let w = null;
  try {
    w = JSON.parse(text);
  } catch {
    return null;
  }
  if (!w || typeof w !== 'object' || !Array.isArray(w.terrain)) return null;
  if (!runMigrations(w, SCHEMA)) return null;

  // keep the id counter ahead of anything already in the world, before
  // ensureWorld starts handing out ids of its own
  let max = 0;
  const scan = list => {
    if (!Array.isArray(list)) return;
    for (const o of list) {
      const n = parseInt(String(o.id).split('_')[1], 10);
      if (n > max) max = n;
    }
  };
  scan(w.trees);
  scan(w.buildings);
  scan(w.sheep);
  scan(w.villagers);
  scan(w.plots);
  scan(w.logs);
  scan(w.stones);
  scan(w.visitors);
  nextId = max + 1;

  ensureWorld(w);
  rebuildBlocked(w);
  return w;
}

export { rnd, rndInt, rndRange };
