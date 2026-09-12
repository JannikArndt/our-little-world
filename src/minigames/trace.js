// Making a thing by tracing it.
//
// Buying furniture with one tap is free, and free is the wrong price: putting
// something in a room ought to cost a bit of effort, and at five the effort
// worth spending is learning to write. So a lamp is made by tracing the word
// LAMP, or by tracing the shape of one — whichever the player is in the mood
// for, switched with one button and remembered.
//
// The matching is deliberately kind. Every unfinished stroke is offered every
// point the finger passes, so strokes can be drawn in any order and from
// either end is the one thing it does not forgive. Lifting a finger keeps
// what has been done. Nothing is ever wrong, nothing is scored, and nothing
// says try again — a letter simply goes green when it has been written.

import { LETTERS } from '../core/letters.js';
import { rr, glyph } from '../render/art.js';

const STEP = 0.075; // how far apart the checkpoints along a stroke sit
const REACH = 0.115; // how near the finger has to come to one, as a fraction of the letter box
const INK = '#5d9150';

/* ------------------------------------------------------------------ */
/* the shapes, for anybody who would rather draw than write           */
/* ------------------------------------------------------------------ */

/**
 * One picture per thing, in the same 0..1 box the letters use. Simple on
 * purpose: a small hand has to be able to follow it, so these are the lines
 * somebody would draw if you asked them to draw a bed, not a good drawing of
 * a bed. Adding a thing to HOUSE_STUFF means adding a row here too.
 */
export const SHAPES = {
  bed: [
    [0.06, 0.34, 0.06, 0.78, 0.94, 0.78, 0.94, 0.46, 0.34, 0.46, 0.34, 0.34, 0.06, 0.34],
    [0.1, 0.78, 0.1, 0.92],
    [0.9, 0.78, 0.9, 0.92],
  ],
  window: [
    [0.16, 0.12, 0.84, 0.12, 0.84, 0.88, 0.16, 0.88, 0.16, 0.12],
    [0.5, 0.12, 0.5, 0.88],
    [0.16, 0.5, 0.84, 0.5],
  ],
  lamp: [
    [0.38, 0.34, 0.38, 0.9, 0.62, 0.9, 0.62, 0.34, 0.38, 0.34],
    [0.5, 0.34, 0.38, 0.2, 0.5, 0.05, 0.62, 0.2, 0.5, 0.34],
  ],
  shelf: [
    [0.08, 0.6, 0.92, 0.6],
    [0.24, 0.6, 0.28, 0.4, 0.44, 0.3, 0.62, 0.34, 0.7, 0.48, 0.68, 0.6],
  ],
  stove: [
    [
      0.5, 0.06, 0.28, 0.34, 0.22, 0.6, 0.34, 0.84, 0.5, 0.94, 0.7, 0.86, 0.8, 0.62, 0.7, 0.34, 0.5,
      0.06,
    ],
    [0.5, 0.46, 0.4, 0.66, 0.46, 0.84, 0.58, 0.78, 0.58, 0.6, 0.5, 0.46],
  ],
  table: [
    [0.06, 0.44, 0.94, 0.44],
    [0.2, 0.44, 0.24, 0.9],
    [0.8, 0.44, 0.76, 0.9],
    [0.34, 0.28, 0.5, 0.22, 0.66, 0.28, 0.62, 0.4, 0.38, 0.4, 0.34, 0.28],
  ],
  chair: [
    [0.3, 0.12, 0.3, 0.56, 0.72, 0.56],
    [0.3, 0.56, 0.26, 0.92],
    [0.72, 0.56, 0.74, 0.92],
  ],
  blanket: [
    [0.1, 0.3, 0.9, 0.3, 0.9, 0.76, 0.1, 0.76, 0.1, 0.3],
    [0.1, 0.53, 0.3, 0.45, 0.5, 0.6, 0.7, 0.45, 0.9, 0.53],
  ],
  flowers: [
    [0.5, 0.5, 0.5, 0.94],
    [0.5, 0.5, 0.3, 0.62],
    [
      0.28, 0.3, 0.34, 0.5, 0.5, 0.56, 0.66, 0.5, 0.72, 0.3, 0.58, 0.42, 0.5, 0.2, 0.42, 0.42, 0.28,
      0.3,
    ],
  ],
};

/* ------------------------------------------------------------------ */
/* laying strokes out on the glass                                    */
/* ------------------------------------------------------------------ */

/** Chop a polyline into evenly spaced checkpoints, in box coordinates. */
function checkpoints(flat) {
  const pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i], y: flat[i + 1] });
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = out[out.length - 1],
      b = pts[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(d / STEP));
    for (let k = 1; k <= n; k++)
      out.push({ x: a.x + (b.x - a.x) * (k / n), y: a.y + (b.y - a.y) * (k / n) });
  }
  return out;
}

/** Put a set of 0..1 strokes into a box on the canvas. */
function place(strokes, x, y, w, h) {
  return strokes.map(flat => ({
    pts: checkpoints(flat).map(p => ({ x: x + p.x * w, y: y + p.y * h })),
    at: 0,
  }));
}

/**
 * A word, laid out across a box — every letter the same width, so the spacing
 * is even and a child can see how many there are before starting.
 */
export function wordStrokes(word, x, y, w, h) {
  const letters = String(word)
    .toUpperCase()
    .split('')
    .filter(c => LETTERS[c]);
  if (!letters.length) return [];
  const gap = 0.16; // of a letter's width
  const cell = w / (letters.length + (letters.length - 1) * gap);
  const out = [];
  for (let i = 0; i < letters.length; i++) {
    const lx = x + i * cell * (1 + gap);
    for (const s of place(LETTERS[letters[i]], lx, y, cell, h)) {
      s.group = i;
      out.push(s);
    }
  }
  return out;
}

/** A picture, in the middle of a box. */
export function shapeStrokes(kind, x, y, w, h) {
  const s = SHAPES[kind];
  if (!s) return [];
  const side = Math.min(w, h);
  return place(s, x + (w - side) / 2, y + (h - side) / 2, side, side);
}

/* ------------------------------------------------------------------ */
/* following a finger                                                 */
/* ------------------------------------------------------------------ */

/**
 * Watches a finger and marks checkpoints off as it passes them.
 *
 * `reach` is measured off the size of the box a stroke was laid into, so the
 * same forgiveness applies whether a word is three letters or nine.
 */
export function tracer(strokes, span) {
  const reach = Math.max(14, span * REACH);
  let drawing = false;
  let trail = [];

  function offer(p) {
    for (const s of strokes) {
      if (s.at >= s.pts.length) continue;
      // look a little way ahead too, so a fast finger does not leave a gap
      for (let k = s.at; k < Math.min(s.pts.length, s.at + 3); k++) {
        const q = s.pts[k];
        if (Math.hypot(p.x - q.x, p.y - q.y) <= reach) {
          s.at = k + 1;
          break;
        }
      }
    }
  }

  return {
    strokes: strokes,
    down(p) {
      drawing = true;
      trail = [p];
      offer(p);
    },
    move(p) {
      if (!drawing) return;
      // fill in between: a finger moves further between two frames than the
      // checkpoints are apart, and skipping one should not stall a letter
      const last = trail[trail.length - 1];
      if (last) {
        const n = Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / (reach * 0.6));
        for (let i = 1; i < n; i++)
          offer({ x: last.x + (p.x - last.x) * (i / n), y: last.y + (p.y - last.y) * (i / n) });
      }
      trail.push(p);
      if (trail.length > 90) trail.shift();
      offer(p);
    },
    up() {
      drawing = false;
      trail = [];
    },
    /** How far along, 0 to 1 — for anything that wants to show progress. */
    howFar() {
      let did = 0,
        all = 0;
      for (const s of strokes) {
        did += Math.min(s.at, s.pts.length);
        all += s.pts.length;
      }
      return all ? did / all : 1;
    },
    done() {
      return strokes.every(s => s.at >= s.pts.length);
    },
    draw(ctx, t) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const s of strokes) {
        // what is still to do: a dotted line, the way a tracing book prints it
        ctx.strokeStyle = 'rgba(67,55,42,.26)';
        ctx.lineWidth = 7;
        ctx.setLineDash([2, 9]);
        ctx.beginPath();
        for (let i = 0; i < s.pts.length; i++) {
          const p = s.pts[i];
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // and what has been done, in the Keeper's green, going on as you go
        if (s.at > 0) {
          ctx.strokeStyle = INK;
          ctx.lineWidth = 8;
          ctx.beginPath();
          for (let i = 0; i < Math.min(s.at, s.pts.length); i++) {
            const p = s.pts[i];
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
        }

        // where to put the finger next, breathing gently so it is findable
        if (s.at > 0 && s.at < s.pts.length) {
          const p = s.pts[s.at];
          ctx.fillStyle = 'rgba(242,193,78,' + (0.55 + 0.3 * Math.sin(t * 0.007)) + ')';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
          ctx.fill();
        }
        // and where to start one that has not been begun
        if (s.at === 0) {
          const p = s.pts[0];
          ctx.fillStyle = 'rgba(200,120,60,' + (0.5 + 0.35 * Math.sin(t * 0.005)) + ')';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fffdf8';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  };
}

/** A card that says what is being made, above whatever is being traced. */
export function traceHeader(ctx, icon, label, x, y, w) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,253,248,.9)';
  ctx.strokeStyle = 'rgba(217,201,174,.9)';
  ctx.lineWidth = 2;
  rr(ctx, x, y, w, 34, 12);
  ctx.fill();
  ctx.stroke();
  glyph(ctx, icon, x + 22, y + 17, 22);
  ctx.fillStyle = '#43372a';
  ctx.font = '700 15px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 42, y + 18);
  ctx.restore();
}
