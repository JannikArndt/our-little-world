// Terrain grid: the single source of truth for where people and animals can walk.

export const GW = 40;          // tiles across
export const GH = 24;          // tiles down
export const TILE = 24;        // logical pixels per tile
export const WORLD_W = GW * TILE;   // 960
export const WORLD_H = GH * TILE;   // 576

export const T = {
  GRASS: 0,
  FOREST: 1,
  WATER: 2,
  ROAD: 3,
  BRIDGE: 4,
  FIELD: 5,
  ROCK: 6,
  SAND: 7,
};

// Movement cost per tile. Infinity = impassable.
// A road is 1 — everything else is slower, which is what makes roads worth building.
export const COST = [2.4, 3.3, Infinity, 1.0, 1.0, 2.8, Infinity, 1.8];

export const idx = (x, y) => y * GW + x;
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH;

export function tileAt(world, x, y) {
  if (!inBounds(x, y)) return T.ROCK;
  return world.terrain[idx(x, y)];
}
export function setTile(world, x, y, t) {
  if (inBounds(x, y)) world.terrain[idx(x, y)] = t;
}
export function costAt(world, x, y) {
  if (!inBounds(x, y)) return Infinity;
  if (world.blocked[idx(x, y)]) return Infinity;   // buildings, standing trees
  return COST[world.terrain[idx(x, y)]];
}
export function walkable(world, x, y) { return costAt(world, x, y) !== Infinity; }

// world (pixel) <-> tile helpers
export const toTileX = (px) => Math.floor(px / TILE);
export const toTileY = (py) => Math.floor(py / TILE);
export const tileCenterX = (tx) => tx * TILE + TILE / 2;
export const tileCenterY = (ty) => ty * TILE + TILE / 2;

/** Recompute the "blocked" overlay from buildings and standing trees. */
export function rebuildBlocked(world) {
  const b = world.blocked;
  for (let i = 0; i < b.length; i++) b[i] = 0;
  for (const bl of world.buildings) {
    if (bl.state === 'site') continue;             // an empty plot can be walked over
    for (let y = bl.y; y < bl.y + bl.h; y++)
      for (let x = bl.x; x < bl.x + bl.w; x++)
        if (inBounds(x, y)) b[idx(x, y)] = 1;
    // doorway stays open so villagers can reach the door tile
    if (bl.door) b[idx(bl.door.x, bl.door.y)] = 0;
  }
  for (const t of world.trees) {
    if (t.state === 'standing' && inBounds(t.x, t.y)) b[idx(t.x, t.y)] = 1;
  }
  // a broken bridge is a bridge nobody dares to cross
  if (world.bridge && world.bridge.built && world.bridge.damaged) {
    for (const t of world.bridge.tiles) if (inBounds(t.x, t.y)) b[idx(t.x, t.y)] = 1;
  }
}
