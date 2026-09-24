// There are two ways the ground goes bare in this village, and they must not
// look the same, because one of them costs stone.
//
// A **track** is worn by feet and is free. The doors are joined up, each join
// routed with the very same A* a villager walks, and the earth gives way in
// proportion to how many journeys come that way: the trunk past the well
// carries everybody, the spur to one back door carries one person.
//
// A **road** is laid by hand out of `road.build`, a stone for every two
// tiles, and everybody re-plans onto it because it is half the work to walk.
// So it is drawn as the made thing it is — broad, bare, firm at the edge —
// and a track is a thin line with the grass still closing over it. Paying a
// stone has to show, or it buys nothing anybody can see.
//
// Nothing here is snapped to the tile grid. A tile is where the walking is
// allowed, not what the path looks like, which is why the shape that comes
// out is a curve rather than a row of squares with the corners filed off.

import { GW, GH, TILE, T, idx, inBounds } from '../core/grid.js';
import { findPath } from '../core/pathfind.js';
import { C, mix, lite, dusk } from './art.js';

/** Somebody comes out of the middle of the front wall. */
function doorOf(b) {
  return {
    x: (b.x + b.w / 2) * TILE,
    y: (b.y + b.h) * TILE - 1,
    tx: Math.max(0, Math.min(GW - 1, Math.round(b.x + b.w / 2 - 0.5))),
    ty: Math.max(0, Math.min(GH - 1, b.y + b.h)),
  };
}

/**
 * Things with no inside to go into. A fence is the clearest case: it is ten
 * tiles long and has no door, so a path to the middle of it would be a path
 * to nowhere, laid across the wheat.
 */
const NO_DOOR = new Set(['fence']);

/** Every door there is to walk to, in the order the buildings were raised. */
function doors(w) {
  const out = [];
  for (const b of w.buildings ?? []) {
    if (b.state !== 'built') continue;
    if (b.w == null || b.h == null || NO_DOOR.has(b.type)) continue;
    const d = doorOf(b);
    if (inBounds(d.tx, d.ty)) out.push(d);
  }
  return out;
}

/**
 * The cheapest set of joins that still reaches every door — a village grows
 * its paths this way, one at a time to whatever is nearest, rather than
 * laying a road from everywhere to everywhere.
 */
function spanning(nodes) {
  const n = nodes.length;
  const held = new Array(n).fill(false),
    best = new Array(n).fill(Infinity),
    from = new Array(n).fill(-1),
    edges = [];
  best[0] = 0;
  for (let k = 0; k < n; k++) {
    let at = -1;
    for (let i = 0; i < n; i++) if (!held[i] && (at < 0 || best[i] < best[at])) at = i;
    if (at < 0 || best[at] === Infinity) break;
    held[at] = true;
    if (from[at] >= 0) edges.push([from[at], at]);
    for (let i = 0; i < n; i++) {
      if (held[i]) continue;
      const dx = nodes[i].x - nodes[at].x,
        dy = nodes[i].y - nodes[at].y,
        d = dx * dx + dy * dy;
      if (d < best[i]) {
        best[i] = d;
        from[i] = at;
      }
    }
  }
  return edges;
}

/**
 * How many of the village's journeys come along each join. Cut one and the
 * village falls in two; the smaller half is how many people have no way round
 * it. That is the number that decides how wide a path is and how bare.
 */
function traffic(n, edges) {
  const near = Array.from({ length: n }, () => []);
  edges.forEach(([a, b], e) => {
    near[a].push([b, e]);
    near[b].push([a, e]);
  });
  return edges.map(([, b], cut) => {
    const seen = new Set([b]);
    const todo = [b];
    while (todo.length) {
      for (const [to, e] of near[todo.pop()]) {
        if (e === cut || seen.has(to)) continue;
        seen.add(to);
        todo.push(to);
      }
    }
    return Math.min(seen.size, n - seen.size);
  });
}

/** Corner-cutting, twice over: a walked line has no right angles left in it. */
function smooth(pts, rounds) {
  let p = pts;
  for (let r = 0; r < rounds; r++) {
    if (p.length < 3) break;
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i],
        b = p[i + 1];
      q.push({ x: a.x * 0.72 + b.x * 0.28, y: a.y * 0.72 + b.y * 0.28 });
      q.push({ x: a.x * 0.28 + b.x * 0.72, y: a.y * 0.28 + b.y * 0.72 });
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

/**
 * The village's paths: a curve per join, with `use` from 0 to 1 saying how
 * much of the village walks it. Pure, and nothing to do with a canvas, so a
 * test can ask whether a door really got a path to it.
 */
export function pathNetwork(w) {
  const nodes = doors(w);
  if (nodes.length < 2) return [];
  const edges = spanning(nodes);
  if (!edges.length) return [];
  const crossing = traffic(nodes.length, edges);
  const most = Math.max(...crossing, 1);
  const out = [];
  edges.forEach(([a, b], e) => {
    const A = nodes[a],
      B = nodes[b];
    const tiles = findPath(w, A.tx, A.ty, B.tx, B.ty, { within: 0 });
    if (!tiles) return;
    // the route is in tiles; the path is the line through the middle of them,
    // starting and finishing at the doors themselves rather than at a corner
    const raw = [{ x: A.x, y: A.y }];
    for (const t of tiles) raw.push({ x: t.x * TILE + TILE / 2, y: t.y * TILE + TILE / 2 });
    raw.push({ x: B.x, y: B.y });
    out.push({ pts: smooth(raw, 3), use: crossing[e] / most, seed: (e * 37) % 100 });
  });
  return out;
}

/**
 * The road somebody laid, as lines to draw rather than as a set of squares.
 *
 * Two tiles that touch only at a corner count as joined, because a walker
 * really does step that way — the pathfinder goes eight ways — and a road
 * laid on a slope steps diagonally all the time. The spine of a run is its
 * longest way through; whatever is left over hangs off that spine as a
 * branch, so a T-junction keeps its stub instead of losing it.
 */
export function roadRuns(w) {
  const on = (x, y) => inBounds(x, y) && w.terrain[idx(x, y)] === T.ROAD;
  const next = (x, y) => {
    const out = [];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      if (on(x + dx, y + dy)) out.push([x + dx, y + dy]);
    for (const [dx, dy] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ])
      // only where there is no way round through a square side
      if (on(x + dx, y + dy) && !on(x + dx, y) && !on(x, y + dy)) out.push([x + dx, y + dy]);
    return out;
  };
  /** Every tile reachable from here, and the step each was reached by. */
  const walk = (from, only) => {
    const back = new Map([[idx(from[0], from[1]), -1]]);
    const order = [from];
    for (let i = 0; i < order.length; i++) {
      const [x, y] = order[i];
      for (const [nx, ny] of next(x, y)) {
        const k = idx(nx, ny);
        if (back.has(k) || (only && !only.has(k))) continue;
        back.set(k, idx(x, y));
        order.push([nx, ny]);
      }
    }
    return { back, order };
  };
  const lineTo = (back, at) => {
    const pts = [];
    for (let k = at; k >= 0; k = back.get(k))
      pts.push({ x: (k % GW) + 0.5, y: Math.floor(k / GW) + 0.5 });
    return pts.reverse();
  };

  const left = new Set();
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (on(x, y)) left.add(idx(x, y));

  const runs = [];
  while (left.size) {
    const first = left.values().next().value;
    const here = walk([first % GW, Math.floor(first / GW)]);
    const whole = new Set(here.order.map(([x, y]) => idx(x, y)));
    for (const k of whole) left.delete(k);
    // the two ends furthest apart are the road's spine; the rest branches off
    const far = here.order[here.order.length - 1];
    const ends = walk(far, whole);
    const other = ends.order[ends.order.length - 1];
    const done = new Set();
    const add = pts => {
      for (const p of pts) done.add(idx(p.x - 0.5, p.y - 0.5));
      runs.push(pts.map(p => ({ x: p.x * TILE, y: p.y * TILE })));
    };
    add(lineTo(ends.back, idx(other[0], other[1])));
    // anything the spine missed is joined back onto it the short way
    let guard = 0;
    while (guard++ < 40) {
      const stray = [...whole].find(k => !done.has(k));
      if (stray == null) break;
      const out = walk([stray % GW, Math.floor(stray / GW)], whole);
      const meet = out.order.find(([x, y]) => done.has(idx(x, y)));
      add(lineTo(out.back, meet ? idx(meet[0], meet[1]) : idx(stray % GW, Math.floor(stray / GW))));
    }
  }
  // one tile on its own is still a stone somebody spent, so it still draws
  return runs.map((pts, i) => ({
    pts: smooth(pts.length > 1 ? pts : [pts[0], { x: pts[0].x + 0.01, y: pts[0].y }], 3),
    use: 1,
    seed: (i * 53) % 100,
  }));
}

/**
 * The two sides of a path, as a shape to fill. `wide` says how far out from
 * the middle at each point, so a path can breathe in and out along its length
 * instead of running at one width like a pipe.
 */
function ribbon(c, pts, wide) {
  const n = pts.length;
  if (n < 2) return;
  const L = [],
    R = [],
    H = [];
  let head0 = 0,
    head1 = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy) || 1;
    const ux = dx / len,
      uy = dy / len;
    if (i === 0) head0 = Math.atan2(uy, ux);
    if (i === n - 1) head1 = Math.atan2(uy, ux);
    const h = wide(i / (n - 1));
    H.push(h);
    L.push({ x: pts[i].x - uy * h, y: pts[i].y + ux * h });
    R.push({ x: pts[i].x + uy * h, y: pts[i].y - ux * h });
  }
  c.beginPath();
  c.moveTo(L[0].x, L[0].y);
  for (let i = 1; i < n; i++) c.lineTo(L[i].x, L[i].y);
  // round off both ends, so a path stops at a door rather than being cut off
  c.arc(pts[n - 1].x, pts[n - 1].y, H[n - 1], head1 + Math.PI / 2, head1 - Math.PI / 2, true);
  for (let i = n - 1; i >= 0; i--) c.lineTo(R[i].x, R[i].y);
  c.arc(pts[0].x, pts[0].y, H[0], head0 - Math.PI / 2, head0 + Math.PI / 2, true);
  c.closePath();
  return { L, R, H };
}

/** A smooth wander along the length of a path, so no two stretches match. */
const wander = (t, seed) =>
  1 + 0.17 * Math.sin(t * 27 + seed) + 0.11 * Math.sin(t * 63 + seed * 2.3) - 0.06;

/** Blades, a few at a time, leaning out of the edge into the path. */
function tufts(c, side, out, seed) {
  for (let i = 3; i < side.length - 3; i += 6) {
    const k = Math.abs(Math.sin(i * 12.9898 + seed * 78.233)) % 1;
    if (k < 0.34) continue;
    const p = side[i];
    // leaning in over the path, so the edge is grass rather than a line
    const a = side[Math.max(0, i - 1)],
      b = side[Math.min(side.length - 1, i + 1)];
    const len0 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const inx = ((b.y - a.y) / len0) * out,
      iny = (-(b.x - a.x) / len0) * out;
    c.fillStyle = k > 0.72 ? C.grassLite : k > 0.5 ? C.grass : C.grassDark;
    for (let j = 0; j < 3; j++) {
      const lean = (j - 1) * 0.5 + (k - 0.5) * 0.7;
      const len = 5 + k * 4 - Math.abs(j - 1) * 1.6;
      const tipx = inx * Math.cos(lean) - iny * Math.sin(lean),
        tipy = inx * Math.sin(lean) + iny * Math.cos(lean);
      c.beginPath();
      c.moveTo(p.x - iny * 0.9, p.y + inx * 0.9);
      c.lineTo(p.x + iny * 0.9, p.y - inx * 0.9);
      c.lineTo(p.x + tipx * len, p.y + tipy * len);
      c.closePath();
      c.fill();
    }
  }
}

/** The styles a draft can be in. `paint` takes the one to use. */
/**
 * What each kind of ground looks like. `wide` is the half-width from the
 * quietest way to the busiest; `verge` how far the grass gives up beyond it;
 * `worn` how much of the middle is trodden bare; `tuft` how far the grass
 * leans back in over the edge.
 */
const TRACK = { wide: [3.6, 9], verge: 1.42, bare: 1.16, worn: 0.42, tuft: 1.3, grit: 0.5 };
const ROAD = { wide: [11, 11], verge: 1.16, bare: 1.07, worn: 0.62, tuft: 0.45, grit: 1.2 };

/**
 * One kind of ground, painted band by band across the whole network rather
 * than line by line, so where two ways run together they blend into one
 * piece of worn earth instead of leaving a seam down the middle.
 */
function paintKind(c, net, S) {
  if (!net.length) return;
  const wideAt = p => t => (S.wide[0] + (S.wide[1] - S.wide[0]) * p.use) * wander(t, p.seed);
  const half = (p, scale) => {
    const base = wideAt(p);
    return t => base(t) * scale;
  };
  const band = (scale, colour, alpha) => {
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = colour;
    for (const p of net) {
      ribbon(c, p.pts, half(p, scale));
      c.fill();
    }
    c.restore();
  };

  // the grass giving up, then the earth showing through, then the middle worn
  // bare by everybody who has ever gone this way
  band(S.verge, mix(C.grass, C.roadDark, 0.5), 0.55);
  band(S.bare, mix(C.grass, C.road, 0.82), 0.92);
  band(1, C.road, 1);
  band(S.worn, lite(C.road, 0.18), 0.8);

  // the doorstep: everybody who comes out of a door stands here first
  c.save();
  c.fillStyle = mix(C.road, C.roadDark, 0.3);
  for (const p of net) {
    for (const end of [p.pts[0], p.pts[p.pts.length - 1]]) {
      c.globalAlpha = 0.5;
      c.beginPath();
      c.ellipse(end.x, end.y + 2, 13, 6.5, 0, 0, 7);
      c.fill();
    }
  }
  c.restore();

  // a thread of shade along the lower edge, because the path sits a little
  // below the grass either side of it — the same light as everything else
  c.save();
  c.globalAlpha = 0.16;
  c.strokeStyle = dusk(C.road, 0.4);
  c.lineWidth = 2.2;
  c.lineCap = 'round';
  for (const p of net) {
    const sides = ribbon(c, p.pts, half(p, 1));
    if (!sides) continue;
    c.beginPath();
    for (let i = 0; i < sides.R.length; i++) {
      const q = sides.R[i];
      if (i === 0) c.moveTo(q.x, q.y);
      else c.lineTo(q.x, q.y);
    }
    c.stroke();
  }
  c.restore();

  // stones trodden into the middle — kept well inside the edge, because grit
  // scattered out over the grass reads as snow rather than as a path
  const wide = wideAt;
  for (const p of net) {
    const n = p.pts.length;
    const every = Math.max(2, Math.round(5 / S.grit));
    for (let i = 3; i < n - 3; i += every) {
      const t = i / (n - 1);
      const k = Math.abs(Math.sin(i * 7.1 + p.seed * 3.7)) % 1;
      const a = p.pts[i - 1],
        b = p.pts[i + 1],
        len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const off = (k - 0.5) * 2 * wide(p)(t) * 0.5;
      const gx = p.pts[i].x - ((b.y - a.y) / len) * off,
        gy = p.pts[i].y + ((b.x - a.x) / len) * off;
      c.fillStyle = k > 0.84 ? lite(C.road, 0.4) : dusk(C.road, 0.22);
      c.beginPath();
      c.ellipse(gx, gy, 0.7 + k * 0.7, 0.6 + k * 0.5, k * 3, 0, 7);
      c.fill();
    }
  }

  // and the grass leaning in over both edges
  for (const p of net) {
    const sides = ribbon(c, p.pts, half(p, S.bare));
    if (!sides) continue;
    tufts(c, sides.L, -S.tuft, p.seed);
    tufts(c, sides.R, S.tuft, p.seed + 11);
  }
}

/**
 * The village's ground, in the order it settled: the tracks feet wore, then
 * the roads laid over the top of them. A road drawn second is a road you can
 * see you paid for.
 */
export function paintPaths(c, w) {
  paintKind(c, pathNetwork(w), TRACK);
  paintKind(c, roadRuns(w), ROAD);
}
