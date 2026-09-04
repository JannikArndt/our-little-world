// Looking after an animal.
// Nothing is written down. You look at the sheep and work out what it wants.

import { openPanel, makeCanvas, onPointer, loop } from '../ui/overlay.js';
import { drawSheep, rr, glyph } from '../render/art.js';
import { tr } from '../core/i18n.js';

const ITEMS = [
  { key: 'hay',   icon: '🌾' },
  { key: 'water', icon: '🪣' },
  { key: 'shear', icon: '✂️' },
  { key: 'pet',   icon: '🤚' },
];

const WRONG = { hay: 'care.wrongHay', water: 'care.wrongWater', shear: 'care.wrongShear' };

export function openCare(game, sheep) {
  const p = openPanel({ title: '🐑 ' + sheep.name, lead: tr('care.lead') });

  const cv = makeCanvas(420, 300);
  p.body.appendChild(cv.canvas);

  const slots = ITEMS.map((it, i) => Object.assign({}, it,
    { hx: 60 + i * 100, hy: 258, x: 60 + i * 100, y: 258, held: false }));
  let dragging = null, moved = 0, shake = 0, joy = 0;
  let flying = null;                 // an item on its way over to her

  onPointer(cv.canvas, 420, 300, {
    down(pt) {
      moved = 0;
      for (const s of slots) {
        if (Math.abs(pt.x - s.x) < 36 && Math.abs(pt.y - s.y) < 36) { dragging = s; s.held = true; return; }
      }
    },
    move(pt) {
      if (!dragging) return;
      moved += Math.abs(pt.x - dragging.x) + Math.abs(pt.y - dragging.y);
      dragging.x = pt.x; dragging.y = pt.y;
    },
    up(pt) {
      if (!dragging) return;
      const d = dragging;
      dragging = null; d.held = false;
      const onSheep = Math.abs(pt.x - 200) < 110 && Math.abs(pt.y - 130) < 100;
      d.x = d.hx; d.y = d.hy;
      // a tap is enough; dragging it onto her works too
      if (moved < 14 || onSheep) send(d);
    },
  });

  /** Take it over to her, then see what she makes of it. */
  function send(item) {
    if (flying) return;
    flying = { icon: item.icon, key: item.key, x: item.hx, y: item.hy, t: 0 };
  }

  function need() {
    const s = game.world.sheep.find(x => x.id === sheep.id) || sheep;
    if (s.thirst > 70) return 'water';
    if (s.hunger > 70) return 'hay';
    if (s.fluff > 88) return 'shear';
    return null;
  }

  function resolve(key) {
    const s = game.world.sheep.find(x => x.id === sheep.id) || sheep;
    if (key === 'pet') {
      joy = 1;
      game.dispatch({ type: 'sheep.care', role: game.role, sheepId: s.id, item: 'pet' });
      p.readout(tr('care.pet.done'));
      return;
    }
    const wanted = need();
    if (key === wanted || (key === 'shear' && s.fluff > 70)) {
      joy = 1;
      game.dispatch({ type: 'sheep.care', role: game.role, sheepId: s.id, item: key });
      p.readout(tr(key === 'shear' ? 'care.sheared' : key === 'water' ? 'care.drank' : 'care.ate'));
      setTimeout(refreshHint, 900);
    } else {
      shake = 1;
      p.readout(tr(WRONG[key] || 'care.notInterested'));
    }
  }

  function refreshHint() {
    const n = need();
    p.readout(tr(n ? 'care.stillWants' : 'care.content'));
  }
  refreshHint();

  const row = p.row();
  row.appendChild(p.button(tr('ui.done'), 'soft', () => { stop(); p.close(); }));

  function draw(t) {
    const ctx = cv.ctx;
    const s = game.world.sheep.find(x => x.id === sheep.id) || sheep;
    ctx.clearRect(0, 0, 420, 300);
    ctx.fillStyle = '#d9ecd0'; ctx.fillRect(0, 0, 420, 300);
    ctx.fillStyle = '#c8e0bd'; ctx.fillRect(0, 190, 420, 110);
    ctx.strokeStyle = 'rgba(120,160,110,.5)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const gx = (i * 37) % 420, gy = 196 + (i * 13) % 24;
      ctx.beginPath(); ctx.moveTo(gx, gy + 6); ctx.lineTo(gx + Math.sin(t * 0.002 + i) * 2, gy); ctx.stroke();
    }

    // the sheep, big
    ctx.save();
    ctx.translate(196 + (shake > 0 ? Math.sin(t * 0.05) * 5 * shake : 0), 146);
    ctx.scale(4.7, 4.7);
    drawSheep(ctx, { x: 0, y: 0, facing: 1, fluff: s.fluff, mood: s.mood, hearts: -999, moving: -999 },
              t, game.world.tick, true);
    ctx.restore();

    // what she is telling you, without words
    const n = need();
    if (n) {
      const glyph = n === 'water' ? '💧' : n === 'hay' ? '🌾' : '🧶';
      const bob = Math.sin(t * 0.004) * 3;
      ctx.font = '30px system-ui, "Apple Color Emoji", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,253,248,.95)';
      ctx.strokeStyle = 'rgba(67,55,42,.2)'; ctx.lineWidth = 1.5;
      rr(ctx, 288, 34 + bob, 66, 56, 24); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(281, 95 + bob, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(270, 108 + bob, 3.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.fillText(n === 'water' ? '💧' : n === 'hay' ? '🥱' : '🧶', 321, 62 + bob);
    }
    if (joy > 0) {
      ctx.font = '26px system-ui, "Apple Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.globalAlpha = joy;
      ctx.fillText('💚', 150, 66 - (1 - joy) * 30);
      ctx.fillText('💚', 246, 52 - (1 - joy) * 40);
      ctx.globalAlpha = 1;
    }

    // whatever is on its way over
    if (flying) {
      const e = flying.t;
      const fx2 = flying.x + (200 - flying.x) * e;
      const fy2 = flying.y + (140 - flying.y) * e - Math.sin(e * Math.PI) * 60;
      ctx.save();
      ctx.translate(fx2, fy2);
      ctx.rotate(e * 2.2);
      glyph(ctx, flying.icon, 0, 0, 34);
      ctx.restore();
    }

    // the shelf of things
    ctx.fillStyle = 'rgba(255,253,248,.75)';
    rr(ctx, 8, 226, 404, 64, 16); ctx.fill();
    for (const s2 of slots) {
      ctx.fillStyle = s2.held ? '#f2c14e' : '#fffdf8';
      ctx.strokeStyle = 'rgba(67,55,42,.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s2.x, s2.y, 28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      glyph(ctx, s2.icon, s2.x, s2.y, 26);
    }
  }

  const stop = loop((t, dt) => {
    cv.fit();
    if (shake > 0) shake = Math.max(0, shake - dt / 500);
    if (joy > 0) joy = Math.max(0, joy - dt / 1400);
    if (flying) {
      flying.t += dt / 420;
      if (flying.t >= 1) { const k = flying.key; flying = null; resolve(k); }
    }
    draw(t);
  });
}
