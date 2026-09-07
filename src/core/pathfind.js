// A* over the terrain grid. 8-directional, no corner cutting.
// The grid is 40x24 = 960 nodes, so this is cheap enough to run on demand.

import { GW, GH, idx, costAt, inBounds, tileAt } from './grid.js';

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
];

// Reused scratch buffers — pathfinding happens often, allocation does not.
const gScore = new Float64Array(GW * GH);
const fScore = new Float64Array(GW * GH);
const cameFrom = new Int32Array(GW * GH);
const closed = new Uint8Array(GW * GH);
const stamp = new Int32Array(GW * GH);
let epoch = 0;

class Heap {
  constructor() { this.a = []; }
  clear() { this.a.length = 0; }
  push(n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (fScore[a[p]] <= fScore[a[i]]) break;
      const t = a[p]; a[p] = a[i]; a[i] = t; i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && fScore[a[l]] < fScore[a[m]]) m = l;
        if (r < a.length && fScore[a[r]] < fScore[a[m]]) m = r;
        if (m === i) break;
        const t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}
const open = new Heap();

function h(ax, ay, bx, by) {
  const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy);
}

/**
 * `opts.avoid` is a terrain a walker would rather not cross — a fenced wheat
 * field, to a sheep. It is a preference, not a wall: the goal itself is always
 * allowed, so a sheep somebody leads into the field still goes in.
 *
 * @returns {Array<{x:number,y:number}>|null} tile path including the goal, or null.
 */
export function findPath(world, sx, sy, gx, gy, opts) {
  const nearEnough = (opts && opts.within) || 0;
  const avoid = (opts && opts.avoid != null) ? opts.avoid : -1;
  if (!inBounds(sx, sy) || !inBounds(gx, gy)) return null;
  epoch++;
  open.clear();

  const start = idx(sx, sy), goal = idx(gx, gy);
  gScore[start] = 0; fScore[start] = h(sx, sy, gx, gy);
  cameFrom[start] = -1; stamp[start] = epoch; closed[start] = 0;
  open.push(start);

  let guard = 4000;
  while (open.size && guard-- > 0) {
    const cur = open.pop();
    if (closed[cur] === 1 && stamp[cur] === epoch) continue;
    closed[cur] = 1; stamp[cur] = epoch;

    const cx = cur % GW, cy = (cur / GW) | 0;
    if (cur === goal || (nearEnough && Math.abs(cx - gx) + Math.abs(cy - gy) <= nearEnough)) {
      const out = [];
      let n = cur;
      while (n !== -1) { out.push({ x: n % GW, y: (n / GW) | 0 }); n = cameFrom[n]; }
      out.reverse(); out.shift();               // drop the tile we're already on
      return out;
    }

    for (let d = 0; d < DIRS.length; d++) {
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (!inBounds(nx, ny)) continue;
      const c = costAt(world, nx, ny);
      if (c === Infinity) continue;
      if (avoid !== -1 && tileAt(world, nx, ny) === avoid && !(nx === gx && ny === gy)) continue;
      if (DIRS[d][2] > 1) {                      // no squeezing through diagonal gaps
        if (costAt(world, cx + DIRS[d][0], cy) === Infinity) continue;
        if (costAt(world, cx, cy + DIRS[d][1]) === Infinity) continue;
      }
      const ni = idx(nx, ny);
      if (stamp[ni] === epoch && closed[ni] === 1) continue;
      const tentative = gScore[cur] + c * DIRS[d][2];
      if (stamp[ni] !== epoch || tentative < gScore[ni]) {
        stamp[ni] = epoch; closed[ni] = 0;
        cameFrom[ni] = cur; gScore[ni] = tentative;
        fScore[ni] = tentative + h(nx, ny, gx, gy) * 1.02;
        open.push(ni);
      }
    }
  }
  return null;
}

/** Cheap reachability question: "could anyone get from here to there at all?" */
export function reachable(world, sx, sy, gx, gy) {
  return findPath(world, sx, sy, gx, gy, { within: 1 }) !== null;
}
