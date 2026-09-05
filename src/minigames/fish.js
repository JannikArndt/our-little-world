// Fishing from the boat.
//
// One rule, and it is the whole game: the float sits still, then it goes
// under. Tap while it is under and there is a fish on the line. Tap early and
// the line comes up empty. Three casts, then row back.

import { openPanel, makeCanvas, onPointer, loop } from '../ui/overlay.js';
import { C, rr, glyph } from '../render/art.js';
import { tr, trn } from '../core/i18n.js';

const W = 420, H = 300;
const CASTS = 3;
const BITE_MS = 950;                 // how long a fish stays interested

export function openFish(game, boat) {
  const p = openPanel({ title: tr('fish.title'), lead: tr('fish.lead') });

  const cv = makeCanvas(W, H);
  p.body.appendChild(cv.canvas);

  let casts = CASTS, caught = 0;
  let phase = 'ready';               // ready → waiting → bite → (ready | over)
  let timer = 0, dip = 0, splash = 0;
  let float = { x: 250, y: 200 };

  p.readout(tr('fish.cast') + ' ' + trn('fish.casts', casts, { n: casts }));

  onPointer(cv.canvas, W, H, {
    down(pt) {
      if (phase === 'ready') {
        if (pt.y < 120) return;                       // that is the sky
        float = { x: Math.max(150, Math.min(W - 30, pt.x)), y: Math.max(150, Math.min(H - 40, pt.y)) };
        cast();
      } else if (phase === 'waiting') {
        tooSoon();
      } else if (phase === 'bite') {
        landIt();
      }
    },
  });

  function cast() {
    phase = 'waiting';
    timer = 900 + Math.random() * 2400;
    splash = 1;
    p.readout(tr('fish.waiting'));
  }

  function spend() {
    casts--;
    if (casts <= 0) {
      phase = 'over';
      finish();
    } else {
      phase = 'ready';
    }
  }

  function tooSoon() {
    dip = 0;
    p.readout(tr('fish.tooSoon') + ' ' + trn('fish.casts', casts - 1, { n: casts - 1 }));
    spend();
  }

  function landIt() {
    caught++;
    dip = 0;
    splash = 1;
    p.readout(tr('fish.got') + ' ' + trn('fish.casts', casts - 1, { n: casts - 1 }));
    spend();
  }

  function missed() {
    dip = 0;
    p.readout(tr('fish.missed') + ' ' + trn('fish.casts', casts - 1, { n: casts - 1 }));
    spend();
  }

  /** Only the outcome travels: one action, whatever happened out here. */
  function finish() {
    game.dispatch({ type: 'fish.catch', role: game.role, n: caught });
    p.readout(caught ? trn('fish.done', caught, { n: caught }) : tr('fish.none'));
  }

  const row = p.row();
  row.appendChild(p.button(tr('fish.rowBack'), 'soft', () => {
    if (phase !== 'over') finish();
    stop();
    p.close();
  }));

  function draw(t) {
    const ctx = cv.ctx;
    ctx.clearRect(0, 0, W, H);

    // sky, far bank, water
    ctx.fillStyle = '#cfe6f2'; ctx.fillRect(0, 0, W, 120);
    ctx.fillStyle = '#8ec96f'; ctx.fillRect(0, 96, W, 28);
    ctx.fillStyle = C.forestDark;
    for (let i = 0; i < 9; i++) {
      const tx = 20 + i * 48;
      ctx.beginPath(); ctx.arc(tx, 100, 12, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = C.water; ctx.fillRect(0, 120, W, H - 120);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const wy = 132 + (i * 29) % (H - 140);
      const wx = ((i * 71) + Math.sin(t * 0.0012 + i) * 12) % W;
      ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + 16, wy); ctx.stroke();
    }

    // the boat, seen from behind, with a rod
    const bob = Math.sin(t * 0.0018) * 2.5;
    ctx.save();
    ctx.translate(78, 214 + bob);
    ctx.fillStyle = '#b8763f';
    ctx.beginPath();
    ctx.moveTo(-46, -14); ctx.lineTo(46, -14);
    ctx.quadraticCurveTo(34, 20, 0, 20); ctx.quadraticCurveTo(-34, 20, -46, -14);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8a5c30'; rr(ctx, -46, -18, 92, 6, 3); ctx.fill();
    ctx.fillStyle = '#e6d3ab'; rr(ctx, -22, -12, 44, 6, 3); ctx.fill();
    ctx.restore();

    // the rod and line
    const rodX = 108, rodY = 190 + bob;
    ctx.strokeStyle = C.woodDark; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(rodX - 16, rodY + 18); ctx.lineTo(rodX + 34, rodY - 34); ctx.stroke();
    const fy = float.y + (phase === 'bite' ? dip * 9 : Math.sin(t * 0.003) * 1.6);
    if (phase !== 'ready') {
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rodX + 34, rodY - 34);
      ctx.quadraticCurveTo((rodX + float.x) / 2, rodY - 10, float.x, fy);
      ctx.stroke();

      // the float: red on top, white under, and it goes down when they bite
      ctx.fillStyle = '#fffdf8';
      ctx.beginPath(); ctx.ellipse(float.x, fy + 3, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = phase === 'bite' ? '#e0553f' : '#c05b4d';
      ctx.beginPath(); ctx.arc(float.x, fy - 2, 5.5, 0, Math.PI * 2); ctx.fill();

      // rings on the water where the line goes in
      ctx.strokeStyle = 'rgba(255,255,255,' + (phase === 'bite' ? 0.85 : 0.4) + ')';
      ctx.lineWidth = 1.4;
      const r = 8 + ((t * 0.03) % 16);
      ctx.beginPath(); ctx.ellipse(float.x, fy + 4, r, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    }

    if (splash > 0) {
      ctx.globalAlpha = splash;
      glyph(ctx, '💦', float.x, fy - 22, 22);
      ctx.globalAlpha = 1;
    }

    // what has been caught so far, along the gunwale
    for (let i = 0; i < caught; i++) glyph(ctx, '🐟', 30 + i * 26, 262, 22);

    if (phase === 'ready' && casts > 0) {
      ctx.fillStyle = 'rgba(255,253,248,.9)';
      rr(ctx, W / 2 - 84, 140, 168, 30, 15); ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.font = '700 13px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(tr('fish.cast'), W / 2, 156);
    }
  }

  const stop = loop((t, dt) => {
    cv.fit();
    if (splash > 0) splash = Math.max(0, splash - dt / 600);
    if (phase === 'waiting') {
      timer -= dt;
      if (timer <= 0) { phase = 'bite'; timer = BITE_MS; }
    } else if (phase === 'bite') {
      timer -= dt;
      dip = 0.5 + 0.5 * Math.sin(t * 0.02);
      if (timer <= 0) missed();
    }
    draw(t);
  });
}
