// The shared world. Plain JSON-serialisable data only — no Maps, Sets or
// typed arrays — so that a whole world fits in one network message and in
// localStorage without any conversion step.

import { GW, GH, T, idx, inBounds, rebuildBlocked } from './grid.js';
import { rnd, rndInt, rndRange } from './rng.js';

export const SCHEMA = 5;
export const TICK_MS = 100;                 // one simulation step
export const BLOCK_TICKS = 5 * 60 * 10;     // a five minute play block

export const RESOURCES = [
  { key: 'wood',  icon: '🪵', name: 'wood' },
  { key: 'plank', icon: '🪚', name: 'planks' },
  { key: 'stone', icon: '🪨', name: 'stone' },
  { key: 'wheat', icon: '🌾', name: 'wheat' },
  { key: 'food',  icon: '🍞', name: 'food' },
  { key: 'wool',  icon: '🧶', name: 'wool' },
];

export const ROLE = {
  A: { id: 'A', emoji: '🔨', name: 'Builder', colour: '#c8783c' },
  B: { id: 'B', emoji: '🌿', name: 'Keeper',  colour: '#5d9150' },
};

export const CAPS = {
  fell:   { icon: '🪓', name: 'felling trees',   owner: 'A' },
  saw:    { icon: '🪚', name: 'the sawmill',     owner: 'A' },
  bridge: { icon: '🌉', name: 'bridge building', owner: 'A' },
  house:  { icon: '🏠', name: 'house building',  owner: 'A' },
  mill:   { icon: '🌀', name: 'the mill',        owner: 'A' },
  herd:   { icon: '🐑', name: 'moving animals',  owner: 'B' },
  care:   { icon: '💚', name: 'looking after animals', owner: 'B' },
  road:   { icon: '🛤️', name: 'road building',   owner: 'B' },
  farm:   { icon: '🌱', name: 'farming',         owner: 'B' },
};

const VILLAGER_NAMES = ['Anna', 'Bo', 'Mira', 'Ted'];
const VILLAGER_COLOURS = ['#d96a5f', '#4f83b8', '#b47ec0', '#4f9c8a'];
const SHEEP_NAMES = ['Cloud', 'Pip', 'Nutmeg'];

let nextId = 1;
export function newId(prefix) { return prefix + '_' + (nextId++); }

/* --------------------------------------------------------------------- */
/* terrain                                                               */
/* --------------------------------------------------------------------- */

function riverCentre(y) { return 18.6 + Math.sin(y * 0.40) * 1.9; }
function riverHalfWidth(y) { return 1.95 + 0.45 * Math.sin(y * 0.85 + 1); }

function paintTerrain(w) {
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

export function createWorld(seed) {
  nextId = 1;
  const w = {
    schema: SCHEMA,
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
    bridge: { built: false, tiles: [], quality: 0, damaged: false },
    larder: { x: 8.5, y: 14.5, food: 7 },
    players: {
      A: { res: { wood: 2, plank: 1, stone: 2, wheat: 0, food: 0, wool: 0 },
           caps: { fell: 1, saw: 1, bridge: 1, house: 1, mill: 1 },
           done: {}, busy: null, seen: 0 },
      B: { res: { wood: 0, plank: 0, stone: 3, wheat: 0, food: 2, wool: 0 },
           caps: { herd: 1, care: 1, road: 1, farm: 1 },
           done: {}, busy: null, seen: 0 },
    },
    asks: [],
    notices: [],
    journal: [],
    seq: 0,
  };

  paintTerrain(w);

  // ---- village on the west bank -------------------------------------
  addBuilding(w, { type: 'house', x: 4,  y: 12, w: 3, h: 2, state: 'built', name: "Anna & Bo's house", beds: 2, warm: true, light: true });
  addBuilding(w, { type: 'house', x: 10, y: 12, w: 3, h: 2, state: 'built', name: "Mira's house", beds: 1, warm: true, light: true });
  addBuilding(w, { type: 'site',  x: 4,  y: 18, w: 3, h: 2, state: 'site',  name: 'an empty plot' });
  addBuilding(w, { type: 'workshop', x: 9, y: 16, w: 4, h: 3, state: 'built', name: 'the workshop' });

  paintRoad(w, 5, 14, 8, 15);
  paintRoad(w, 8, 15, 11, 14);
  paintRoad(w, 8, 15, 11, 19);

  // ---- the forest ----------------------------------------------------
  const spots = [];
  for (let i = 0; i < 60 && spots.length < 15; i++) {
    const x = 1 + rndInt(w, 11), y = 1 + rndInt(w, 8);
    if (w.terrain[idx(x, y)] !== T.FOREST) continue;
    if (spots.some(s => Math.abs(s.x - x) + Math.abs(s.y - y) < 3)) continue;
    spots.push({ x, y });
  }
  for (const s of spots) addTree(w, s.x, s.y, 1 + rndInt(w, 3));
  addTree(w, 24, 3, 2); addTree(w, 30, 12, 3); addTree(w, 35, 6, 1);   // a few on the east bank

  // ---- the field -----------------------------------------------------
  const plotAt = [[26, 16], [29, 16], [32, 16], [26, 19], [29, 19], [32, 19]];
  for (const [x, y] of plotAt) w.plots.push({ id: newId('plot'), x, y, state: 'empty', water: 0, growth: 0, nibbled: 0 });

  // ---- animals -------------------------------------------------------
  const sheepAt = [[27, 6], [31, 9], [24, 11]];
  for (let i = 0; i < 3; i++) {
    w.sheep.push({
      id: newId('sheep'), name: SHEEP_NAMES[i],
      x: sheepAt[i][0] + 0.5, y: sheepAt[i][1] + 0.5,
      path: [], pathI: 0, hunger: 20 + rndInt(w, 25), thirst: 15 + rndInt(w, 30),
      fluff: 40 + rndInt(w, 30), mood: 'ok', wait: rndInt(w, 40), led: null, hearts: 0,
    });
  }
  // each sheep starts wanting a different thing, so there is something to notice
  w.sheep[0].fluff = 94;      // wants shearing
  w.sheep[1].thirst = 82;     // wants water
  w.sheep[2].hunger = 84;     // wants hay

  // ---- people --------------------------------------------------------
  const homes = [w.buildings[0].id, w.buildings[0].id, w.buildings[1].id, null];
  const at = [[6, 15], [9, 13], [11, 15], [7, 17]];
  for (let i = 0; i < 4; i++) {
    w.villagers.push({
      id: newId('v'), name: VILLAGER_NAMES[i], colour: VILLAGER_COLOURS[i],
      x: at[i][0] + 0.5, y: at[i][1] + 0.5,
      path: [], pathI: 0, task: null, wait: rndInt(w, 30),
      hunger: 28 + rndInt(w, 26), homeId: homes[i], carrying: null,
      mood: 'ok', hearts: 0, said: null, saidUntil: 0,
    });
  }
  // the people who already live somewhere take up their beds, so the one
  // without a home really does have nowhere to go
  for (const v of w.villagers) if (v.homeId) byId(w.buildings, v.homeId).residents.push(v.id);

  // ---- stones you can pick up along the river ------------------------
  for (const [sx, sy] of [[15, 20], [21, 4]]) {
    const p = findSandNear(w, sx, sy);
    if (p) w.stones.push({ id: newId('sb'), x: p.x, y: p.y, count: 6, regrow: 0 });
  }

  // ---- the crossing --------------------------------------------------
  w.bridge.site = findCrossing(w, 12);

  rebuildBlocked(w);
  return w;
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

export function blockProgress(w) {
  if (!w.block.active) return w.block.endedAt !== null ? 1 : 0;
  return Math.min(1, (w.tick - w.block.startTick) / w.block.length);
}

/* --------------------------------------------------------------------- */
/* serialisation                                                         */
/* --------------------------------------------------------------------- */

export function serialize(w) { return JSON.stringify(w); }

export function deserialize(text) {
  const w = JSON.parse(text);
  if (!w || w.schema !== SCHEMA) return null;
  // keep the id counter ahead of anything already in the world
  let max = 0;
  const scan = (list) => { for (const o of list) { const n = parseInt(String(o.id).split('_')[1], 10); if (n > max) max = n; } };
  scan(w.trees); scan(w.buildings); scan(w.sheep); scan(w.villagers); scan(w.plots); scan(w.logs); scan(w.stones);
  nextId = max + 1;
  rebuildBlocked(w);
  return w;
}

export { rnd, rndInt, rndRange };
