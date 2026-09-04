// The renderer never changes the world; it only looks at it.
// Terrain is painted once into an offscreen canvas and re-used, so a frame is
// one blit plus a few dozen small shapes — cheap enough for an old iPad.

import { GW, GH, TILE, WORLD_W, WORLD_H, T, idx } from '../core/grid.js';
import { blockProgress } from '../core/world.js';
import * as art from './art.js';

const C = art.C;

/** A friendly face for the field. */
function scarecrow(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = '#8a6f4a'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + 26); ctx.lineTo(x, y + 4);
  ctx.moveTo(x - 9, y + 11); ctx.lineTo(x + 9, y + 11);
  ctx.stroke();
  ctx.fillStyle = '#c9974f';
  ctx.beginPath(); ctx.arc(x, y + 3, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8a6f4a';
  ctx.beginPath(); ctx.ellipse(x, y - 1, 8.5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#43372a';
  ctx.beginPath(); ctx.arc(x - 2, y + 3, 0.8, 0, Math.PI * 2); ctx.arc(x + 2, y + 3, 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Draw one edge of the river as a smooth curve through the tile edges. */
function ribbon(ctx, pts, grow, reverse) {
  const p = reverse ? pts.slice().reverse() : pts;
  const first = { x: p[0].x + grow, y: p[0].y - 40 };
  if (reverse) ctx.lineTo(first.x, first.y); else ctx.moveTo(first.x, first.y);
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1];
    ctx.quadraticCurveTo(a.x + grow, a.y, (a.x + b.x) / 2 + grow, (a.y + b.y) / 2);
  }
  const last = p[p.length - 1];
  ctx.lineTo(last.x + grow, last.y + 40);
}

function tileNoise(x, y) {           // stable per-tile pseudo random
  let h = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.terrain = document.createElement('canvas');
    this.terrain.width = WORLD_W; this.terrain.height = WORLD_H;
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
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
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

  scale() { return this.fit * this.cam.zoom; }

  clampCamera() {
    const s = this.scale();
    const halfW = this.view.w / 2 / s, halfH = this.view.h / 2 / s;
    if (halfW * 2 >= WORLD_W) this.cam.x = WORLD_W / 2;
    else this.cam.x = Math.max(halfW, Math.min(WORLD_W - halfW, this.cam.x));
    if (halfH * 2 >= WORLD_H) this.cam.y = WORLD_H / 2;
    else this.cam.y = Math.max(halfH, Math.min(WORLD_H - halfH, this.cam.y));
  }

  toScreen(wx, wy) {
    const s = this.scale();
    return { x: (wx - this.cam.x) * s + this.view.w / 2, y: (wy - this.cam.y) * s + this.view.h / 2 };
  }
  toWorld(sx, sy) {
    const s = this.scale();
    return { x: (sx - this.view.w / 2) / s + this.cam.x, y: (sy - this.view.h / 2) / s + this.cam.y };
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

    // 1. a meadow, in soft patches rather than squares
    c.fillStyle = C.grass;
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    for (let i = 0; i < 150; i++) {
      const n1 = tileNoise(i, 3), n2 = tileNoise(i, 11), n3 = tileNoise(i, 29);
      c.fillStyle = n3 > 0.5 ? C.grassLite : C.grassDark;
      c.globalAlpha = 0.30;
      c.beginPath();
      c.ellipse(n1 * WORLD_W, n2 * WORLD_H, 26 + n3 * 46, 18 + n1 * 26, n2 * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;

    // 2. the forest as a mass of overlapping canopy shade
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (w.terrain[idx(x, y)] !== T.FOREST) continue;
        const n = tileNoise(x, y);
        c.globalAlpha = 0.52;
        c.fillStyle = n > 0.5 ? C.forest : C.forestDark;
        c.beginPath();
        c.ellipse(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE * 0.92, TILE * 0.84, n * 3, 0, Math.PI * 2);
        c.fill();
      }
    c.globalAlpha = 1;

    // 3. the ploughed field
    let fx0 = GW, fy0 = GH, fx1 = -1, fy1 = -1;
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++)
        if (w.terrain[idx(x, y)] === T.FIELD) {
          if (x < fx0) fx0 = x; if (x > fx1) fx1 = x;
          if (y < fy0) fy0 = y; if (y > fy1) fy1 = y;
        }
    if (fx1 >= 0) {
      c.fillStyle = C.field;
      for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
          if (w.terrain[idx(x, y)] !== T.FIELD) continue;
          c.beginPath();
          c.ellipse(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE * 0.78, TILE * 0.74, 0, 0, Math.PI * 2);
          c.fill();
        }
      c.strokeStyle = 'rgba(120,95,60,.10)'; c.lineWidth = 1.4; c.lineCap = 'round';
      for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
          if (w.terrain[idx(x, y)] !== T.FIELD) continue;
          for (let i = 0; i < 2; i++) {
            const yy = y * TILE + 7 + i * 10;
            c.beginPath(); c.moveTo(x * TILE + 3, yy); c.lineTo(x * TILE + TILE - 3, yy); c.stroke();
          }
        }
      scarecrow(c, fx0 * TILE + 8, fy0 * TILE + 6);
    }

    // 4. the river, as one smooth ribbon rather than a staircase of tiles
    const left = [], right = [];
    for (let y = 0; y < GH; y++) {
      let a = -1, b = -1;
      for (let x = 0; x < GW; x++) {
        const t = w.terrain[idx(x, y)];
        if (t === T.WATER || t === T.BRIDGE) { if (a < 0) a = x; b = x; }
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
      band(TILE * 0.8, C.sand);
      band(0, C.water);
      c.save();
      c.globalAlpha = 0.35;
      c.strokeStyle = C.waterDeep; c.lineWidth = 5;
      c.beginPath(); ribbon(c, left, 2, false); c.stroke();
      c.beginPath(); ribbon(c, right, -2, false); c.stroke();
      c.restore();
      for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
          const t = w.terrain[idx(x, y)];
          if (t === T.WATER || t === T.BRIDGE) this.water.push({ x: x * TILE, y: y * TILE, n: tileNoise(x, y) });
        }
    }

    // 5. roads: overlapping rounded patches make a path, not a row of squares
    c.fillStyle = C.road;
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (w.terrain[idx(x, y)] !== T.ROAD) continue;
        c.beginPath();
        c.ellipse(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE * 0.62, TILE * 0.58, 0, 0, Math.PI * 2);
        c.fill();
      }
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (w.terrain[idx(x, y)] !== T.ROAD) continue;
        const n = tileNoise(x, y + 5), m = tileNoise(x + 7, y);
        c.fillStyle = C.roadDark;
        for (let i = 0; i < 5; i++)
          c.fillRect(x * TILE + ((n * 733 + i * 173) % TILE), y * TILE + ((m * 419 + i * 251) % TILE), 1.8, 1.8);
      }

    // 6. small things that make it look lived in
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        const t = w.terrain[idx(x, y)];
        if (t !== T.GRASS && t !== T.SAND) continue;
        const n = tileNoise(x + 13, y + 41);
        const px = x * TILE + 4 + (n * 311) % (TILE - 8);
        const py = y * TILE + 4 + ((n * 907) % (TILE - 8));
        if (t === T.SAND) {
          if (n < 0.86) continue;
          c.fillStyle = 'rgba(150,140,120,.5)';
          c.beginPath(); c.ellipse(px, py, 2.4, 1.7, n * 3, 0, Math.PI * 2); c.fill();
        } else if (n > 0.955) {
          c.fillStyle = C.forestDark;               // a little bush
          c.beginPath();
          c.arc(px, py, 4.2, 0, Math.PI * 2);
          c.arc(px + 4, py + 1.4, 3.4, 0, Math.PI * 2);
          c.fill();
        } else if (n > 0.90) {
          const petal = n > 0.93 ? '#f6e08a' : '#f0a8b8';   // flowers
          c.fillStyle = petal;
          for (let i = 0; i < 3; i++)
            c.fillRect(px + i * 3, py + ((i * 5) % 4), 1.8, 1.8);
        } else if (n > 0.882) {
          c.strokeStyle = C.grassLite; c.lineWidth = 1.4; c.lineCap = 'round';
          c.beginPath();
          c.moveTo(px, py + 3); c.lineTo(px + 1, py - 2);
          c.moveTo(px + 3, py + 3); c.lineTo(px + 2.5, py - 3);
          c.stroke();
        }
      }

    // a soft border so the world reads as a little diorama
    c.strokeStyle = 'rgba(80,66,48,.20)'; c.lineWidth = 6;
    c.strokeRect(3, 3, WORLD_W - 6, WORLD_H - 6);
  }

  /* ---------------- frame ---------------- */

  render(w, time, extra) {
    const ctx = this.ctx;
    const st = this.terrainStamp(w);
    if (st !== this.stamp) { this.paintTerrain(w); this.stamp = st; }

    const s = this.scale();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#b9d3c2';
    ctx.fillRect(0, 0, this.view.w, this.view.h);
    ctx.save();
    ctx.translate(this.view.w / 2, this.view.h / 2);
    ctx.scale(s, s);
    ctx.translate(-this.cam.x, -this.cam.y);

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
    for (const v of w.villagers) things.push({ y: v.y, kind: 'villager', o: v });
    for (const sh of w.sheep) things.push({ y: sh.y, kind: 'sheep', o: sh });
    if (w.visitors) for (const c of w.visitors) things.push({ y: c.y, kind: 'deer', o: c });
    things.push({ y: w.larder.y, kind: 'larder', o: w.larder });
    things.sort((a, b) => a.y - b.y);

    if (this.halo) this.drawHalos(ctx, w, time, extra);

    for (const th of things) {
      const o = th.o;
      switch (th.kind) {
        case 'building':
          if (o.state === 'site') art.drawSite(ctx, o, time);
          else if (o.type === 'workshop') art.drawWorkshop(ctx, o, time, w.tick);
          else art.drawHouse(ctx, o, time, w.tick);
          break;
        case 'tree': {
          if (o.state === 'standing') art.drawTree(ctx, o, time);
          else {
            const age = w.tick - (o.fellTick != null ? o.fellTick : -999);
            if (age < 18) { art.drawStump(ctx, o); art.drawFallingTree(ctx, o, age / 18); }
            else art.drawStump(ctx, o);
          }
          break;
        }
        case 'log': art.drawLog(ctx, o); break;
        case 'plot': art.drawPlot(ctx, o, time); break;
        case 'stones': art.drawStoneBank(ctx, o); break;
        case 'villager': art.drawVillager(ctx, o, time, w.tick); break;
        case 'sheep': art.drawSheep(ctx, o, time, w.tick); break;
        case 'deer': art.drawDeer(ctx, o, time); break;
        case 'larder': art.drawLarder(ctx, o, time); break;
        default: break;
      }
    }

    if (w.fx) for (const f of w.fx) art.drawFx(ctx, f, w.tick - f.born);
    if (extra && extra.overlay) extra.overlay(ctx, s);

    ctx.restore();
    this.drawDusk(ctx, w);
  }

  drawWaterShimmer(ctx, time) {
    ctx.strokeStyle = 'rgba(255,255,255,.30)';
    ctx.lineWidth = 1.6; ctx.lineCap = 'round';
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

  /** A slow, quiet ring around things that would like some attention. */
  drawHalos(ctx, w, time, extra) {
    const pulse = 0.35 + 0.25 * Math.sin(time * 0.003);
    const ring = (x, y, r, colour) => {
      ctx.strokeStyle = colour; ctx.lineWidth = 2.4;
      ctx.globalAlpha = pulse;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    };
    for (const s of w.sheep) if (s.mood !== 'ok') ring(s.x * TILE, s.y * TILE + 3, 15, 'rgba(93,145,80,.9)');
    for (const p of w.plots) if (p.state === 'ripe' || (p.state === 'growing' && p.water <= 8))
      ring(p.x * TILE + TILE, p.y * TILE + TILE, 24, 'rgba(224,185,80,.95)');
    for (const b of w.buildings) if (b.state === 'site')
      ring(b.x * TILE + b.w * TILE / 2, b.y * TILE + b.h * TILE - 4, b.w * TILE * 0.5, 'rgba(200,120,60,.9)');
    for (const l of w.logs) ring(l.x * TILE, l.y * TILE + 3, 16, 'rgba(169,116,63,.9)');
    if (w.bridge.damaged) ring((w.bridge.site.x0 + w.bridge.site.x1 + 1) * TILE / 2, (w.bridge.site.row + 1) * TILE, 34, 'rgba(200,90,70,.95)');
    if (extra && extra.highlight) {
      const h = extra.highlight;
      ring(h.x * TILE, h.y * TILE, h.r || 20, 'rgba(255,255,255,.95)');
    }
  }

  /** The light warms towards the end of a play block. Never a countdown. */
  drawDusk(ctx, w) {
    const p = blockProgress(w);
    let a = 0;
    if (!w.block.active && w.block.endedAt !== null) a = 0.30;
    else if (p > 0.78) a = ((p - 0.78) / 0.22) * 0.30;
    if (a <= 0.001) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, this.view.h);
    g.addColorStop(0, 'rgba(255,186,110,' + a * 0.9 + ')');
    g.addColorStop(1, 'rgba(255,150,90,' + a * 0.45 + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.view.w, this.view.h);
  }
}
