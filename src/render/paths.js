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
// The two meet without a seam because they are measured from the same bones.
// `roadBones` gives the dots and the joins a road is made of, and both the
// shape that gets painted and the distance a track keeps from it come from
// there. A track narrows to nothing as it comes up to a road rather than
// being cut at one: a cut leaves an end, an end leaves a round cap, and a cap
// sat out on the grass wherever the painted road fell short of the square
// corner of the tile that the cutting was done against.
//
// Nothing here is snapped to the tile grid. A tile is where the walking is
// allowed, not what the path looks like, which is why the shape that comes
// out is a curve rather than a row of squares with the corners filed off.

import { GW, GH, TILE, T, idx, inBounds } from '../core/grid.js';
import { findPath } from '../core/pathfind.js';
import { C, rr, mix, lite, dusk } from './art.js';

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
    // Where the way is paved nobody wears the ground, but that is done by
    // thinning the track away as it comes up to the road (see `paintPaths`)
    // rather than by cutting it there. So every line still runs door to door,
    // whole, and no line has an end anywhere but at somebody's front step.
    out.push({ pts: smooth(raw, 3), use: crossing[e] / most, seed: (e * 37) % 100 });
  });
  return out;
}

/**
 * The road as a graph of tiles. Two tiles that touch only at a corner count
 * as joined, because a walker really does step that way — the pathfinder goes
 * eight ways, and a road laid on a slope steps diagonally all the time — but
 * only where there is no way round through a square side, so a solid block of
 * paving does not sprout crossing diagonals through the middle of itself.
 */
function roadGraph(w) {
  const on = (x, y) => inBounds(x, y) && w.terrain[idx(x, y)] === T.ROAD;
  const STEP = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  const next = (x, y) => {
    const out = [];
    for (const [dx, dy] of STEP) {
      if (!on(x + dx, y + dy)) continue;
      if (dx && dy && (on(x + dx, y) || on(x, y + dy))) continue;
      out.push([x + dx, y + dy]);
    }
    return out;
  };
  const tiles = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (on(x, y)) tiles.push([x, y]);
  return { next, tiles };
}

/**
 * The dots and the joins a road is made of: one dot in the middle of every
 * paved tile, one join between every pair of them that touch.
 *
 * Everything about a road comes from here — the shape that is painted and the
 * distance a track keeps from it. That is the whole point of the function
 * existing: while the painting was a union of discs and the giving-way was a
 * test against the square tile, the two disagreed by four pixels at every
 * corner, and four pixels is exactly the width of a half-circle of sand
 * sitting on the grass beside the bricks.
 */
function roadBones(w) {
  const { next, tiles } = roadGraph(w);
  const mid = (x, y) => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
  const segs = [];
  for (const [x, y] of tiles)
    for (const [nx, ny] of next(x, y))
      // once per pair, whichever of the two is asked first
      if (ny > y || (ny === y && nx > x)) segs.push([mid(x, y), mid(nx, ny)]);
  return { dots: tiles.map(([x, y]) => mid(x, y)), segs };
}

/**
 * How far a point is from the middle of the nearest laid road. A track uses
 * this to know when to give way, and it is measured against the same bones
 * the road is painted from, so the two can never drift apart.
 */
export function roadNear(w) {
  const { dots, segs } = roadBones(w);
  if (!dots.length) return () => Infinity;
  return (px, py) => {
    let best = Infinity;
    for (const d of dots) {
      const v = Math.hypot(px - d.x, py - d.y);
      if (v < best) best = v;
    }
    for (const [a, b] of segs) {
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy)));
      const v = Math.hypot(px - a.x - dx * t, py - a.y - dy * t);
      if (v < best) best = v;
    }
    return best;
  };
}

/**
 * Lines to lay the brickwork along. The road's *shape* is `roadShape`; these
 * only say which way the weave runs, so all they have to be is long and to
 * follow the road. The longest way through whatever is still unlaid is taken,
 * again and again, so the main road is set out first and a stub off it gives
 * way to it rather than the other way round.
 */
export function roadRuns(w) {
  const { next, tiles } = roadGraph(w);
  const left = new Set(tiles.map(([x, y]) => idx(x, y)));
  /** Every tile still unlaid that can be reached from here, and the way back. */
  const reach = from => {
    const back = new Map([[idx(from[0], from[1]), -1]]);
    const order = [from];
    for (let i = 0; i < order.length; i++) {
      const [x, y] = order[i];
      for (const [nx, ny] of next(x, y)) {
        const k = idx(nx, ny);
        if (back.has(k) || !left.has(k)) continue;
        back.set(k, idx(x, y));
        order.push([nx, ny]);
      }
    }
    return { back, order };
  };
  const runs = [];
  while (left.size) {
    // the two ends furthest apart, found the usual way round: anywhere to the
    // far end of the road, then from there to the far end of the road again
    const any = left.values().next().value;
    const { back, order } = reach(reach([any % GW, Math.floor(any / GW)]).order.at(-1));
    const last = order.at(-1);
    const pts = [];
    for (let k = idx(last[0], last[1]); k >= 0; k = back.get(k)) {
      left.delete(k);
      pts.push({ x: (k % GW) * TILE + TILE / 2, y: Math.floor(k / GW) * TILE + TILE / 2 });
    }
    runs.push(pts.reverse());
  }
  // one tile on its own is still a stone somebody spent, so it still draws
  return runs.map((pts, i) => ({
    pts: smooth(pts.length > 1 ? pts : [pts[0], { x: pts[0].x + 0.01, y: pts[0].y }], 3),
    use: 1,
    seed: (i * 53) % 100,
  }));
}

/**
 * The two sides of a path, as a shape to fill. `wide(i)` says how far out
 * from the middle at point `i`, so a path can breathe in and out along its
 * length instead of running at one width like a pipe — and can close to
 * nothing where it gives way to something else.
 *
 * It builds a `Path2D` rather than drawing, because the whole network has to
 * be filled in **one** go. Filling line by line composited every overlap
 * twice, and at half opacity that showed up as a chequerboard of tile-sized
 * blocks wherever two runs met — the shape was right and the painting was
 * what looked wrong.
 */
function ribbon(pts, wide) {
  const n = pts.length;
  if (n < 2) return null;
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
    const h = wide(i);
    H.push(h);
    L.push({ x: pts[i].x - uy * h, y: pts[i].y + ux * h });
    R.push({ x: pts[i].x + uy * h, y: pts[i].y - ux * h });
  }
  const path = new Path2D();
  path.moveTo(L[0].x, L[0].y);
  for (let i = 1; i < n; i++) path.lineTo(L[i].x, L[i].y);
  // round off both ends, so a path stops at a door rather than being cut off
  path.arc(pts[n - 1].x, pts[n - 1].y, H[n - 1], head1 + Math.PI / 2, head1 - Math.PI / 2, true);
  for (let i = n - 1; i >= 0; i--) path.lineTo(R[i].x, R[i].y);
  path.arc(pts[0].x, pts[0].y, H[0], head0 - Math.PI / 2, head0 + Math.PI / 2, true);
  path.closePath();
  return { path, L, R, H };
}

/** A smooth wander along the length of a path, so no two stretches match. */
const wander = (t, seed) =>
  1 + 0.17 * Math.sin(t * 27 + seed) + 0.11 * Math.sin(t * 63 + seed * 2.3) - 0.06;

/** Blades, a few at a time, leaning out of the edge into the path. */
function tufts(c, side, out, seed, wide) {
  for (let i = 3; i < side.length - 3; i += 6) {
    const k = Math.abs(Math.sin(i * 12.9898 + seed * 78.233)) % 1;
    if (k < 0.34) continue;
    // where a track has given way to a road there is no edge to lean over
    if (wide[i] < 2) continue;
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
const ROAD = {
  // a road's own shape comes from the tiles, so `reach` is how far the paving
  // spreads from the middle of one — far enough to cover it and meet the next
  reach: 13,
  // and `wide` is not the road's width at all but how far out from the line
  // the weave is laid before being clipped back to the paving — just past
  // the reach, and no further, or two runs near each other lay their weaves
  // over one another at different angles and the whole road turns to mush
  wide: [15, 15],
  verge: 1.3,
  bare: 1.1,
  worn: 0.62,
  tuft: 0,
  grit: 0,
  stone: true,
};

/**
 * The shape a road really covers: a disc on every paved tile and a capsule
 * between every pair that touch, all added to one `Path2D` and filled in one
 * go — so the outline is the union of the lot, rounded on the outside corners
 * and solid on the inside ones.
 *
 * This is not the same thing as a run. A run is a line *through* a road and
 * is what the brickwork is laid along; drawing the road itself as a ribbon of
 * fixed width along that line could not cover what a player had actually
 * painted, and left the grass showing through in bites — which is what made a
 * wide road look like a string of separate pieces.
 */
export function roadShape(w, reach) {
  const { dots, segs } = roadBones(w);
  const path = new Path2D();
  for (const a of dots) {
    // wound the same way round as the capsules below, or a non-zero fill
    // takes the overlap back out again and the road disappears
    path.moveTo(a.x + reach, a.y);
    path.arc(a.x, a.y, reach, 0, Math.PI * 2, true);
  }
  for (const [a, b] of segs) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = (-(b.y - a.y) / len) * reach,
      ny = ((b.x - a.x) / len) * reach;
    path.moveTo(a.x + nx, a.y + ny);
    path.lineTo(b.x + nx, b.y + ny);
    path.lineTo(b.x - nx, b.y - ny);
    path.lineTo(a.x - nx, a.y - ny);
    path.closePath();
  }
  return path;
}

/** Half a brick: they are 2U long and U across, and lie in 2U squares. */
const U = 2.3;

/**
 * One row of the weave, stepped along **its own** length rather than along
 * the middle of the road. Stepping every row at once from the middle looks
 * right on a straight and comes apart on a bend: the outer rows have further
 * to go, so they fan out, and the gaps between them showed as dark rays out
 * of every corner of every road. A row walked along itself cannot fan.
 *
 * It starts before the line and finishes after it, because a run ends in the
 * middle of the last tile it was laid along and the paving carries on to the
 * rounded end of that tile. Clipping takes back whatever went too far.
 */
function layRow(c, line, across, j, seed, over) {
  const run = [0];
  for (let i = 1; i < line.length; i++)
    run.push(run[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
  const total = run[run.length - 1];
  let at = 1;
  for (let s = -over; s < total + over; s += 2 * U) {
    while (at < run.length - 1 && run[at] < s) at++;
    const a = line[at - 1],
      b = line[at];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len,
      uy = (b.y - a.y) / len;
    const f = (s - run[at - 1]) / (run[at] - run[at - 1] || 1);
    const px = a.x + (b.x - a.x) * f,
      py = a.y + (b.y - a.y) * f;
    const square = Math.round(s / (2 * U));
    // turn and turn about, and one row over from its neighbour: that is what
    // makes it a weave rather than a grid
    const along = (square + j) % 2 === 0;
    for (const k of [-0.5, 0.5]) {
      const ds = along ? 0 : k * U,
        dt = along ? k * U : 0;
      const cx = px + ux * ds - uy * dt,
        cy = py + uy * ds + ux * dt;
      const g = Math.abs(Math.sin(square * 5.1 + j * 9.7 + (k + 1) * 3.3 + seed + across)) % 1;
      c.save();
      c.translate(cx, cy);
      c.rotate(Math.atan2(uy, ux));
      const w = along ? 2 * U - 0.4 : U - 0.4,
        h = along ? U - 0.4 : 2 * U - 0.4;
      // the brick, then the same brick again a shade down and to the right:
      // what stays showing on the upper left is the sun on its edge
      c.fillStyle = lite(g > 0.55 ? C.stone : C.stoneDark, 0.34);
      rr(c, -w / 2, -h / 2, w, h, 0.7);
      c.fill();
      c.fillStyle = g > 0.7 ? C.stone : g > 0.35 ? mix(C.stone, C.stoneDark, 0.55) : C.stoneDark;
      rr(c, -w / 2 + 0.45, -h / 2 + 0.5, w - 0.45, h - 0.5, 0.7);
      c.fill();
      c.restore();
    }
  }
}

/**
 * The stone somebody paid for, laid in **basket weave**: a square of two
 * bricks lying along the road, then a square of two lying across it, turn and
 * turn about. It is a pattern a person chooses rather than one that falls out
 * of a grid, which is the point — a road is the one piece of ground in this
 * village that somebody sat down and made.
 *
 * It is set out along the road's own length and width rather than the world's
 * x and y, so the weave turns every bend with the road and never looks like
 * it was stamped on from above. Clipped to the road, so no brick ends up out
 * on the grass, and the dark earth underneath shows between them as mortar.
 */
function bricks(c, lines, shape) {
  c.save();
  c.clip(shape);
  // shortest first, so at a junction the main road's weave is the one laid
  // last and the stub gives way to it rather than the other way round
  for (const p of [...lines].sort((a, b) => a.pts.length - b.pts.length)) {
    const n = p.pts.length;
    if (n < 2) continue;
    // the way the road faces at each point, which is also the way across it
    const dir = p.pts.map((q, i) => {
      const a = p.pts[Math.max(0, i - 1)],
        b = p.pts[Math.min(n - 1, i + 1)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    });
    const half = p.wide[0];
    const rows = Math.ceil(half / (2 * U));
    for (let j = -rows; j <= rows; j++) {
      const across = j * 2 * U + U;
      if (Math.abs(across) > half + U) continue;
      const line = p.pts.map((q, i) => ({
        x: q.x - dir[i].y * across,
        y: q.y + dir[i].x * across,
      }));
      // past the ends by the full width of the verge, because that is how
      // far the paving goes on past the middle of the last tile
      layRow(c, line, across, j, p.seed, ROAD.reach * ROAD.verge);
    }
  }
  c.restore();
}

/**
 * One kind of ground. Each band is built up across the **whole** network and
 * filled once, because filling line by line composited every overlap twice —
 * which at half opacity drew a chequerboard of tile-sized blocks wherever two
 * runs met. One fill, and two ways that run together are one piece of ground.
 */
function paintKind(c, net, S, solid, fade) {
  if (!net.length) return;
  // How far out the ground is bare, worked out once for every point of every
  // line: the style's width for how busy the way is, wandering a little so no
  // two stretches match, and — where `fade` says so — closing to nothing as
  // the line comes up to something that has already taken the ground over.
  const lines = net.map(p => {
    const out = S.wide[0] + (S.wide[1] - S.wide[0]) * p.use;
    const n = p.pts.length;
    return {
      pts: p.pts,
      seed: p.seed,
      // only a track's edge is this line, so only a track's edge wanders; a
      // road's edge is its tiles, and a wandering weave would dip inside them
      wide: p.pts.map((q, i) =>
        S.stone ? out : out * wander(i / (n - 1), p.seed) * (fade ? fade(q) : 1),
      ),
    };
  });
  const sidesAt = scale => lines.map(L => ribbon(L.pts, i => L.wide[i] * scale)).filter(Boolean);
  // a road knows its own shape from the tiles; a track's is its ribbons
  const shape = scale => {
    if (solid) return solid(scale);
    const all = new Path2D();
    for (const r of sidesAt(scale)) all.addPath(r.path);
    return all;
  };
  const band = (scale, colour, alpha) => {
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = colour;
    c.fill(shape(scale));
    c.restore();
  };

  // the grass giving up, then the earth showing through, then what is
  // underfoot: bare earth on a track, the stone somebody laid on a road
  band(S.verge, mix(C.grass, S.stone ? C.stoneDark : C.sand, 0.55), 0.5);
  band(S.bare, mix(C.grass, S.stone ? C.stone : C.sand, 0.85), 0.92);
  band(1, S.stone ? dusk(C.stoneDark, 0.3) : C.sand, 1);
  if (S.stone) bricks(c, lines, shape(1));
  else band(S.worn, mix(C.sand, C.road, 0.5), 0.55);

  // the doorstep: everybody who comes out of a door stands here first
  if (!S.stone) {
    const steps = new Path2D();
    for (const p of lines)
      for (const end of [p.pts[0], p.pts[p.pts.length - 1]])
        steps.ellipse(end.x, end.y + 2, 13, 6.5, 0, 0, 7);
    c.save();
    c.globalAlpha = 0.5;
    c.fillStyle = mix(C.sand, C.road, 0.55);
    c.fill(steps);
    c.restore();
  }

  // a thread of shade along the lower edge, because the ground sits a little
  // below the grass either side of it — the same light as everything else
  c.save();
  c.globalAlpha = S.stone ? 0.24 : 0.16;
  c.strokeStyle = dusk(S.stone ? C.stoneDark : C.sand, 0.3);
  c.lineWidth = S.stone ? 2.8 : 2.2;
  c.lineCap = 'round';
  if (solid) c.stroke(solid(1));
  else {
    c.beginPath();
    for (const r of sidesAt(1)) {
      r.R.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
    }
    c.stroke();
  }
  c.restore();

  // stones trodden into a track — kept well inside the edge, because grit
  // scattered out over the grass reads as snow rather than as a path
  if (!S.stone)
    for (const p of lines) {
      const n = p.pts.length;
      const every = Math.max(2, Math.round(5 / S.grit));
      for (let i = 3; i < n - 3; i += every) {
        if (p.wide[i] < 2) continue; // no track left here to tread anything into
        const k = Math.abs(Math.sin(i * 7.1 + p.seed * 3.7)) % 1;
        const a = p.pts[i - 1],
          b = p.pts[i + 1],
          len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const off = (k - 0.5) * 2 * p.wide[i] * 0.5;
        const gx = p.pts[i].x - ((b.y - a.y) / len) * off,
          gy = p.pts[i].y + ((b.x - a.x) / len) * off;
        c.fillStyle = k > 0.84 ? lite(C.sand, 0.3) : dusk(C.sand, 0.18);
        c.beginPath();
        c.ellipse(gx, gy, 0.7 + k * 0.7, 0.6 + k * 0.5, k * 3, 0, 7);
        c.fill();
      }
    }

  // and the grass leaning in over both edges
  if (solid) return;
  for (const L of lines) {
    const r = ribbon(L.pts, i => L.wide[i] * S.bare);
    if (!r) continue;
    tufts(c, r.L, -S.tuft, L.seed, r.H);
    tufts(c, r.R, S.tuft, L.seed + 11, r.H);
  }
}

/**
 * The village's ground, in the order it settled: the tracks feet wore, then
 * the roads laid over the top of them. A road drawn second is a road you can
 * see you paid for.
 */
export function paintPaths(c, w) {
  // A track gives way to a road rather than being cut off by one: it narrows
  // as it comes up to the paving and is gone by the outer edge of it. The
  // distance is taken from the road's own bones, so the width reaches nought
  // exactly where the road's outermost band begins and not a pixel out.
  const near = roadNear(w);
  const EDGE = ROAD.reach * ROAD.verge;
  const GIVE = TILE * 1.6; // and how far back up the track the narrowing runs
  paintKind(c, pathNetwork(w), TRACK, null, q =>
    Math.max(0, Math.min(1, (near(q.x, q.y) - EDGE) / GIVE)),
  );
  // the runs say which way the brickwork runs; the tiles say where the road is
  paintKind(c, roadRuns(w), ROAD, scale => roadShape(w, ROAD.reach * scale));
}
