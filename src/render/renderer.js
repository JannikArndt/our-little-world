// The renderer never changes the world; it only looks at it.
// Terrain is painted once into an offscreen canvas and re-used, so a frame is
// one blit plus a few dozen small shapes — cheap enough for an old iPad.

import { GW, GH, TILE, WORLD_W, WORLD_H, T, idx } from '../core/grid.js';
import { blockProgress, dayPhase } from '../core/world.js';

// The colour of the day, in eight moments. Everything between them is mixed.
// wash is laid over the picture; dark is multiplied into it as shade.
const DAY_LIGHT = [
  { at: 0.0, wash: [120, 110, 200, 0.44], dark: [70, 80, 140, 0.34] }, // first light
  { at: 0.12, wash: [206, 232, 255, 0.1], dark: [80, 90, 140, 0.02] }, // morning
  { at: 0.35, wash: [255, 250, 220, 0.06], dark: [255, 255, 255, 0.0] }, // midday
  { at: 0.62, wash: [255, 236, 180, 0.08], dark: [255, 255, 255, 0.0] }, // afternoon
  { at: 0.8, wash: [255, 190, 95, 0.2], dark: [150, 105, 80, 0.08] }, // gold
  { at: 0.9, wash: [255, 140, 55, 0.34], dark: [140, 85, 80, 0.2] }, // sunset
  { at: 0.97, wash: [150, 110, 175, 0.34], dark: [70, 70, 130, 0.36] }, // afterglow
  { at: 1.0, wash: [90, 95, 170, 0.3], dark: [52, 58, 118, 0.46] }, // dark
];

const rgba = c =>
  'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + c[3] + ')';
import * as art from './art.js';

const C = art.C;

/** A friendly face for the field: a sack head, a straw hat with a brim that
 *  droops, a shirt on a crossbar, straw coming out of the cuffs, and a bird
 *  who has worked out that none of it means anything. */
function scarecrow(ctx, x, y) {
  ctx.save();
  ctx.lineCap = 'round';
  // the post and the crossbar
  ctx.strokeStyle = '#8a6f4a';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(x, y + 26);
  ctx.lineTo(x, y + 4);
  ctx.moveTo(x - 10, y + 11);
  ctx.lineTo(x + 10, y + 11);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,240,210,.28)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x - 1, y + 25);
  ctx.lineTo(x - 1, y + 5);
  ctx.stroke();

  // a shirt hung on it, with a sleeve blown out to one side
  ctx.fillStyle = '#9db7a0';
  ctx.beginPath();
  ctx.moveTo(x - 7, y + 9);
  ctx.lineTo(x + 7, y + 9);
  ctx.lineTo(x + 6, y + 20);
  ctx.lineTo(x - 6, y + 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#88a48c';
  ctx.beginPath();
  ctx.moveTo(x + 2, y + 9);
  ctx.lineTo(x + 7, y + 9);
  ctx.lineTo(x + 6, y + 20);
  ctx.lineTo(x + 2, y + 20);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#9db7a0';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(x - 6, y + 10);
  ctx.lineTo(x - 10, y + 12);
  ctx.moveTo(x + 6, y + 10);
  ctx.lineTo(x + 10, y + 11);
  ctx.stroke();
  // straw out of both cuffs and the bottom of the shirt
  ctx.strokeStyle = '#d8bd6e';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let i = -1; i <= 1; i++) {
    ctx.moveTo(x - 10, y + 12);
    ctx.lineTo(x - 13.5, y + 12 + i * 2);
    ctx.moveTo(x + 10, y + 11);
    ctx.lineTo(x + 13.5, y + 11 + i * 2);
    ctx.moveTo(x + i * 3, y + 20);
    ctx.lineTo(x + i * 4, y + 23.5);
  }
  ctx.stroke();

  // the head: a sack, tied at the neck
  ctx.fillStyle = '#c9974f';
  ctx.beginPath();
  ctx.arc(x, y + 3, 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,245,215,.3)';
  ctx.beginPath();
  ctx.arc(x - 1.6, y + 1.6, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a6f4a';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 3.4, y + 7.6);
  ctx.lineTo(x + 3.4, y + 7.6);
  ctx.stroke();

  // a straw hat: a crown, and a brim that has given up
  ctx.fillStyle = '#b8964f';
  ctx.beginPath();
  ctx.ellipse(x, y - 1.4, 4, 2.8, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d8bd6e';
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 0.6);
  ctx.quadraticCurveTo(x, y - 3.4, x + 9, y - 0.6);
  ctx.quadraticCurveTo(x, y + 1.6, x - 9, y - 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(120,92,40,.3)';
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 0.6);
  ctx.quadraticCurveTo(x, y + 1.6, x + 9, y - 0.6);
  ctx.quadraticCurveTo(x, y + 0.8, x - 9, y - 0.6);
  ctx.closePath();
  ctx.fill();

  // two button eyes, a stitched smile, and one rosy cheek
  ctx.fillStyle = '#43372a';
  ctx.beginPath();
  ctx.arc(x - 2, y + 3, 0.9, 0, Math.PI * 2);
  ctx.arc(x + 2, y + 3, 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath();
  ctx.arc(x - 2.2, y + 2.7, 0.3, 0, Math.PI * 2);
  ctx.arc(x + 1.8, y + 2.7, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#43372a';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(x, y + 4.4, 2, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = 'rgba(214,120,110,.35)';
  ctx.beginPath();
  ctx.ellipse(x - 3.4, y + 4.6, 1.2, 0.8, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 3.4, y + 4.6, 1.2, 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // and the bird, sitting on the end of the crossbar
  ctx.fillStyle = '#5d5148';
  ctx.beginPath();
  ctx.ellipse(x + 11, y + 8, 2.6, 2.1, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 12.6, y + 6.2, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e0a03e';
  ctx.beginPath();
  ctx.moveTo(x + 13.9, y + 6.1);
  ctx.lineTo(x + 15.6, y + 6.6);
  ctx.lineTo(x + 13.9, y + 7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + 13, y + 5.9, 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#43372a';
  ctx.beginPath();
  ctx.arc(x + 13.1, y + 5.9, 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Draw one edge of the river as a smooth curve through the tile edges. */
function ribbon(ctx, pts, grow, reverse) {
  const p = reverse ? pts.slice().reverse() : pts;
  // Reversed travels bottom-to-top, so its cap at each end points the other
  // way — otherwise the far (east) bank bled inward off the map instead of
  // outward, and the river looked cut off square at the top and bottom.
  const cap = reverse ? 40 : -40;
  const first = { x: p[0].x + grow, y: p[0].y + cap };
  if (reverse) ctx.lineTo(first.x, first.y);
  else ctx.moveTo(first.x, first.y);
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i],
      b = p[i + 1];
    ctx.quadraticCurveTo(a.x + grow, a.y, (a.x + b.x) / 2 + grow, (a.y + b.y) / 2);
  }
  const last = p[p.length - 1];
  ctx.lineTo(last.x + grow, last.y - cap);
}

function tileNoise(x, y) {
  // stable per-tile pseudo random
  let h = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// The closest you may get, as the size one tile ends up on the glass. Four
// times the size it is drawn is close enough to tap a sheep's nose and far
// enough that the village is still a village.
const MAX_TILE_PX = 96;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.terrain = document.createElement('canvas');
    this.terrain.width = WORLD_W;
    this.terrain.height = WORLD_H;
    this.tctx = this.terrain.getContext('2d');
    this.stamp = -1;
    this.water = [];
    this.cam = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 };
    this.fit = 1;
    this.dpr = 1;
    this.view = { w: 0, h: 0 };
    this.halo = true;
    this.userZoom = false;
  }

  /* ---------------- viewport ---------------- */

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)),
      h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
    this.view = { w: r.width, h: r.height };
    this.fit = Math.min(r.width / WORLD_W, r.height / WORLD_H);
    // On a tall screen, fitting the whole world would waste most of it.
    // Fill the viewport instead and let people pan; a wide screen keeps zoom 1.
    if (!this.userZoom) {
      const cover = Math.max(r.width / WORLD_W, r.height / WORLD_H) / this.fit;
      this.cam.zoom = Math.max(1, Math.min(3.2, cover));
    }
    this.clampCamera();
  }

  /**
   * The canvas can change size with no resize event to announce it: a phone's
   * address bar sliding away moves the visual viewport, `--app-h` re-lays the
   * page, and the stage quietly gets taller. Until we notice, every tap is
   * mapped through the old rectangle and lands somewhere else. So the frame
   * loop asks, and re-measuring only actually happens when something moved.
   */
  remeasure() {
    const r = this.canvas.getBoundingClientRect();
    if (Math.abs(r.width - this.view.w) < 0.5 && Math.abs(r.height - this.view.h) < 0.5) return;
    this.resize();
  }

  scale() {
    return this.fit * this.cam.zoom;
  }

  /**
   * How close you may get. Not a bare number, because the same number means a
   * different thing on a phone and on a laptop: it is a tile drawn four times
   * the size it is painted, whatever the screen. Zoom 1 is always the whole
   * world, so that stays the floor.
   */
  maxZoom() {
    return Math.max(1, MAX_TILE_PX / TILE / (this.fit || 1));
  }

  /**
   * How far you may push the world about: anywhere from one corner to the
   * other, in both directions, always. It used to stop as soon as an edge
   * reached the edge of the screen — and worse, an axis that happened to fit
   * exactly was pinned to the middle and would not budge at all, which on a
   * phone is the up-and-down one every time. So a tree in the top row could
   * never be brought out from under the top bar. Now anything at all can be
   * put in the middle of the screen and tapped in clear air. The camera still
   * never leaves the world; past the edge is a soft green, not more village.
   */
  clampCamera() {
    this.cam.x = Math.max(0, Math.min(WORLD_W, this.cam.x));
    this.cam.y = Math.max(0, Math.min(WORLD_H, this.cam.y));
  }

  toScreen(wx, wy) {
    const s = this.scale();
    return {
      x: (wx - this.cam.x) * s + this.view.w / 2,
      y: (wy - this.cam.y) * s + this.view.h / 2,
    };
  }
  toWorld(sx, sy) {
    const s = this.scale();
    return {
      x: (sx - this.view.w / 2) / s + this.cam.x,
      y: (sy - this.view.h / 2) / s + this.cam.y,
    };
  }

  /* ---------------- terrain cache ---------------- */

  terrainStamp(w) {
    let s = 0;
    for (let i = 0; i < w.terrain.length; i++) s += w.terrain[i] * (i + 1);
    return s;
  }

  paintTerrain(w) {
    const c = this.tctx;
    this.water.length = 0;
    c.clearRect(0, 0, WORLD_W, WORLD_H);

    // 1. a meadow, in soft patches rather than squares — two passes, a broad
    //    one for the lie of the land and a finer one for the mown-in-places
    //    look a field gets when animals have been over it
    c.fillStyle = C.grass;
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    for (let i = 0; i < 150; i++) {
      const n1 = tileNoise(i, 3),
        n2 = tileNoise(i, 11),
        n3 = tileNoise(i, 29);
      c.fillStyle = n3 > 0.5 ? C.grassLite : C.grassDark;
      c.globalAlpha = 0.3;
      c.beginPath();
      c.ellipse(n1 * WORLD_W, n2 * WORLD_H, 26 + n3 * 46, 18 + n1 * 26, n2 * 3, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 90; i++) {
      const n1 = tileNoise(i, 71),
        n2 = tileNoise(i, 97),
        n3 = tileNoise(i, 131);
      c.fillStyle = n3 > 0.5 ? art.lite(C.grassLite, 0.22) : art.dusk(C.grassDark, 0.1);
      c.globalAlpha = 0.16;
      c.beginPath();
      c.ellipse(n1 * WORLD_W, n2 * WORLD_H, 9 + n3 * 16, 6 + n1 * 10, n2 * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;

    // 2. the forest as a mass of overlapping canopy shade, with the warm
    //    leaf litter under it showing through in the gaps
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (w.terrain[idx(x, y)] !== T.FOREST) continue;
        const n = tileNoise(x, y);
        c.globalAlpha = 0.2;
        c.fillStyle = '#9c8046';
        c.beginPath();
        c.ellipse(
          x * TILE + TILE / 2,
          y * TILE + TILE / 2,
          TILE * 0.7,
          TILE * 0.6,
          n * 3,
          0,
          Math.PI * 2,
        );
        c.fill();
        c.globalAlpha = 0.52;
        c.fillStyle = n > 0.5 ? C.forest : C.forestDark;
        c.beginPath();
        c.ellipse(
          x * TILE + TILE / 2,
          y * TILE + TILE / 2,
          TILE * 0.92,
          TILE * 0.84,
          n * 3,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    // fallen leaves and a few ferns, where the light gets through
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (w.terrain[idx(x, y)] !== T.FOREST) continue;
        const n = tileNoise(x + 61, y + 7);
        c.globalAlpha = 0.34;
        for (let i = 0; i < 3; i++) {
          const m = tileNoise(x + i * 13, y + i * 29);
          c.fillStyle = m > 0.66 ? '#b8933f' : m > 0.33 ? '#8f7434' : C.forestDark;
          c.beginPath();
          c.ellipse(
            x * TILE + 4 + m * (TILE - 8),
            y * TILE + 4 + n * (TILE - 8) + i * 5,
            2.2,
            1.1,
            m * 3,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
        if (n > 0.78) {
          // a patch of sun on the forest floor
          c.globalAlpha = 0.18;
          c.fillStyle = '#fff3c8';
          c.beginPath();
          c.ellipse(x * TILE + 12, y * TILE + 12, 8, 5, n * 3, 0, Math.PI * 2);
          c.fill();
        }
      }
    c.globalAlpha = 1;

    // 3. the ploughed field
    let fx0 = GW,
      fy0 = GH,
      fx1 = -1,
      fy1 = -1;
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++)
        if (w.terrain[idx(x, y)] === T.FIELD) {
          if (x < fx0) fx0 = x;
          if (x > fx1) fx1 = x;
          if (y < fy0) fy0 = y;
          if (y > fy1) fy1 = y;
        }
    if (fx1 >= 0) {
      c.fillStyle = C.field;
      for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
          if (w.terrain[idx(x, y)] !== T.FIELD) continue;
          c.beginPath();
          c.ellipse(
            x * TILE + TILE / 2,
            y * TILE + TILE / 2,
            TILE * 0.78,
            TILE * 0.74,
            0,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
      // furrows, each a dark trough with a lit ridge beside it, and clods
      for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
          if (w.terrain[idx(x, y)] !== T.FIELD) continue;
          for (let i = 0; i < 2; i++) {
            const yy = y * TILE + 7 + i * 10;
            c.fillStyle = 'rgba(120,95,60,.12)';
            c.fillRect(x * TILE, yy - 1, TILE, 2);
            c.fillStyle = 'rgba(255,240,205,.16)';
            c.fillRect(x * TILE, yy + 1, TILE, 1.2);
          }
          const n = tileNoise(x + 5, y + 17);
          c.fillStyle = 'rgba(120,95,60,.16)';
          for (let i = 0; i < 3; i++) {
            c.beginPath();
            c.ellipse(
              x * TILE + 3 + ((n * 617 + i * 211) % (TILE - 6)),
              y * TILE + 3 + ((n * 431 + i * 157) % (TILE - 6)),
              1.6,
              1,
              n * 3,
              0,
              Math.PI * 2,
            );
            c.fill();
          }
        }
      scarecrow(c, fx0 * TILE + 10, fy0 * TILE + 6);
    }

    // 4. the river, as one smooth ribbon rather than a staircase of tiles
    const left = [],
      right = [];
    for (let y = 0; y < GH; y++) {
      let a = -1,
        b = -1;
      for (let x = 0; x < GW; x++) {
        const t = w.terrain[idx(x, y)];
        if (t === T.WATER || t === T.BRIDGE) {
          if (a < 0) a = x;
          b = x;
        }
      }
      if (a < 0) continue;
      left.push({ x: a * TILE, y: y * TILE + TILE / 2 });
      right.push({ x: (b + 1) * TILE, y: y * TILE + TILE / 2 });
    }
    if (left.length > 1) {
      const band = (grow, fill) => {
        c.fillStyle = fill;
        c.beginPath();
        ribbon(c, left, -grow, false);
        ribbon(c, right, grow, true);
        c.closePath();
        c.fill();
      };
      // dry sand out at the edge, damp sand where the water actually reaches,
      // then the river itself: darker along both banks, paler in the middle,
      // which is what a shallow river bed does to the colour of it
      band(TILE * 0.85, C.sand);
      band(TILE * 0.25, art.dusk(C.sand, 0.14));
      band(0, C.waterDeep);
      band(-TILE * 0.28, C.water);
      c.save();
      c.globalAlpha = 0.3;
      c.strokeStyle = C.waterDeep;
      c.lineWidth = 7;
      c.beginPath();
      ribbon(c, left, 3, false);
      c.stroke();
      c.beginPath();
      ribbon(c, right, -3, false);
      c.stroke();
      c.restore();

      // pebbles up the sand, and reeds where the bank meets the water
      for (let i = 0; i < left.length; i += 2) {
        const n = tileNoise(i, 23);
        for (const [p, side] of [
          [left[i], -1],
          [right[i], 1],
        ]) {
          const m = tileNoise(i * 3, side + 9);
          c.fillStyle = 'rgba(150,140,120,.45)';
          c.beginPath();
          c.ellipse(p.x + side * (4 + m * 12), p.y + n * 8 - 4, 2.2, 1.4, m * 3, 0, Math.PI * 2);
          c.fill();
          if (m > 0.62) {
            c.strokeStyle = 'rgba(96,140,78,.75)';
            c.lineWidth = 1.2;
            c.lineCap = 'round';
            c.beginPath();
            for (let k = -1; k <= 1; k++) {
              c.moveTo(p.x + side * 2 + k, p.y + 3);
              c.lineTo(p.x + side * 2 + k * 2.4, p.y - 6 - Math.abs(k) * 2);
            }
            c.stroke();
            c.fillStyle = '#8a6f4a';
            c.beginPath();
            c.ellipse(p.x + side * 2, p.y - 7.5, 0.9, 2.2, 0, 0, Math.PI * 2);
            c.fill();
          }
        }
      }

      for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
          const t = w.terrain[idx(x, y)];
          if (t === T.WATER || t === T.BRIDGE)
            this.water.push({ x: x * TILE, y: y * TILE, n: tileNoise(x, y) });
        }
    }

    // 5. roads: overlapping rounded patches make a path, not a row of squares,
    //    with two ruts worn down the middle and grass creeping in at the edges
    c.fillStyle = C.roadDark;
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (w.terrain[idx(x, y)] !== T.ROAD) continue;
        c.beginPath();
        c.ellipse(
          x * TILE + TILE / 2,
          y * TILE + TILE / 2,
          TILE * 0.64,
          TILE * 0.6,
          0,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    c.fillStyle = C.road;
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (w.terrain[idx(x, y)] !== T.ROAD) continue;
        c.beginPath();
        c.ellipse(
          x * TILE + TILE / 2,
          y * TILE + TILE / 2 - 0.8,
          TILE * 0.58,
          TILE * 0.54,
          0,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (w.terrain[idx(x, y)] !== T.ROAD) continue;
        const n = tileNoise(x, y + 5),
          m = tileNoise(x + 7, y);
        // the ruts, where a cart has been this way more than once
        c.fillStyle = 'rgba(150,120,80,.2)';
        c.fillRect(x * TILE, y * TILE + 6, TILE, 2.4);
        c.fillRect(x * TILE, y * TILE + 16, TILE, 2.4);
        c.fillStyle = C.roadDark;
        for (let i = 0; i < 5; i++)
          c.fillRect(
            x * TILE + ((n * 733 + i * 173) % TILE),
            y * TILE + ((m * 419 + i * 251) % TILE),
            1.8,
            1.8,
          );
        // and a few paler bits of grit that catch the light
        c.fillStyle = 'rgba(255,245,215,.3)';
        for (let i = 0; i < 3; i++)
          c.fillRect(
            x * TILE + ((m * 593 + i * 137) % TILE),
            y * TILE + ((n * 311 + i * 197) % TILE),
            1.4,
            1.4,
          );
      }

    // 6. small things that make it look lived in
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        const t = w.terrain[idx(x, y)];
        if (t !== T.GRASS && t !== T.SAND) continue;
        const n = tileNoise(x + 13, y + 41);
        const px = x * TILE + 4 + ((n * 311) % (TILE - 8));
        const py = y * TILE + 4 + ((n * 907) % (TILE - 8));
        if (t === T.SAND) {
          if (n < 0.8) continue;
          // a pebble with a light on top of it and a shadow under it, or a
          // little piece of driftwood
          if (n > 0.95) {
            c.fillStyle = 'rgba(140,115,80,.45)';
            c.beginPath();
            c.ellipse(px, py, 4.4, 1.3, n * 3, 0, Math.PI * 2);
            c.fill();
          } else {
            c.fillStyle = 'rgba(120,110,95,.3)';
            c.beginPath();
            c.ellipse(px + 0.6, py + 0.8, 2.6, 1.7, n * 3, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = 'rgba(168,158,138,.75)';
            c.beginPath();
            c.ellipse(px, py, 2.4, 1.7, n * 3, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = 'rgba(255,250,235,.45)';
            c.beginPath();
            c.ellipse(px - 0.6, py - 0.5, 1.2, 0.8, n * 3, 0, Math.PI * 2);
            c.fill();
          }
        } else if (n > 0.955) {
          // a little bush, with a lit crown and a shadow of its own
          c.fillStyle = 'rgba(60,50,35,.12)';
          c.beginPath();
          c.ellipse(px + 2, py + 3.4, 6, 2, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = C.forestDark;
          c.beginPath();
          c.arc(px, py, 4.2, 0, Math.PI * 2);
          c.arc(px + 4, py + 1.4, 3.4, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = art.lite(C.forest, 0.18);
          c.beginPath();
          c.arc(px - 0.8, py - 1.4, 2.6, 0, Math.PI * 2);
          c.fill();
        } else if (n > 0.9) {
          // flowers: a petalled head on a stem, not three pixels in a row
          const petal = n > 0.93 ? '#f6e08a' : '#f0a8b8';
          for (let f = 0; f < 3; f++) {
            const fx = px + f * 4,
              fy = py + ((f * 5) % 4);
            c.strokeStyle = 'rgba(110,160,90,.8)';
            c.lineWidth = 0.8;
            c.beginPath();
            c.moveTo(fx, fy + 3.4);
            c.lineTo(fx, fy);
            c.stroke();
            c.fillStyle = petal;
            for (let k = 0; k < 4; k++) {
              const a = (k / 4) * Math.PI * 2;
              c.beginPath();
              c.arc(fx + Math.cos(a) * 1.1, fy + Math.sin(a) * 1.1, 0.95, 0, Math.PI * 2);
              c.fill();
            }
            c.fillStyle = '#e8c05a';
            c.beginPath();
            c.arc(fx, fy, 0.7, 0, Math.PI * 2);
            c.fill();
          }
        } else if (n > 0.86) {
          // a tuft of longer grass, three blades and a shadow at the root
          c.strokeStyle = 'rgba(96,150,72,.45)';
          c.lineWidth = 1.5;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(px + 1, py + 3.6);
          c.lineTo(px + 1.4, py - 1.6);
          c.stroke();
          c.strokeStyle = C.grassLite;
          c.lineWidth = 1.4;
          c.beginPath();
          c.moveTo(px, py + 3);
          c.lineTo(px + 1, py - 2);
          c.moveTo(px + 3, py + 3);
          c.lineTo(px + 2.5, py - 3);
          c.moveTo(px + 5, py + 3);
          c.lineTo(px + 6, py - 1.4);
          c.stroke();
        }
      }

    // a soft border so the world reads as a little diorama
    c.strokeStyle = 'rgba(80,66,48,.20)';
    c.lineWidth = 6;
    c.strokeRect(3, 3, WORLD_W - 6, WORLD_H - 6);
  }

  /* ---------------- frame ---------------- */

  render(w, time, extra) {
    const ctx = this.ctx;
    const st = this.terrainStamp(w);
    if (st !== this.stamp) {
      this.paintTerrain(w);
      this.stamp = st;
    }

    const s = this.scale();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#b9d3c2';
    ctx.fillRect(0, 0, this.view.w, this.view.h);
    ctx.save();
    ctx.translate(this.view.w / 2, this.view.h / 2);
    ctx.scale(s, s);
    ctx.translate(-this.cam.x, -this.cam.y);

    art.setSun(this.sunFor(w));
    ctx.drawImage(this.terrain, 0, 0);
    this.drawWaterShimmer(ctx, time);
    art.drawBridge(ctx, w.bridge, time);

    // everything that stands up, painted back to front
    const things = [];
    for (const b of w.buildings) things.push({ y: b.y + b.h, kind: 'building', o: b });
    for (const t of w.trees) things.push({ y: t.y + 0.4, kind: 'tree', o: t });
    for (const l of w.logs) things.push({ y: l.y, kind: 'log', o: l });
    for (const p of w.plots) things.push({ y: p.y + 2, kind: 'plot', o: p });
    for (const sb of w.stones) things.push({ y: sb.y + 0.5, kind: 'stones', o: sb });
    for (const v of w.villagers) if (!v.inside) things.push({ y: v.y, kind: 'villager', o: v });
    for (const sh of w.sheep) things.push({ y: sh.y, kind: 'sheep', o: sh });
    if (w.visitors) for (const c of w.visitors) things.push({ y: c.y, kind: 'deer', o: c });
    things.push({ y: w.larder.y, kind: 'larder', o: w.larder });
    things.sort((a, b) => a.y - b.y);

    if (this.halo) this.drawHalos(ctx, w, time, extra);

    for (const th of things) {
      const o = th.o;
      switch (th.kind) {
        case 'building':
          if (o.type === 'boat') art.drawLanding(ctx, o, time, w.tick);
          else if (o.type === 'play') {
            if (o.state === 'built') art.drawPlayground(ctx, o, time, w.tick);
            else art.drawPlan(ctx, o, time, '🛝');
          } else if (o.type === 'well') {
            if (o.state === 'built') art.drawWell(ctx, o, time, w.tick);
            else art.drawPlan(ctx, o, time, '🪣');
          } else if (o.type === 'privy') {
            if (o.state === 'built') art.drawPrivy(ctx, o, time, w.tick);
            else art.drawPlan(ctx, o, time, '🚪');
          } else if (o.type === 'fence') {
            if (o.state === 'built') art.drawFence(ctx, o, time);
            else art.drawPlan(ctx, o, time, '🚧');
          } else if (o.state === 'site') art.drawSite(ctx, o, time);
          else if (o.type === 'workshop') art.drawWorkshop(ctx, o, time, w.tick, w.pile);
          else art.drawHouse(ctx, o, time, w.tick);
          break;
        case 'tree': {
          if (o.state === 'standing') art.drawTree(ctx, o, time);
          else if (o.state === 'sapling') art.drawSapling(ctx, o, time);
          else {
            const age = w.tick - (o.fellTick ?? -999);
            if (age < 18) {
              art.drawStump(ctx, o);
              art.drawFallingTree(ctx, o, age / 18);
            } else art.drawStump(ctx, o);
          }
          break;
        }
        case 'log':
          art.drawLog(ctx, o);
          break;
        case 'plot':
          art.drawPlot(ctx, o, time);
          break;
        case 'stones':
          art.drawStoneBank(ctx, o);
          break;
        case 'villager':
          art.drawVillager(ctx, o, time, w.tick, true);
          break;
        case 'sheep':
          art.drawSheep(ctx, o, time, w.tick, true);
          break;
        case 'deer':
          art.drawDeer(ctx, o, time);
          break;
        case 'larder':
          art.drawLarder(ctx, o, time);
          break;
        default:
          break;
      }
    }

    // and then, over the lot of it, whatever anybody is saying. A bubble is
    // words to read and a picture to notice; a roof standing between you and
    // it is only a roof in the way, so this pass comes after the village.
    for (const th of things) {
      if (th.kind === 'villager') art.drawVillagerSay(ctx, th.o);
      else if (th.kind === 'sheep') art.drawSheepSay(ctx, th.o, w.tick);
    }

    if (w.regionBoxes?.length) this.drawMist(ctx, w, time);
    if (w.fx) for (const f of w.fx) art.drawFx(ctx, f, w.tick - f.born);
    if (extra?.overlay) extra.overlay(ctx, s);

    ctx.restore();
    this.drawDayLight(ctx, w);
  }

  drawWaterShimmer(ctx, time) {
    ctx.strokeStyle = 'rgba(255,255,255,.30)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let i = 0; i < this.water.length; i += 3) {
      const t = this.water[i];
      const ph = time * 0.0011 + t.n * 6.28;
      const ox = Math.sin(ph) * 5;
      ctx.globalAlpha = 0.28 + 0.22 * Math.sin(ph * 1.7);
      ctx.beginPath();
      ctx.moveTo(t.x + 5 + ox, t.y + 8 + t.n * 8);
      ctx.lineTo(t.x + 15 + ox, t.y + 8 + t.n * 8);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Somewhere the world has not got to yet: soft weather, not a wall. */
  drawMist(ctx, w, time) {
    for (const box of w.regionBoxes) {
      const x = box[0] * TILE,
        y = box[1] * TILE;
      const bw = (box[2] - box[0] + 1) * TILE,
        bh = (box[3] - box[1] + 1) * TILE;
      ctx.save();
      ctx.fillStyle = 'rgba(236,240,238,.88)';
      ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      for (let i = 0; i < 14; i++) {
        const cx = x + ((i * 137) % bw),
          cy = y + ((i * 89) % bh);
        const r = 18 + (i % 4) * 9 + Math.sin(time * 0.0006 + i) * 4;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** A slow, quiet ring around things that would like some attention. */
  drawHalos(ctx, w, time, extra) {
    const pulse = 0.35 + 0.25 * Math.sin(time * 0.003);
    const ring = (x, y, r, colour) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2.4;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    for (const s of w.sheep)
      if (s.mood !== 'ok') ring(s.x * TILE, s.y * TILE + 3, 15, 'rgba(93,145,80,.9)');
    for (const p of w.plots)
      if (p.state === 'ripe' || (p.state === 'growing' && p.water <= 8))
        ring(p.x * TILE + TILE, p.y * TILE + TILE, 24, 'rgba(224,185,80,.95)');
    for (const b of w.buildings)
      if (b.state === 'site' && b.type === 'site')
        ring(
          b.x * TILE + (b.w * TILE) / 2,
          b.y * TILE + b.h * TILE - 4,
          b.w * TILE * 0.5,
          'rgba(200,120,60,.9)',
        );
    for (const l of w.logs) ring(l.x * TILE, l.y * TILE + 3, 16, 'rgba(169,116,63,.9)');
    if (w.bridge.damaged)
      ring(
        ((w.bridge.site.x0 + w.bridge.site.x1 + 1) * TILE) / 2,
        (w.bridge.site.row + 1) * TILE,
        34,
        'rgba(200,90,70,.95)',
      );
    if (extra?.highlight) {
      const h = extra.highlight;
      ring(h.x * TILE, h.y * TILE, h.r || 20, 'rgba(255,255,255,.95)');
    }
    if (extra?.spotlight) {
      // who the guide is talking about: a slower, wider ring than the rest
      const sp = extra.spotlight;
      const beat = 0.45 + 0.35 * Math.sin(time * 0.0022);
      ctx.strokeStyle = 'rgba(242,193,78,.95)';
      ctx.lineWidth = 3;
      ctx.globalAlpha = beat;
      ctx.beginPath();
      ctx.ellipse(sp.x * TILE, sp.y * TILE + 3, sp.r || 22, (sp.r || 22) * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /**
   * The day, told as light. Two passes over the finished picture: a wash that
   * gives the hour its colour, and a multiply that puts shade under it — warm
   * shade while the sun is low, cold once it has gone. No clock anywhere: if
   * you want to know how late it is, you look outside.
   */
  dayLight(w) {
    if (dayPhase(w) === 'night') return { wash: [70, 90, 190, 0.26], dark: [44, 52, 110, 0.55] };
    const p = blockProgress(w);
    const k = DAY_LIGHT;
    let i = 0;
    while (i < k.length - 2 && p >= k[i + 1].at) i++;
    const a = k[i],
      b = k[i + 1];
    const t = Math.max(0, Math.min(1, (p - a.at) / (b.at - a.at)));
    const mix = (x, y) => x.map((v, n) => v + (y[n] - v) * t);
    return { wash: mix(a.wash, b.wash), dark: mix(a.dark, b.dark) };
  }

  /** Where the sun stands, for everything that casts a shadow. */
  sunFor(w) {
    if (dayPhase(w) === 'night') return { dx: 0, stretch: 1, alpha: 0.07 };
    const angle = blockProgress(w) * 2 - 1; // -1 in the east, +1 in the west
    return {
      dx: angle * 1.7,
      stretch: 1 + Math.abs(angle) * 1.5,
      alpha: 0.2 - Math.abs(angle) * 0.1,
    };
  }

  drawDayLight(ctx, w) {
    const l = this.dayLight(w);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (l.dark[3] > 0.004) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = rgba(l.dark);
      ctx.fillRect(0, 0, this.view.w, this.view.h);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (l.wash[3] > 0.004) {
      const g = ctx.createLinearGradient(0, 0, 0, this.view.h);
      g.addColorStop(0, rgba(l.wash));
      g.addColorStop(1, rgba([l.wash[0], l.wash[1], l.wash[2], l.wash[3] * 0.62]));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.view.w, this.view.h);
    }
  }
}
