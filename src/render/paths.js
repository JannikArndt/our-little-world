// A path is not a kind of ground. It is where people walk — out of one door,
// past the well, in at another — and the ground gives way under them. So the
// paths in this village are worked out rather than painted on: the doors are
// joined up, each pair of them routed with the very same A* a villager uses,
// and the earth wears in proportion to how many of those journeys come this
// way. The trunk through the middle carries everybody, so it is wide and
// worn bare; the spur to one back door carries one person, so it is a thin
// line with the grass still closing over it.
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
export const STYLES = {
  // the village as it walks: a wide worn trunk, thin spurs, grass closing in
  walked: { wide: [5, 13], verge: 1.3, bare: 1.12, worn: 0.48, tuft: 1 },
  // the same, drawn narrower, with more of the grass left standing
  faint: { wide: [3.6, 9], verge: 1.4, bare: 1.16, worn: 0.42, tuft: 1.25 },
  // broader and barer, for a village that has been here longer
  worn: { wide: [6.5, 17], verge: 1.24, bare: 1.1, worn: 0.54, tuft: 0.8 },
};

/**
 * Paint the village's paths into the terrain. Band by band across the whole
 * network rather than path by path, so where two paths run together they
 * blend into one piece of worn ground instead of leaving a seam.
 */
export function paintPaths(c, w, styleName) {
  const S = STYLES[styleName] ?? STYLES.walked;
  const net = pathNetwork(w);
  if (!net.length) return;

  // A road somebody laid is a path made wider on purpose, not a second kind
  // of ground — so where a path runs over one, it broadens out.
  const paved = (x, y) => {
    const tx = Math.floor(x / TILE),
      ty = Math.floor(y / TILE);
    return inBounds(tx, ty) && w.terrain[idx(tx, ty)] === T.ROAD ? 1.42 : 1;
  };
  const wideAt = p => t => {
    const i = Math.min(p.pts.length - 1, Math.round(t * (p.pts.length - 1)));
    return (
      (S.wide[0] + (S.wide[1] - S.wide[0]) * p.use) *
      wander(t, p.seed) *
      paved(p.pts[i].x, p.pts[i].y)
    );
  };
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
    for (let i = 3; i < n - 3; i += 5) {
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
