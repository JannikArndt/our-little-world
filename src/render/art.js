// Everything you can see is drawn here with plain 2D calls: no image files,
// no sprite sheets, nothing to download. Coordinates are world pixels
// (24 per tile), y grows downward.

import { TILE } from '../core/grid.js';
import { tr } from '../core/i18n.js';

export const C = {
  grass:   '#8ec96f', grassDark: '#7cb85f', grassLite: '#a3d886',
  forest:  '#6ea75a', forestDark: '#5f9a4d',
  water:   '#69adcd', waterDeep: '#4d8fb2', waterLite: '#96cbe2',
  sand:    '#e5d7b0', road: '#cdb182', roadDark: '#b89a6b',
  field:   '#c2ab7c', soil: '#a57f4e',
  wood:    '#a9743f', woodDark: '#8a5c30', woodLite: '#c99a63',
  roof:    '#c4694b', roofDark: '#a5533a', roof2: '#7f8f6a',
  wall:    '#f2e4cb', wallShade: '#dfcdae',
  ink:     '#43372a', shadow: 'rgba(60,50,35,0.18)',
  wheat:   '#e0b950', wheatDry: '#b8a878', sprout: '#7fc25a',
  wool:    '#fbf6ec', woolShade: '#e6ddcd', muzzle: '#4a4038',
  stone:   '#a9a49b', stoneDark: '#8b867e',
};

export function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y); ctx.quadraticCurveTo(x + w, y, x + w, y + k);
  ctx.lineTo(x + w, y + h - k); ctx.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  ctx.lineTo(x + k, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - k);
  ctx.lineTo(x, y + k); ctx.quadraticCurveTo(x, y, x + k, y);
  ctx.closePath();
}

function shadow(ctx, x, y, rx, ry) {
  ctx.fillStyle = C.shadow;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}

/** Emoji advance widths are wider than their ink, so centring on the advance
 *  leaves the picture sitting to one side. Centre on what you can actually see. */
export function glyph(ctx, text, x, y, px) {
  ctx.font = px + 'px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let w = 0, left = 0;
  try {
    const m = ctx.measureText(text);
    if (m.actualBoundingBoxLeft != null && m.actualBoundingBoxRight != null) {
      left = -m.actualBoundingBoxLeft;
      w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    } else { w = m.width; }
  } catch (e) { w = px; }
  if (!w) w = px;
  ctx.fillText(text, x - left - w / 2, y);
}

function bubble(ctx, x, y, glyphText, size) {
  const s = size || 15;
  ctx.fillStyle = 'rgba(255,253,248,0.96)';
  ctx.strokeStyle = 'rgba(67,55,42,0.22)';
  ctx.lineWidth = 1.2;
  rr(ctx, x - s * 0.72, y - s * 1.5, s * 1.44, s * 1.28, s * 0.5);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 2.5, y - s * 0.24); ctx.lineTo(x + 2.5, y - s * 0.24); ctx.lineTo(x, y + 2.5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#000';
  glyph(ctx, glyphText, x, y - s * 0.86, s * 0.92);
}
export { bubble };

export function speech(ctx, x, y, text) {
  ctx.font = '600 10px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = Math.min(150, ctx.measureText(text).width + 14);
  ctx.fillStyle = 'rgba(255,253,248,0.97)';
  ctx.strokeStyle = 'rgba(67,55,42,0.22)'; ctx.lineWidth = 1.2;
  rr(ctx, x - w / 2, y - 15, w, 16, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 3, y + 1); ctx.lineTo(x + 3, y + 1); ctx.lineTo(x, y + 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.fillText(text, x, y - 7);
}

/* ------------------------------------------------------------------ */
/* trees                                                              */
/* ------------------------------------------------------------------ */

const CANOPY = [
  ['#4b8340', '#7cc064'],
  ['#3f7338', '#6cb057'],
  ['#568e48', '#8acb70'],
];

export function drawTree(ctx, t, time) {
  const x = t.x * TILE + TILE / 2, y = t.y * TILE + TILE / 2;
  const k = (t.kind - 1) % 3;
  const scale = 0.9 + k * 0.13;
  const sway = Math.sin(time * 0.0011 + (t.sway || 0)) * 1.6;
  ctx.fillStyle = 'rgba(50,42,28,0.22)';
  ctx.beginPath(); ctx.ellipse(x + 3, y + 5, 12 * scale, 5 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.woodDark;
  ctx.fillRect(x - 2.4, y - 8 * scale, 4.8, 12 * scale);
  const [dark, lite] = CANOPY[k];
  ctx.save();
  ctx.translate(x + sway, y - 12 * scale);
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.ellipse(0, 0, 12.5 * scale, 11 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-7 * scale, 3 * scale, 8 * scale, 7 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(7 * scale, 3 * scale, 8 * scale, 7 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = lite;
  ctx.beginPath(); ctx.ellipse(-2.5 * scale, -3.5 * scale, 8.4 * scale, 6.8 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  ctx.beginPath(); ctx.ellipse(-4 * scale, -6 * scale, 4.4 * scale, 3.2 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawFallingTree(ctx, t, p) {
  // p goes 0 -> 1 as the tree comes down
  const x = t.x * TILE + TILE / 2, y = t.y * TILE + TILE / 2;
  const dir = t.fellDir === 'W' ? -1 : t.fellDir === 'E' ? 1 : 0;
  const vert = t.fellDir === 'N' ? -1 : t.fellDir === 'S' ? 1 : 0;
  const e = p < 1 ? 1 - Math.pow(1 - p, 3) : 1;
  const ang = e * (Math.PI / 2) * (dir || (vert ? 0.35 : 1));
  ctx.save();
  ctx.translate(x, y + 4);
  ctx.rotate(ang * (dir >= 0 ? 1 : -1) * (dir === 0 ? 1 : 1));
  ctx.scale(1, vert ? 1 - e * 0.45 : 1);
  ctx.fillStyle = C.woodDark;
  ctx.fillRect(-2.2, -20, 4.4, 22);
  ctx.fillStyle = CANOPY[(t.kind - 1) % 3][0];
  ctx.beginPath(); ctx.ellipse(0, -24, 12, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawStump(ctx, t) {
  const x = t.x * TILE + TILE / 2, y = t.y * TILE + TILE / 2;
  shadow(ctx, x, y + 3, 7, 3);
  ctx.fillStyle = C.woodDark;
  ctx.beginPath(); ctx.ellipse(x, y, 5.5, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.woodLite;
  ctx.beginPath(); ctx.ellipse(x, y - 1.4, 4.6, 3.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,80,45,.5)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.ellipse(x, y - 1.4, 2.4, 1.7, 0, 0, Math.PI * 2); ctx.stroke();
}

export function drawLog(ctx, l) {
  const x = l.x * TILE, y = l.y * TILE;
  shadow(ctx, x, y + 4, 12, 4);
  ctx.fillStyle = C.wood;
  rr(ctx, x - 13, y - 4, 26, 9, 4.5); ctx.fill();
  ctx.fillStyle = C.woodLite;
  ctx.beginPath(); ctx.ellipse(x + 12, y + 0.5, 2.6, 4.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x - 9, y - 1.5); ctx.lineTo(x + 7, y - 1.5); ctx.stroke();
}

/* ------------------------------------------------------------------ */
/* people                                                             */
/* ------------------------------------------------------------------ */

const MOOD_GLYPH = { hungry: '🍞', sad: '🛏️' };

export function drawVillager(ctx, v, time, tick) {
  const x = v.x * TILE, y = v.y * TILE;
  const walking = (tick - (v.moving || -99)) < 3;
  const bob = walking ? Math.abs(Math.sin(time * 0.012 + v.x)) * 1.6 : 0;
  const lean = walking ? Math.sin(time * 0.012 + v.x) * 0.08 : 0;
  shadow(ctx, x, y + 4, 6.5, 2.8);

  ctx.save();
  ctx.translate(x, y - bob);
  ctx.rotate(lean);

  // legs
  ctx.strokeStyle = '#6b5540'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  const stride = walking ? Math.sin(time * 0.012 + v.x) * 2.2 : 0.8;
  ctx.beginPath(); ctx.moveTo(-1.6, 0); ctx.lineTo(-1.6 - stride, 4.4);
  ctx.moveTo(1.6, 0); ctx.lineTo(1.6 + stride, 4.4); ctx.stroke();

  // body
  ctx.fillStyle = v.colour || '#d96a5f';
  rr(ctx, -4.6, -8.5, 9.2, 9.5, 3.6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  rr(ctx, -4.6, -8.5, 4, 9.5, 3.2); ctx.fill();

  // arms
  ctx.strokeStyle = v.colour || '#d96a5f'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4.2, -6); ctx.lineTo(-6.4 + stride * 0.5, -2.2);
  ctx.moveTo(4.2, -6); ctx.lineTo(6.4 - stride * 0.5, -2.2);
  ctx.stroke();

  // head
  ctx.fillStyle = '#f0d0ac';
  ctx.beginPath(); ctx.arc(0, -12.6, 4.7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(70,50,35,.85)';
  ctx.beginPath(); ctx.arc(0, -13.6, 4.7, Math.PI * 1.03, Math.PI * 1.97); ctx.fill();

  // face
  const f = v.facing === -1 ? -1 : 1;
  ctx.fillStyle = C.ink;
  ctx.beginPath(); ctx.arc(-1.4 * f + 0.5 * f, -12.4, 0.72, 0, Math.PI * 2);
  ctx.arc(1.6 * f + 0.5 * f, -12.4, 0.72, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 0.8;
  ctx.beginPath();
  if (v.mood === 'happy') ctx.arc(0.5 * f, -10.8, 1.8, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (v.mood === 'hungry' || v.mood === 'sad') ctx.arc(0.5 * f, -9.4, 1.8, 1.15 * Math.PI, 1.85 * Math.PI);
  else { ctx.moveTo(-1 + 0.5 * f, -10.6); ctx.lineTo(1.8 + 0.5 * f, -10.6); }
  ctx.stroke();
  ctx.restore();

  if (v.carrying) {
    ctx.save(); ctx.translate(x, y - 9);
    ctx.fillStyle = C.wood; rr(ctx, -9, -3, 18, 6, 3); ctx.fill();
    ctx.fillStyle = C.woodLite; ctx.beginPath(); ctx.ellipse(8, 0, 1.8, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  if (v.said) speech(ctx, x, y - 22, tr(v.said));
  else if (MOOD_GLYPH[v.mood]) bubble(ctx, x + 9, y - 18, MOOD_GLYPH[v.mood], 12);
}

/* ------------------------------------------------------------------ */
/* sheep                                                              */
/* ------------------------------------------------------------------ */

const SHEEP_GLYPH = { hungry: '🌾', thirsty: '💧', woolly: '✂️' };

export function drawSheep(ctx, s, time, tick, noBubble) {
  const x = s.x * TILE, y = s.y * TILE;
  const f = s.facing === -1 ? -1 : 1;
  const walking = (tick - (s.moving || -99)) < 3;
  const bob = walking ? Math.abs(Math.sin(time * 0.009 + s.x)) * 1.1 : 0;
  const puff = 0.82 + (s.fluff / 100) * 0.4;
  shadow(ctx, x, y + 3.5, 9 * puff, 3.4);

  ctx.save();
  ctx.translate(x, y - bob);
  ctx.scale(f, 1);

  const st = walking ? Math.sin(time * 0.011 + s.x) * 1.6 : 0.6;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#6b5f54'; ctx.lineWidth = 1.6;      // the far pair
  ctx.beginPath();
  ctx.moveTo(-2.2, -1.4); ctx.lineTo(-2.2 + st, 2.6);
  ctx.moveTo(4.2, -1.4); ctx.lineTo(4.2 - st, 2.6); ctx.stroke();
  ctx.strokeStyle = C.muzzle; ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(-3.4, -1); ctx.lineTo(-3.4 - st, 3.6);
  ctx.moveTo(3.2, -1); ctx.lineTo(3.2 + st, 3.6); ctx.stroke();

  ctx.fillStyle = C.woolShade;
  ctx.beginPath();
  ctx.arc(-4 * puff, -3.5, 5 * puff, 0, Math.PI * 2);
  ctx.arc(1 * puff, -5 * puff, 5.6 * puff, 0, Math.PI * 2);
  ctx.arc(4.5 * puff, -3, 4.6 * puff, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.wool;
  ctx.beginPath();
  ctx.arc(-3.4 * puff, -4.6, 4.2 * puff, 0, Math.PI * 2);
  ctx.arc(1.4 * puff, -6 * puff, 4.6 * puff, 0, Math.PI * 2);
  ctx.fill();

  // head — droops when the sheep wants something
  const droop = (s.mood === 'hungry' || s.mood === 'thirsty') ? 2.2 : 0;
  ctx.fillStyle = C.muzzle;
  ctx.beginPath(); ctx.ellipse(7.4, -3.4 + droop, 3.3, 2.9, 0.25, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(5.4, -6.2 + droop, 1.7, 1.2, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(8.4, -4.1 + droop, 0.75, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.beginPath(); ctx.arc(8.6, -4.1 + droop, 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  if (noBubble) return;
  if (tick - (s.hearts || -999) < 30) bubble(ctx, x, y - 16, '💚', 12);
  else if (SHEEP_GLYPH[s.mood]) bubble(ctx, x + 8, y - 15, SHEEP_GLYPH[s.mood], 12);
}

export function drawDeer(ctx, c, time) {
  const x = c.x * TILE, y = c.y * TILE;
  shadow(ctx, x, y + 3, 8, 3);
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = '#7c5a3c'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-3, -1); ctx.lineTo(-3.6, 3.4); ctx.moveTo(3, -1); ctx.lineTo(3.6, 3.4); ctx.stroke();
  ctx.fillStyle = '#a9784e';
  rr(ctx, -6, -8, 12, 8, 4); ctx.fill();
  ctx.beginPath(); ctx.ellipse(6.5, -10, 2.8, 2.4, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8a5f3c'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(6, -12); ctx.lineTo(5, -16); ctx.moveTo(5, -16); ctx.lineTo(3.2, -17.4);
  ctx.moveTo(7.6, -12); ctx.lineTo(8.6, -16); ctx.moveTo(8.6, -16); ctx.lineTo(10.4, -17.2);
  ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.beginPath(); ctx.arc(7.6, -10.4, 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* buildings                                                          */
/* ------------------------------------------------------------------ */

export function drawSite(ctx, b, time) {
  const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = 'rgba(90,75,55,.55)'; ctx.lineWidth = 1.6;
  rr(ctx, x + 3, y + 3, w - 6, h - 6, 5); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(180,160,120,.28)';
  rr(ctx, x + 3, y + 3, w - 6, h - 6, 5); ctx.fill();
  for (const [cx, cy] of [[x + 4, y + 4], [x + w - 4, y + 4], [x + 4, y + h - 4], [x + w - 4, y + h - 4]]) {
    ctx.fillStyle = C.woodDark; ctx.fillRect(cx - 1.2, cy - 7, 2.4, 8);
  }
  ctx.fillStyle = 'rgba(67,55,42,.75)';
  ctx.font = '600 9px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(tr(b.newFamily ? 'art.forFamily' : 'art.plot'), x + w / 2, y + h / 2 + 1);
  ctx.restore();
}

export function drawHouse(ctx, b, time, tick) {
  const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
  const grow = b.builtTick != null && tick - b.builtTick < 22 ? (tick - b.builtTick) / 22 : 1;
  const e = grow < 1 ? 1 - Math.pow(1 - grow, 3) : 1;
  ctx.save();
  ctx.translate(x + w / 2, y + h);
  ctx.scale(1, e);
  ctx.translate(-(x + w / 2), -(y + h));

  shadow(ctx, x + w / 2, y + h - 1, w * 0.46, 5);
  const wallTop = y + h - 26;
  ctx.fillStyle = C.wall;
  rr(ctx, x + 3, wallTop, w - 6, 26, 3); ctx.fill();
  ctx.fillStyle = C.wallShade;
  rr(ctx, x + w - 11, wallTop, 8, 26, 3); ctx.fill();

  // roof
  ctx.fillStyle = b.cold ? C.roof2 : C.roof;
  ctx.beginPath();
  ctx.moveTo(x - 1, wallTop + 2);
  ctx.lineTo(x + w / 2, wallTop - 15);
  ctx.lineTo(x + w + 1, wallTop + 2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.roofDark;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, wallTop - 15); ctx.lineTo(x + w + 1, wallTop + 2);
  ctx.lineTo(x + w - 4, wallTop + 2); ctx.lineTo(x + w / 2 - 2, wallTop - 11);
  ctx.closePath(); ctx.fill();

  // door
  ctx.fillStyle = C.woodDark;
  rr(ctx, x + w / 2 - 5, y + h - 14, 10, 14, 3); ctx.fill();
  ctx.fillStyle = '#e0b26a';
  ctx.beginPath(); ctx.arc(x + w / 2 + 3, y + h - 7, 0.9, 0, Math.PI * 2); ctx.fill();

  // windows
  const lit = b.light !== false;
  const nWin = Math.max(1, Math.min(2, (b.beds || 1)));
  for (let i = 0; i < nWin; i++) {
    const wx = x + w / 2 - 5 + (i === 0 ? -12 : 12) + (nWin === 1 ? 12 : 0);
    ctx.fillStyle = lit ? '#f7dc9a' : '#8ea0a8';
    rr(ctx, wx - 3.5, wallTop + 7, 8, 8, 1.6); ctx.fill();
    ctx.strokeStyle = C.woodDark; ctx.lineWidth = 1.1;
    rr(ctx, wx - 3.5, wallTop + 7, 8, 8, 1.6); ctx.stroke();
  }

  // chimney and smoke
  if (b.warm !== false) {
    ctx.fillStyle = C.stoneDark;
    ctx.fillRect(x + w - 14, wallTop - 16, 5, 10);
    if (b.smoke) {
      for (let i = 0; i < 3; i++) {
        const t = (time * 0.0012 + i * 0.33) % 1;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.4 * (1 - t)) + ')';
        ctx.beginPath();
        ctx.arc(x + w - 11.5 + Math.sin(t * 5 + i) * 3, wallTop - 18 - t * 20, 2 + t * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();

  if (b.cold || b.dark || b.cramped) {
    const g = b.cold ? '🥶' : b.dark ? '🕯️' : '😣';
    bubble(ctx, x + w - 4, y - 2, g, 12);
  }
}

export function drawWorkshop(ctx, b, time, tick) {
  const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
  shadow(ctx, x + w / 2, y + h - 2, w * 0.44, 6);
  const wallTop = y + h - 32;
  ctx.fillStyle = '#e7d6b6';
  rr(ctx, x + 4, wallTop, w - 8, 32, 3); ctx.fill();
  ctx.fillStyle = C.wallShade;
  rr(ctx, x + w - 14, wallTop, 10, 32, 3); ctx.fill();
  ctx.fillStyle = '#8a6f4a';
  ctx.beginPath();
  ctx.moveTo(x, wallTop + 3); ctx.lineTo(x + w / 2, wallTop - 18); ctx.lineTo(x + w, wallTop + 3);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#71583a';
  ctx.beginPath();
  ctx.moveTo(x + w / 2, wallTop - 18); ctx.lineTo(x + w, wallTop + 3);
  ctx.lineTo(x + w - 5, wallTop + 3); ctx.lineTo(x + w / 2 - 3, wallTop - 13);
  ctx.closePath(); ctx.fill();

  // big open doorway
  ctx.fillStyle = '#5f4a32';
  rr(ctx, x + w / 2 - 9, y + h - 20, 18, 20, 3); ctx.fill();

  // the saw wheel — it spins when somebody is working
  const spinning = b.spin != null && tick - b.spin < 26;
  const ang = spinning ? time * 0.02 : time * 0.0012;
  ctx.save();
  ctx.translate(x + 12, wallTop + 14);
  ctx.rotate(ang);
  ctx.strokeStyle = spinning ? '#f0e2c0' : '#c9bda2'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 6; i++) {
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(i * 1.047) * 7, Math.sin(i * 1.047) * 7); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(67,55,42,.7)';
  ctx.font = '700 8px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(tr('art.workshop'), x + w / 2, y + h + 6);
}

export function drawLarder(ctx, l, time) {
  const x = l.x * TILE, y = l.y * TILE;
  shadow(ctx, x, y + 4, 12, 4);
  ctx.fillStyle = '#c9974f';
  rr(ctx, x - 11, y - 6, 22, 12, 4); ctx.fill();
  ctx.strokeStyle = '#a97b3a'; ctx.lineWidth = 1;
  for (let i = -8; i <= 8; i += 4) { ctx.beginPath(); ctx.moveTo(x + i, y - 6); ctx.lineTo(x + i, y + 6); ctx.stroke(); }
  const n = Math.min(4, l.food);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = '#e2b268';
    ctx.beginPath(); ctx.ellipse(x - 6 + i * 4.4, y - 7.5, 3.2, 2.4, -0.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = C.ink;
  ctx.font = '700 9px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🍞 ' + l.food, x, y + 13);
  if (l.food === 0) bubble(ctx, x + 13, y - 8, '❔', 11);
}

export function drawStoneBank(ctx, s) {
  const x = s.x * TILE + TILE / 2, y = s.y * TILE + TILE / 2;
  shadow(ctx, x, y + 3, 9, 3);
  const n = Math.min(6, s.count);
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2;
  for (let i = 0; i < n; i++) {
    const a = i * 1.9;
    ctx.fillStyle = i % 2 ? C.stone : C.stoneDark;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * 6.5, y + Math.sin(a) * 4, 4.2, 3.2, a, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
  if (n === 0) {
    ctx.fillStyle = 'rgba(67,55,42,.35)';
    ctx.font = '9px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('…', x, y);
  }
}

/* ------------------------------------------------------------------ */
/* the field                                                          */
/* ------------------------------------------------------------------ */

export function drawPlot(ctx, p, time) {
  const x = p.x * TILE, y = p.y * TILE, s = TILE * 2;
  ctx.fillStyle = p.water > 15 ? '#94714a' : C.soil;
  rr(ctx, x + 2, y + 2, s - 4, s - 4, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.10)';
  rr(ctx, x + 2, y + 2, s - 4, 5, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.07)'; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(x + 5, y + i * (s / 4)); ctx.lineTo(x + s - 5, y + i * (s / 4)); ctx.stroke();
  }
  if (p.state === 'empty') return;

  const g = p.state === 'ripe' ? 1 : p.growth / 100;
  const dry = p.water <= 8 && p.state === 'growing';
  const sway = Math.sin(time * 0.002) * (0.6 + g);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const sx = x + 8 + c * 11, sy = y + s - 6 - r * 11;
      const hgt = 4 + g * 13;
      ctx.strokeStyle = dry ? C.wheatDry : (g > 0.85 ? C.wheat : C.sprout);
      ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + sway * 0.5, sy - hgt * 0.6, sx + sway * (dry ? 2.4 : 1), sy - hgt);
      ctx.stroke();
      if (g > 0.85) {
        ctx.fillStyle = C.wheat;
        ctx.beginPath();
        ctx.ellipse(sx + sway, sy - hgt - 1.5, 1.7, 3, sway * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (p.state === 'ripe') bubble(ctx, x + s - 6, y + 2, '🌾', 12);
  else if (dry) bubble(ctx, x + s - 6, y + 2, '💧', 12);
}

/* ------------------------------------------------------------------ */
/* the bridge                                                         */
/* ------------------------------------------------------------------ */

export function drawBridge(ctx, br, time) {
  if (!br.built) return;
  const s = br.site;
  const x0 = s.x0 * TILE, x1 = (s.x1 + 1) * TILE;
  const y0 = s.row * TILE, y1 = (s.row + s.rows) * TILE;
  ctx.fillStyle = '#9a6f42';
  ctx.fillRect(x0 - 6, y0 + 2, x1 - x0 + 12, y1 - y0 - 4);
  ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = 1;
  for (let x = x0 - 4; x < x1 + 6; x += 6) {
    ctx.beginPath(); ctx.moveTo(x, y0 + 2); ctx.lineTo(x, y1 - 2); ctx.stroke();
  }
  ctx.fillStyle = '#7d5730';
  ctx.fillRect(x0 - 6, y0 + 1, x1 - x0 + 12, 3);
  ctx.fillRect(x0 - 6, y1 - 4, x1 - x0 + 12, 3);
  // rails, one along each side
  ctx.strokeStyle = '#7d5730'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0 - 6, y0 - 1); ctx.lineTo(x1 + 6, y0 - 1);
  ctx.moveTo(x0 - 6, y1 + 1); ctx.lineTo(x1 + 6, y1 + 1);
  ctx.stroke();
  for (let x = x0 - 4; x < x1 + 6; x += 14) {
    ctx.fillRect(x, y0 - 5, 2.4, 6);
    ctx.fillRect(x, y1 - 1, 2.4, 6);
  }

  if (br.damaged) {
    const mx = (x0 + x1) / 2;
    ctx.fillStyle = C.waterDeep;
    ctx.fillRect(mx - 7, y0 + 2, 14, y1 - y0 - 4);
    ctx.save();
    ctx.translate(mx + 12, y1 - 6); ctx.rotate(0.5);
    ctx.fillStyle = '#9a6f42'; rr(ctx, -10, -2, 20, 4, 2); ctx.fill();
    ctx.restore();
    bubble(ctx, mx, y0 - 6, '⚠️', 13);
  }
}

/* ------------------------------------------------------------------ */
/* transient effects                                                  */
/* ------------------------------------------------------------------ */

export function drawFx(ctx, f, age) {
  const p = age / 26;
  const x = f.x * TILE, y = f.y * TILE;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - p * p);
  switch (f.kind) {
    case 'float':
      ctx.font = '700 13px -apple-system, system-ui, "Apple Color Emoji", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,253,248,.9)';
      ctx.strokeText(f.text, x, y - p * 22);
      ctx.fillStyle = f.colour || C.ink;
      ctx.fillText(f.text, x, y - p * 22);
      break;
    case 'thump':
      ctx.strokeStyle = 'rgba(120,95,60,.7)'; ctx.lineWidth = 2.5 * (1 - p);
      ctx.beginPath(); ctx.ellipse(x, y, 8 + p * 34, 4 + p * 16, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'sparkle':
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + p * 2;
        ctx.fillStyle = '#ffd76a';
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * (8 + p * 26), y + Math.sin(a) * (5 + p * 16) - p * 10, 2.2 * (1 - p), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'hearts':
      ctx.font = '13px "Apple Color Emoji", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💚', x, y - p * 20);
      break;
    case 'splash':
      ctx.strokeStyle = 'rgba(110,180,215,.85)'; ctx.lineWidth = 2 * (1 - p);
      ctx.beginPath(); ctx.ellipse(x, y, 4 + p * 20, 2 + p * 9, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'crack':
      ctx.font = '18px "Apple Color Emoji", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💥', x, y - p * 10);
      break;
    default: break;
  }
  ctx.restore();
}
