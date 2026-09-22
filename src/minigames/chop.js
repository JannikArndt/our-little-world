// Felling a tree.
//
// One tree, filling the panel, and the notch you cut into it. The mark tells
// you where the axe should land; it moves to the other lip of the notch after
// every swing, so each one has to be aimed afresh.
//
// The rule you can work out by looking: **a clean bite is a log**. The pile on
// the grass grows with every stroke that lands on the mark and stands still
// for every one that glances off — so the wood a tree gives is the wood you
// cut out of it. And the mark is wider for hands that have done this before,
// which is the only thing practice buys.

import { openPanel, makeCanvas, onPointer, loop } from '../ui/overlay.js';
import { T, tileAt, inBounds } from '../core/grid.js';
import { C, rr, glyph, blob, lite, dusk, wob } from '../render/art.js';
import { tr, trn } from '../core/i18n.js';

const W = 340,
  H = 340;
const CX = 170; // the middle of the trunk
const GROUND = 296; // where it goes into the earth
const TOP = 130; // where it goes into the leaves
const HALF_B = 30,
  HALF_T = 21; // how thick it is at the foot and at the head
const CUT = 246; // the height an axe swings at
const SPREAD = 21; // half the mouth of the notch
const SKY = '#cfe3d4';

// the same three trees the village has, at the size you stand under one
const CANOPY = [
  ['#41763a', '#59994a', '#7cc064', '#8a5c30', null],
  ['#365f33', '#4a8240', '#6cb057', '#75502c', '#c9543f'],
  ['#4a7f40', '#66a552', '#8acb70', '#9c6b3c', '#f5c6d4'],
];

/** How thick the trunk is at a given height. */
function half(y) {
  const f = Math.max(0, Math.min(1, (y - TOP) / (GROUND - TOP)));
  return HALF_T + (HALF_B - HALF_T) * f;
}
const leftEdge = y => CX - half(y);

// How far in the notch has to go before the tree gives: past the middle, so
// what is left is a hinge rather than a post.
const NEED = half(CUT) * 1.24;
const BITE = { clean: NEED / 4.7, fair: NEED / 7.7, wide: NEED / 19 };

/* ---- where it goes over ---------------------------------------------- */

const DIRS = { S: [0, 1], W: [-1, 0], E: [1, 0], N: [0, -1] };
const RANK = { clear: 0, tree: 1, edge: 2, house: 3, water: 4 };

function look(w, tree, dir) {
  const d = DIRS[dir];
  for (let i = 1; i <= 2; i++) {
    const x = tree.x + d[0] * i,
      y = tree.y + d[1] * i;
    if (!inBounds(x, y)) return 'edge';
    if (tileAt(w, x, y) === T.WATER) return 'water';
    if (
      w.buildings.some(
        b => b.state !== 'site' && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h,
      )
    )
      return 'house';
    if (w.trees.some(t => t.state === 'standing' && t.id !== tree.id && t.x === x && t.y === y))
      return 'tree';
  }
  return 'clear';
}

/** Nobody has to choose any more: it goes wherever there is room for it. */
function whereItFalls(w, tree) {
  let best = 'S',
    score = 9;
  for (const d in DIRS) {
    const r = RANK[look(w, tree, d)];
    if (r < score) {
      score = r;
      best = d;
    }
  }
  return best;
}

/* ---------------------------------------------------------------------- */

export function openChop(game, tree) {
  const w = game.world;
  const dir = whereItFalls(w, tree);
  const kind = CANOPY[(tree.kind - 1) % 3];
  const seed = (tree.sway || 0) + tree.x * 3 + tree.y * 7;

  // The only thing practice buys: a bigger mark to hit.
  const fells = w.players[game.role].done.fell || 0;
  const hand = Math.min(3, Math.floor(fells / 2));
  const core = 10 + hand * 4;

  // Closing this from outside — Escape, the day turning — has to stop the
  // loop and let go of the test-only handle exactly as leaving the tree does.
  // A tree already cut clean through still counts: the wood belongs to
  // whoever swung the axe, whether or not they stayed to watch it fall.
  const p = openPanel({
    title: tr('chop.title'),
    lead: tr('chop.lead'),
    onClose: () => {
      stop();
      game._chop = null;
      if (done) fell();
    },
  });
  const cv = makeCanvas(W, H);
  cv.canvas.className = 'tall'; // a tree is taller than the panel is wide
  p.body.appendChild(cv.canvas);

  let depth = 0,
    logs = 0;
  let next = 'top'; // which lip of the notch is marked
  let swing = 0,
    shake = 0,
    falling = 0,
    settle = 0,
    done = false;
  let chips = [],
    scars = [];

  const markY = () => (next === 'top' ? CUT - SPREAD : CUT + SPREAD);

  // so a test can aim at the mark instead of guessing at it; it goes away the
  // moment the axe is out of the tree, which is also how a test knows to stop
  const publish = () => {
    game._chop = done ? null : { W: W, H: H, y: markY(), core: core, logs: logs, depth: depth };
  };

  p.readout(tr('chop.aim'));
  publish();

  function strike(y) {
    if (done) return;
    const err = Math.abs(y - markY());
    const how = err <= core ? 'clean' : err <= core * 2.4 ? 'fair' : 'wide';
    depth += BITE[how];
    swing = 1;
    shake = 1;
    if (how === 'clean') logs++;
    else if (how === 'wide') scars.push({ y: Math.max(TOP + 10, Math.min(GROUND - 6, y)) });

    const apex = leftEdge(CUT) + Math.min(depth, NEED);
    for (let i = 0; i < (how === 'clean' ? 9 : 5); i++)
      chips.push({
        x: apex,
        y: CUT,
        vx: -1 - Math.random() * 3,
        vy: -1.4 - Math.random() * 1.8,
        life: 1,
      });

    if (depth >= NEED) {
      done = true;
      falling = 0.0001;
      row.style.display = 'none'; // nothing left to leave standing
      p.readout(tr('chop.timber'));
    } else {
      p.readout(tr('chop.' + how) + (depth > NEED * 0.72 ? ' ' + tr('chop.nearly') : ''));
      next = next === 'top' ? 'bot' : 'top';
    }
    publish();
  }

  onPointer(cv.canvas, W, H, {
    down(pt) {
      strike(pt.y);
    },
  });

  const row = p.row();
  row.appendChild(
    p.button(tr('chop.leave'), 'soft', () => {
      p.close(); // the loop and the handle go together, in onClose above
    }),
  );

  /* ---- drawing ------------------------------------------------------- */

  // what is behind the tree this frame, so a notch cuts a hole to it rather
  // than to a flat colour that stopped matching the sky
  let behind = SKY;

  function trunk(ctx) {
    // a trunk with a flare into the ground and a light down one side, so the
    // thing you are swinging at is round rather than a plank
    ctx.fillStyle = kind[3];
    ctx.beginPath();
    ctx.moveTo(CX - HALF_T, TOP);
    ctx.lineTo(CX + HALF_T, TOP);
    ctx.lineTo(CX + HALF_B, GROUND);
    ctx.quadraticCurveTo(CX + HALF_B + 7, GROUND + 5, CX + HALF_B + 14, GROUND + 7);
    ctx.lineTo(CX - HALF_B - 14, GROUND + 7);
    ctx.quadraticCurveTo(CX - HALF_B - 7, GROUND + 5, CX - HALF_B, GROUND);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = lite(kind[3], 0.26); // the sunward side
    ctx.fillRect(CX - HALF_B - 14, TOP - 4, 16, GROUND - TOP + 14);
    ctx.fillStyle = dusk(kind[3], 0.3); // and the side the sun is not on
    ctx.fillRect(CX + HALF_T + 1, TOP - 4, HALF_B + 14, GROUND - TOP + 14);
    // bark, so the trunk has a grain to aim along
    for (let i = 0; i < 9; i++) {
      const f = 0.08 + i * 0.105;
      ctx.strokeStyle = i % 2 ? 'rgba(120,80,45,.32)' : 'rgba(255,240,210,.14)';
      ctx.lineWidth = 1.6 + (i % 3) * 0.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(CX - HALF_T + HALF_T * 2 * f, TOP - 2);
      ctx.bezierCurveTo(
        CX - HALF_T + HALF_T * 2 * f + (i % 2 ? 5 : -5),
        TOP + 60,
        CX - HALF_B + HALF_B * 2 * f + (i % 2 ? -4 : 4),
        GROUND - 80,
        CX - HALF_B + HALF_B * 2 * f,
        GROUND + 4,
      );
      ctx.stroke();
    }
    // a knot or two, where a branch used to be
    for (const [ky, kx] of [
      [TOP + 40, -0.4],
      [TOP + 96, 0.35],
    ]) {
      ctx.fillStyle = dusk(kind[3], 0.34);
      ctx.beginPath();
      ctx.ellipse(CX + half(ky) * kx, ky, 6, 8, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dusk(kind[3], 0.14);
      ctx.beginPath();
      ctx.ellipse(CX + half(ky) * kx, ky, 3, 4.4, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    for (const s of scars) {
      ctx.fillStyle = 'rgba(90,60,32,.5)';
      ctx.beginPath();
      ctx.moveTo(leftEdge(s.y) - 1, s.y - 5);
      ctx.lineTo(leftEdge(s.y) + 9, s.y);
      ctx.lineTo(leftEdge(s.y) - 1, s.y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(232,211,170,.6)';
      ctx.beginPath();
      ctx.moveTo(leftEdge(s.y) - 1, s.y - 5);
      ctx.lineTo(leftEdge(s.y) + 4, s.y - 1.5);
      ctx.lineTo(leftEdge(s.y) - 1, s.y - 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }

  function notch(ctx) {
    if (depth <= 0) return;
    const d = Math.min(depth, NEED);
    ctx.fillStyle = behind; // whatever is behind the tree, showing through
    ctx.beginPath();
    ctx.moveTo(leftEdge(CUT - SPREAD) - 3, CUT - SPREAD);
    ctx.lineTo(leftEdge(CUT) + d, CUT);
    ctx.lineTo(leftEdge(CUT + SPREAD) - 3, CUT + SPREAD);
    ctx.closePath();
    ctx.fill();
    // the pale face of the cut, which is how you see how deep you are; it stays
    // inside the bark, or it draws a little beak out into the air
    ctx.strokeStyle = '#e8d3aa';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(leftEdge(CUT - SPREAD) + 2, CUT - SPREAD);
    ctx.lineTo(leftEdge(CUT) + d, CUT);
    ctx.lineTo(leftEdge(CUT + SPREAD) + 2, CUT + SPREAD);
    ctx.stroke();
  }

  function crown(ctx, t) {
    const sway = Math.sin(t * 0.0012) * (falling > 0 ? 0 : 2.2);
    ctx.save();
    ctx.translate(CX + sway, TOP - 6);

    // the same canopy the village draws, at the size you stand under one: a
    // pale silhouette with everything else set down and right of it, so the
    // top-left edge is a thread of sun on the outermost leaves
    const RX = 96,
      RY = 74,
      CY = -40;
    blob(ctx, 0, CY, RX, RY, 8, seed);
    ctx.fillStyle = lite(kind[2], 0.4);
    ctx.fill();
    ctx.save();
    blob(ctx, 0, CY, RX, RY, 8, seed);
    ctx.clip();
    blob(ctx, 5, CY + 6, RX, RY, 8, seed);
    ctx.fillStyle = kind[0];
    ctx.fill();
    blob(ctx, 0, CY - 8, RX * 0.9, RY * 0.88, 7, seed + 40);
    ctx.fillStyle = kind[1];
    ctx.fill();
    blob(ctx, -21, CY - 24, RX * 0.58, RY * 0.56, 6, seed + 80);
    ctx.fillStyle = kind[2];
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath();
    ctx.ellipse(-34, -62, 24, 15, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(28,44,24,.3)'; // dark where the trunk goes up into it
    ctx.beginPath();
    ctx.ellipse(0, 18, 46, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    if (kind[4]) {
      ctx.fillStyle = kind[4];
      for (let i = 0; i < 7; i++) {
        const a = wob(seed + i * 11) * Math.PI * 2;
        const r = 20 + wob(seed + i * 17) * 52;
        const fx = Math.cos(a) * r,
          fy = CY + Math.sin(a) * r * 0.7;
        ctx.beginPath();
        ctx.arc(fx, fy, 4.4, 0, Math.PI * 2);
        ctx.arc(fx + 7, fy + 4, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.restore();
  }

  function logPile(ctx) {
    // one log end for every clean bite, which is the whole rule of the game
    for (let i = 0; i < Math.min(logs, 8); i++) {
      const col = i % 3,
        rowN = Math.floor(i / 3);
      const x = 258 + col * 26 + rowN * 13,
        y = 314 - rowN * 22;
      ctx.fillStyle = 'rgba(60,50,35,.14)';
      ctx.beginPath();
      ctx.ellipse(x + 2, y + 9, 13, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dusk(C.wood, 0.24);
      ctx.beginPath();
      ctx.ellipse(x, y, 12, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.wood;
      ctx.beginPath();
      ctx.ellipse(x - 0.6, y - 0.8, 11, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8d3aa';
      ctx.beginPath();
      ctx.ellipse(x, y, 8.5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = lite('#e8d3aa', 0.3);
      ctx.beginPath();
      ctx.ellipse(x - 1.4, y - 1.4, 6, 4.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,95,50,.45)';
      ctx.lineWidth = 1;
      for (let k = 1; k <= 3; k++) {
        ctx.beginPath();
        ctx.ellipse(x - 0.4, y - 0.4, 1.6 * k, 1.3 * k, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(140,95,50,.6)'; // the split across the end
      ctx.beginPath();
      ctx.moveTo(x - 6, y + 2.4);
      ctx.lineTo(x + 3.4, y - 3);
      ctx.stroke();
    }
    if (logs > 8) glyph(ctx, '…', 330, 314, 16);
  }

  function mark(ctx, t) {
    const y = markY();
    const pulse = 0.65 + 0.35 * Math.sin(t * 0.005);
    ctx.save();
    // the width of the mark is the width of the thing you have to hit
    ctx.globalAlpha = 0.28 * pulse;
    ctx.fillStyle = '#f2c14e';
    rr(ctx, CX - HALF_B - 16, y - core, HALF_B * 2 + 32, core * 2, core);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#e0a52f';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(CX - HALF_B - 20, y);
    ctx.lineTo(CX + HALF_B + 20, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // the axe waits beside the mark and swings into it
    const s = swing > 0 ? Math.sin((1 - swing) * Math.PI) : 0;
    ctx.save();
    ctx.translate(CX - HALF_B - 44 + s * 30, y - 8 + s * 6);
    ctx.rotate(-0.7 + s * 1.5);
    glyph(ctx, '🪓', 0, 0, 36);
    ctx.restore();
  }

  function draw(t) {
    const ctx = cv.ctx;
    ctx.clearRect(0, 0, W, H);

    // A morning in the wood: a sky that warms toward the ground, the rest of
    // the forest a long way back and out of focus, and grass at your feet.
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#bcd9d9');
    sky.addColorStop(0.6, SKY);
    sky.addColorStop(1, '#e2eddb');
    behind = sky; // so the notch cuts a hole to whatever is really behind
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // other trees, far enough off to be one colour each
    for (let i = 0; i < 9; i++) {
      const bx = 6 + i * 41 + ((i * 29) % 15);
      const r = 15 + ((i * 13) % 9);
      ctx.fillStyle = i % 2 ? 'rgba(126,162,120,.2)' : 'rgba(108,146,108,.17)';
      ctx.beginPath();
      ctx.arc(bx, GROUND - 16 - r * 0.5, r, 0, Math.PI * 2);
      ctx.arc(bx - r * 0.6, GROUND - 10, r * 0.7, 0, Math.PI * 2);
      ctx.arc(bx + r * 0.6, GROUND - 10, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = C.grass;
    ctx.fillRect(0, GROUND - 2, W, H - GROUND + 2);
    ctx.fillStyle = 'rgba(255,250,215,.2)'; // the sun on the top of the grass
    ctx.fillRect(0, GROUND - 2, W, 5);
    ctx.fillStyle = 'rgba(96,150,72,.22)'; // and the shade further down it
    ctx.fillRect(0, GROUND + 22, W, H - GROUND - 22);
    // blades, tufts and a daisy or two
    ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const gx = 4 + i * 13 + ((i * 7) % 9),
        gy = GROUND + 6 + (i % 4) * 9;
      ctx.strokeStyle = i % 3 ? C.grassDark : C.grassLite;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(gx, gy + 6);
      ctx.quadraticCurveTo(gx + 1, gy + 1, gx + 2.6, gy - 3);
      ctx.stroke();
      if (i % 9 === 4) {
        ctx.fillStyle = '#f6e08a';
        ctx.beginPath();
        ctx.arc(gx + 3, gy - 4, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // the shadow belongs to the ground, so it is drawn before anything turns
    ctx.fillStyle = 'rgba(60,50,35,.14)';
    ctx.beginPath();
    ctx.ellipse(CX + 14, GROUND + 6, 44, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(60,50,35,.08)'; // dappled, the way a canopy throws it
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(
        CX + 14 + (wob(seed + i) - 0.5) * 120,
        GROUND + 4 + (wob(seed + i * 5) - 0.5) * 22,
        16,
        5,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    ctx.save();
    if (falling > 0) {
      // over it goes, turning on the hinge the notch left behind, and then
      // settling the last little way onto the grass
      const e = 1 - Math.pow(1 - Math.min(1, falling), 3);
      ctx.translate(CX - half(CUT) * 0.2, CUT + e * 26);
      ctx.rotate(-e * 1.56);
      ctx.translate(-(CX - half(CUT) * 0.2), -CUT);
    } else if (shake > 0) {
      ctx.translate(CX, GROUND);
      ctx.rotate(Math.sin(t * 0.05) * 0.012 * shake);
      ctx.translate(-CX, -GROUND);
    }
    crown(ctx, t);
    trunk(ctx);
    notch(ctx);
    ctx.restore();

    if (falling > 0) {
      // what is left standing
      ctx.fillStyle = C.woodDark;
      rr(ctx, CX - half(CUT) - 1, CUT - 4, half(CUT) * 2 + 2, GROUND - CUT + 4, 4);
      ctx.fill();
      ctx.fillStyle = '#e8d3aa';
      ctx.beginPath();
      ctx.ellipse(CX, CUT - 2, half(CUT), 8, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      mark(ctx, t);
    }

    for (const c of chips) {
      ctx.globalAlpha = Math.max(0, c.life);
      ctx.fillStyle = '#e2c894';
      ctx.fillRect(c.x - 2, c.y - 2, 4, 3);
    }
    ctx.globalAlpha = 1;

    logPile(ctx);

    // how many trees this pair of hands has had down, and so how big the mark is
    ctx.fillStyle = 'rgba(67,55,42,.62)';
    ctx.font = '700 12px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(tr('chop.hand.' + hand), 12, 18);
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i < hand ? 0.9 : 0.25;
      glyph(ctx, '🪓', 20 + i * 20, 38, 15);
    }
    ctx.globalAlpha = 1;
  }

  const stop = loop((t, dt) => {
    cv.fit();
    if (shake > 0) shake = Math.max(0, shake - dt / 300);
    if (swing > 0) swing = Math.max(0, swing - dt / 230);
    for (const c of chips) {
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.24;
      c.life -= dt / 700;
    }
    chips = chips.filter(c => c.life > 0);
    if (falling > 0 && falling < 1) {
      falling = Math.min(1, falling + dt / 700);
      if (falling >= 1) {
        settle = 900;
        p.readout(trn('chop.gotLogs', logs, { n: logs }));
      }
    } else if (settle > 0) {
      // a beat to look at the pile, then away — no card to tap away afterwards
      settle -= dt;
      if (settle <= 0) finish();
    }
    draw(t);
  });

  // Over it goes, and the pile beside it is what it gave. Kept apart from
  // closing the panel, because the two do not always happen together.
  let told = false;
  function fell() {
    if (told) return;
    told = true;
    game.dispatch({
      type: 'tree.fell',
      role: game.role,
      treeId: tree.id,
      dir: dir,
      wood: 2,
      logs: Math.max(1, Math.min(6, logs)),
    });
  }

  function finish() {
    p.close(); // the loop, the handle and the dispatch all go together, in onClose above
  }
}
