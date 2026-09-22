// Everything you can see is drawn here with plain 2D calls: no image files,
// no sprite sheets, nothing to download. Coordinates are world pixels
// (24 per tile), y grows downward.
//
// How a thing is drawn, so that thirty of them look like one village:
//
//  - **The light comes over your left shoulder.** Every form is lit on its
//    upper left and shaded on its lower right, always, whatever the hour.
//    The *cast* shadow on the ground swings with the sun (`setSun`), because
//    that is what tells you it is late; the shading inside a roof or a sleeve
//    does not, because re-lighting every shape every frame would cost more
//    than it is worth and a village where the light keeps turning is a
//    village that looks unsure of itself.
//  - **Three tones and an edge.** A shape gets its own colour, a lighter one
//    where the sun lands, a darker one where it does not, and a thin warm rim
//    along the sunward edge. `lite()` and `dusk()` make those two from the
//    colour itself, so nothing is ever a second guess at a shade of green.
//  - **Things meet in shadow.** Wherever one form sits on or under another —
//    a canopy on a trunk, a wall under the eaves, a hat on a head — there is a
//    soft dark line at the join. That, more than any amount of detail, is
//    what makes a flat picture look like it has a front and a back.
//  - **One small kindness each.** A window box, a nail, a knot in a plank, a
//    curl of fleece. Never enough to read as clutter at arm's length; enough
//    that going close is worth doing.

import { TILE } from '../core/grid.js';
import { tr } from '../core/i18n.js';
import { FOODS, VILLAGER_SKILLS } from '../core/content.js';

export const C = {
  grass: '#8ec96f',
  grassDark: '#7cb85f',
  grassLite: '#a3d886',
  forest: '#6ea75a',
  forestDark: '#5f9a4d',
  water: '#69adcd',
  waterDeep: '#4d8fb2',
  waterLite: '#96cbe2',
  sand: '#e5d7b0',
  road: '#cdb182',
  roadDark: '#b89a6b',
  field: '#c2ab7c',
  soil: '#a57f4e',
  wood: '#a9743f',
  woodDark: '#8a5c30',
  woodLite: '#c99a63',
  roof: '#c4694b',
  roofDark: '#a5533a',
  roof2: '#7f8f6a',
  wall: '#f2e4cb',
  wallShade: '#dfcdae',
  ink: '#43372a',
  shadow: 'rgba(60,50,35,0.18)',
  wheat: '#e0b950',
  wheatDry: '#b8a878',
  sprout: '#7fc25a',
  wool: '#fbf6ec',
  woolShade: '#e6ddcd',
  muzzle: '#4a4038',
  stone: '#a9a49b',
  stoneDark: '#8b867e',
  // the tones the detail is made of: the warm glow behind a lit window, the
  // iron on a door, the green of a window box, the blossom on a spring tree
  glow: '#ffd873',
  iron: '#6f6a63',
  leaf: '#4f8f45',
  blossom: '#f5c6d4',
  petal: '#f6e08a',
  skin: '#f0d0ac',
  hair: '#6b4a33',
};

/* ------------------------------------------------------------------ */
/* light and shade                                                    */
/* ------------------------------------------------------------------ */

/** #rgb or #rrggbb to three numbers. */
function bits(hex) {
  const h = hex.length === 4 ? hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3] : hex.slice(1);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// The same handful of colours get lightened and darkened by the same handful
// of amounts, sixty times a second, for every tree in the forest. Work each
// one out once and keep it.
const mixed = new Map();

/**
 * Two colours blended. Everything that wants a highlight or a shade asks for
 * one *of the colour it already has*, so a roof's shadow is a darker roof
 * rather than a brown somebody picked by eye and a wall's sunlit face is the
 * same wall. That is most of why this looks like one village.
 */
export function mix(a, b, t) {
  const key = a + b + t;
  const had = mixed.get(key);
  if (had) return had;
  const p = bits(a),
    q = bits(b);
  const out =
    'rgb(' +
    Math.round(p[0] + (q[0] - p[0]) * t) +
    ',' +
    Math.round(p[1] + (q[1] - p[1]) * t) +
    ',' +
    Math.round(p[2] + (q[2] - p[2]) * t) +
    ')';
  mixed.set(key, out);
  return out;
}

/** Where the sun lands. */
export const lite = (c, t) => mix(c, '#fff6e0', t);
/** And where it does not — toward the warm brown the whole village shades to,
 *  never toward black, which is what makes a flat picture look like a hole. */
export const dusk = (c, t) => mix(c, '#4a3a28', t);

export function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + k);
  ctx.lineTo(x + w, y + h - k);
  ctx.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  ctx.lineTo(x + k, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - k);
  ctx.lineTo(x, y + k);
  ctx.quadraticCurveTo(x, y, x + k, y);
  ctx.closePath();
}

// Where the sun is, in one place. Everything that casts a shadow reads it, so
// the whole world leans the same way as the day goes past.
let sun = { dx: 0, stretch: 1, alpha: 0.18 };
export function setSun(s) {
  sun = s;
}

/**
 * A shadow in two parts: a wide soft one that says the light is diffuse, and a
 * small firm one right where the thing touches the ground. The tight one is
 * what actually sets a tree down on the grass instead of leaving it floating
 * a little above it — and it stays put while the long one swings with the sun.
 */
function shadow(ctx, x, y, rx, ry) {
  ctx.fillStyle = 'rgba(60,50,35,' + sun.alpha * 0.62 + ')';
  ctx.beginPath();
  ctx.ellipse(x + sun.dx * rx, y, rx * sun.stretch * 1.12, ry * 1.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(60,50,35,' + sun.alpha * 0.55 + ')';
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 0.66, ry * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
}

/* ------------------------------------------------------------------ */
/* shapes worth having twice                                          */
/* ------------------------------------------------------------------ */

/** A settled little number from a seed: the same tree wobbles the same way
 *  every frame, and no two trees wobble alike. */
export function wob(seed) {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * A soft lumpy blob — a canopy, a fleece, a cloud of leaves. A ring of circles
 * rather than one ellipse, so the outline is scalloped and the thing reads as
 * something grown rather than something stamped.
 */
export function blob(ctx, cx, cy, rx, ry, n, seed) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const j = 0.78 + wob(seed + i * 3.7) * 0.34;
    const px = cx + Math.cos(a) * rx * 0.46,
      py = cy + Math.sin(a) * ry * 0.46;
    const r = Math.min(rx, ry) * 0.64 * j;
    ctx.moveTo(px + r, py);
    ctx.arc(px, py, r, 0, Math.PI * 2);
  }
  ctx.moveTo(cx + rx * 0.8, cy);
  ctx.ellipse(cx, cy, rx * 0.8, ry * 0.8, 0, 0, Math.PI * 2);
}

/** Boards, with a shadow down each seam. Decks, doors, privy walls, the lot. */
function planks(ctx, x, y, w, h, step, vertical) {
  ctx.strokeStyle = 'rgba(58,44,28,.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (vertical)
    for (let p = x + step; p < x + w - 0.5; p += step) {
      ctx.moveTo(p, y);
      ctx.lineTo(p, y + h);
    }
  else
    for (let p = y + step; p < y + h - 0.5; p += step) {
      ctx.moveTo(x, p);
      ctx.lineTo(x + w, p);
    }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,245,220,.16)';
  ctx.beginPath();
  if (vertical)
    for (let p = x + step; p < x + w - 0.5; p += step) {
      ctx.moveTo(p + 1, y);
      ctx.lineTo(p + 1, y + h);
    }
  else
    for (let p = y + step; p < y + h - 0.5; p += step) {
      ctx.moveTo(x, p + 1);
      ctx.lineTo(x + w, p + 1);
    }
  ctx.stroke();
}

/** The line where one thing sits under another: eaves on a wall, a canopy on
 *  a trunk. Soft, warm, and never quite black. */
function seam(ctx, x, y, w, h, strength) {
  ctx.fillStyle = 'rgba(70,52,34,' + (strength ?? 0.16) + ')';
  ctx.fillRect(x, y, w, h);
}

/** Emoji advance widths are wider than their ink, so centring on the advance
 *  leaves the picture sitting to one side. Centre on what you can actually see. */
export function glyph(ctx, text, x, y, px) {
  ctx.font = px + 'px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let w = 0,
    left = 0;
  try {
    const m = ctx.measureText(text);
    if (m.actualBoundingBoxLeft != null && m.actualBoundingBoxRight != null) {
      left = -m.actualBoundingBoxLeft;
      w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    } else {
      w = m.width;
    }
  } catch {
    w = px;
  }
  if (!w) w = px;
  ctx.fillText(text, x - left - w / 2, y);
}

function bubble(ctx, x, y, glyphText, size) {
  const s = size || 15;
  ctx.fillStyle = 'rgba(255,253,248,0.96)';
  ctx.strokeStyle = 'rgba(67,55,42,0.22)';
  ctx.lineWidth = 1.2;
  rr(ctx, x - s * 0.72, y - s * 1.5, s * 1.44, s * 1.28, s * 0.5);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 2.5, y - s * 0.24);
  ctx.lineTo(x + 2.5, y - s * 0.24);
  ctx.lineTo(x, y + 2.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#000';
  glyph(ctx, glyphText, x, y - s * 0.86, s * 0.92);
}
export { bubble };

export function speech(ctx, x, y, text) {
  ctx.font = '600 10px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(150, ctx.measureText(text).width + 14);
  ctx.fillStyle = 'rgba(255,253,248,0.97)';
  ctx.strokeStyle = 'rgba(67,55,42,0.22)';
  ctx.lineWidth = 1.2;
  rr(ctx, x - w / 2, y - 15, w, 16, 8);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 3, y + 1);
  ctx.lineTo(x + 3, y + 1);
  ctx.lineTo(x, y + 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.fillText(text, x, y - 7);
}

/* ------------------------------------------------------------------ */
/* trees                                                              */
/* ------------------------------------------------------------------ */

// Three trees grow here: a broad green one, a darker older one, and a young
// one that blossoms. Each is a shade to plant the canopy in, a lighter one for
// where the sun lands, and something small it carries.
const CANOPY = [
  { dark: '#41763a', mid: '#59994a', lite: '#7cc064', trunk: '#8a5c30', fruit: null },
  { dark: '#365f33', mid: '#4a8240', lite: '#6cb057', trunk: '#75502c', fruit: '#c9543f' },
  { dark: '#4a7f40', mid: '#66a552', lite: '#8acb70', trunk: '#9c6b3c', fruit: C.blossom },
];

/**
 * A trunk that tapers and flares into the ground, lit down one side. It is
 * four lines rather than a rectangle because a rectangle is a post, and the
 * whole difference between a post and a tree is at the bottom of it.
 */
function trunk(ctx, x, y, h, halfTop, halfFoot, colour) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x - halfTop, y - h);
  ctx.lineTo(x + halfTop, y - h);
  ctx.quadraticCurveTo(x + halfTop + 0.4, y - h * 0.3, x + halfFoot, y);
  ctx.lineTo(x - halfFoot, y);
  ctx.quadraticCurveTo(x - halfTop - 0.4, y - h * 0.3, x - halfTop, y - h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = lite(colour, 0.3); // the sunward side
  ctx.beginPath();
  ctx.moveTo(x - halfTop, y - h);
  ctx.lineTo(x - halfTop + 1.3, y - h);
  ctx.quadraticCurveTo(x - halfTop, y - h * 0.3, x - halfFoot + 1.1, y);
  ctx.lineTo(x - halfFoot, y);
  ctx.quadraticCurveTo(x - halfTop - 0.4, y - h * 0.3, x - halfTop, y - h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = dusk(colour, 0.34); // and the side it does not
  ctx.beginPath();
  ctx.moveTo(x + halfTop - 1, y - h);
  ctx.lineTo(x + halfTop, y - h);
  ctx.quadraticCurveTo(x + halfTop + 0.4, y - h * 0.3, x + halfFoot, y);
  ctx.lineTo(x + halfFoot - 1.2, y);
  ctx.closePath();
  ctx.fill();
}

export function drawTree(ctx, t, time) {
  const x = t.x * TILE + TILE / 2,
    y = t.y * TILE + TILE / 2;
  const k = (t.kind - 1) % 3;
  const seed = (t.sway || 0) + t.x * 3 + t.y * 7;
  const scale = 0.9 + k * 0.13;
  const sway = Math.sin(time * 0.0011 + (t.sway || 0)) * 1.6;
  const P = CANOPY[k];

  // the shade a tree throws is dappled, not a plate
  shadow(ctx, x, y + 4, 11 * scale, 4.4 * scale);
  ctx.fillStyle = 'rgba(50,42,28,0.10)';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(
      x + (wob(seed + i) - 0.5) * 16 * scale,
      y + 4 + (wob(seed + i * 5) - 0.5) * 5,
      4 * scale,
      2 * scale,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  trunk(ctx, x, y + 4, 16 * scale, 2.2 * scale, 3.6 * scale, P.trunk);
  // two roots going off into the grass
  ctx.strokeStyle = dusk(P.trunk, 0.15);
  ctx.lineWidth = 1.6 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 2.4 * scale, y + 2.6);
  ctx.lineTo(x - 5.4 * scale, y + 4.2);
  ctx.moveTo(x + 2.4 * scale, y + 2.6);
  ctx.lineTo(x + 5 * scale, y + 4);
  ctx.stroke();
  // a knot, where a branch used to be
  ctx.fillStyle = dusk(P.trunk, 0.3);
  ctx.beginPath();
  ctx.ellipse(x + 0.6 * scale, y - 5 * scale, 1, 1.3, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x + sway, y - 12 * scale);

  // The canopy is built as one silhouette and then lit inside it. A pale fill
  // goes down first and everything else sits a whisker down and to the right
  // of it, so what is left showing along the top-left edge is a thread of sun
  // on the outermost leaves — the one thing that stops a green shape on green
  // grass reading as a sticker.
  const RX = 13.5 * scale,
    RY = 11.5 * scale;
  blob(ctx, 0, 0, RX, RY, 7, seed);
  ctx.fillStyle = lite(P.lite, 0.4);
  ctx.fill();

  ctx.save();
  blob(ctx, 0, 0, RX, RY, 7, seed);
  ctx.clip();
  const dx = 0.7 * scale,
    dy = 0.85 * scale;
  blob(ctx, dx, dy, RX, RY, 7, seed);
  ctx.fillStyle = P.dark;
  ctx.fill();
  blob(ctx, dx - 1.4 * scale, dy - 2 * scale, RX * 0.9, RY * 0.88, 6, seed + 40);
  ctx.fillStyle = P.mid;
  ctx.fill();
  blob(ctx, dx - 3.6 * scale, dy - 4.4 * scale, RX * 0.62, RY * 0.6, 5, seed + 80);
  ctx.fillStyle = P.lite;
  ctx.fill();
  // the brightest patch, where the leaves face the sun square on
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.beginPath();
  ctx.ellipse(-4.6 * scale, -6 * scale, 3.6 * scale, 2.4 * scale, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // and darker down where the trunk disappears into it
  ctx.fillStyle = 'rgba(28,44,24,.3)';
  ctx.beginPath();
  ctx.ellipse(0, 8 * scale, 7 * scale, 3.6 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  // whatever this one carries — a few berries, or a little blossom, in ones
  // and twos the way they actually hang
  if (P.fruit) {
    ctx.fillStyle = P.fruit;
    for (let i = 0; i < 3; i++) {
      const a = wob(seed + i * 11) * Math.PI * 2;
      const r = (4 + wob(seed + i * 17) * 7) * scale;
      const fx = Math.cos(a) * r,
        fy = Math.sin(a) * r * 0.75;
      ctx.beginPath();
      ctx.arc(fx, fy, 1.25 * scale, 0, Math.PI * 2);
      ctx.arc(fx + 2 * scale, fy + 1.2 * scale, 1 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.restore();
}

export function drawFallingTree(ctx, t, p) {
  // p goes 0 -> 1 as the tree comes down
  const x = t.x * TILE + TILE / 2,
    y = t.y * TILE + TILE / 2;
  const k = (t.kind - 1) % 3;
  const P = CANOPY[k];
  const seed = (t.sway || 0) + t.x * 3 + t.y * 7;
  const dir = t.fellDir === 'W' ? -1 : t.fellDir === 'E' ? 1 : 0;
  const vert = t.fellDir === 'N' ? -1 : t.fellDir === 'S' ? 1 : 0;
  const e = p < 1 ? 1 - Math.pow(1 - p, 3) : 1;
  const ang = e * (Math.PI / 2) * (dir || (vert ? 0.35 : 1));
  ctx.save();
  ctx.translate(x, y + 4);
  ctx.rotate(ang * (dir >= 0 ? 1 : -1) * (dir === 0 ? 1 : 1));
  ctx.scale(1, vert ? 1 - e * 0.45 : 1);
  trunk(ctx, 0, 0, 22, 2.2, 3.4, P.trunk);
  blob(ctx, 0, -24, 13, 11, 7, seed);
  ctx.fillStyle = P.dark;
  ctx.fill();
  ctx.save();
  blob(ctx, 0, -24, 13, 11, 7, seed);
  ctx.clip();
  blob(ctx, -1.4, -26, 11.7, 9.7, 6, seed + 40);
  ctx.fillStyle = P.mid;
  ctx.fill();
  ctx.restore();
  ctx.restore();
  // leaves shaken loose on the way down, drifting off to the side
  if (p < 1) {
    ctx.fillStyle = P.lite;
    for (let i = 0; i < 4; i++) {
      const q = Math.min(1, p * 1.4 + i * 0.12);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - q) * 0.9;
      ctx.translate(x + (wob(seed + i) - 0.4) * 20, y - 16 + q * 18);
      ctx.rotate(q * 6 + i);
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.2, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

/** What a tree leaves behind: a cut face with its rings showing, the bark
 *  still round the outside of it, and a curl of sawdust in the grass. */
export function drawStump(ctx, t) {
  const x = t.x * TILE + TILE / 2,
    y = t.y * TILE + TILE / 2;
  const bark = CANOPY[(t.kind - 1) % 3].trunk;
  const seed = (t.sway || 0) + t.x * 3;
  shadow(ctx, x, y + 3, 7, 3);

  ctx.fillStyle = dusk(bark, 0.25); // the side of it, in shade
  rr(ctx, x - 5.6, y - 4.6, 11.2, 6.4, 3);
  ctx.fill();
  ctx.fillStyle = bark; // and the sunward cheek of the bark
  ctx.beginPath();
  ctx.ellipse(x - 2.4, y - 1.6, 3.2, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = lite(bark, 0.45); // the cut face, pale where the saw went
  ctx.beginPath();
  ctx.ellipse(x, y - 4, 5.4, 3.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lite(bark, 0.62);
  ctx.beginPath();
  ctx.ellipse(x - 0.4, y - 4.3, 4.4, 2.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,80,45,.42)'; // three rings of how old it was
  ctx.lineWidth = 0.7;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(x - 0.3, y - 4.3, 1.1 * i, 0.75 * i, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(226,200,150,.7)'; // sawdust, where it fell
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(
      x + (wob(seed + i) - 0.5) * 16,
      y + 2 + wob(seed + i * 3) * 3,
      1.4,
      0.8,
      wob(seed + i * 5) * 3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

/** A felled log lying in the grass, one end sawn flat so you can see it is
 *  timber rather than a branch. Bark on top, rings on the end, bark strips
 *  peeling where it landed. */
export function drawLog(ctx, l) {
  const x = l.x * TILE,
    y = l.y * TILE;
  shadow(ctx, x, y + 4, 13, 4.4);
  ctx.fillStyle = dusk(C.wood, 0.22);
  rr(ctx, x - 13, y - 4.5, 26, 10, 5);
  ctx.fill();
  ctx.fillStyle = C.wood; // the sunlit length of the bark
  rr(ctx, x - 12.5, y - 4.5, 25, 6.6, 3.3);
  ctx.fill();
  ctx.fillStyle = lite(C.wood, 0.26);
  rr(ctx, x - 11, y - 4, 21, 2.6, 1.3);
  ctx.fill();
  // bark grain, a couple of long scratches down it
  ctx.strokeStyle = 'rgba(80,54,30,.3)';
  ctx.lineWidth = 0.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 1.6);
  ctx.lineTo(x + 3, y - 1.9);
  ctx.moveTo(x - 4, y + 1.4);
  ctx.lineTo(x + 7, y + 1.2);
  ctx.stroke();
  // the sawn end, with its rings
  ctx.fillStyle = lite(C.wood, 0.5);
  ctx.beginPath();
  ctx.ellipse(x + 12, y + 0.4, 2.9, 4.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(138,92,48,.5)';
  ctx.lineWidth = 0.7;
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath();
    ctx.ellipse(x + 11.8, y + 0.4, 0.9 * i, 1.5 * i, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ */
/* people                                                             */
/* ------------------------------------------------------------------ */

const MOOD_GLYPH = { hungry: '🍞', sad: '🛏️', poorly: '🤒' };

// the four things a tap can get out of somebody — the only case where a name
// floats over their head instead of a word or a want
const TAP_ANSWER = { wave: true, wink: true, hop: true, shy: true };

/** Who that just was: the only answer a tap needs now. Plain letters with a
 *  light outline round them — the same trick drawFx uses for floating
 *  numbers — so a name reads on grass or water alike, no bubble needed. */
function nameTag(ctx, x, y, name) {
  ctx.font = '700 11px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,253,248,.92)';
  ctx.strokeText(name, x, y);
  ctx.fillStyle = C.ink;
  ctx.fillText(name, x, y);
}

/**
 * What is in a working hand. Drawn rather than an emoji, like everything else
 * in the village, and small enough that a villager at work reads as somebody
 * getting on with a job rather than a tool with legs.
 */
function workTool(ctx, job, facing) {
  const f = facing < 0 ? -1 : 1;
  ctx.save();
  ctx.translate(6.2 * f, -3);
  ctx.scale(f, 1);
  ctx.lineCap = 'round';
  switch (job) {
    case 'fell': // an axe, over the shoulder
      ctx.strokeStyle = C.woodDark;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-1, 3);
      ctx.lineTo(2.6, -6);
      ctx.stroke();
      ctx.fillStyle = C.stone;
      ctx.beginPath();
      ctx.moveTo(1.6, -6.4);
      ctx.lineTo(5.4, -7.6);
      ctx.lineTo(5.2, -4);
      ctx.lineTo(2.4, -4.2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'stone': // one in the hand, off the bank
      ctx.fillStyle = C.stone;
      ctx.beginPath();
      ctx.ellipse(1.6, 0, 2.4, 2, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.stoneDark;
      ctx.beginPath();
      ctx.ellipse(2.4, 0.8, 1.1, 0.8, 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'farm': // a sickle
      ctx.strokeStyle = C.woodDark;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, 2.4);
      ctx.lineTo(1.4, -1.4);
      ctx.stroke();
      ctx.strokeStyle = '#cfcac1';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(3.4, -2.2, 3, Math.PI * 0.75, Math.PI * 1.85);
      ctx.stroke();
      break;
    case 'care': // shears, open on the pivot
      ctx.strokeStyle = '#b9b3a8';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-0.6, 3);
      ctx.lineTo(3.2, -4.4);
      ctx.moveTo(2.6, 3);
      ctx.lineTo(5.6, -1.4);
      ctx.stroke();
      ctx.fillStyle = C.woodDark;
      ctx.beginPath();
      ctx.arc(2, 0.2, 0.9, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'fish': // a rod, and a line off the end of it
      ctx.strokeStyle = C.woodDark;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-1, 3);
      ctx.lineTo(6, -7);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(67,55,42,.45)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(6, -7);
      ctx.lineTo(7.6, -1.5);
      ctx.stroke();
      break;
    default:
      break;
  }
  ctx.restore();
}

export function drawVillager(ctx, v, time, tick, noBubble) {
  const act = v.act ? v.act.kind : null;
  const x = v.x * TILE,
    y = v.y * TILE;
  const walking = tick - (v.moving || -99) < 3;
  const running = act === 'run',
    dancing = act === 'dance',
    sitting = act === 'sit';
  const eating = act === 'eat',
    chatting = act === 'chat',
    squabbling = act === 'squabble';
  const shy = act === 'shy',
    winking = act === 'wink',
    waving = act === 'wave',
    hopping = act === 'hop';
  const small = v.kid ? 0.72 : 1; // the children are smaller

  // which way they are looking: usually the arrow they last walked in, but
  // the two-person acts turn them toward each other — decided by comparing
  // the two ids, so both screens turn the same pair the same way without
  // either of them knowing where the other one actually stands
  let facing = v.facing === -1 ? -1 : 1;
  if ((chatting || squabbling) && v.act.with) facing = v.id < v.act.with ? 1 : -1;

  const hop = hopping ? Math.abs(Math.sin(time * 0.014)) * 3.4 : 0;
  const stride = sitting
    ? 0
    : running
      ? Math.sin(time * 0.024 + v.x) * 3.6
      : walking
        ? Math.sin(time * 0.012 + v.x) * 2.2
        : 0.8;

  let bob = walking ? Math.abs(Math.sin(time * 0.012 + v.x)) * 1.6 : 0;
  if (running) bob = Math.abs(Math.sin(time * 0.02 + v.x)) * 2.2; // a proper bound, not a wander
  if (dancing) bob = Math.abs(Math.sin(time * 0.006 + v.x)) * 1.1; // swaying more than bouncing
  if (sitting) bob = 0;
  bob += hop;

  let lean = walking ? Math.sin(time * 0.012 + v.x) * 0.08 : 0;
  if (dancing) lean = Math.sin(time * 0.005 + v.x) * 0.24;
  if (squabbling) lean = facing * 0.16; // leaning in at each other
  if (chatting) lean = facing * 0.05;

  const shiftX = dancing ? Math.sin(time * 0.005 + v.x) * 1.6 : squabbling ? facing * 1.1 : 0;
  const sitDrop = sitting ? 3.2 : 0; // settled lower, knees bent

  shadow(ctx, x, y + 4, 6.5 * small, 2.8 * small);

  const coat = v.colour || '#d96a5f';
  const cuff = dusk(coat, 0.26); // sleeves, hem and collar, out of the same cloth
  const sunny = lite(coat, 0.2);

  ctx.save();
  ctx.translate(x + shiftX, y - bob + sitDrop);
  if (small !== 1) ctx.scale(small, small);
  ctx.rotate(lean);

  // legs, and a pair of boots at the end of them — a person with no shoes on
  // is a stick, and it is the stubby dark ends that make them a person
  const boot = (bx, by, angle) => {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(angle);
    ctx.fillStyle = '#4e3b2c';
    rr(ctx, -1.9, -1.1, 4.4, 2.6, 1.2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,210,.2)';
    rr(ctx, -1.9, -1.1, 4.4, 1, 0.8);
    ctx.fill();
    ctx.restore();
  };
  // Sitting, the legs go out in front and so must be painted over the smock,
  // or somebody on the grass is a body with two boots floating beside it.
  const legs = () => {
    ctx.strokeStyle = '#6b5540';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (sitting) {
      // knees up, shins out along the ground, one a little ahead of the other
      ctx.moveTo(-0.6, -0.4);
      ctx.lineTo(4.2 * facing, 0.2);
      ctx.lineTo(8.4 * facing, 2.4);
      ctx.moveTo(1.2, 1.2);
      ctx.lineTo(4 * facing, 2.6);
      ctx.lineTo(7 * facing, 4.4);
    } else {
      ctx.moveTo(-1.6, 0);
      ctx.lineTo(-1.6 - stride, 4.4);
      ctx.moveTo(1.6, 0);
      ctx.lineTo(1.6 + stride, 4.4);
    }
    ctx.stroke();
    if (sitting) {
      boot(9.2 * facing, 2.6, facing * 0.45);
      boot(7.8 * facing, 4.6, facing * 0.45);
    } else {
      boot(-1.6 - stride, 4.7, -stride * 0.06);
      boot(1.6 + stride, 4.7, stride * 0.06);
    }
  };
  if (!sitting) legs();

  // body: a smock, lit down the left, hemmed and collared in a darker shade
  // of the same cloth so everybody's clothes still read as one wardrobe
  const bodyTop = sitting ? -5.4 : -8.5,
    bodyH = sitting ? 6.4 : 9.5;
  ctx.fillStyle = coat;
  rr(ctx, -4.6, bodyTop, 9.2, bodyH, 3.6);
  ctx.fill();
  ctx.save();
  rr(ctx, -4.6, bodyTop, 9.2, bodyH, 3.6);
  ctx.clip();
  ctx.fillStyle = sunny; // the side the sun is on
  rr(ctx, -4.6, bodyTop, 3.4, bodyH, 3.2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.2)';
  rr(ctx, -4.4, bodyTop + 0.6, 1.6, bodyH - 2, 0.8);
  ctx.fill();
  ctx.fillStyle = cuff; // and the hem along the bottom
  ctx.fillRect(-4.6, bodyTop + bodyH - 2, 9.2, 2);
  ctx.fillStyle = 'rgba(70,52,34,.18)'; // where the chin shades the chest
  ctx.fillRect(-4.6, bodyTop, 9.2, 1.6);
  ctx.restore();
  if (sitting) legs();
  // a little collar, the one piece of tailoring anybody here owns
  ctx.fillStyle = cuff;
  ctx.beginPath();
  ctx.moveTo(-2.6, bodyTop + 0.2);
  ctx.lineTo(2.6, bodyTop + 0.2);
  ctx.lineTo(0, bodyTop + 2.6);
  ctx.closePath();
  ctx.fill();

  // arms, with a hand on the end of each
  const hand = (hx, hy) => {
    ctx.fillStyle = C.skin;
    ctx.beginPath();
    ctx.arc(hx, hy, 1.4, 0, Math.PI * 2);
    ctx.fill();
  };
  ctx.strokeStyle = coat;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  if (waving) {
    // one arm stays put; the other goes up by the head and wags side to side
    const wag = Math.sin(time * 0.018) * 1.8;
    ctx.moveTo(-4.2 * facing, -6);
    ctx.lineTo(-6 * facing, -2.2);
    ctx.moveTo(4.2 * facing, -6);
    ctx.lineTo((5.6 + wag) * facing, -12);
    ctx.stroke();
    hand(-6 * facing, -2.2);
    hand((5.6 + wag) * facing, -12);
  } else {
    ctx.moveTo(-4.2, -6);
    ctx.lineTo(-6.4 + stride * 0.5, -2.2);
    ctx.moveTo(4.2, -6);
    ctx.lineTo(6.4 - stride * 0.5, -2.2);
    ctx.stroke();
    hand(-6.4 + stride * 0.5, -2.2);
    hand(6.4 - stride * 0.5, -2.2);
  }

  if (act === 'work') workTool(ctx, v.act.job, facing);

  // head — skin, then the shade of the hair falling across the top of it,
  // then ears, then a face
  const headY = sitting ? -9.6 : -12.6;
  ctx.fillStyle = C.skin;
  ctx.beginPath();
  ctx.arc(-4.9, headY + 0.4, 1.1, 0, Math.PI * 2); // ears
  ctx.arc(4.9, headY + 0.4, 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.skin;
  ctx.beginPath();
  ctx.arc(0, headY, 4.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dusk(C.skin, 0.12); // the cheek away from the sun
  ctx.beginPath();
  ctx.arc(1.3, headY + 0.4, 4.2, -Math.PI * 0.42, Math.PI * 0.58);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,250,235,.3)'; // and a soft light on the other one
  ctx.beginPath();
  ctx.ellipse(-2.2, headY - 1.6, 2.2, 1.7, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = C.hair;
  ctx.beginPath();
  if (shy)
    ctx.arc(0, headY, 4.9, 0, Math.PI * 2); // hair only: turned right away
  else ctx.arc(0, headY - 1, 4.7, Math.PI * 1.03, Math.PI * 1.97);
  ctx.fill();
  if (!shy) {
    // a fringe over one eyebrow and a tuft standing up, so a head is a
    // haircut somebody has rather than a cap somebody is wearing
    ctx.fillStyle = C.hair;
    ctx.beginPath();
    ctx.ellipse(-2.6 * facing, headY - 1.4, 2.6, 1.9, facing * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(1.4 * facing, headY - 4.4);
    ctx.quadraticCurveTo(4.4 * facing, headY - 7.4, 0.4 * facing, headY - 5.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,210,.18)'; // a shine along the top of it
    ctx.beginPath();
    ctx.ellipse(-1.6, headY - 3.2, 2.4, 0.9, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  seam(ctx, -4.7, headY - 1.2, 9.4, 0.7, 0.1); // hair sits *on* the head

  // face
  if (shy) {
    ctx.fillStyle = 'rgba(230,150,140,.55)'; // a little blush is all that shows
    ctx.beginPath();
    ctx.ellipse(3.4 * facing, headY + 1.2, 1.3, 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const f = facing;
    const eye1 = -0.9 * f,
      eye2 = 2.1 * f;
    const glad = v.mood === 'happy' || dancing || hopping || waving || winking;
    const low = v.mood === 'hungry' || v.mood === 'sad' || v.mood === 'poorly';
    // cheeks, always, faintly — it is what makes a face warm rather than drawn
    ctx.fillStyle = 'rgba(232,148,136,.3)';
    ctx.beginPath();
    ctx.ellipse(eye1 - 1.6 * f, headY + 1.9, 1.3, 0.9, 0, 0, Math.PI * 2);
    ctx.ellipse(eye2 + 1.5 * f, headY + 1.9, 1.3, 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    const openEye = (ex, ey) => {
      ctx.fillStyle = '#fffaf2';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 1.05, 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(ex + 0.18 * f, ey + 0.1, 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.95)'; // the catchlight: one white dot,
      ctx.beginPath(); // and the whole face is suddenly looking at something
      ctx.arc(ex - 0.22 * f, ey - 0.42, 0.34, 0, Math.PI * 2);
      ctx.fill();
    };
    if (winking) {
      openEye(eye1, headY + 0.2);
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(eye2, headY + 0.6, 1, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
      const twinkle = 0.5 + Math.sin(time * 0.02) * 0.5; // a little sparkle by the shut eye
      ctx.strokeStyle = 'rgba(255,209,110,' + (0.35 + twinkle * 0.5) + ')';
      ctx.lineWidth = 0.9;
      const sx = eye2 + 2.2 * f,
        sy = headY - 1.6;
      ctx.beginPath();
      ctx.moveTo(sx - 1.4, sy);
      ctx.lineTo(sx + 1.4, sy);
      ctx.moveTo(sx, sy - 1.4);
      ctx.lineTo(sx, sy + 1.4);
      ctx.stroke();
    } else {
      openEye(eye1, headY + 0.2);
      openEye(eye2, headY + 0.2);
    }
    // eyebrows: two short strokes, and almost all of how somebody is feeling
    ctx.strokeStyle = 'rgba(80,58,40,.8)';
    ctx.lineWidth = 0.75;
    ctx.lineCap = 'round';
    const brow = (bx, tilt) => {
      ctx.beginPath();
      ctx.moveTo(bx - 1, headY - 1.7 + tilt);
      ctx.lineTo(bx + 1, headY - 1.7 - tilt);
      ctx.stroke();
    };
    brow(eye1, low ? -0.5 * f : glad ? 0.25 * f : 0);
    brow(eye2, low ? 0.5 * f : glad ? -0.25 * f : 0);

    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    if (glad) ctx.arc(0.5 * f, headY + 1.8, 1.8, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (low) ctx.arc(0.5 * f, headY + 3.2, 1.8, 1.15 * Math.PI, 1.85 * Math.PI);
    else {
      ctx.moveTo(-1 + 0.5 * f, headY + 2);
      ctx.lineTo(1.8 + 0.5 * f, headY + 2);
    }
    ctx.stroke();
  }
  ctx.restore();

  // What is in their arms. Wood was the only thing anybody ever carried, and
  // now a villager who has been shown the field comes home with a sheaf too —
  // so it is drawn as whatever it actually is.
  if (v.carrying) {
    ctx.save();
    ctx.translate(x, y - 9);
    if (v.carrying.res === 'wheat') {
      // A sheaf carried across the chest, in the same band the log below sits
      // in: cut stalks trailing behind, the heavy ears out in front on the
      // side they are facing, and a string round the waist of it. Fanned up
      // past the chin — which is where this used to be drawn — a sheaf reads
      // as straw growing out of somebody's head rather than a thing held.
      ctx.translate(facing * 2.2, 3.4);
      ctx.rotate(facing * 0.12);
      ctx.strokeStyle = C.wheatDry; // the cut ends, loose and splayed
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        ctx.moveTo(-facing * 1.4, i * 0.5);
        ctx.lineTo(-facing * 7, i * 1.15);
      }
      ctx.stroke();
      ctx.strokeStyle = C.wheat; // and the straw that carries the grain
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(-facing * 1.4, i * 0.5);
        ctx.lineTo(facing * 3.6, i * 1.1);
      }
      ctx.stroke();
      ctx.fillStyle = C.wheat; // the ears themselves, fat at the front
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.ellipse(facing * 4.4, i * 1.25, 2, 1, facing * i * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = C.woodDark; // the string round the middle of it
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-facing * 1.1, -1.8);
      ctx.lineTo(-facing * 1.1, 1.8);
      ctx.stroke();
    } else {
      ctx.fillStyle = C.wood;
      rr(ctx, -9, -3, 18, 6, 3);
      ctx.fill();
      ctx.fillStyle = C.woodLite;
      ctx.beginPath();
      ctx.ellipse(8, 0, 1.8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // touches that ride the ground rather than lean and bob along with them
  if (running) {
    for (let i = 0; i < 3; i++) {
      const p = (time * 0.006 + i * 0.33) % 1;
      ctx.fillStyle = 'rgba(180,160,120,' + 0.32 * (1 - p) + ')';
      ctx.beginPath();
      ctx.arc(x - facing * (6 + p * 10), y + 3 - p * 3, 1.6 + p * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (squabbling) {
    for (let i = 0; i < 3; i++) {
      const p = (time * 0.008 + i * 0.3) % 1;
      ctx.fillStyle = 'rgba(180,160,120,' + 0.3 * (1 - p) + ')';
      ctx.beginPath();
      ctx.arc(x + (i - 1) * 4, y + 2 - p * 5, 1.8 + p * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    bubble(ctx, x + facing * 9, y - 20, '💢', 11);
  }
  if (dancing) {
    for (let i = 0; i < 2; i++) {
      const p = (time * 0.0016 + v.x + i * 0.5) % 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p);
      glyph(ctx, i ? '🎵' : '🎶', x + (i ? 10 : -10), y - 24 - p * 8, 9);
      ctx.restore();
    }
  }
  if (eating) {
    // held up beside the chin rather than over the face, and a roll rather
    // than a bun-shaped blob: a browner crust, a pale crumb, a bite gone
    ctx.save();
    ctx.translate(x + facing * 6.4, y - 10.4);
    ctx.fillStyle = '#c98b4c';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.2, 2.4, -facing * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#efcf94';
    ctx.beginPath();
    ctx.ellipse(-facing * 0.4, 0.3, 2.2, 1.5, -facing * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,92,48,.5)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-facing * 1.6, -1.2);
    ctx.lineTo(facing * 1.2, -1.6);
    ctx.stroke();
    const p = (time * 0.006) % 1; // a crumb, falling and fading
    ctx.fillStyle = 'rgba(226,178,104,' + (1 - p) + ')';
    ctx.beginPath();
    ctx.arc(-facing * 2, 3 + p * 5, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (!noBubble) drawVillagerSay(ctx, v);
}

/**
 * What is floating over somebody's head: a line they are saying, their name,
 * or how they are feeling. It is its own function so the village can paint it
 * in a pass of its own, after everything that stands up — words behind a roof
 * are words nobody can read, and a bubble is there to be read.
 */
export function drawVillagerSay(ctx, v) {
  const act = v.act ? v.act.kind : null;
  const x = v.x * TILE,
    y = v.y * TILE;
  if (v.said) speech(ctx, x, y - 22, tr(v.said));
  else if (act === 'work' && VILLAGER_SKILLS[v.act.job])
    bubble(ctx, x + 9, y - 18, VILLAGER_SKILLS[v.act.job].icon, 12);
  else if (TAP_ANSWER[act]) nameTag(ctx, x, y - 20, v.name);
  else if (MOOD_GLYPH[v.mood]) bubble(ctx, x + 9, y - 18, MOOD_GLYPH[v.mood], 12);
}

/* ------------------------------------------------------------------ */
/* sheep                                                              */
/* ------------------------------------------------------------------ */

const SHEEP_GLYPH = { hungry: '🌾', thirsty: '💧', woolly: '✂️' };

export function drawSheep(ctx, s, time, tick, noBubble) {
  const x = s.x * TILE,
    y = s.y * TILE;
  const f = s.facing === -1 ? -1 : 1;
  const walking = tick - (s.moving || -99) < 3;
  const bob = walking ? Math.abs(Math.sin(time * 0.009 + s.x)) * 1.1 : 0;
  const puff = 0.82 + (s.fluff / 100) * 0.4;
  const seed = s.x * 7 + s.y * 3;
  shadow(ctx, x, y + 3.5, 9 * puff, 3.4);

  ctx.save();
  ctx.translate(x, y - bob);
  ctx.scale(f, 1);

  // legs, with a dark hoof on each — the far pair first, in a paler brown,
  // because the ones you can see past are the ones that are further away
  const st = walking ? Math.sin(time * 0.011 + s.x) * 1.6 : 0.6;
  ctx.lineCap = 'round';
  const hoof = (hx, hy) => {
    ctx.fillStyle = '#39302a';
    rr(ctx, hx - 1.1, hy - 0.7, 2.2, 1.5, 0.7);
    ctx.fill();
  };
  ctx.strokeStyle = '#8a7c6d';
  ctx.lineWidth = 1.6; // the far pair
  ctx.beginPath();
  ctx.moveTo(-2.2, -1.4);
  ctx.lineTo(-2.2 + st, 2.6);
  ctx.moveTo(4.2, -1.4);
  ctx.lineTo(4.2 - st, 2.6);
  ctx.stroke();
  ctx.strokeStyle = C.muzzle;
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(-3.4, -1);
  ctx.lineTo(-3.4 - st, 3.6);
  ctx.moveTo(3.2, -1);
  ctx.lineTo(3.2 + st, 3.6);
  ctx.stroke();
  hoof(-3.4 - st, 3.8);
  hoof(3.2 + st, 3.8);

  // the fleece: one lumpy silhouette, shaded underneath and lit on top, with
  // a few curls drawn into it so it reads as wool rather than as cloud
  const fx = -0.4,
    fy = -5.2 * puff,
    frx = 10.2 * puff,
    fry = 7.4 * puff;
  blob(ctx, fx, fy, frx, fry, 7, seed);
  ctx.fillStyle = C.woolShade;
  ctx.fill();
  ctx.save();
  blob(ctx, fx, fy, frx, fry, 7, seed);
  ctx.clip();
  blob(ctx, fx - 0.7, fy - 0.9, frx, fry, 7, seed);
  ctx.fillStyle = C.wool;
  ctx.fill();
  ctx.fillStyle = 'rgba(190,176,156,.4)'; // the belly, out of the light
  ctx.beginPath();
  ctx.ellipse(fx, fy + 5.6 * puff, 8 * puff, 2.6 * puff, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(176,162,142,.55)'; // three curls, and no more
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) {
    const cx = fx - 5 + i * 4.4,
      cy = fy - 1 + (i % 2) * 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 1.9, 0.2, Math.PI * 1.5);
    ctx.stroke();
  }
  ctx.restore();

  // a tail, on the end of her
  ctx.fillStyle = C.woolShade;
  ctx.beginPath();
  ctx.ellipse(-8.6 * puff, -3.4, 2.1, 2.6, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // head — droops when the sheep wants something
  const droop = s.mood === 'hungry' || s.mood === 'thirsty' ? 2.2 : 0;
  ctx.fillStyle = dusk(C.muzzle, 0.2); // the far ear, behind the face
  ctx.beginPath();
  ctx.ellipse(5.2, -6.6 + droop, 1.8, 1.1, -0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.muzzle;
  ctx.beginPath();
  ctx.ellipse(7.4, -3.4 + droop, 3.3, 2.9, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lite(C.muzzle, 0.18); // the light down the front of her face
  ctx.beginPath();
  ctx.ellipse(8.2, -3.2 + droop, 2.2, 2.1, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.muzzle; // the near ear, out to the side
  ctx.beginPath();
  ctx.ellipse(5.4, -6.2 + droop, 1.9, 1.3, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(214,158,150,.5)'; // pink inside it
  ctx.beginPath();
  ctx.ellipse(5.5, -6.1 + droop, 1.1, 0.6, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // a forelock of fleece, falling over her forehead
  ctx.fillStyle = C.wool;
  ctx.beginPath();
  ctx.ellipse(5.4, -5.4 + droop * 0.6, 2.6, 2, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // the nose, and two nostrils
  ctx.fillStyle = dusk(C.muzzle, 0.3);
  ctx.beginPath();
  ctx.ellipse(9.8, -2.2 + droop, 1.5, 1.1, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(8.4, -4.1 + droop, 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(8.7, -4.1 + droop, 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.beginPath();
  ctx.arc(8.5, -4.45 + droop, 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (!noBubble) drawSheepSay(ctx, s, tick);
}

/** The same, for a sheep: a heart just now, or what she is short of. */
export function drawSheepSay(ctx, s, tick) {
  const x = s.x * TILE,
    y = s.y * TILE;
  if (tick - (s.hearts || -999) < 30) bubble(ctx, x, y - 16, '💚', 12);
  else if (SHEEP_GLYPH[s.mood]) bubble(ctx, x + 8, y - 15, SHEEP_GLYPH[s.mood], 12);
}

/** Somebody from the forest, who came to have a look and will go again.
 *  White on the rump, a dark eye, and antlers she keeps catching on things. */
export function drawDeer(ctx, c, _time) {
  const x = c.x * TILE,
    y = c.y * TILE;
  const hide = '#a9784e';
  shadow(ctx, x, y + 3, 8, 3);
  ctx.save();
  ctx.translate(x, y);

  ctx.strokeStyle = '#7c5a3c';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-3, -1);
  ctx.lineTo(-3.6, 3.4);
  ctx.moveTo(3, -1);
  ctx.lineTo(3.6, 3.4);
  ctx.stroke();
  ctx.fillStyle = '#463225'; // slim dark feet
  rr(ctx, -4.5, 2.9, 1.9, 1.4, 0.7);
  ctx.fill();
  rr(ctx, 2.8, 2.9, 1.9, 1.4, 0.7);
  ctx.fill();

  ctx.fillStyle = hide;
  rr(ctx, -6, -8, 12, 8, 4);
  ctx.fill();
  ctx.fillStyle = lite(hide, 0.22); // the sunlit back
  rr(ctx, -5.6, -7.8, 11, 3, 2.4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,250,240,.75)'; // a pale belly and a white tail
  rr(ctx, -4.6, -2.6, 8.4, 2.2, 1.4);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-6.4, -6, 1.7, 2.1, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,248,232,.7)'; // and the spots she was born with
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(-3.6 + (i % 2) * 3.4, -6.4 + ((i / 2) | 0) * 2.6, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = hide; // the neck
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(4, -6.4);
  ctx.lineTo(6.2, -9.6);
  ctx.stroke();
  ctx.fillStyle = hide;
  ctx.beginPath();
  ctx.ellipse(6.5, -10, 2.8, 2.4, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lite(hide, 0.2);
  ctx.beginPath();
  ctx.ellipse(7.4, -10.2, 1.6, 1.4, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hide; // an ear, turned to listen
  ctx.beginPath();
  ctx.ellipse(4.6, -12.2, 1.6, 1.1, -0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#8a5f3c';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(6, -12);
  ctx.lineTo(5, -16);
  ctx.moveTo(5, -16);
  ctx.lineTo(3.2, -17.4);
  ctx.moveTo(5.4, -14.6);
  ctx.lineTo(3.8, -15.2);
  ctx.moveTo(7.6, -12);
  ctx.lineTo(8.6, -16);
  ctx.moveTo(8.6, -16);
  ctx.lineTo(10.4, -17.2);
  ctx.moveTo(8.2, -14.4);
  ctx.lineTo(9.8, -15);
  ctx.stroke();

  ctx.fillStyle = '#2e2620'; // a big dark eye, looking straight at you
  ctx.beginPath();
  ctx.ellipse(7.6, -10.4, 0.85, 0.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.beginPath();
  ctx.arc(7.4, -10.7, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a3a30'; // and a soft nose
  ctx.beginPath();
  ctx.ellipse(8.9, -9.4, 0.9, 0.7, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* buildings                                                          */
/* ------------------------------------------------------------------ */

/** Somewhere a house is going to go: pegs in the ground, string between them,
 *  and the first four posts stood up in their holes. */
export function drawSite(ctx, b, _time) {
  const x = b.x * TILE,
    y = b.y * TILE,
    w = b.w * TILE,
    h = b.h * TILE;
  ctx.save();
  // turned earth inside the lines, where the floor will be
  ctx.fillStyle = 'rgba(168,134,92,.3)';
  rr(ctx, x + 3, y + 3, w - 6, h - 6, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(140,108,70,.22)';
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.ellipse(
      x + 8 + wob(b.x + i) * (w - 16),
      y + 8 + wob(b.y + i * 3) * (h - 16),
      2.4,
      1.4,
      wob(i) * 3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = 'rgba(90,75,55,.5)';
  ctx.lineWidth = 1.6;
  rr(ctx, x + 3, y + 3, w - 6, h - 6, 5);
  ctx.stroke();
  ctx.setLineDash([]);

  // the corner posts, each with a shadow and a bit of string tied round it
  for (const [cx, cy] of [
    [x + 4, y + 4],
    [x + w - 4, y + 4],
    [x + 4, y + h - 4],
    [x + w - 4, y + h - 4],
  ]) {
    shadow(ctx, cx, cy + 1, 2.6, 1.2);
    ctx.fillStyle = C.woodDark;
    rr(ctx, cx - 1.4, cy - 9, 2.8, 10, 1);
    ctx.fill();
    ctx.fillStyle = lite(C.woodDark, 0.28);
    rr(ctx, cx - 1.4, cy - 9, 1.2, 10, 0.8);
    ctx.fill();
    ctx.fillStyle = '#e8ddc6';
    ctx.fillRect(cx - 1.8, cy - 7, 3.6, 1);
  }
  ctx.fillStyle = 'rgba(67,55,42,.72)';
  ctx.font = '600 9px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tr(b.newFamily ? 'art.forFamily' : 'art.plot'), x + w / 2, y + h / 2 + 1);
  ctx.restore();
}

/**
 * A pitched roof, in three pieces: the sunlit face, the shaded one, and the
 * ridge between them. Shingles are drawn as short rows clipped to the roof,
 * because a roof is the largest flat thing in the village and the one most
 * worth giving a texture to.
 */
function roof(ctx, cx, apexY, x0, x1, eaveY, base, overhang) {
  const lx = x0 - overhang,
    rx = x1 + overhang;
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.moveTo(lx, eaveY);
  ctx.lineTo(cx, apexY);
  ctx.lineTo(rx, eaveY);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(lx, eaveY);
  ctx.lineTo(cx, apexY);
  ctx.lineTo(rx, eaveY);
  ctx.closePath();
  ctx.clip();
  // the far slope, away from the sun
  ctx.fillStyle = dusk(base, 0.24);
  ctx.beginPath();
  ctx.moveTo(cx, apexY);
  ctx.lineTo(rx, eaveY);
  ctx.lineTo(cx, eaveY);
  ctx.closePath();
  ctx.fill();
  // shingles: rows of scallops, faint, following the pitch
  ctx.strokeStyle = 'rgba(70,45,32,.2)';
  ctx.lineWidth = 0.9;
  const rows = Math.max(3, Math.round((eaveY - apexY) / 4.5));
  for (let i = 1; i <= rows; i++) {
    const ry = apexY + ((eaveY - apexY) * i) / rows;
    ctx.beginPath();
    ctx.moveTo(lx, ry);
    ctx.lineTo(rx, ry);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,240,215,.14)';
  for (let i = 1; i <= rows; i++) {
    const ry = apexY + ((eaveY - apexY) * i) / rows + 1;
    ctx.beginPath();
    ctx.moveTo(lx, ry);
    ctx.lineTo(rx, ry);
    ctx.stroke();
  }
  // the sun catching the near edge of the sunward slope
  ctx.fillStyle = lite(base, 0.13);
  ctx.beginPath();
  ctx.moveTo(lx, eaveY);
  ctx.lineTo(cx, apexY);
  ctx.lineTo(cx - (cx - lx) * 0.55, apexY + (eaveY - apexY) * 0.45);
  ctx.lineTo(lx + 2, eaveY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // the ridge beam along the top, catching the sun
  ctx.strokeStyle = lite(base, 0.34);
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(lx + 1.5, eaveY - 0.8);
  ctx.lineTo(cx, apexY - 0.4);
  ctx.stroke();
  ctx.strokeStyle = dusk(base, 0.3);
  ctx.beginPath();
  ctx.moveTo(cx, apexY - 0.4);
  ctx.lineTo(rx - 1.5, eaveY - 0.8);
  ctx.stroke();
  // and a finial: one knob at the top, the sort of thing somebody carved
  ctx.fillStyle = dusk(base, 0.2);
  ctx.beginPath();
  ctx.arc(cx, apexY - 1.4, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

/** A window that is a window: a sill, a frame, four panes, and the warm
 *  inside of a house showing through them. */
function window_(ctx, wx, wy, lit, lamp, time, box) {
  const w = 9,
    h = 9;
  const x = wx - w / 2,
    y = wy - h / 2;
  if (lamp) {
    const flick = 0.66 + Math.sin(time * 0.004 + wx) * 0.06;
    const g = ctx.createRadialGradient(wx, wy, 1, wx, wy, 17);
    g.addColorStop(0, 'rgba(255,214,120,' + flick + ')');
    g.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(wx, wy, 17, 0, Math.PI * 2);
    ctx.fill();
  }
  const glass = lamp ? C.glow : lit ? '#f7dc9a' : '#8ea0a8';
  ctx.fillStyle = glass;
  rr(ctx, x, y, w, h, 1.6);
  ctx.fill();
  // the room behind the glass is darker at the top, brighter at the sill
  ctx.fillStyle = 'rgba(96,66,38,.24)';
  rr(ctx, x, y, w, 3, 1.4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.3)'; // a slant of reflection on the pane
  ctx.beginPath();
  ctx.moveTo(x + 0.6, y + h - 1);
  ctx.lineTo(x + w - 1, y + 0.6);
  ctx.lineTo(x + w - 4.2, y + 0.6);
  ctx.lineTo(x + 0.6, y + h - 4.4);
  ctx.closePath();
  ctx.fill();
  // the glazing bars, four panes
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(wx, y);
  ctx.lineTo(wx, y + h);
  ctx.moveTo(x, wy);
  ctx.lineTo(x + w, wy);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  rr(ctx, x, y, w, h, 1.6);
  ctx.stroke();
  // the sill, with its own little shadow under it
  ctx.fillStyle = lite(C.woodDark, 0.3);
  rr(ctx, x - 1.4, y + h, w + 2.8, 1.8, 0.8);
  ctx.fill();
  seam(ctx, x - 1, y + h + 1.8, w + 2, 1, 0.14);
  if (box) {
    // a window box, because somebody living here likes flowers
    ctx.fillStyle = C.woodDark;
    rr(ctx, x - 0.6, y + h + 1.4, w + 1.2, 3.4, 1);
    ctx.fill();
    ctx.fillStyle = lite(C.woodDark, 0.22);
    rr(ctx, x - 0.6, y + h + 1.4, w + 1.2, 1.2, 0.8);
    ctx.fill();
    ctx.fillStyle = C.leaf;
    ctx.beginPath();
    ctx.ellipse(wx, y + h + 1.2, w * 0.52, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === 1 ? C.petal : C.blossom;
      ctx.beginPath();
      ctx.arc(wx - 3 + i * 3, y + h + 0.3, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** A door that opens: planks, an iron strap across them, a round handle,
 *  a stone step worn flat by everybody going in and out. */
function door(ctx, cx, footY, w, h) {
  const x = cx - w / 2,
    y = footY - h;
  ctx.fillStyle = 'rgba(70,52,34,.3)'; // the frame it is set into
  rr(ctx, x - 1.3, y - 1.3, w + 2.6, h + 1.3, 3);
  ctx.fill();
  ctx.fillStyle = C.woodDark;
  rr(ctx, x, y, w, h, 2.6);
  ctx.fill();
  ctx.save();
  rr(ctx, x, y, w, h, 2.6);
  ctx.clip();
  ctx.fillStyle = lite(C.woodDark, 0.16);
  ctx.fillRect(x, y, w * 0.4, h);
  planks(ctx, x, y, w, h, 3.4, true);
  ctx.fillStyle = dusk(C.woodDark, 0.3); // the iron strap hinge
  ctx.fillRect(x, y + 2.6, w * 0.62, 1.4);
  ctx.fillRect(x, y + h - 5, w * 0.62, 1.4);
  ctx.restore();
  ctx.fillStyle = '#e0b26a'; // the handle, catching the light
  ctx.beginPath();
  ctx.arc(cx + w * 0.28, y + h * 0.52, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.stone; // and the step
  rr(ctx, x - 2, footY - 0.4, w + 4, 2.2, 1);
  ctx.fill();
  ctx.fillStyle = lite(C.stone, 0.3);
  rr(ctx, x - 2, footY - 0.4, w + 4, 1, 0.8);
  ctx.fill();
}

/** Bricks, a cap slab, and smoke if there is something burning under it. */
function chimney(ctx, x, top, w, h, smoking, time) {
  const brick = '#a5705a';
  ctx.fillStyle = brick;
  ctx.fillRect(x, top, w, h);
  ctx.fillStyle = lite(brick, 0.26);
  ctx.fillRect(x, top, w * 0.45, h);
  ctx.strokeStyle = 'rgba(58,48,38,.35)'; // three courses of brick
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    ctx.moveTo(x, top + (h * i) / 3);
    ctx.lineTo(x + w, top + (h * i) / 3);
  }
  ctx.stroke();
  ctx.fillStyle = dusk(brick, 0.24); // the cap, a little wider
  rr(ctx, x - 1.2, top - 1.8, w + 2.4, 2.4, 0.8);
  ctx.fill();
  if (!smoking) return;
  for (let i = 0; i < 4; i++) {
    const t = (time * 0.0012 + i * 0.25) % 1;
    ctx.fillStyle = 'rgba(255,255,255,' + 0.34 * (1 - t) + ')';
    ctx.beginPath();
    ctx.arc(x + w / 2 + Math.sin(t * 5 + i) * 3.4, top - 4 - t * 22, 1.6 + t * 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * A house, standing on a rectangle of ground. Pulled out of `drawHouse` so the
 * picture on the "shall we put one up?" panel is *this* house rather than a
 * second, simpler drawing of one that then turns up looking different.
 * `b` says what this one has: a lamp lit, a fire going, how many beds.
 */
export function houseFace(ctx, x, y, w, h, b, time) {
  const wallTop = y + h - 26;
  const cx = x + w / 2,
    foot = y + h;

  shadow(ctx, cx, foot - 1, w * 0.46, 5);

  // a course of stone along the bottom, so the house stands on something
  ctx.fillStyle = C.stone;
  rr(ctx, x + 2, foot - 6, w - 4, 6, 2);
  ctx.fill();
  ctx.fillStyle = dusk(C.stone, 0.18);
  for (let i = 0; i < 5; i++) {
    const sw = (w - 8) / 5;
    rr(ctx, x + 4 + i * sw + (i % 2), foot - 5 + (i % 2) * 2.4, sw - 2, 2.2, 0.8);
    ctx.fill();
  }

  // plaster, lit on the left and shaded on the right
  ctx.fillStyle = C.wall;
  rr(ctx, x + 3, wallTop, w - 6, 26, 3);
  ctx.fill();
  ctx.save();
  rr(ctx, x + 3, wallTop, w - 6, 26, 3);
  ctx.clip();
  ctx.fillStyle = C.wallShade;
  rr(ctx, x + w - 13, wallTop, 10, 26, 3);
  ctx.fill();
  ctx.fillStyle = lite(C.wall, 0.4);
  rr(ctx, x + 3, wallTop, 7, 26, 3);
  ctx.fill();
  // the timbers holding it all up: a post at each end, the plate they carry
  // along the top, and a knee brace into each corner. They stay up under the
  // eaves and out of the windows, which is both where a carpenter would put
  // them and the only place they do not cut a pane in half.
  ctx.fillStyle = 'rgba(150,110,70,.3)';
  ctx.fillRect(x + 3, wallTop, 2.6, 26);
  ctx.fillRect(x + w - 5.6, wallTop, 2.6, 26);
  ctx.fillRect(x + 3, wallTop + 3.6, w - 6, 2);
  ctx.beginPath();
  ctx.moveTo(x + 5.6, wallTop + 5.6);
  ctx.lineTo(x + 11, wallTop + 5.6);
  ctx.lineTo(x + 5.6, wallTop + 11);
  ctx.closePath();
  ctx.moveTo(x + w - 5.6, wallTop + 5.6);
  ctx.lineTo(x + w - 11, wallTop + 5.6);
  ctx.lineTo(x + w - 5.6, wallTop + 11);
  ctx.closePath();
  ctx.fill();
  // the eaves put the top of the wall in shade, which is what makes the roof
  // sit on the house rather than float above it
  seam(ctx, x + 3, wallTop, w - 6, 3.4, 0.17);
  ctx.restore();

  roof(ctx, cx, wallTop - 16, x + 3, x + w - 3, wallTop + 2, b.cold ? C.roof2 : C.roof, 4);

  door(ctx, cx, foot, 11, 15);

  // windows — warm and glowing once the lamp is on inside
  const lit = b.light !== false;
  const lamp = !!b.lamp;
  const nWin = Math.max(1, Math.min(2, b.beds || 1));
  for (let i = 0; i < nWin; i++) {
    const wx = cx + (nWin === 1 ? 17 : i === 0 ? -17 : 17);
    window_(ctx, wx, wallTop + 11, lit, lamp, time, i === 0);
  }
  // when a lamp is on, a little of it falls out of the door onto the step
  if (lamp) {
    ctx.fillStyle = 'rgba(255,214,120,.2)';
    ctx.beginPath();
    ctx.ellipse(cx, foot + 2, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // chimney and smoke
  if (b.warm !== false) chimney(ctx, x + w - 19, wallTop - 19, 5.5, 12, b.smoke, time);

  // a stack of firewood against the end of the wall, sawn ends out, the way
  // anybody stacks it who has to carry it in through that door in the dark
  const fwx = x + 6,
    fwy = foot - 2.5;
  shadow(ctx, fwx + 1.6, fwy + 1.4, 4.6, 1.8);
  for (let i = 0; i < 3; i++) {
    const row = i < 2 ? 0 : 1;
    const lx = fwx + (i < 2 ? i : 0) * 3.4 + row * 1.7,
      ly = fwy - row * 3.1;
    ctx.fillStyle = C.wood;
    ctx.beginPath();
    ctx.ellipse(lx, ly, 1.8, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lite(C.wood, 0.4);
    ctx.beginPath();
    ctx.ellipse(lx, ly, 1.2, 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(138,92,48,.45)';
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.ellipse(lx, ly, 0.6, 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawHouse(ctx, b, time, tick) {
  const x = b.x * TILE,
    y = b.y * TILE,
    w = b.w * TILE,
    h = b.h * TILE;
  const grow = b.builtTick != null && tick - b.builtTick < 22 ? (tick - b.builtTick) / 22 : 1;
  const e = grow < 1 ? 1 - Math.pow(1 - grow, 3) : 1;
  ctx.save();
  ctx.translate(x + w / 2, y + h);
  ctx.scale(1, e);
  ctx.translate(-(x + w / 2), -(y + h));
  houseFace(ctx, x, y, w, h, b, time);
  ctx.restore();

  if (b.cold || b.dark || b.cramped) {
    const g = b.cold ? '🥶' : b.dark ? '🕯️' : '😣';
    bubble(ctx, x + w - 4, y - 2, g, 12);
  }
}

/**
 * A plan is a place where something could go: a few marks on the ground and
 * the thing it would become, drawn faintly, hovering just off the grass with
 * its own soft shadow under it so it reads as an idea rather than as a thing
 * somebody has left lying there.
 */
export function drawPlan(ctx, b, time, glyphText) {
  const x = b.x * TILE,
    y = b.y * TILE,
    w = b.w * TILE,
    h = b.h * TILE;
  const bob = Math.sin(time * 0.0016) * 1.4;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = 'rgba(90,75,55,.5)';
  ctx.lineWidth = 1.4;
  rr(ctx, x + 3, y + 3, w - 6, h - 6, 6);
  ctx.stroke();
  ctx.setLineDash([]);
  // a corner peg at each end of the line, so it reads as measured out
  ctx.fillStyle = 'rgba(90,75,55,.45)';
  for (const [px, py] of [
    [x + 3, y + 3],
    [x + w - 3, y + 3],
    [x + 3, y + h - 3],
    [x + w - 3, y + h - 3],
  ]) {
    ctx.beginPath();
    ctx.arc(px, py, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = 'rgba(60,50,35,1)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2 + 11, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.42;
  glyph(ctx, glyphText, x + w / 2, y + h / 2 + bob, Math.min(24, h - 4));
  ctx.restore();
}

/** A few boards over the water on posts driven into the bed, and once it is
 *  built, a boat tied up alongside with its own reflection under it. */
export function drawLanding(ctx, b, time, tick) {
  const x = b.x * TILE,
    y = b.y * TILE,
    w = b.w * TILE,
    h = b.h * TILE;
  const deckY = y + h / 2;
  const built = b.state === 'built';
  const grow =
    built && b.builtTick != null && tick - b.builtTick < 22 ? (tick - b.builtTick) / 22 : 1;

  // the posts holding it up, and their shadows in the shallows
  ctx.fillStyle = 'rgba(40,70,90,.22)';
  for (let px = x + 8; px < x + w + 10; px += 11) {
    ctx.beginPath();
    ctx.ellipse(px + 2, deckY + 7, 3.4, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = dusk(C.woodDark, 0.15);
  for (let px = x + 8; px < x + w + 10; px += 11) {
    rr(ctx, px - 1.5, deckY + 3, 3, 5, 1);
    ctx.fill();
  }

  // the boards
  ctx.fillStyle = '#9a6f42';
  rr(ctx, x + 2, deckY - 5, w + 10, 10, 2);
  ctx.fill();
  ctx.save();
  rr(ctx, x + 2, deckY - 5, w + 10, 10, 2);
  ctx.clip();
  ctx.fillStyle = lite('#9a6f42', 0.26);
  ctx.fillRect(x + 2, deckY - 5, w + 10, 3.4);
  planks(ctx, x + 2, deckY - 5, w + 10, 10, 6, true);
  ctx.restore();
  ctx.fillStyle = '#7d5730';
  ctx.fillRect(x + 2, deckY + 3, w + 10, 2);
  // a mooring post, with a rope hitched round it
  ctx.fillStyle = C.woodDark;
  rr(ctx, x + w + 6, deckY - 12, 3.6, 12, 1.5);
  ctx.fill();
  ctx.fillStyle = lite(C.woodDark, 0.26);
  rr(ctx, x + w + 6, deckY - 12, 1.5, 12, 1);
  ctx.fill();
  ctx.strokeStyle = '#d8c39b';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(x + w + 7.8, deckY - 8.6, 2.4, 0, Math.PI * 2);
  ctx.stroke();

  if (!built) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    glyph(ctx, '⛵', x + w + 16, deckY - 6 + Math.sin(time * 0.0016) * 1.4, 20);
    ctx.restore();
    return;
  }

  // the boat itself, nudging the boards
  const bx = x + w + 17,
    by = deckY + Math.sin(time * 0.0018) * 1.6;
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(grow, grow);
  // what the boat does to the water under it, before the boat
  ctx.fillStyle = 'rgba(40,70,90,.2)';
  ctx.beginPath();
  ctx.ellipse(0, 7, 13, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(Math.sin(time * 0.0013) * 0.05);
  const hull = '#b8763f';
  ctx.fillStyle = dusk(hull, 0.24);
  ctx.beginPath();
  ctx.moveTo(-13, -3);
  ctx.lineTo(13, -3);
  ctx.quadraticCurveTo(10, 6, 0, 6);
  ctx.quadraticCurveTo(-10, 6, -13, -3);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = hull;
  ctx.fillRect(-13, -3, 26, 4.4);
  ctx.fillStyle = lite(hull, 0.3); // the strake along the waterline
  ctx.fillRect(-13, -1.2, 26, 1.2);
  ctx.restore();
  ctx.fillStyle = '#8a5c30'; // the gunwale
  rr(ctx, -13, -4.8, 26, 2.8, 1.2);
  ctx.fill();
  ctx.fillStyle = lite('#8a5c30', 0.3);
  rr(ctx, -13, -4.8, 26, 1.1, 0.8);
  ctx.fill();
  ctx.fillStyle = '#e6d3ab'; // a thwart to sit on
  rr(ctx, -6, -3, 12, 2.2, 1);
  ctx.fill();
  ctx.fillStyle = dusk('#e6d3ab', 0.24); // and an oar shipped along it
  ctx.save();
  ctx.rotate(-0.12);
  rr(ctx, -10, -2.2, 17, 1.4, 0.7);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(8, -1.5, 2.4, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // the mast, its stay, and a small sail with a seam in it
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(0, -18);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120,96,64,.6)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(0, -17.4);
  ctx.lineTo(-7, -4);
  ctx.stroke();
  ctx.fillStyle = '#fbf6ec';
  ctx.beginPath();
  ctx.moveTo(1, -17);
  ctx.quadraticCurveTo(8, -13, 9, -7);
  ctx.lineTo(1, -6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(214,200,176,.7)';
  ctx.beginPath();
  ctx.moveTo(1, -17);
  ctx.quadraticCurveTo(4.6, -12.6, 4.4, -6.4);
  ctx.lineTo(1, -6.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c94f3f'; // a pennant at the masthead
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(5.5 + Math.sin(time * 0.004) * 1.4, -17);
  ctx.lineTo(0, -15.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A swing, a slide and a sandpit — nothing that has to be there, which is
 *  exactly why it gets the bucket, the spade and the sandcastle too. */
export function drawPlayground(ctx, b, time, tick) {
  const x = b.x * TILE,
    y = b.y * TILE,
    w = b.w * TILE,
    h = b.h * TILE;
  const grow = b.builtTick != null && tick - b.builtTick < 26 ? (tick - b.builtTick) / 26 : 1;
  const e = grow < 1 ? 1 - Math.pow(1 - grow, 3) : 1;
  ctx.save();
  ctx.translate(x + w / 2, y + h);
  ctx.scale(1, e);
  ctx.translate(-(x + w / 2), -(y + h));

  // the sandpit, with a raised board edge and somebody's castle in it
  const spx = x + w - 14,
    spy = y + h - 8;
  ctx.fillStyle = dusk(C.sand, 0.2);
  ctx.beginPath();
  ctx.ellipse(spx, spy + 1, 13.4, 7.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.sand;
  ctx.beginPath();
  ctx.ellipse(spx, spy, 13, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lite(C.sand, 0.35);
  ctx.beginPath();
  ctx.ellipse(spx - 2, spy - 1.6, 9, 4.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(spx, spy, 13, 7, 0, 0, Math.PI * 2);
  ctx.stroke();
  // a sandcastle: two towers and a flag
  ctx.fillStyle = dusk(C.sand, 0.28);
  rr(ctx, spx - 5, spy - 6, 4, 6, 0.8);
  ctx.fill();
  rr(ctx, spx - 1, spy - 4.6, 3.4, 4.6, 0.8);
  ctx.fill();
  ctx.fillStyle = lite(C.sand, 0.15);
  rr(ctx, spx - 5, spy - 6, 1.6, 6, 0.8);
  ctx.fill();
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(spx - 3, spy - 6);
  ctx.lineTo(spx - 3, spy - 10);
  ctx.stroke();
  ctx.fillStyle = '#c94f3f';
  ctx.beginPath();
  ctx.moveTo(spx - 3, spy - 10);
  ctx.lineTo(spx + 1, spy - 9);
  ctx.lineTo(spx - 3, spy - 8);
  ctx.closePath();
  ctx.fill();
  // and the bucket and spade left where they were dropped
  ctx.fillStyle = '#5ba6c8';
  rr(ctx, spx + 5, spy - 3.6, 4.4, 4, 1);
  ctx.fill();
  ctx.strokeStyle = '#4a8ba8';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(spx + 7.2, spy - 3.8, 2.4, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#e0a03e';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(spx + 10, spy + 1);
  ctx.lineTo(spx + 12.4, spy - 4.4);
  ctx.stroke();

  // the slide: a ladder up the back and a chute with a lip at the bottom
  const lx = x + 12,
    lt = y + h - 22;
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(lx - 2.6, y + h - 5);
  ctx.lineTo(lx - 2.6, lt);
  ctx.moveTo(lx + 1.4, y + h - 5);
  ctx.lineTo(lx + 1.4, lt);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 1; i <= 3; i++) {
    const ry = lt + ((y + h - 5 - lt) * i) / 4;
    ctx.moveTo(lx - 2.6, ry);
    ctx.lineTo(lx + 1.4, ry);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(70,52,34,.2)'; // the chute's shadow on the grass
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(lx + 2, lt + 2);
  ctx.quadraticCurveTo(lx + 10, y + h - 10, lx + 16, y + h - 3);
  ctx.stroke();
  ctx.strokeStyle = '#7fa9c0';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(lx, lt);
  ctx.quadraticCurveTo(lx + 8, y + h - 12, lx + 14, y + h - 5);
  ctx.stroke();
  ctx.strokeStyle = '#bcdcec'; // the polished middle of it
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(lx, lt);
  ctx.quadraticCurveTo(lx + 8, y + h - 12, lx + 14, y + h - 5);
  ctx.stroke();

  // the swing, moving whenever somebody has been on it
  const sx = x + w / 2 + 4,
    top = y + h - 26;
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(sx - 11, y + h - 5);
  ctx.lineTo(sx - 5, top);
  ctx.moveTo(sx + 11, y + h - 5);
  ctx.lineTo(sx + 5, top);
  ctx.moveTo(sx - 8, top);
  ctx.lineTo(sx + 8, top);
  ctx.stroke();
  ctx.strokeStyle = lite(C.woodDark, 0.3); // a shine along the top bar
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(sx - 8, top - 0.9);
  ctx.lineTo(sx + 8, top - 0.9);
  ctx.stroke();
  const a = Math.sin(time * 0.0022) * 0.28;
  ctx.fillStyle = 'rgba(70,52,34,.16)'; // the seat's shadow, swinging with it
  ctx.beginPath();
  ctx.ellipse(sx + Math.sin(a) * 13, y + h - 4, 5, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(sx, top);
  ctx.rotate(a);
  ctx.strokeStyle = '#7a6a56';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-3, 0);
  ctx.lineTo(-3, 13);
  ctx.moveTo(3, 0);
  ctx.lineTo(3, 13);
  ctx.stroke();
  ctx.fillStyle = '#c8783c';
  rr(ctx, -5.5, 13, 11, 3, 1.2);
  ctx.fill();
  ctx.fillStyle = lite('#c8783c', 0.3);
  rr(ctx, -5.5, 13, 11, 1.2, 0.8);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

/** Clean water: a round wall of stones somebody laid by hand, a little roof
 *  over it, a windlass, and a bucket that has been up and down a lot. */
export function drawWell(ctx, b, time, tick) {
  const x = b.x * TILE + (b.w * TILE) / 2,
    y = b.y * TILE + b.h * TILE;
  const grow = b.builtTick != null && tick - b.builtTick < 22 ? (tick - b.builtTick) / 22 : 1;
  const e = grow < 1 ? 1 - Math.pow(1 - grow, 3) : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, e);
  shadow(ctx, 0, -1, 11, 4);

  // the water, a long way down, before the wall that hides most of it
  ctx.fillStyle = '#3c6d88';
  ctx.beginPath();
  ctx.ellipse(0, -13, 9, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7fb3cc';
  ctx.beginPath();
  ctx.ellipse(0.4, -13.4, 7.4, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.45)'; // one ring, going out
  ctx.lineWidth = 0.8;
  const rr2 = 1 + ((time * 0.0012) % 1) * 5.5;
  ctx.globalAlpha = 1 - ((time * 0.0012) % 1);
  ctx.beginPath();
  ctx.ellipse(0.4, -13.4, rr2, rr2 * 0.35, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // the round wall, drawn as courses of stones rather than one grey box
  ctx.fillStyle = C.stoneDark;
  rr(ctx, -10, -14, 20, 14, 4);
  ctx.fill();
  ctx.save();
  rr(ctx, -10, -14, 20, 14, 4);
  ctx.clip();
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4; i++) {
      const sw = 6.2,
        sx = -11 + i * sw + (row % 2) * 3;
      ctx.fillStyle = (i + row) % 2 ? C.stone : lite(C.stone, 0.2);
      rr(ctx, sx, -13.4 + row * 4.6, sw - 1, 3.8, 1.4);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(70,52,34,.16)'; // the curve of the wall, in shade
  rr(ctx, 4, -14, 6, 14, 3);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = lite(C.stone, 0.35); // the coping you lean your elbows on
  rr(ctx, -10.6, -15.4, 21.2, 2.6, 1.2);
  ctx.fill();

  // posts and a little roof
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-7, -14);
  ctx.lineTo(-7, -26);
  ctx.moveTo(7, -14);
  ctx.lineTo(7, -26);
  ctx.stroke();
  ctx.strokeStyle = lite(C.woodDark, 0.3);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-7.8, -14);
  ctx.lineTo(-7.8, -26);
  ctx.moveTo(6.2, -14);
  ctx.lineTo(6.2, -26);
  ctx.stroke();
  roof(ctx, 0, -34, -10, 10, -26, C.roof, 2.5);

  // the windlass: a roller, a crank, and the rope wound on it
  ctx.fillStyle = C.wood;
  rr(ctx, -7, -25.4, 14, 3.4, 1.6);
  ctx.fill();
  ctx.fillStyle = lite(C.wood, 0.3);
  rr(ctx, -7, -25.4, 14, 1.3, 0.8);
  ctx.fill();
  ctx.strokeStyle = '#d8c39b';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = -2; i <= 2; i++) {
    ctx.moveTo(i * 2.2, -25.2);
    ctx.lineTo(i * 2.2, -22.2);
  }
  ctx.stroke();
  ctx.strokeStyle = C.iron;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(7, -23.7);
  ctx.lineTo(10, -23.7);
  ctx.lineTo(10, -20.4);
  ctx.stroke();

  // the bucket, swinging a little, with a hoop round it and a drip off it
  const sway = Math.sin(time * 0.0016) * 1.4;
  ctx.strokeStyle = '#d8c39b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(sway, -19.4);
  ctx.stroke();
  ctx.strokeStyle = C.iron;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(sway, -19.4, 3.4, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = C.wood;
  ctx.beginPath();
  ctx.moveTo(sway - 3.6, -19.2);
  ctx.lineTo(sway + 3.6, -19.2);
  ctx.lineTo(sway + 2.8, -13.6);
  ctx.lineTo(sway - 2.8, -13.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = lite(C.wood, 0.28);
  ctx.beginPath();
  ctx.moveTo(sway - 3.6, -19.2);
  ctx.lineTo(sway - 1.4, -19.2);
  ctx.lineTo(sway - 1.6, -13.6);
  ctx.lineTo(sway - 2.8, -13.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.iron;
  ctx.fillRect(sway - 3.4, -17.6, 6.8, 0.9);
  ctx.fillRect(sway - 3, -15.2, 6, 0.9);
  ctx.restore();
}

/** The little house at the bottom of the garden. Everybody has one, and this
 *  one leans a bit, has a moon cut in the door and a hollyhock beside it. */
export function drawPrivy(ctx, b, time, tick) {
  const x = b.x * TILE + (b.w * TILE) / 2,
    y = b.y * TILE + b.h * TILE;
  const grow = b.builtTick != null && tick - b.builtTick < 22 ? (tick - b.builtTick) / 22 : 1;
  const e = grow < 1 ? 1 - Math.pow(1 - grow, 3) : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, e);
  shadow(ctx, 0, -1, 9, 3.5);

  ctx.fillStyle = C.woodLite;
  rr(ctx, -8, -20, 16, 20, 2);
  ctx.fill();
  ctx.save();
  rr(ctx, -8, -20, 16, 20, 2);
  ctx.clip();
  ctx.fillStyle = dusk(C.woodLite, 0.16);
  ctx.fillRect(2, -20, 6, 20);
  ctx.fillStyle = lite(C.woodLite, 0.28);
  ctx.fillRect(-8, -20, 3.4, 20);
  planks(ctx, -8, -20, 16, 20, 4, true);
  seam(ctx, -8, -20, 16, 2.6, 0.18);
  ctx.restore();

  ctx.fillStyle = C.roofDark; // a plank roof, slightly askew
  ctx.beginPath();
  ctx.moveTo(-10, -20);
  ctx.lineTo(9, -23);
  ctx.lineTo(10, -20);
  ctx.lineTo(-9, -17);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = lite(C.roofDark, 0.24);
  ctx.beginPath();
  ctx.moveTo(-10, -20);
  ctx.lineTo(9, -23);
  ctx.lineTo(9.4, -21.8);
  ctx.lineTo(-9.6, -18.8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = C.wood; // the door
  rr(ctx, -5, -16, 10, 16, 1.5);
  ctx.fill();
  ctx.save();
  rr(ctx, -5, -16, 10, 16, 1.5);
  ctx.clip();
  ctx.fillStyle = lite(C.wood, 0.2);
  ctx.fillRect(-5, -16, 3.4, 16);
  planks(ctx, -5, -16, 10, 16, 3.4, true);
  ctx.restore();
  ctx.fillStyle = '#6d543a'; // and the little moon cut in it
  ctx.beginPath();
  ctx.arc(0, -11, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.wood;
  ctx.beginPath();
  ctx.arc(1.1, -11.6, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.iron; // a latch, and a hinge
  ctx.fillRect(-5, -13.4, 3.4, 1.1);
  ctx.fillRect(-5, -4.4, 3.4, 1.1);
  ctx.beginPath();
  ctx.arc(3.4, -8, 0.8, 0, Math.PI * 2);
  ctx.fill();

  // a hollyhock growing up the sunny side, taller than the door
  ctx.strokeStyle = C.leaf;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  const lean = Math.sin(time * 0.0014) * 0.8;
  ctx.beginPath();
  ctx.moveTo(-9.4, 0);
  ctx.quadraticCurveTo(-10.4, -8, -10 + lean, -16);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? C.blossom : lite(C.blossom, 0.35);
    ctx.beginPath();
    ctx.arc(-10.2 + lean * (i / 4) + (i % 2 ? 1.4 : -1.2), -6 - i * 3.2, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = C.leaf;
  ctx.beginPath();
  ctx.ellipse(-11.6, -3.4, 2.4, 1.5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Posts and rails round the wheat, with a gap to walk through. The rails sag
 *  a little between posts, because a straight rail is a fence nobody built. */
export function drawFence(ctx, b, _time) {
  const x0 = b.x * TILE,
    y0 = b.y * TILE;
  const x1 = (b.x + b.w) * TILE,
    y1 = (b.y + b.h) * TILE;
  const gateY = y0 + (b.h * TILE) / 2; // the way in, on the near side

  ctx.save();
  ctx.lineCap = 'round';
  const rail = (ax, ay, bx, by) => {
    const sag = Math.abs(bx - ax) > Math.abs(by - ay) ? 1.1 : 0;
    for (const [up, wide, colour] of [
      [6, 2.2, '#a9743f'],
      [11, 2.2, '#a9743f'],
    ]) {
      ctx.strokeStyle = 'rgba(70,52,34,.18)';
      ctx.lineWidth = wide + 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay - up + 1);
      ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - up + sag + 1, bx, by - up + 1);
      ctx.stroke();
      ctx.strokeStyle = colour;
      ctx.lineWidth = wide;
      ctx.beginPath();
      ctx.moveTo(ax, ay - up);
      ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - up + sag, bx, by - up);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,210,.22)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(ax, ay - up - 0.7);
      ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - up + sag - 0.7, bx, by - up - 0.7);
      ctx.stroke();
    }
  };
  rail(x0, y0, x1, y0);
  rail(x0, y1, x1, y1);
  // the sides, minus the gateway
  rail(x0, y0, x0, gateY - 14);
  rail(x0, gateY + 14, x0, y1);
  rail(x1, y0, x1, y1);

  const post = (px, py) => {
    shadow(ctx, px, py + 0.5, 2.6, 1.1);
    ctx.fillStyle = C.woodDark;
    rr(ctx, px - 1.8, py - 15, 3.6, 16, 1.2);
    ctx.fill();
    ctx.fillStyle = lite(C.woodDark, 0.26);
    rr(ctx, px - 1.8, py - 15, 1.5, 16, 0.9);
    ctx.fill();
    ctx.fillStyle = dusk(C.woodDark, 0.2); // a sawn top, weathering
    ctx.beginPath();
    ctx.ellipse(px - 0.1, py - 15, 1.8, 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let px = x0; px <= x1; px += TILE * 2) {
    post(px, y0);
    post(px, y1);
  }
  for (let py = y0; py <= y1; py += TILE * 2) {
    post(x0, py);
    post(x1, py);
  }
  post(x0, gateY - 14);
  post(x0, gateY + 14);
  ctx.restore();
}

/** Small, but it knows what it is doing. A whip of a stem, three real leaves
 *  with a vein down each, and the ring of turned earth somebody planted it in. */
export function drawSapling(ctx, t, time) {
  const x = t.x * TILE + TILE / 2,
    y = t.y * TILE + TILE / 2;
  const sway = Math.sin(time * 0.0016 + (t.sway || 0)) * 1.1;
  shadow(ctx, x, y + 4, 5.5, 2.2);

  // the little circle of soil it was put in
  ctx.fillStyle = 'rgba(146,110,68,.5)';
  ctx.beginPath();
  ctx.ellipse(x, y + 3.4, 6, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + 3);
  ctx.quadraticCurveTo(x + sway * 0.2, y - 1, x + sway * 0.4, y - 5);
  ctx.stroke();
  ctx.strokeStyle = lite(C.woodDark, 0.3);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(x - 0.5, y + 2.5);
  ctx.quadraticCurveTo(x + sway * 0.2 - 0.5, y - 1, x + sway * 0.4 - 0.4, y - 5);
  ctx.stroke();

  // three leaves, each with a vein, each lit on the side the sun is on
  const leaf = (lx, ly, rx, ry, rot, shade) => {
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(lx, ly, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.34)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(lx - Math.cos(rot) * rx * 0.8, ly - Math.sin(rot) * rx * 0.8);
    ctx.lineTo(lx + Math.cos(rot) * rx * 0.8, ly + Math.sin(rot) * rx * 0.8);
    ctx.stroke();
  };
  leaf(x - 3.2 + sway, y - 7, 4, 2.5, -0.5, C.leaf);
  leaf(x + 3.2 + sway, y - 8.5, 4, 2.5, 0.5, C.sprout);
  leaf(x + sway, y - 11.4, 3.4, 3, 0, lite(C.sprout, 0.15));
  // the bud at the very top, which is the whole promise of the thing
  ctx.fillStyle = lite(C.sprout, 0.4);
  ctx.beginPath();
  ctx.arc(x + sway, y - 12.6, 1.2, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * What the villagers have hauled in, standing by the door where anybody can
 * see it and either of you can pick it up. It grows with the pile and stops
 * growing well before the cap does — four logs and a full sack says "there is
 * something here", and a wall of timber would say nothing more.
 */
function drawPile(ctx, x, y, pile) {
  const wood = Math.min(4, Math.ceil((pile.wood || 0) / 5));
  const wheat = pile.wheat || 0;
  if (wood > 0) {
    shadow(ctx, x + 3, y + 2, 12, 3.6);
    for (let i = 0; i < wood; i++) {
      const row = i < 2 ? 0 : 1;
      const at = i < 2 ? i : i - 2;
      const lx = x - 5 + at * 10 + row * 5,
        ly = y - row * 6;
      ctx.fillStyle = dusk(C.wood, 0.2);
      rr(ctx, lx - 5, ly - 3.6, 10, 7.2, 3.2);
      ctx.fill();
      ctx.fillStyle = C.wood;
      rr(ctx, lx - 5, ly - 3.6, 10, 4.8, 2.4);
      ctx.fill();
      ctx.fillStyle = lite(C.wood, 0.25);
      rr(ctx, lx - 4.2, ly - 3.2, 8, 1.8, 0.9);
      ctx.fill();
      ctx.fillStyle = lite(C.wood, 0.46); // the sawn end, with a ring in it
      ctx.beginPath();
      ctx.ellipse(lx + 4.4, ly, 1.7, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(138,92,48,.5)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.ellipse(lx + 4.3, ly, 0.8, 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (wheat > 0) {
    const sx = x + 18;
    shadow(ctx, sx, y + 2, 7.5, 2.8);
    // darker than the wall behind it, or it is not a sack, it is plaster
    const h = 8 + Math.min(6, wheat);
    const cloth = '#c3a878';
    ctx.fillStyle = cloth;
    rr(ctx, sx - 6, y - h, 12, h + 1, 4);
    ctx.fill();
    ctx.save();
    rr(ctx, sx - 6, y - h, 12, h + 1, 4);
    ctx.clip();
    ctx.fillStyle = lite(cloth, 0.3);
    rr(ctx, sx - 6, y - h, 4.5, h + 1, 4);
    ctx.fill();
    ctx.fillStyle = dusk(cloth, 0.14);
    rr(ctx, sx + 2.4, y - h, 3.6, h + 1, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(70,52,34,.12)'; // where the sack creases as it sags
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.ellipse(sx - 3 + i * 5, y - h * 0.4, 1.4, h * 0.3, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(67,55,42,.3)';
    ctx.lineWidth = 1;
    rr(ctx, sx - 6, y - h, 12, h + 1, 4);
    ctx.stroke();
    ctx.strokeStyle = '#a2895f'; // the string tying the neck of it
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sx - 5, y - h + 1.6);
    ctx.lineTo(sx + 5, y - h + 1.6);
    ctx.stroke();
    ctx.strokeStyle = C.wheatDry; // and a few stalks over the top of it
    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      ctx.moveTo(sx + i * 1.6, y - h + 1);
      ctx.lineTo(sx + i * 3.2, y - h - 4.5);
    }
    ctx.stroke();
    ctx.fillStyle = C.wheat;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.ellipse(sx + i * 3.2, y - h - 5, 1, 1.9, i * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = lite(C.wheat, 0.3);
      ctx.beginPath();
      ctx.ellipse(sx + i * 3.2 - 0.4, y - h - 5.6, 0.5, 1, i * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.wheat;
    }
  }
}

export function drawWorkshop(ctx, b, time, tick, pile) {
  const x = b.x * TILE,
    y = b.y * TILE,
    w = b.w * TILE,
    h = b.h * TILE;
  const cx = x + w / 2,
    foot = y + h;
  const wallTop = y + h - 32;
  const board = '#e7d6b6',
    shingle = '#8a6f4a';
  shadow(ctx, cx, foot - 2, w * 0.44, 6);

  // a stone footing, because a workshop floor gets wet
  ctx.fillStyle = C.stone;
  rr(ctx, x + 3, foot - 7, w - 6, 7, 2);
  ctx.fill();
  ctx.fillStyle = dusk(C.stone, 0.2);
  for (let i = 0; i < 6; i++) {
    const sw = (w - 10) / 6;
    rr(ctx, x + 5 + i * sw + (i % 2), foot - 6 + (i % 2) * 2.6, sw - 2, 2.4, 0.8);
    ctx.fill();
  }

  // the wall: horizontal boarding, lit on the left
  ctx.fillStyle = board;
  rr(ctx, x + 4, wallTop, w - 8, 32, 3);
  ctx.fill();
  ctx.save();
  rr(ctx, x + 4, wallTop, w - 8, 32, 3);
  ctx.clip();
  ctx.fillStyle = C.wallShade;
  rr(ctx, x + w - 15, wallTop, 11, 32, 3);
  ctx.fill();
  ctx.fillStyle = lite(board, 0.4);
  rr(ctx, x + 4, wallTop, 8, 32, 3);
  ctx.fill();
  planks(ctx, x + 4, wallTop, w - 8, 32, 5, false);
  seam(ctx, x + 4, wallTop, w - 8, 3.6, 0.18); // under the eaves
  ctx.restore();

  roof(ctx, cx, wallTop - 19, x + 2, x + w - 2, wallTop + 3, shingle, 5);

  // the big open doorway: dark inside, with the frame standing proud of it
  ctx.fillStyle = C.woodDark;
  rr(ctx, cx - 11, foot - 22, 22, 22, 3);
  ctx.fill();
  ctx.fillStyle = '#4a3627';
  rr(ctx, cx - 9, foot - 20, 18, 20, 2);
  ctx.fill();
  // the two doors, folded back against the frame
  ctx.fillStyle = dusk(C.woodDark, 0.1);
  rr(ctx, cx - 11, foot - 22, 4, 22, 1.6);
  ctx.fill();
  rr(ctx, cx + 7, foot - 22, 4, 22, 1.6);
  ctx.fill();
  ctx.fillStyle = C.iron; // a hinge strap on each
  ctx.fillRect(cx - 11, foot - 18, 4, 1.4);
  ctx.fillRect(cx + 7, foot - 18, 4, 1.4);
  ctx.fillRect(cx - 11, foot - 6, 4, 1.4);
  ctx.fillRect(cx + 7, foot - 6, 4, 1.4);
  // and, in the dark of the doorway, a bench with something half-made on it
  ctx.fillStyle = 'rgba(190,150,100,.5)';
  rr(ctx, cx - 7, foot - 9, 13, 2.2, 0.8);
  ctx.fill();
  rr(ctx, cx - 6, foot - 7, 1.6, 6, 0.6);
  ctx.fill();
  rr(ctx, cx + 3.4, foot - 7, 1.6, 6, 0.6);
  ctx.fill();

  // the saw wheel — it spins when somebody is working, and throws sawdust
  const spinning = b.spin != null && tick - b.spin < 26;
  const ang = spinning ? time * 0.02 : time * 0.0012;
  const whx = x + 13,
    why = wallTop + 16;
  ctx.fillStyle = 'rgba(70,52,34,.2)'; // the wheel sits against the boards
  ctx.beginPath();
  ctx.arc(whx + 1, why + 1, 8.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(whx, why);
  ctx.rotate(ang);
  ctx.strokeStyle = spinning ? lite(C.wood, 0.5) : C.wood;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(0, 0, 7.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const a = i * 1.047;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * 7.6, Math.sin(a) * 7.6);
    ctx.stroke();
    // paddles, so it is a water wheel and not a cartwheel nailed to a wall
    ctx.fillStyle = dusk(C.wood, 0.2);
    ctx.save();
    ctx.rotate(a);
    ctx.fillRect(6.2, -1.6, 2.6, 3.2);
    ctx.restore();
  }
  ctx.fillStyle = C.iron;
  ctx.beginPath();
  ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (spinning) {
    for (let i = 0; i < 4; i++) {
      const q = (time * 0.004 + i * 0.25) % 1;
      ctx.fillStyle = 'rgba(232,206,158,' + 0.6 * (1 - q) + ')';
      ctx.beginPath();
      ctx.arc(whx - 4 - q * 10, why + 6 - q * 6, 1.4 * (1 - q) + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // a saw and a plank leaning by the door, put down and not put away
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + w - 11, foot - 1);
  ctx.lineTo(x + w - 15, foot - 17);
  ctx.stroke();
  ctx.fillStyle = lite(C.wood, 0.35);
  ctx.save();
  ctx.translate(x + w - 8, foot - 9);
  ctx.rotate(0.22);
  rr(ctx, -2.2, -9, 4.4, 18, 1.2);
  ctx.fill();
  ctx.restore();

  // a little shop sign on a bracket, with a saw painted on it rather than a
  // word — the name is written under the building in whatever language is
  // being played, and a picture says the same thing to somebody still learning
  // to read it
  const sgx = cx + 17,
    sgy = wallTop + 9;
  ctx.strokeStyle = C.iron;
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sgx - 7, sgy - 2);
  ctx.lineTo(sgx + 3, sgy - 2);
  ctx.moveTo(sgx - 6.4, sgy - 1.6);
  ctx.lineTo(sgx - 6.4, sgy + 1);
  ctx.moveTo(sgx + 2.4, sgy - 1.6);
  ctx.lineTo(sgx + 2.4, sgy + 1);
  ctx.stroke();
  ctx.fillStyle = lite(C.wood, 0.28);
  rr(ctx, sgx - 8, sgy + 1, 12, 8, 1.6);
  ctx.fill();
  ctx.fillStyle = dusk(C.wood, 0.08);
  rr(ctx, sgx - 8, sgy + 6.6, 12, 2.4, 1.2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(67,55,42,.72)'; // the saw: a blade and its teeth
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sgx - 5.6, sgy + 3.2);
  ctx.lineTo(sgx + 1.4, sgy + 3.2);
  ctx.stroke();
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    ctx.moveTo(sgx - 5.2 + i * 1.5, sgy + 3.4);
    ctx.lineTo(sgx - 4.5 + i * 1.5, sgy + 4.6);
  }
  ctx.stroke();

  ctx.fillStyle = 'rgba(67,55,42,.72)';
  ctx.font = '700 8px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tr('art.workshop'), cx, foot + 6);

  // whatever the villagers have brought in, standing on the ground at the
  // left-hand end of the wall — clear of the doorway and of the name
  if (pile) drawPile(ctx, x + 6, foot - 1, pile);
}

/** The larder: a slatted crate with a lid, standing where both of you pass it,
 *  with whatever is in it showing over the top. */
export function drawLarder(ctx, l, _time) {
  const x = l.x * TILE,
    y = l.y * TILE;
  const crate = '#c9974f';
  shadow(ctx, x, y + 5, 12.5, 4.2);

  const total = FOODS.reduce((sum, f) => sum + (l[f.key] || 0), 0);
  // what is in it, behind the front of the crate so it sits *inside*
  const n = Math.min(4, total);
  for (let i = 0; i < n; i++) {
    const bx = x - 6 + i * 4.4;
    ctx.fillStyle = '#c98b4c';
    ctx.beginPath();
    ctx.ellipse(bx, y - 7.6, 3.3, 2.6, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e2b268';
    ctx.beginPath();
    ctx.ellipse(bx - 0.3, y - 8, 2.5, 1.9, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,100,54,.5)'; // the slash across the top of a loaf
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(bx - 1.4, y - 8.6);
    ctx.lineTo(bx + 1.2, y - 9);
    ctx.stroke();
  }

  ctx.fillStyle = dusk(crate, 0.2);
  rr(ctx, x - 11.5, y - 6.5, 23, 13, 2.4);
  ctx.fill();
  ctx.fillStyle = crate;
  rr(ctx, x - 11, y - 6, 22, 12, 2);
  ctx.fill();
  ctx.save();
  rr(ctx, x - 11, y - 6, 22, 12, 2);
  ctx.clip();
  ctx.fillStyle = lite(crate, 0.24);
  ctx.fillRect(x - 11, y - 6, 22, 3.4);
  ctx.fillStyle = dusk(crate, 0.14);
  ctx.fillRect(x + 5, y - 6, 6, 12);
  planks(ctx, x - 11, y - 6, 22, 12, 4, true);
  ctx.restore();
  ctx.fillStyle = dusk(crate, 0.26); // the battens across the slats
  ctx.fillRect(x - 11, y - 3.4, 22, 1.6);
  ctx.fillRect(x - 11, y + 3, 22, 1.6);
  ctx.fillStyle = lite(crate, 0.3); // and the rim you lift it by
  rr(ctx, x - 12, y - 7.6, 24, 2.6, 1.2);
  ctx.fill();

  ctx.fillStyle = C.ink;
  ctx.font = '700 9px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🍞🐟 ' + total, x, y + 13);
  if (total === 0) bubble(ctx, x + 13, y - 8, '❔', 11);
}

/** What the river has left on the bank: rounded stones, each one lit on top
 *  and sitting in its own little dent of wet sand. */
export function drawStoneBank(ctx, s) {
  const x = s.x * TILE + TILE / 2,
    y = s.y * TILE + TILE / 2;
  shadow(ctx, x, y + 3, 9, 3);
  const n = Math.min(6, s.count);
  for (let i = 0; i < n; i++) {
    const a = i * 1.9;
    const sx = x + Math.cos(a) * 6.5,
      sy = y + Math.sin(a) * 4;
    ctx.fillStyle = 'rgba(70,60,45,.18)'; // the dent it is sitting in
    ctx.beginPath();
    ctx.ellipse(sx + 0.8, sy + 1.6, 4.4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    const base = i % 2 ? C.stone : C.stoneDark;
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 4.3, 3.3, a, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lite(base, 0.3);
    ctx.beginPath();
    ctx.ellipse(sx - 0.9, sy - 0.9, 3, 2.1, a, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.4)'; // the shine off a wet stone
    ctx.beginPath();
    ctx.ellipse(sx - 1.4, sy - 1.4, 1.3, 0.8, a - 0.4, 0, Math.PI * 2);
    ctx.fill();
    if (i % 3 === 0) {
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; // a seam of quartz through one
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(sx - 2.4, sy + 0.8);
      ctx.lineTo(sx + 2, sy - 0.6);
      ctx.stroke();
    }
  }
  if (n === 0) {
    ctx.fillStyle = 'rgba(67,55,42,.35)';
    ctx.font = '9px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('…', x, y);
  }
}

/* ------------------------------------------------------------------ */
/* the field                                                          */
/* ------------------------------------------------------------------ */

export function drawPlot(ctx, p, time) {
  const x = p.x * TILE,
    y = p.y * TILE,
    s = TILE * 2;
  const wet = p.water > 15;
  const soil = wet ? '#94714a' : C.soil;
  // the soil, and the earth thrown up along the near edge of it
  ctx.fillStyle = dusk(soil, 0.2);
  rr(ctx, x + 2, y + 2, s - 4, s - 4, 6);
  ctx.fill();
  ctx.fillStyle = soil;
  rr(ctx, x + 2, y + 2, s - 4, s - 6, 6);
  ctx.fill();
  ctx.save();
  rr(ctx, x + 2, y + 2, s - 4, s - 4, 6);
  ctx.clip();
  ctx.fillStyle = lite(soil, 0.16);
  rr(ctx, x + 2, y + 2, s - 4, 5, 4);
  ctx.fill();
  // furrows: a dark trough with a lit ridge along the top of each
  for (let i = 1; i < 4; i++) {
    const fy = y + i * (s / 4);
    ctx.fillStyle = 'rgba(70,52,34,.16)';
    ctx.fillRect(x + 4, fy - 1.4, s - 8, 2.4);
    ctx.fillStyle = 'rgba(255,240,210,.14)';
    ctx.fillRect(x + 4, fy + 1, s - 8, 1.2);
  }
  // clods, so the ground has a grain to it
  ctx.fillStyle = 'rgba(70,52,34,.12)';
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.ellipse(
      x + 5 + wob(p.x + i) * (s - 10),
      y + 5 + wob(p.y + i * 3) * (s - 10),
      1.7,
      1.1,
      wob(i) * 3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  if (wet) {
    ctx.fillStyle = 'rgba(70,110,140,.16)'; // where the water is still standing
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(
        x + 8 + wob(p.x + i * 7) * (s - 16),
        y + 8 + wob(p.y + i * 5) * (s - 16),
        3.6,
        1.8,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  ctx.restore();
  if (p.state === 'empty') return;

  const g = p.state === 'ripe' ? 1 : p.growth / 100;
  const dry = p.water <= 8 && p.state === 'growing';
  const sway = Math.sin(time * 0.002) * (0.6 + g);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const sx = x + 8 + c * 11,
        sy = y + s - 6 - r * 11;
      const hgt = 4 + g * 13;
      const stalk = dry ? C.wheatDry : g > 0.85 ? C.wheat : C.sprout;
      const bend = sway * (dry ? 2.4 : 1);
      // three stalks to a clump, the outer two paler and a touch shorter, so
      // a field reads as a crowd of plants rather than a row of strokes
      for (const [off, h2, tone] of [
        [-1.8, 0.82, dusk(stalk, 0.14)],
        [1.8, 0.88, dusk(stalk, 0.07)],
        [0, 1, stalk],
      ]) {
        ctx.strokeStyle = tone;
        ctx.lineWidth = off ? 1.2 : 1.7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx + off, sy);
        ctx.quadraticCurveTo(
          sx + off + bend * 0.5,
          sy - hgt * h2 * 0.6,
          sx + off + bend,
          sy - hgt * h2,
        );
        ctx.stroke();
        if (g > 0.85) {
          // an ear: a fat grain head with its awns going up out of it
          ctx.fillStyle = off ? dusk(C.wheat, 0.1) : C.wheat;
          ctx.beginPath();
          ctx.ellipse(sx + off + bend, sy - hgt * h2 - 1.5, 1.7, 3, bend * 0.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = lite(C.wheat, 0.35);
          ctx.beginPath();
          ctx.ellipse(sx + off + bend - 0.6, sy - hgt * h2 - 2.4, 0.7, 1.4, bend * 0.1, 0, 7);
          ctx.fill();
          if (!off) {
            ctx.strokeStyle = 'rgba(224,185,80,.7)';
            ctx.lineWidth = 0.55;
            ctx.beginPath();
            for (let a = -1; a <= 1; a++) {
              ctx.moveTo(sx + bend + a * 0.8, sy - hgt - 3.6);
              ctx.lineTo(sx + bend + a * 2.4, sy - hgt - 7);
            }
            ctx.stroke();
          }
        } else if (g > 0.25 && !off) {
          // a young blade or two off the side of the stem
          ctx.strokeStyle = tone;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx, sy - hgt * 0.45);
          ctx.quadraticCurveTo(sx - 2.6, sy - hgt * 0.62, sx - 3.4, sy - hgt * 0.4);
          ctx.moveTo(sx, sy - hgt * 0.6);
          ctx.quadraticCurveTo(sx + 2.6, sy - hgt * 0.78, sx + 3.4, sy - hgt * 0.56);
          ctx.stroke();
        }
      }
    }
  }
  if (p.state === 'ripe') bubble(ctx, x + s - 6, y + 2, '🌾', 12);
  else if (dry) bubble(ctx, x + s - 6, y + 2, '💧', 12);
}

/* ------------------------------------------------------------------ */
/* the bridge                                                         */
/* ------------------------------------------------------------------ */

export function drawBridge(ctx, br, _time) {
  if (!br.built) return;
  const s = br.site;
  const x0 = s.x0 * TILE,
    x1 = (s.x1 + 1) * TILE;
  const y0 = s.row * TILE,
    y1 = (s.row + s.rows) * TILE;
  const deck = '#9a6f42';

  // what the bridge does to the water under it
  ctx.fillStyle = 'rgba(30,60,80,.2)';
  ctx.fillRect(x0 - 4, y1 - 2, x1 - x0 + 8, 6);

  ctx.fillStyle = deck;
  ctx.fillRect(x0 - 6, y0 + 2, x1 - x0 + 12, y1 - y0 - 4);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 - 6, y0 + 2, x1 - x0 + 12, y1 - y0 - 4);
  ctx.clip();
  ctx.fillStyle = lite(deck, 0.26); // the crown of the deck, catching the light
  ctx.fillRect(x0 - 6, y0 + 3, x1 - x0 + 12, (y1 - y0) * 0.58);
  planks(ctx, x0 - 6, y0 + 2, x1 - x0 + 12, y1 - y0 - 4, 6, true);
  ctx.fillStyle = 'rgba(214,180,128,.2)'; // worn pale where everyone walks
  ctx.fillRect(x0 - 6, (y0 + y1) / 2 - 4, x1 - x0 + 12, 8);
  ctx.restore();
  ctx.fillStyle = '#7d5730';
  ctx.fillRect(x0 - 6, y0 + 1, x1 - x0 + 12, 3);
  ctx.fillRect(x0 - 6, y1 - 4, x1 - x0 + 12, 3);

  // rails, one along each side, on posts with a little cap on each
  ctx.strokeStyle = '#7d5730';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0 - 6, y0 - 1);
  ctx.lineTo(x1 + 6, y0 - 1);
  ctx.moveTo(x0 - 6, y1 + 1);
  ctx.lineTo(x1 + 6, y1 + 1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,240,210,.2)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x0 - 6, y0 - 1.9);
  ctx.lineTo(x1 + 6, y0 - 1.9);
  ctx.moveTo(x0 - 6, y1 + 0.1);
  ctx.lineTo(x1 + 6, y1 + 0.1);
  ctx.stroke();
  for (let px = x0 - 4; px < x1 + 6; px += 14) {
    ctx.fillStyle = '#7d5730';
    rr(ctx, px, y0 - 5.4, 2.6, 6.4, 0.9);
    ctx.fill();
    rr(ctx, px, y1 - 1, 2.6, 6.4, 0.9);
    ctx.fill();
    ctx.fillStyle = lite('#7d5730', 0.26);
    ctx.fillRect(px, y0 - 5.4, 1.1, 6.4);
    ctx.fillRect(px, y1 - 1, 1.1, 6.4);
  }

  if (br.damaged) {
    const mx = (x0 + x1) / 2;
    ctx.fillStyle = C.waterDeep;
    ctx.fillRect(mx - 7, y0 + 2, 14, y1 - y0 - 4);
    ctx.fillStyle = 'rgba(255,255,255,.22)'; // water showing through the gap
    ctx.fillRect(mx - 7, y0 + 4, 14, 2);
    ctx.fillStyle = dusk(deck, 0.24); // splintered ends either side of it
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(mx - 7, y0 + 4 + i * 6);
      ctx.lineTo(mx - 10 - i, y0 + 6 + i * 6);
      ctx.lineTo(mx - 7, y0 + 8 + i * 6);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(mx + 7, y0 + 5 + i * 6);
      ctx.lineTo(mx + 10 + i, y0 + 7 + i * 6);
      ctx.lineTo(mx + 7, y0 + 9 + i * 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.save(); // and a board floating off downstream
    ctx.translate(mx + 12, y1 - 6);
    ctx.rotate(0.5);
    ctx.fillStyle = deck;
    rr(ctx, -10, -2, 20, 4, 2);
    ctx.fill();
    ctx.fillStyle = lite(deck, 0.24);
    rr(ctx, -10, -2, 20, 1.6, 0.8);
    ctx.fill();
    ctx.restore();
    bubble(ctx, mx, y0 - 6, '⚠️', 13);
  }
}

/**
 * Whoever the guide is talking about, drawn big enough to recognise in a card.
 * The world drawings are all anchored at their feet, so this just moves the
 * origin and scales — no second set of pictures to keep in step.
 */
export function drawPortrait(ctx, kind, o, cx, cy, scale, time, tick) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  const at = { x: 0, y: 0, facing: 1, moving: -999, hearts: -999 };
  if (kind === 'sheep') {
    drawSheep(ctx, Object.assign({}, o, at), time, tick, true);
  } else {
    // a portrait is a face on a job card, not a scene — a dance or a chat
    // needs a partner or a lean that only makes sense out in the world
    drawVillager(
      ctx,
      Object.assign({}, o, at, { said: null, carrying: null, act: null }),
      time,
      tick,
    );
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* transient effects                                                  */
/* ------------------------------------------------------------------ */

export function drawFx(ctx, f, age) {
  const p = age / 26;
  const x = f.x * TILE,
    y = f.y * TILE;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - p * p);
  switch (f.kind) {
    case 'float':
      ctx.font = '700 13px -apple-system, system-ui, "Apple Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,253,248,.9)';
      ctx.strokeText(f.text, x, y - p * 22);
      ctx.fillStyle = f.colour || C.ink;
      ctx.fillText(f.text, x, y - p * 22);
      break;
    case 'thump':
      ctx.strokeStyle = 'rgba(120,95,60,.7)';
      ctx.lineWidth = 2.5 * (1 - p);
      ctx.beginPath();
      ctx.ellipse(x, y, 8 + p * 34, 4 + p * 16, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'sparkle':
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + p * 2;
        ctx.fillStyle = '#ffd76a';
        ctx.beginPath();
        ctx.arc(
          x + Math.cos(a) * (8 + p * 26),
          y + Math.sin(a) * (5 + p * 16) - p * 10,
          2.2 * (1 - p),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      break;
    case 'hearts':
      ctx.font = '13px "Apple Color Emoji", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💚', x, y - p * 20);
      break;
    case 'splash':
      ctx.strokeStyle = 'rgba(110,180,215,.85)';
      ctx.lineWidth = 2 * (1 - p);
      ctx.beginPath();
      ctx.ellipse(x, y, 4 + p * 20, 2 + p * 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'crack':
      ctx.font = '18px "Apple Color Emoji", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💥', x, y - p * 10);
      break;
    default:
      break;
  }
  ctx.restore();
}
