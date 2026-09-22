// The workshop. Two machines that turn one thing into another.
//   sawmill: wood -> planks   (cut the log into equal pieces)
//   mill:    wheat -> bread   (turn the stone, then bake)

import { el, openPanel, makeCanvas, onPointer, loop } from '../ui/overlay.js';
import { C, rr, glyph, lite, dusk, wob } from '../render/art.js';
import { tr, trn } from '../core/i18n.js';
import { makeRng } from '../core/rng.js';

const LOG_UNITS = 12;
const MIN_PLANK = 3;
// Orders that use the whole log: 2 sixes, 3 fours, 4 threes.
const ORDERS = [
  [2, 6],
  [3, 4],
  [4, 3],
];
// Three perfect logs — every piece the size that was asked for — are enough
// to show it wasn't luck, without making the reward feel far away. That's
// when the drawn example goes away and the ruler has to carry the job alone.
const LEVEL2_AT = 3;
const W = 480,
  H = 236;
const X0 = 96,
  X1 = 384,
  U = (X1 - X0) / LOG_UNITS,
  Y = 128;
const STACK_L = 48,
  STACK_R = 432;

/* ------------------------------------------------------------------ */
/* sawmill                                                            */
/* ------------------------------------------------------------------ */

export function openSawmill(game) {
  const wood = () => game.world.players[game.role].res.wood;
  const planks = () => game.world.players[game.role].res.plank;

  if (wood() < 1) {
    // no bench work opens here, so there is no loop to stop on the way out
    const p = openPanel({ title: tr('saw.title'), lead: tr('saw.lead') });
    p.body.appendChild(el('p', 'lead', tr('saw.noWood')));
    const r = p.row();
    r.appendChild(p.button(tr('ui.alright'), 'soft', () => p.close()));
    return;
  }

  // Closing this from outside — Escape, the day turning — has to stop the
  // loop the same way its own done/not-now button does, so it goes here.
  const p = openPanel({ title: tr('saw.title'), lead: tr('saw.lead'), onClose: () => stop() });

  const cv = makeCanvas(W, H);

  // Which level this player is on lives on the world, not the panel, so it is
  // still true the next time the sawmill opens.
  function levelOf() {
    return (game.world.players[game.role].done.sawPerfect || 0) >= LEVEL2_AT ? 2 : 1;
  }
  let level = levelOf();
  const levelLine = el('p', 'lead small', '');
  function showLevel() {
    levelLine.textContent = tr(level === 2 ? 'saw.level2' : 'saw.level1');
  }
  showLevel();
  p.body.appendChild(levelLine);
  p.body.appendChild(cv.canvas);

  // Every log comes with its own order, so nobody can cut the same thing twice
  // without thinking about it.
  const rng = makeRng((game.world.tick * 2654435761) ^ game.world.seed);
  let order = null,
    cuts = [],
    sawing = 0,
    result = null,
    flying = [];

  function newOrder() {
    const pick = ORDERS[Math.floor(rng() * ORDERS.length)];
    // the level travels with the order, so a log already on the bench never
    // changes its picture mid-cut — only the *next* one does
    order = { pieces: pick[0], size: pick[1], level: level };
    game._saw = { pieces: order.pieces, size: order.size, level: level }; // so a test can read what was asked for
    cuts = [];
    sawing = 0;
    result = null;
    flying = [];
    describe();
    buttons();
  }

  function pieces() {
    const edges = [0].concat(cuts, [LOG_UNITS]);
    const out = [];
    for (let i = 1; i < edges.length; i++) out.push(edges[i] - edges[i - 1]);
    return out;
  }

  const right = () => pieces().filter(n => n === order.size).length;

  function describe() {
    if (result) return;
    p.readout(
      cuts.length
        ? trn('saw.sofar', right(), { n: right(), pieces: order.pieces, size: order.size })
        : trn('saw.order', order.pieces, { n: order.pieces, size: order.size }),
    );
  }

  onPointer(cv.canvas, W, H, {
    down(pt) {
      if (result || sawing) return;
      const u = Math.round((pt.x - X0) / U);
      if (u < 1 || u > LOG_UNITS - 1) return;
      const i = cuts.indexOf(u);
      if (i >= 0) cuts.splice(i, 1);
      else if (cuts.length < LOG_UNITS / MIN_PLANK) cuts.push(u);
      cuts.sort((a, b) => a - b);
      describe();
      buttons();
    },
  });

  /* ---- buttons ---- */
  const row = p.row();
  let sawBtn = null,
    nextBtn = null;

  function buttons() {
    row.innerHTML = '';
    if (!result) {
      sawBtn = p.button(tr('saw.go'), '', () => {
        if (!sawing && cuts.length) {
          sawing = 0.0001;
          buttons();
        }
      });
      sawBtn.disabled = !cuts.length || !!sawing;
      row.appendChild(sawBtn);
    } else if (wood() > 0) {
      // No shortcut: the next log is a new order and has to be measured again.
      nextBtn = p.button(tr('saw.nextLog'), 'go', () => newOrder());
      row.appendChild(nextBtn);
    }
    const done = p.button(result ? tr('ui.done') : tr('ui.notNow'), 'soft', () => p.close());
    done.style.flex = '0 0 auto';
    row.appendChild(done);
  }

  newOrder();

  /* ---- drawing ---- */
  /** A piece of timber: a lit top edge, a shaded bottom one, grain running
   *  its length, and a pale sawn end so you can tell which way it was cut. */
  function plank(ctx, x, y, w, h, ok) {
    const tone = ok ? C.wood : '#8e7550';
    ctx.fillStyle = dusk(tone, 0.2);
    rr(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.save();
    rr(ctx, x, y, w, h, 5);
    ctx.clip();
    ctx.fillStyle = tone;
    ctx.fillRect(x, y, w, h * 0.74);
    ctx.fillStyle = lite(tone, 0.26);
    ctx.fillRect(x, y, w, h * 0.3);
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    rr(ctx, x + 2, y + 2.4, Math.max(2, w - 5), Math.max(2, h * 0.16), 2);
    ctx.fill();
    // grain: two long lines that wander, and a knot where they part
    ctx.strokeStyle = 'rgba(120,80,45,.35)';
    ctx.lineWidth = 1;
    for (let g = 1; g < 3; g++) {
      const gy = y + (h / 3) * g;
      ctx.beginPath();
      ctx.moveTo(x + 2, gy);
      ctx.bezierCurveTo(x + w * 0.3, gy - 2, x + w * 0.7, gy + 2, x + w - 2, gy);
      ctx.stroke();
    }
    if (w > 26) {
      ctx.fillStyle = 'rgba(120,80,45,.3)';
      ctx.beginPath();
      ctx.ellipse(x + w * 0.62, y + h * 0.5, 2.2, 3, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // the sawn end, paler than the face of it
    ctx.fillStyle = lite(tone, 0.4);
    ctx.fillRect(x + w - 4, y, 4, h);
    ctx.restore();
  }

  function stack(ctx, x, label, n, colour) {
    const show = Math.min(n, 6);
    for (let i = 0; i < show; i++) {
      const sy = 176 - i * 11;
      ctx.fillStyle = dusk(colour, 0.22);
      rr(ctx, x - 26, sy, 52, 10, 3);
      ctx.fill();
      ctx.fillStyle = colour;
      rr(ctx, x - 26, sy, 52, 7, 3);
      ctx.fill();
      ctx.fillStyle = lite(colour, 0.28);
      rr(ctx, x - 25, sy + 0.6, 50, 2.4, 1.2);
      ctx.fill();
      ctx.fillStyle = lite(colour, 0.45); // the end you would pick it up by
      rr(ctx, x + 21, sy, 5, 9, 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,45,.3)';
      ctx.lineWidth = 1;
      rr(ctx, x - 26, sy, 52, 10, 3);
      ctx.stroke();
    }
    ctx.fillStyle = '#43372a';
    ctx.font = '800 17px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x, 199);
    glyph(ctx, label, x, 216, 18);
  }

  function draw(_t) {
    const ctx = cv.ctx;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#efe4cd';
    ctx.fillRect(0, 0, W, H);

    // the order. Level 1 draws it at the log's own scale, so the cuts can be
    // copied by eye; level 2 keeps only the sum, big enough to read at a
    // glance, so the length has to come from the ruler below instead.
    ctx.fillStyle = '#43372a';
    if (order.level === 2) {
      ctx.font = '800 15px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tr('saw.wanted'), W / 2, 22);
      ctx.font = '800 34px -apple-system, system-ui, sans-serif';
      ctx.fillText(order.pieces + ' × ' + order.size, W / 2, 54);
    } else {
      const wide = order.pieces * order.size * U + (order.pieces - 1) * 5;
      let ox = Math.max(102, (W - wide) / 2); // clear of the words on the left
      ctx.font = '800 15px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(tr('saw.wanted'), 14, 26);
      ctx.font = '800 19px -apple-system, system-ui, sans-serif';
      ctx.fillText(order.pieces + ' × ' + order.size, 14, 52);
      for (let i = 0; i < order.pieces; i++) {
        const w = order.size * U;
        ctx.save();
        ctx.globalAlpha = 0.5;
        plank(ctx, ox, 30, w, 26, true);
        ctx.restore();
        ctx.strokeStyle = '#5d9150';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        rr(ctx, ox, 30, w, 26, 5);
        ctx.stroke();
        ctx.setLineDash([]);
        ox += w + 5;
      }
    }

    // the bench the log lies on, with a leg under each end of it
    const bench = '#c9b38c';
    ctx.fillStyle = dusk(bench, 0.28);
    for (const lx of [X0 + 6, X1 - 18]) {
      rr(ctx, lx, Y + 34, 12, 26, 3);
      ctx.fill();
    }
    ctx.fillStyle = dusk(bench, 0.16);
    rr(ctx, X0 - 14, Y + 26, X1 - X0 + 28, 15, 6);
    ctx.fill();
    ctx.fillStyle = bench;
    rr(ctx, X0 - 14, Y + 26, X1 - X0 + 28, 10, 5);
    ctx.fill();
    ctx.fillStyle = lite(bench, 0.3);
    rr(ctx, X0 - 14, Y + 26, X1 - X0 + 28, 3.6, 1.8);
    ctx.fill();
    ctx.fillStyle = 'rgba(232,206,158,.75)'; // sawdust along the bench
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.ellipse(
        X0 - 10 + wob(i) * (X1 - X0 + 20),
        Y + 40 + wob(i * 3) * 4,
        2.2,
        1.1,
        wob(i * 5) * 3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // the log, cut where you said
    const ps = pieces();
    let x = X0;
    for (let i = 0; i < ps.length; i++) {
      const w = ps[i] * U;
      const ok = ps[i] === order.size;
      let dx = 0,
        dy = 0,
        alpha = 1;
      if (result) {
        const f = flying[i] || { ok: ok, at: 0 };
        if (ok) {
          dx = (STACK_R - (x + w / 2)) * f.at;
          dy = (170 - Y) * f.at;
          alpha = 1 - f.at * 0.8;
        } else {
          dy = f.at * 60;
          alpha = 1 - f.at;
        }
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(dx, dy);
      plank(ctx, x, Y - 15, w - 1, 30, ok);
      if (result) glyph(ctx, ok ? '🪚' : '🔥', x + w / 2, Y, 15);
      ctx.restore();
      x += w;
    }

    // the ruler underneath
    ctx.strokeStyle = 'rgba(67,55,42,.35)';
    ctx.lineWidth = 1;
    ctx.font = '11px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(67,55,42,.6)';
    for (let u = 0; u <= LOG_UNITS; u++) {
      const px = X0 + u * U;
      ctx.beginPath();
      ctx.moveTo(px, Y + 18);
      ctx.lineTo(px, Y + 18 + (u % order.size === 0 ? 9 : 4));
      ctx.stroke();
      if (u % order.size === 0) ctx.fillText(String(u), px, Y + 29);
    }

    if (!result) {
      for (const u of cuts) {
        const px = X0 + u * U;
        ctx.strokeStyle = '#c05b4d';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(px, Y - 24);
        ctx.lineTo(px, Y + 24);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // what you have on either side: wood going down, planks going up
    stack(ctx, STACK_L, '🪵', wood(), C.wood);
    stack(ctx, STACK_R, '🪚', planks(), '#e3c98f');

    // the blade
    if (sawing > 0 && sawing < 1) {
      const bx = X0 - 30 + (X1 - X0 + 60) * sawing;
      ctx.save();
      ctx.translate(bx, Y - 40);
      ctx.fillStyle = '#cfd4d8';
      rr(ctx, -5, 0, 10, 58, 3);
      ctx.fill();
      ctx.fillStyle = '#8e959b';
      for (let i = 0; i < 8; i++) ctx.fillRect(-6, 6 + i * 7, 12, 2);
      ctx.restore();
      ctx.fillStyle = 'rgba(220,200,150,.8)';
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + sawing * 12;
        ctx.beginPath();
        ctx.arc(bx + Math.cos(a) * 16, Y + 16 + Math.sin(a) * 10, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const stop = loop((t, dt) => {
    cv.fit();
    if (sawing > 0 && sawing < 1) {
      sawing += dt / 900;
      if (sawing >= 1) settle();
    }
    for (const f of flying) if (f.at < 1) f.at = Math.min(1, f.at + dt / 700);
    draw(t);
  });

  function settle() {
    const ps = pieces();
    const good = ps.filter(n => n === order.size).length;
    result = { good: good, scraps: ps.length - good };
    flying = ps.map(n => ({ ok: n === order.size, at: 0 }));
    game.dispatch({
      type: 'saw.run',
      role: game.role,
      wood: 1,
      planks: good,
      pieces: order.pieces,
    });

    p.readout(
      good === order.pieces
        ? tr('saw.perfect', { n: good, size: order.size })
        : good > 0
          ? trn('saw.some', good, { n: good, scraps: result.scraps })
          : tr('saw.none'),
    );

    // Levelling up happens between logs, never under one that's still flying
    // apart — the next order is the first one measured with the ruler alone.
    const now = levelOf();
    if (now > level) {
      level = now;
      showLevel();
    }

    buttons();
  }
}

/* ------------------------------------------------------------------ */
/* mill + oven                                                        */
/* ------------------------------------------------------------------ */

export function openMill(game) {
  const w = game.world;
  const wheat = w.players[game.role].res.wheat;

  if (wheat < 2) {
    // no turning opens here, so there is no loop to stop on the way out
    const p = openPanel({ title: tr('mill.title'), lead: tr('mill.lead') });
    p.body.appendChild(el('p', 'lead', tr(wheat === 1 ? 'mill.oneWheat' : 'mill.noWheat')));
    const r = p.row();
    r.appendChild(p.button(tr('ui.alright'), 'soft', () => p.close()));
    return;
  }

  // Closing this from outside — Escape, the day turning — has to stop the
  // loop the same way its own "later" button does, so it goes here.
  const p = openPanel({ title: tr('mill.title'), lead: tr('mill.lead'), onClose: () => stop() });

  const cv = makeCanvas(400, 240);
  p.body.appendChild(cv.canvas);

  let angle = 0,
    turned = 0,
    last = null,
    flour = 0,
    baking = 0,
    done = false;
  const NEEDED = Math.PI * 6; // three full turns

  onPointer(cv.canvas, 400, 240, {
    down(pt) {
      last = pt;
    },
    move(pt) {
      if (!last || flour >= 1) return;
      const cx = 150,
        cy = 120;
      const a0 = Math.atan2(last.y - cy, last.x - cx);
      const a1 = Math.atan2(pt.y - cy, pt.x - cx);
      let d = a1 - a0;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      angle += d;
      turned += Math.abs(d);
      last = pt;
      if (turned >= NEEDED) {
        flour = 1;
        bakeBtn.disabled = false;
        p.readout(tr('mill.flour'));
      } else p.readout(tr('mill.keepTurning', { n: Math.round((turned / NEEDED) * 100) }));
    },
    up() {
      last = null;
    },
  });

  const row = p.row();
  const bakeBtn = p.button(tr('mill.bake'), '', () => {
    if (done || flour < 1) return;
    done = true;
    baking = 0.0001;
    bakeBtn.disabled = true;
  });
  bakeBtn.disabled = true;
  row.appendChild(bakeBtn);
  const back = p.button(tr('ui.later'), 'soft', () => p.close());
  back.style.flex = '0 0 auto';
  row.appendChild(back);
  p.readout(tr('mill.turn'));

  function draw(_t) {
    const ctx = cv.ctx;
    ctx.clearRect(0, 0, 400, 240);
    ctx.fillStyle = '#efe4cd';
    ctx.fillRect(0, 0, 400, 240);

    // the hopper: a wooden box on two legs, with the grain in it showing over
    // the top and a dusting of flour down the chute
    const hop = '#b5946a';
    ctx.fillStyle = dusk(hop, 0.22);
    ctx.beginPath();
    ctx.moveTo(118, 18);
    ctx.lineTo(182, 18);
    ctx.lineTo(163, 58);
    ctx.lineTo(137, 58);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hop;
    ctx.beginPath();
    ctx.moveTo(120, 20);
    ctx.lineTo(180, 20);
    ctx.lineTo(162, 56);
    ctx.lineTo(138, 56);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(120, 20);
    ctx.lineTo(180, 20);
    ctx.lineTo(162, 56);
    ctx.lineTo(138, 56);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = lite(hop, 0.3);
    ctx.fillRect(118, 18, 18, 42);
    ctx.strokeStyle = 'rgba(70,52,34,.22)'; // the boards it is made of
    ctx.lineWidth = 1;
    for (const py of [30, 42]) {
      ctx.beginPath();
      ctx.moveTo(118, py);
      ctx.lineTo(182, py);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = dusk(hop, 0.32); // the iron band round the mouth of it
    ctx.fillRect(136, 54, 28, 3.4);
    ctx.fillStyle = '#e0b950'; // grain, heaped over the top
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.ellipse(126 + i * 6, 20 - (i % 3), 4, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = lite('#e0b950', 0.35);
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(130 + i * 10, 18.5 - (i % 2), 2.4, 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // a dusting of flour where it comes out at the bottom
    ctx.fillStyle = 'rgba(248,242,228,.75)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(140 + i * 4, 60 + ((i * 3) % 5), 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // millstone: a great flat wheel with grooves cut across its face, a square
    // iron eye at the middle and a handle worn smooth
    ctx.fillStyle = 'rgba(70,60,45,.18)'; // it is heavy, and it sits on a bed
    ctx.beginPath();
    ctx.ellipse(152, 126, 58, 56, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(150, 120);
    ctx.rotate(angle);
    ctx.fillStyle = '#8b867e';
    ctx.beginPath();
    ctx.arc(0, 0, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a9a49b';
    ctx.beginPath();
    ctx.arc(-1.5, -1.5, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lite('#a9a49b', 0.26); // the light on the upper left of it
    ctx.beginPath();
    ctx.arc(-14, -14, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 54, 0, Math.PI * 2);
    ctx.clip();
    // the furrows: eight, each a trough with a lit lip, struck off the centre
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 4);
      ctx.fillStyle = '#7a756d';
      ctx.fillRect(-3, -54, 6, 44);
      ctx.fillStyle = 'rgba(255,250,235,.3)';
      ctx.fillRect(2, -54, 1.6, 44);
      ctx.restore();
    }
    // and the pitting between them, which is what actually grinds
    ctx.fillStyle = 'rgba(110,104,94,.4)';
    for (let i = 0; i < 26; i++) {
      const a = wob(i) * Math.PI * 2,
        r = 14 + wob(i * 3) * 38;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#6f6a63'; // the iron eye
    rr(ctx, -11, -11, 22, 22, 3);
    ctx.fill();
    ctx.fillStyle = lite('#6f6a63', 0.3);
    rr(ctx, -11, -11, 8, 22, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(248,242,228,.6)'; // flour working its way out
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill('evenodd');
    ctx.fillStyle = '#8a5c30'; // the handle
    rr(ctx, 30, -6, 26, 12, 5);
    ctx.fill();
    ctx.fillStyle = lite('#8a5c30', 0.34);
    rr(ctx, 30, -6, 26, 4.4, 2.2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(67,55,42,.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.arc(150, 120, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // the empty track fills in as you turn — a picture of the percentage,
    // not just the word for it
    const pct = Math.max(0, Math.min(1, turned / NEEDED));
    if (pct > 0) {
      ctx.strokeStyle = '#5d9150';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(150, 120, 70, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // ten boxes under the stone say the same thing again, a different way:
    // seven filled out of ten reads as "70%" before you can read the word
    // floor, not round: a box only fills once its whole ten percent is done,
    // so the boxes never race ahead of the number beside them
    const filled = Math.min(10, Math.floor(pct * 10 + 1e-9));
    const segW = 13,
      segH = 14,
      gap = 2,
      segN = 10;
    const barW = segN * segW + (segN - 1) * gap;
    const bx0 = 150 - barW / 2,
      by = 195;
    for (let i = 0; i < segN; i++) {
      const sx = bx0 + i * (segW + gap);
      ctx.fillStyle = i < filled ? '#5d9150' : 'rgba(67,55,42,.12)';
      rr(ctx, sx, by, segW, segH, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(67,55,42,.25)';
      ctx.lineWidth = 1;
      rr(ctx, sx, by, segW, segH, 3);
      ctx.stroke();
    }
    ctx.fillStyle = '#43372a';
    ctx.font = '800 15px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(pct * 100) + '%', bx0 + barW + 10, by + segH / 2);

    // the chute the flour runs down, and the oven at the end of it
    const chute = '#c9b38c';
    ctx.fillStyle = dusk(chute, 0.24);
    rr(ctx, 210, 150, 150, 13, 5);
    ctx.fill();
    ctx.fillStyle = chute;
    rr(ctx, 210, 150, 150, 8, 4);
    ctx.fill();
    ctx.fillStyle = lite(chute, 0.3);
    rr(ctx, 210, 150, 150, 3.4, 1.7);
    ctx.fill();
    if (flour >= 1) {
      ctx.fillStyle = '#e8ddc6'; // a heap of flour, lit on top
      ctx.beginPath();
      ctx.ellipse(255, 147, 22, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8f2e4';
      ctx.beginPath();
      ctx.ellipse(252, 144, 16, 6.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // the oven: brick, a stone arch over the mouth, and a lit fire inside
    const brick = '#9a6b4c';
    ctx.fillStyle = 'rgba(70,52,34,.18)';
    rr(ctx, 287, 82, 82, 70, 10);
    ctx.fill();
    ctx.fillStyle = brick;
    rr(ctx, 285, 78, 82, 72, 10);
    ctx.fill();
    ctx.save();
    rr(ctx, 285, 78, 82, 72, 10);
    ctx.clip();
    ctx.fillStyle = lite(brick, 0.24);
    ctx.fillRect(285, 78, 24, 72);
    ctx.strokeStyle = 'rgba(70,45,30,.28)'; // courses of brick
    ctx.lineWidth = 1;
    for (let r = 1; r < 5; r++) {
      ctx.beginPath();
      ctx.moveTo(285, 78 + r * 14);
      ctx.lineTo(367, 78 + r * 14);
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const bx = 285 + k * 22 + (r % 2) * 11;
        ctx.beginPath();
        ctx.moveTo(bx, 78 + r * 14);
        ctx.lineTo(bx, 78 + (r - 1) * 14);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.fillStyle = dusk(brick, 0.2); // the arch over the mouth
    rr(ctx, 293, 90, 66, 56, 12);
    ctx.fill();
    ctx.fillStyle = baking > 0 ? '#f0a34a' : '#5a3f2c';
    rr(ctx, 297, 96, 58, 44, 8);
    ctx.fill();
    if (baking > 0) {
      ctx.fillStyle = 'rgba(255,180,90,.45)'; // the glow out of the mouth
      ctx.beginPath();
      ctx.ellipse(326, 118, 46, 34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = '24px system-ui, "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (baking > 0.55) ctx.fillText('🍞🍞🍞', 326, 118);
    else if (baking > 0) ctx.fillText('🔥', 326, 118);

    if (turned < NEEDED) {
      ctx.font = '600 12px -apple-system, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(67,55,42,.6)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(tr('mill.turnMe'), 150, 222);
    }
  }

  const stop = loop((t, dt) => {
    cv.fit();
    if (flour >= 1 && !done) angle += dt * 0.0006;
    if (baking > 0 && baking < 1.3) {
      baking += dt / 1100;
      if (baking >= 1 && !p._done) {
        p._done = true;
        game.dispatch({ type: 'mill.run', role: game.role, wheat: 2, food: 3 });
        p.readout(tr('mill.baked'));
        row.innerHTML = '';
        row.appendChild(p.button(tr('mill.take'), 'go', () => p.close()));
      }
    }
    draw(t);
  });
}
