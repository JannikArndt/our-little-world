// The workshop. Two machines that turn one thing into another.
//   sawmill: wood -> planks   (cut the log into equal pieces)
//   mill:    wheat -> bread   (turn the stone, then bake)

import { el, openPanel, makeCanvas, onPointer, loop, message } from '../ui/overlay.js';
import { C, rr, glyph } from '../render/art.js';
import { tr, trn } from '../core/i18n.js';
import { makeRng } from '../core/rng.js';

const LOG_UNITS = 12;
const MIN_PLANK = 3;
// Orders that use the whole log: 2 sixes, 3 fours, 4 threes.
const ORDERS = [[2, 6], [3, 4], [4, 3]];
const W = 480, H = 236;
const X0 = 96, X1 = 384, U = (X1 - X0) / LOG_UNITS, Y = 128;
const STACK_L = 48, STACK_R = 432;

/* ------------------------------------------------------------------ */
/* sawmill                                                            */
/* ------------------------------------------------------------------ */

export function openSawmill(game) {
  const p = openPanel({ title: tr('saw.title'), lead: tr('saw.lead') });

  const wood = () => game.world.players[game.role].res.wood;
  const planks = () => game.world.players[game.role].res.plank;

  if (wood() < 1) {
    p.body.appendChild(el('p', 'lead', tr('saw.noWood')));
    const r = p.row(); r.appendChild(p.button(tr('ui.alright'), 'soft', () => p.close()));
    return;
  }

  const cv = makeCanvas(W, H);
  p.body.appendChild(cv.canvas);

  // Every log comes with its own order, so nobody can cut the same thing twice
  // without thinking about it.
  const rng = makeRng((game.world.tick * 2654435761) ^ game.world.seed);
  let order = null, cuts = [], sawing = 0, result = null, flying = [];

  function newOrder() {
    const pick = ORDERS[Math.floor(rng() * ORDERS.length)];
    order = { pieces: pick[0], size: pick[1] };
    game._saw = order;                 // so a test can read what was asked for
    cuts = []; sawing = 0; result = null; flying = [];
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
    p.readout(cuts.length
      ? trn('saw.sofar', right(), { n: right(), pieces: order.pieces, size: order.size })
      : trn('saw.order', order.pieces, { n: order.pieces, size: order.size }));
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
  let sawBtn = null, nextBtn = null;

  function buttons() {
    row.innerHTML = '';
    if (!result) {
      sawBtn = p.button(tr('saw.go'), '', () => { if (!sawing && cuts.length) { sawing = 0.0001; buttons(); } });
      sawBtn.disabled = !cuts.length || !!sawing;
      row.appendChild(sawBtn);
    } else if (wood() > 0) {
      // No shortcut: the next log is a new order and has to be measured again.
      nextBtn = p.button(tr('saw.nextLog'), 'go', () => newOrder());
      row.appendChild(nextBtn);
    }
    const done = p.button(result ? tr('ui.done') : tr('ui.notNow'), 'soft', () => { stop(); p.close(); });
    done.style.flex = '0 0 auto';
    row.appendChild(done);
  }

  newOrder();

  /* ---- drawing ---- */
  function plank(ctx, x, y, w, h, ok) {
    ctx.fillStyle = ok ? C.wood : '#8e7550';
    rr(ctx, x, y, w, h, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    rr(ctx, x + 2, y + 3, Math.max(2, w - 5), Math.max(2, h * 0.26), 3); ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,45,.35)'; ctx.lineWidth = 1;
    for (let g = 1; g < 3; g++) {
      ctx.beginPath();
      ctx.moveTo(x + 4, y + (h / 3) * g); ctx.lineTo(x + w - 5, y + (h / 3) * g);
      ctx.stroke();
    }
  }

  function stack(ctx, x, label, n, colour) {
    const show = Math.min(n, 6);
    for (let i = 0; i < show; i++) {
      ctx.fillStyle = colour;
      rr(ctx, x - 26, 176 - i * 11, 52, 9, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,45,.3)'; ctx.lineWidth = 1;
      rr(ctx, x - 26, 176 - i * 11, 52, 9, 3); ctx.stroke();
    }
    ctx.fillStyle = '#43372a';
    ctx.font = '800 17px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x, 199);
    glyph(ctx, label, x, 216, 18);
  }

  function draw(t) {
    const ctx = cv.ctx;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#efe4cd'; ctx.fillRect(0, 0, W, H);

    // the order, drawn at the same scale as the log so you can compare lengths
    const wide = order.pieces * order.size * U + (order.pieces - 1) * 5;
    let ox = Math.max(102, (W - wide) / 2);   // clear of the words on the left
    ctx.fillStyle = '#43372a';
    ctx.font = '800 15px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(tr('saw.wanted'), 14, 26);
    ctx.font = '800 19px -apple-system, system-ui, sans-serif';
    ctx.fillText(order.pieces + ' × ' + order.size, 14, 52);
    for (let i = 0; i < order.pieces; i++) {
      const w = order.size * U;
      ctx.save();
      ctx.globalAlpha = 0.5;
      plank(ctx, ox, 30, w, 26, true);
      ctx.restore();
      ctx.strokeStyle = '#5d9150'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      rr(ctx, ox, 30, w, 26, 5); ctx.stroke(); ctx.setLineDash([]);
      ox += w + 5;
    }

    // bench
    ctx.fillStyle = '#c9b38c'; rr(ctx, X0 - 14, Y + 26, (X1 - X0) + 28, 14, 6); ctx.fill();

    // the log, cut where you said
    const ps = pieces();
    let x = X0;
    for (let i = 0; i < ps.length; i++) {
      const w = ps[i] * U;
      const ok = ps[i] === order.size;
      let dx = 0, dy = 0, alpha = 1;
      if (result) {
        const f = flying[i] || { ok: ok, at: 0 };
        if (ok) { dx = (STACK_R - (x + w / 2)) * f.at; dy = (170 - Y) * f.at; alpha = 1 - f.at * 0.8; }
        else { dy = f.at * 60; alpha = 1 - f.at; }
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
    ctx.strokeStyle = 'rgba(67,55,42,.35)'; ctx.lineWidth = 1;
    ctx.font = '11px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(67,55,42,.6)';
    for (let u = 0; u <= LOG_UNITS; u++) {
      const px = X0 + u * U;
      ctx.beginPath(); ctx.moveTo(px, Y + 18); ctx.lineTo(px, Y + 18 + (u % order.size === 0 ? 9 : 4)); ctx.stroke();
      if (u % order.size === 0) ctx.fillText(String(u), px, Y + 29);
    }

    if (!result) {
      for (const u of cuts) {
        const px = X0 + u * U;
        ctx.strokeStyle = '#c05b4d'; ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(px, Y - 24); ctx.lineTo(px, Y + 24); ctx.stroke();
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
      rr(ctx, -5, 0, 10, 58, 3); ctx.fill();
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
    game.dispatch({ type: 'saw.run', role: game.role, wood: 1, planks: good });

    p.readout(good === order.pieces
      ? tr('saw.perfect', { n: good, size: order.size })
      : good > 0
        ? trn('saw.some', good, { n: good, scraps: result.scraps })
        : tr('saw.none'));
    buttons();
  }
}

/* ------------------------------------------------------------------ */
/* mill + oven                                                        */
/* ------------------------------------------------------------------ */

export function openMill(game) {
  const w = game.world;
  const wheat = w.players[game.role].res.wheat;
  const p = openPanel({ title: tr('mill.title'), lead: tr('mill.lead') });

  if (wheat < 2) {
    p.body.appendChild(el('p', 'lead', tr(wheat === 1 ? 'mill.oneWheat' : 'mill.noWheat')));
    const r = p.row(); r.appendChild(p.button(tr('ui.alright'), 'soft', () => p.close()));
    return;
  }

  const cv = makeCanvas(400, 240);
  p.body.appendChild(cv.canvas);

  let angle = 0, turned = 0, last = null, flour = 0, baking = 0, done = false;
  const NEEDED = Math.PI * 6;         // three full turns

  onPointer(cv.canvas, 400, 240, {
    down(pt) { last = pt; },
    move(pt) {
      if (!last || flour >= 1) return;
      const cx = 150, cy = 120;
      const a0 = Math.atan2(last.y - cy, last.x - cx);
      const a1 = Math.atan2(pt.y - cy, pt.x - cx);
      let d = a1 - a0;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      angle += d; turned += Math.abs(d);
      last = pt;
      if (turned >= NEEDED) { flour = 1; bakeBtn.disabled = false; p.readout(tr('mill.flour')); }
      else p.readout(tr('mill.keepTurning', { n: Math.round((turned / NEEDED) * 100) }));
    },
    up() { last = null; },
  });

  const row = p.row();
  const bakeBtn = p.button(tr('mill.bake'), '', () => {
    if (done || flour < 1) return;
    done = true; baking = 0.0001; bakeBtn.disabled = true;
  });
  bakeBtn.disabled = true;
  row.appendChild(bakeBtn);
  const back = p.button(tr('ui.later'), 'soft', () => { stop(); p.close(); });
  back.style.flex = '0 0 auto';
  row.appendChild(back);
  p.readout(tr('mill.turn'));

  function draw(t) {
    const ctx = cv.ctx;
    ctx.clearRect(0, 0, 400, 240);
    ctx.fillStyle = '#efe4cd'; ctx.fillRect(0, 0, 400, 240);

    // hopper
    ctx.fillStyle = '#b5946a';
    ctx.beginPath(); ctx.moveTo(120, 20); ctx.lineTo(180, 20); ctx.lineTo(162, 56); ctx.lineTo(138, 56); ctx.closePath(); ctx.fill();
    ctx.font = '18px system-ui, "Apple Color Emoji", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('🌾🌾', 150, 40);

    // millstone
    ctx.save();
    ctx.translate(150, 120); ctx.rotate(angle);
    ctx.fillStyle = '#a9a49b';
    ctx.beginPath(); ctx.arc(0, 0, 56, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8b867e';
    for (let i = 0; i < 8; i++) {
      ctx.save(); ctx.rotate(i * Math.PI / 4);
      ctx.fillRect(-2.5, -54, 5, 44); ctx.restore();
    }
    ctx.fillStyle = '#6f6a63';
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a5c30';
    rr(ctx, 30, -6, 26, 12, 5); ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(67,55,42,.25)'; ctx.lineWidth = 2;
    ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.arc(150, 120, 70, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    // flour chute + oven
    ctx.fillStyle = '#c9b38c'; rr(ctx, 210, 150, 150, 12, 5); ctx.fill();
    if (flour >= 1) {
      ctx.fillStyle = '#f3ecdc';
      ctx.beginPath(); ctx.ellipse(255, 146, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#9a6b4c';
    rr(ctx, 285, 78, 82, 72, 10); ctx.fill();
    ctx.fillStyle = baking > 0 ? '#f0a34a' : '#5a3f2c';
    rr(ctx, 297, 96, 58, 44, 8); ctx.fill();
    ctx.font = '24px system-ui, "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (baking > 0.55) ctx.fillText('🍞🍞🍞', 326, 118);
    else if (baking > 0) ctx.fillText('🔥', 326, 118);

    if (turned < NEEDED) {
      ctx.font = '600 12px -apple-system, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(67,55,42,.6)';
      ctx.fillText(tr('mill.turnMe'), 150, 196);
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
        row.appendChild(p.button(tr('mill.take'), 'go', () => { stop(); p.close(); }));
      }
    }
    draw(t);
  });
}
