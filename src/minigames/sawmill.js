// The workshop. Two machines that turn one thing into another.
//   sawmill: wood -> planks   (cut the log into equal pieces)
//   mill:    wheat -> bread   (turn the stone, then bake)

import { el, openPanel, makeCanvas, onPointer, loop, message } from '../ui/overlay.js';
import { C, rr } from '../render/art.js';
import { tr, trn } from '../core/i18n.js';

const LOG_UNITS = 12;
const MIN_PLANK = 3;

/* ------------------------------------------------------------------ */
/* sawmill                                                            */
/* ------------------------------------------------------------------ */

export function openSawmill(game) {
  const w = game.world;
  const have = w.players[game.role].res.wood;
  const p = openPanel({ title: tr('saw.title'), lead: tr('saw.lead') });

  if (have < 1) {
    p.body.appendChild(el('p', 'lead', tr('saw.noWood')));
    const r = p.row(); r.appendChild(p.button(tr('ui.alright'), 'soft', () => p.close()));
    return;
  }

  const cv = makeCanvas(480, 200);
  p.body.appendChild(cv.canvas);

  let cuts = [];              // unit positions, 1..11
  let sawing = 0;             // 0..1 blade sweep
  let result = null;

  const X0 = 40, X1 = 440, Y = 92, U = (X1 - X0) / LOG_UNITS;

  onPointer(cv.canvas, 480, 200, {
    down(pt) {
      if (result || sawing) return;
      const u = Math.round((pt.x - X0) / U);
      if (u < 1 || u > LOG_UNITS - 1) return;
      const i = cuts.indexOf(u);
      if (i >= 0) cuts.splice(i, 1);
      else if (cuts.length < 3) cuts.push(u);
      cuts.sort((a, b) => a - b);
      describe();
    },
  });

  function pieces() {
    const edges = [0].concat(cuts, [LOG_UNITS]);
    const out = [];
    for (let i = 1; i < edges.length; i++) out.push(edges[i] - edges[i - 1]);
    return out;
  }

  function describe() {
    const ps = pieces();
    if (!cuts.length) { p.readout(tr('saw.place')); sawBtn.disabled = true; return; }
    sawBtn.disabled = false;
    const good = ps.filter(n => n >= MIN_PLANK).length;
    const even = ps.every(n => n === ps[0]);
    p.readout(tr('saw.pieces', {
      lens: ps.join(' + '), total: LOG_UNITS,
      result: good ? trn('saw.planks', good, { n: good }) : tr('saw.noPlanks'),
    }) + (even ? tr('saw.even') : ''));
  }

  const row = p.row();
  const sawBtn = p.button(tr('saw.go'), '', () => {
    if (result || sawing) return;
    sawing = 0.0001;
    sawBtn.disabled = true;
  });
  sawBtn.disabled = true;
  row.appendChild(sawBtn);
  const back = p.button(tr('ui.notNow'), 'soft', () => { stop(); p.close(); });
  back.style.flex = '0 0 auto';
  row.appendChild(back);

  describe();

  function drawLog(t) {
    const ctx = cv.ctx;
    ctx.clearRect(0, 0, 480, 200);
    ctx.fillStyle = '#efe4cd'; ctx.fillRect(0, 0, 480, 200);

    // bench
    ctx.fillStyle = '#c9b38c'; rr(ctx, 20, 120, 440, 18, 6); ctx.fill();

    const ps = pieces();
    let x = X0;
    const gap = result ? Math.min(10, sawing * 10) : 0;
    for (let i = 0; i < ps.length; i++) {
      const wgt = ps[i] * U;
      const ok = ps[i] >= MIN_PLANK;
      const drop = result && !ok ? Math.min(26, sawing * 40) : 0;
      ctx.save();
      ctx.translate(i * gap, drop);
      ctx.fillStyle = ok ? C.wood : '#8e7550';
      rr(ctx, x, Y - 16, wgt - 1, 32, 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      rr(ctx, x + 2, Y - 13, wgt - 5, 8, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,45,.35)'; ctx.lineWidth = 1;
      for (let g = 0; g < 3; g++) {
        ctx.beginPath();
        ctx.moveTo(x + 4, Y - 8 + g * 8); ctx.lineTo(x + wgt - 5, Y - 8 + g * 8 + (g === 1 ? 2 : 0));
        ctx.stroke();
      }
      if (result) {
        ctx.font = '700 13px -apple-system, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = ok ? '#fffdf8' : 'rgba(255,255,255,.7)';
        ctx.fillText(ok ? '🪚' : '🔥', x + wgt / 2, Y);
      }
      ctx.restore();
      x += wgt;
    }

    // the ruler
    ctx.strokeStyle = 'rgba(67,55,42,.35)'; ctx.lineWidth = 1;
    ctx.font = '10px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(67,55,42,.6)';
    for (let u = 0; u <= LOG_UNITS; u++) {
      const px = X0 + u * U;
      ctx.beginPath(); ctx.moveTo(px, Y + 20); ctx.lineTo(px, Y + 20 + (u % 3 === 0 ? 8 : 4)); ctx.stroke();
      if (u % 3 === 0) ctx.fillText(String(u), px, Y + 31);
    }

    // pending cut marks
    if (!result) {
      for (const u of cuts) {
        const px = X0 + u * U;
        ctx.strokeStyle = '#c05b4d'; ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(px, Y - 24); ctx.lineTo(px, Y + 24); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // the blade sweeping across
    if (sawing > 0 && sawing < 1) {
      const bx = X0 - 30 + (X1 - X0 + 60) * sawing;
      ctx.save();
      ctx.translate(bx, Y - 40);
      ctx.fillStyle = '#cfd4d8';
      rr(ctx, -5, 0, 10, 60, 3); ctx.fill();
      ctx.fillStyle = '#8e959b';
      for (let i = 0; i < 8; i++) ctx.fillRect(-6, 6 + i * 7, 12, 2);
      ctx.restore();
      ctx.fillStyle = 'rgba(220,200,150,.8)';
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + sawing * 12;
        ctx.beginPath();
        ctx.arc(bx + Math.cos(a) * 16, Y + 18 + Math.sin(a) * 10, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const stop = loop((t, dt) => {
    cv.fit();
    if (sawing > 0 && sawing < 1.6) {
      sawing += dt / 900;
      if (sawing >= 1 && !result) settle();
    }
    drawLog(t);
  });

  function settle() {
    const ps = pieces();
    const planks = Math.min(3, ps.filter(n => n >= MIN_PLANK).length);
    const even = ps.every(n => n === ps[0]) && planks === ps.length;
    result = { planks: Math.max(1, planks), even };
    game.dispatch({ type: 'saw.run', role: game.role, wood: 1, planks: result.planks });

    const scraps = ps.length - planks;
    p.readout(even
      ? tr('saw.perfect', { count: ps.length, size: ps[0], planks: result.planks })
      : tr(scraps === 1 ? 'saw.mixed1' : 'saw.mixed', { planks: result.planks, scraps: scraps }));

    row.innerHTML = '';
    const left = game.world.players[game.role].res.wood;
    if (left > 0) {
      row.appendChild(p.button(tr('saw.sameAgain', { n: Math.min(4, left) }), 'go', () => {
        const n = Math.min(4, game.world.players[game.role].res.wood);
        for (let i = 0; i < n; i++) game.dispatch({ type: 'saw.run', role: game.role, wood: 1, planks: result.planks });
        stop(); p.close();
        message(tr('msg.morePlanks', { n: n * result.planks }));
      }));
    }
    row.appendChild(p.button(tr('ui.done'), 'soft', () => { stop(); p.close(); }));
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
