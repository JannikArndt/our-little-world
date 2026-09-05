// The shared world. Plain JSON-serialisable data only — no Maps, Sets or
// typed arrays — so that a whole world fits in one network message and in
// localStorage without any conversion step.

import { GW, GH, T, idx, inBounds, rebuildBlocked } from './grid.js';
import { rnd, rndInt, rndRange } from './rng.js';
import { tr } from './i18n.js';
import { SCENARIOS, DEFAULT_SCENARIO, scenarioOf, ROLES, PROJECTS } from './content.js';
import { runMigrations } from './migrate.js';

// The shape of a saved world. It only goes up when an existing field changes
// meaning — anything new and additive is handled by ensureWorld(), so adding
// to the world does not cost anybody their village. See migrate.js.
export const SCHEMA = 7;
export const TICK_MS = 100;                 // one simulation step
export const BLOCK_TICKS = 5 * 60 * 10;     // a five minute play block

export const RESOURCES = [
  { key: 'wood',  icon: '🪵' },
  { key: 'plank', icon: '🪚' },
  { key: 'stone', icon: '🪨' },
  { key: 'wheat', icon: '🌾' },
  { key: 'food',  icon: '🍞' },
  { key: 'wool',  icon: '🧶' },
];

// what things cost and how fast they grow lives with the rest of the content
export { PROJECT, PROJECTS, SAPLING_TICKS, REPLANT_GOAL, SCENARIOS } from './content.js';

/** The roles in play, drawn from the catalogue. */
export const ROLE = ROLES;

export const CAPS = {
  fell:   { icon: '🪓', owner: 'A' },
  saw:    { icon: '🪚', owner: 'A' },
  bridge: { icon: '🌉', owner: 'A' },
  house:  { icon: '🏠', owner: 'A' },
  mill:   { icon: '🌀', owner: 'A' },
  herd:   { icon: '🐑', owner: 'B' },
  care:   { icon: '💚', owner: 'B' },
  road:   { icon: '🛤️', owner: 'B' },
  farm:   { icon: '🌱', owner: 'B' },
};

/** Names live in the language tables, not in the world. */
export function roleName(id) { return tr('role.' + id + '.short'); }
export function capName(key) { return tr('cap.' + key); }
export function resName(key) { return tr('res.' + key); }

let nextId = 1;
export function newId(prefix) { return prefix + '_' + (nextId++); }

/* --------------------------------------------------------------------- */
/* terrain                                                               */
/* --------------------------------------------------------------------- */

function riverCentre(y) { return 18.6 + Math.sin(y * 0.40) * 1.9; }
function riverHalfWidth(y) { return 1.95 + 0.45 * Math.sin(y * 0.85 + 1); }

const PAINTERS = { valley: paintValley };

function paintValley(w) {
  const t = w.terrain;
  for (let i = 0; i < GW * GH; i++) t[i] = T.GRASS;

  // forest in the north west
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 13; x++)
      if (y + x * 0.35 < 11) t[idx(x, y)] = T.FOREST;

  // the river, north to south
  for (let y = 0; y < GH; y++) {
    const cx = riverCentre(y), hw = riverHalfWidth(y);
    for (let x = 0; x < GW; x++) {
      const d = Math.abs(x + 0.5 - cx);
      if (d < hw) t[idx(x, y)] = T.WATER;
      else if (d < hw + 1.1) t[idx(x, y)] = T.SAND;
    }
  }

  // the field on the east bank
  for (let y = 15; y <= 21; y++)
    for (let x = 25; x <= 34; x++)
      if (t[idx(x, y)] === T.GRASS) t[idx(x, y)] = T.FIELD;
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
    players: {},
    regions: {},
    asks: [],
    notices: [],
    journal: [],
    flags: {},        // one-off switches: what has been seen, what is unlocked
    ext: {},          // room for anything a later version wants to keep
    seq: 0,
  };

  for (const id of scen.roles) w.players[id] = newPlayer(id);
  for (const r of scen.regions || []) w.regions[r.id] = r.open === false ? 'later' : 'open';

  (PAINTERS[scen.terrain] || paintValley)(w);

  // ---- what stands in the village ------------------------------------
  for (const h of scen.houses)
    addBuilding(w, { key: h.key, type: 'house', x: h.x, y: h.y, w: h.w, h: h.h,
                     state: 'built', name: h.name, beds: h.beds, warm: true, light: true });
  for (const st of scen.sites)
    addBuilding(w, { key: st.key, type: 'site', x: st.x, y: st.y, w: st.w, h: st.h,
                     state: 'site', name: st.name });
  for (const b of scen.works)
    addBuilding(w, { key: b.key, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h,
                     state: 'built', name: b.name });
  for (const r of scen.roads) paintRoad(w, r[0], r[1], r[2], r[3]);

  // ---- the forest ----------------------------------------------------
  const f = scen.forest;
  const spots = [];
  for (let i = 0; i < 60 && spots.length < f.count; i++) {
    const x = f.x + rndInt(w, f.w), y = f.y + rndInt(w, f.h);
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
      id: newId('sheep'), name: spec.name,
      x: spec.at[0] + 0.5, y: spec.at[1] + 0.5,
      path: [], pathI: 0, hunger: 20 + rndInt(w, 25), thirst: 15 + rndInt(w, 30),
      fluff: 40 + rndInt(w, 30), mood: 'ok', wait: rndInt(w, 40), led: null, hearts: 0,
    });
  }
  // each one starts wanting a different thing, so there is something to notice
  for (let i = 0; i < scen.sheep.length; i++) {
    const spec = scen.sheep[i], sh = w.sheep[i];
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
  const res = {}, caps = {};
  for (const k in (role.res || {})) res[k] = role.res[k];
  for (const k in (role.caps || {})) caps[k] = role.caps[k];
  return { res, caps, done: {}, busy: null, seen: 0 };
}

/** Somebody from the roster, at home if their house has room for them. */
function makeVillager(w, spec) {
  const home = spec.home != null ? houseFor(w, spec.home) : null;
  return {
    id: newId('v'), key: spec.key, name: spec.name, colour: spec.colour,
    kid: !!spec.kid, x: spec.at[0] + 0.5, y: spec.at[1] + 0.5,
    path: [], pathI: 0, task: null, wait: rndInt(w, 30),
    hunger: 28 + rndInt(w, 26), homeId: home ? home.id : null, carrying: null,
    mood: 'ok', hearts: 0, said: null, saidUntil: 0,
  };
}

/** The nth house of the scenario, found by where it stands. */
function houseFor(w, n) {
  const spec = scenarioOf(w).houses[n];
  if (!spec) return null;
  return w.buildings.find(b => b.key === spec.key) ||
         w.buildings.find(b => b.x === spec.x && b.y === spec.y) || null;
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

  for (const k of ['trees', 'logs', 'buildings', 'plots', 'sheep', 'villagers',
                   'stones', 'visitors', 'asks', 'notices', 'journal']) {
    if (!Array.isArray(w[k])) w[k] = [];
  }
  if (!w.flags || typeof w.flags !== 'object') w.flags = {};
  if (!w.ext || typeof w.ext !== 'object') w.ext = {};
  if (!w.players || typeof w.players !== 'object') w.players = {};
  if (!w.regions || typeof w.regions !== 'object') w.regions = {};

  // a role the scenario plays that this world has never heard of gets a seat
  for (const id of scen.roles || ['A', 'B']) if (!w.players[id]) w.players[id] = newPlayer(id);
  for (const r of scen.regions || []) if (!w.regions[r.id]) w.regions[r.id] = r.open === false ? 'later' : 'open';
  cacheRegions(w);
  if (!w.block) w.block = { active: false, startTick: 0, length: BLOCK_TICKS, endedAt: null };

  // fields that later versions expect to find on things that already exist
  for (const t of w.trees) { if (!t.state) t.state = 'standing'; }
  for (const b of w.buildings) { if (!b.residents) b.residents = []; if (b.beds == null) b.beds = 0; }
  for (const v of w.villagers) { if (v.kid === undefined) v.kid = false; if (!v.poorly) v.poorly = 0; }

  ensurePeople(w, scen);
  ensurePlans(w, scen);
  return w;
}

/** Anybody in the roster who is not in this world yet moves in. */
function ensurePeople(w, scen) {
  for (const spec of scen.villagers) {
    const there = w.villagers.find(v => (v.key && v.key === spec.key) || v.name === spec.name);
    if (there) { if (!there.key) there.key = spec.key; continue; }
    const v = makeVillagerPlain(spec);
    w.villagers.push(v);
    const home = spec.home != null ? houseFor(w, spec.home) : null;
    if (home && home.residents.length < home.beds) { home.residents.push(v.id); v.homeId = home.id; }
  }
}

/** Like makeVillager, but for a world that is already running (no dice). */
function makeVillagerPlain(spec) {
  return {
    id: newId('v'), key: spec.key, name: spec.name, colour: spec.colour,
    kid: !!spec.kid, x: spec.at[0] + 0.5, y: spec.at[1] + 0.5,
    path: [], pathI: 0, task: null, wait: 20,
    hunger: 30, homeId: null, carrying: null,
    mood: 'ok', hearts: 0, said: null, saidUntil: 0,
  };
}

/** Every project the scenario knows about has its place marked out. */
function ensurePlans(w, scen) {
  for (const spec of scen.plans) {
    if (w.buildings.some(b => b.id === spec.id)) continue;
    const at = resolveAnchor(w, spec.anchor);
    if (!at) continue;
    addBuilding(w, {
      id: spec.id, type: spec.type, x: at.x, y: at.y, w: spec.w, h: spec.h,
      state: 'plan', name: spec.name, walkable: !!spec.walkable,
    });
  }
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
        const x = cx + dx, y = cy + dy;
        if (inBounds(x, y) && w.terrain[idx(x, y)] === T.SAND) return { x, y };
      }
  return null;
}

/** The two rows where a bridge can be built, plus the water span. */
function findCrossing(w, row) {
  let x0 = GW, x1 = -1;
  for (const y of [row, row + 1])
    for (let x = 0; x < GW; x++)
      if (w.terrain[idx(x, y)] === T.WATER) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  return { row, rows: 2, x0, x1, span: x1 - x0 + 1 };
}

/* --------------------------------------------------------------------- */
/* lookups                                                               */
/* --------------------------------------------------------------------- */

export const byId = (list, id) => list.find(o => o.id === id) || null;
export function otherRole(r) { return r === 'A' ? 'B' : 'A'; }
export function can(w, role, cap) { return !!(w.players[role] && w.players[role].caps[cap]); }

export function freeBed(w) {
  for (const b of w.buildings)
    if (b.type === 'house' && b.state === 'built' && b.residents.length < b.beds) return b;
  return null;
}
export function homeless(w) { return w.villagers.filter(v => !v.homeId); }
export function poorly(w) { return w.villagers.filter(v => v.poorly > 0); }

/** Whose turn it is not: everybody else at the table. */
export function otherRoles(w, id) { return Object.keys(w.players).filter(r => r !== id); }

/** Clean water to drink, and a river nobody has spoiled. */
export function hasWell(w) { return hasProject(w, 'well'); }
export function riverClean(w) { return hasProject(w, 'privy'); }
export function fieldFenced(w) { return hasProject(w, 'fence'); }

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
export function regionOpen(w, id) { return (w.regions || {})[id] !== 'later'; }
export function kids(w) { return w.villagers.filter(v => v.kid); }

/** The house plot people are waiting on — never one of the project plans. */
export function openSite(w) { return w.buildings.find(b => b.state === 'site') || null; }

/** A project: 'plan' while it is only an idea, 'built' once it is there. */
export function project(w, type) { return w.buildings.find(b => b.type === type) || null; }
export function hasProject(w, type) {
  const b = project(w, type);
  return !!(b && b.state === 'built');
}
export function stumps(w) { return w.trees.filter(t => t.state === 'stump'); }
export function saplings(w) { return w.trees.filter(t => t.state === 'sapling'); }

export function blockProgress(w) {
  if (!w.block.active) return w.block.endedAt !== null ? 1 : 0;
  return Math.min(1, (w.tick - w.block.startTick) / w.block.length);
}

/* --------------------------------------------------------------------- */
/* serialisation                                                         */
/* --------------------------------------------------------------------- */

export function serialize(w) { return JSON.stringify(w); }

/**
 * Read a world back. An older world is brought up to date rather than thrown
 * away; only a world from a newer build than this one is refused, because we
 * cannot know what its fields mean.
 */
export function deserialize(text) {
  let w = null;
  try { w = JSON.parse(text); } catch (e) { return null; }
  if (!w || typeof w !== 'object' || !Array.isArray(w.terrain)) return null;
  if (!runMigrations(w, SCHEMA)) return null;

  // keep the id counter ahead of anything already in the world, before
  // ensureWorld starts handing out ids of its own
  let max = 0;
  const scan = (list) => {
    if (!Array.isArray(list)) return;
    for (const o of list) { const n = parseInt(String(o.id).split('_')[1], 10); if (n > max) max = n; }
  };
  scan(w.trees); scan(w.buildings); scan(w.sheep); scan(w.villagers);
  scan(w.plots); scan(w.logs); scan(w.stones); scan(w.visitors);
  nextId = max + 1;

  ensureWorld(w);
  rebuildBlocked(w);
  return w;
}

export { rnd, rndInt, rndRange };
