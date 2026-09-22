// Fishing from the boat.
//
// One rule, and it is the whole game: the float sits still, then it goes
// under. Tap while it is under and there is a fish on the line. Tap early and
// the line comes up empty. Three casts, then row back.

import { openPanel, makeCanvas, onPointer, loop } from '../ui/overlay.js';
import { C, rr, glyph } from '../render/art.js';
import { tr, trn } from '../core/i18n.js';
import { riverClean } from '../core/world.js';

const W = 420,
  H = 300;
const BITE_MS = 950; // how long a fish stays interested

export function openFish(game, _boat) {
  // Closing this from outside — Escape, the day turning — has to stop the
  // loop and let go of the test-only handle exactly as rowing back does, so
  // it goes here rather than only in that button's own click handler.
  const p = openPanel({
    title: tr('fish.title'),
    lead: tr('fish.lead'),
    onClose: () => {
      stop();
      game._fish = null;
    },
  });

  const cv = makeCanvas(W, H);
  p.body.appendChild(cv.canvas);

  // a river nobody has spoiled is a river with more in it
  const clean = riverClean(game.world);
  let casts = clean ? 4 : 3,
    caught = 0;
  let phase = 'ready'; // ready → waiting → bite → (ready | over)
  let timer = 0,
    dip = 0,
    biteT = 0,
    splash = 0;
  let float = { x: 250, y: 200 };

  // so a test can wait for the bite instead of guessing at the timer; it
  // goes away the moment the boat comes in, which is also how a test knows
  // to stop
  const publish = () => {
    game._fish = { phase: phase, casts: casts, caught: caught };
  };
  publish();

  p.readout(
    (clean ? tr('fish.clean') + ' ' : '') +
      tr('fish.cast') +
      ' ' +
      trn('fish.casts', casts, { n: casts }),
  );

  onPointer(cv.canvas, W, H, {
    down(pt) {
      if (phase === 'ready') {
        if (pt.y < 120) return; // that is the sky
        float = {
          x: Math.max(150, Math.min(W - 30, pt.x)),
          y: Math.max(150, Math.min(H - 40, pt.y)),
        };
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
    publish();
  }

  function spend() {
    casts--;
    if (casts <= 0) {
      phase = 'over';
      publish();
      finish();
    } else {
      phase = 'ready';
      publish();
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
    offerBasket();
  }

  const row = p.row();

  /**
   * The catch lands in the angler's own hands (fish.catch), not the village
   * basket — so offer the same trip a normal Give does, right here, instead
   * of sending them off to find it. One tap, one dispatch, then it is gone:
   * a second tap must never send the fish twice.
   */
  function offerBasket() {
    const have = game.world.players[game.role].res.fish || 0;
    const n = Math.min(caught, have);
    if (n <= 0) return;
    let given = false;
    const btn = p.button('🐟 ' + tr('give.basket'), 'soft', () => {
      if (given) return;
      given = true;
      game.dispatch({ type: 'larder.give', from: game.role, res: 'fish', n });
      btn.disabled = true;
      p.readout('🐟 ' + tr('msg.inBasket', { n }));
    });
    row.insertBefore(btn, row.firstChild);
  }

  row.appendChild(
    p.button(tr('fish.rowBack'), 'soft', () => {
      if (phase !== 'over') finish();
      p.close(); // the loop and the handle go together, in onClose above
    }),
  );

  function draw(t) {
    const ctx = cv.ctx;
    ctx.clearRect(0, 0, W, H);

    // The sky, the far bank and the water. A scene rather than three stripes:
    // the sky warms toward the horizon, the trees over there are all
    // different, and the water goes from shallow and pale at the far bank to
    // deep and dark down at the boat.
    const sky = ctx.createLinearGradient(0, 0, 0, 120);
    sky.addColorStop(0, '#bcdcf0');
    sky.addColorStop(1, '#e6f1ee');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, 120);
    // two soft clouds and a pair of birds a long way off
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (const [cx, cy, r] of [
      [90, 34, 13],
      [112, 36, 10],
      [300, 24, 11],
      [322, 27, 8],
      [283, 28, 8],
    ]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(90,110,120,.5)';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    for (const [bx, by, sz] of [
      [210, 42, 5],
      [232, 52, 4],
    ]) {
      ctx.beginPath();
      ctx.moveTo(bx - sz, by);
      ctx.quadraticCurveTo(bx - sz / 2, by - sz * 0.7, bx, by);
      ctx.quadraticCurveTo(bx + sz / 2, by - sz * 0.7, bx + sz, by);
      ctx.stroke();
    }

    // the far bank: a strip of grass with a shaded lip where it drops in
    ctx.fillStyle = '#8ec96f';
    ctx.fillRect(0, 96, W, 28);
    ctx.fillStyle = 'rgba(70,52,34,.16)'; // the lip where the bank drops in
    ctx.fillRect(0, 118, W, 6);
    // trees over there, no two the same, each on its own trunk
    for (let i = 0; i < 11; i++) {
      const tx = 14 + i * 40 + ((i * 37) % 11);
      const k = (i * 7) % 3;
      const r = 9 + ((i * 13) % 6);
      ctx.strokeStyle = '#7a5433';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(tx, 104);
      ctx.lineTo(tx, 96 - r * 0.4);
      ctx.stroke();
      ctx.fillStyle = k === 0 ? C.forestDark : k === 1 ? C.forest : '#59994a';
      ctx.beginPath();
      ctx.arc(tx, 96 - r * 0.6, r, 0, Math.PI * 2);
      ctx.arc(tx - r * 0.6, 99 - r * 0.4, r * 0.7, 0, Math.PI * 2);
      ctx.arc(tx + r * 0.6, 99 - r * 0.4, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.2)';
      ctx.beginPath();
      ctx.arc(tx - r * 0.35, 94 - r * 0.7, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    // reeds along the edge of it, down in the shallows
    ctx.strokeStyle = 'rgba(96,140,78,.85)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 18; i++) {
      const rx = 8 + i * 24 + ((i * 17) % 9);
      const rh = 9 + ((i * 11) % 8);
      const lean = Math.sin(t * 0.0008 + i) * 1.6;
      ctx.beginPath();
      ctx.moveTo(rx, 126);
      ctx.quadraticCurveTo(rx + lean, 126 - rh * 0.6, rx + lean * 1.6, 126 - rh);
      ctx.stroke();
    }

    const deep = ctx.createLinearGradient(0, 120, 0, H);
    deep.addColorStop(0, C.waterLite);
    deep.addColorStop(0.35, C.water);
    deep.addColorStop(1, C.waterDeep);
    ctx.fillStyle = deep;
    ctx.fillRect(0, 120, W, H - 120);
    // the far bank, upside down in the water, before anything ripples it
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = C.forestDark;
    for (let i = 0; i < 11; i++) {
      const tx = 14 + i * 40 + ((i * 37) % 11);
      const r = 9 + ((i * 13) % 6);
      ctx.beginPath();
      ctx.ellipse(tx, 126 + r * 0.3, r * 1.1, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const wy = 132 + ((i * 29) % (H - 140));
      const wx = (i * 71 + Math.sin(t * 0.0012 + i) * 12) % W;
      // a ripple is longer and fainter the further off it is
      ctx.globalAlpha = 0.3 + ((wy - 120) / (H - 120)) * 0.5;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + 12 + (wy - 120) / 8, wy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // the boat, seen from behind, with a rod
    const bob = Math.sin(t * 0.0018) * 2.5;
    ctx.save();
    ctx.translate(78, 214 + bob);
    ctx.fillStyle = 'rgba(30,70,95,.22)'; // what it does to the water under it
    ctx.beginPath();
    ctx.ellipse(0, 22, 48, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8f5a2e'; // the hull, dark down at the waterline
    ctx.beginPath();
    ctx.moveTo(-46, -14);
    ctx.lineTo(46, -14);
    ctx.quadraticCurveTo(34, 20, 0, 20);
    ctx.quadraticCurveTo(-34, 20, -46, -14);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#b8763f';
    ctx.fillRect(-46, -14, 92, 16);
    ctx.fillStyle = '#c98b4c'; // and lighter where the sun is on it
    ctx.fillRect(-46, -14, 92, 7);
    // the planks the hull is built from
    ctx.strokeStyle = 'rgba(70,45,26,.3)';
    ctx.lineWidth = 1;
    for (const py of [-6, 2, 10]) {
      ctx.beginPath();
      ctx.moveTo(-46, py);
      ctx.quadraticCurveTo(0, py + 5, 46, py);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#8a5c30'; // the gunwale, and a shine along the top of it
    rr(ctx, -46, -18, 92, 6, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,210,.3)';
    rr(ctx, -46, -18, 92, 2.4, 1.2);
    ctx.fill();
    ctx.fillStyle = '#e6d3ab'; // the thwart
    rr(ctx, -22, -12, 44, 6, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,92,54,.3)';
    rr(ctx, -22, -8, 44, 2, 1);
    ctx.fill();
    // an oar shipped along the near side, with its blade out over the water
    ctx.save();
    ctx.rotate(-0.06);
    ctx.fillStyle = '#c9a678';
    rr(ctx, -52, -22, 46, 3.4, 1.7);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-56, -20.2, 7, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // a pail on the floorboards, for whatever comes aboard
    ctx.fillStyle = '#7f9aa8';
    rr(ctx, 26, -14, 14, 11, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    rr(ctx, 26, -14, 5, 11, 2);
    ctx.fill();
    ctx.strokeStyle = '#6d8592';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(33, -14, 7, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // whoever took the boat out, sitting on the bench, rod in hand
    ctx.save();
    ctx.translate(84, 200 + bob);
    const coat = '#5d9150';
    ctx.strokeStyle = '#6b5540';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-3, 4);
    ctx.lineTo(-4, 10);
    ctx.moveTo(2, 4);
    ctx.lineTo(3, 10);
    ctx.stroke();
    ctx.fillStyle = coat;
    rr(ctx, -6, -12, 12, 16, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.2)'; // lit down the left, hemmed below
    rr(ctx, -6, -12, 4.4, 16, 3.4);
    ctx.fill();
    ctx.fillStyle = 'rgba(40,70,36,.5)';
    ctx.fillRect(-6, 1.6, 12, 2.4);
    ctx.strokeStyle = coat;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(4, -6);
    ctx.lineTo(10, 6);
    ctx.stroke();
    ctx.fillStyle = '#f0d0ac';
    ctx.beginPath();
    ctx.arc(10, 6, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -16, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(70,50,35,.85)';
    ctx.beginPath();
    ctx.arc(-1, -17, 5.2, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    ctx.fillStyle = C.ink; // an eye on the float, where it should be
    ctx.beginPath();
    ctx.arc(2.6, -15.4, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(232,148,136,.35)';
    ctx.beginPath();
    ctx.ellipse(4, -13.4, 1.4, 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // the rod and line
    const rodX = 108,
      rodY = 190 + bob;
    // a rod thick at the butt and thin at the tip, whipped where the reel sits
    ctx.strokeStyle = C.woodDark;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rodX - 16, rodY + 18);
    ctx.lineTo(rodX + 9, rodY - 8);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(rodX + 9, rodY - 8);
    ctx.quadraticCurveTo(rodX + 24, rodY - 22, rodX + 34, rodY - 34);
    ctx.stroke();
    ctx.strokeStyle = '#d8c39b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rodX - 3, rodY + 5);
    ctx.lineTo(rodX + 1, rodY + 1);
    ctx.stroke();
    ctx.fillStyle = '#8a7a63';
    ctx.beginPath();
    ctx.arc(rodX - 6, rodY + 10, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b9b3a8';
    ctx.beginPath();
    ctx.arc(rodX - 6, rodY + 10, 1.2, 0, Math.PI * 2);
    ctx.fill();
    const fy = float.y + (phase === 'bite' ? dip * 9 : Math.sin(t * 0.003) * 1.6);
    if (phase !== 'ready') {
      ctx.strokeStyle = 'rgba(255,255,255,.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rodX + 34, rodY - 34);
      ctx.quadraticCurveTo((rodX + float.x) / 2, rodY - 10, float.x, fy);
      ctx.stroke();

      // the float: a red cap, a white belly, a little stem on top, and one
      // white glint — which is the bit your eye is actually watching
      ctx.strokeStyle = '#6b5540';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(float.x, fy - 6);
      ctx.lineTo(float.x, fy - 11);
      ctx.stroke();
      ctx.fillStyle = '#fffdf8';
      ctx.beginPath();
      ctx.ellipse(float.x, fy + 3, 5, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(150,140,125,.3)';
      ctx.beginPath();
      ctx.ellipse(float.x + 1.6, fy + 3.6, 3.4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = phase === 'bite' ? '#e0553f' : '#c05b4d';
      ctx.beginPath();
      ctx.arc(float.x, fy - 2, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,160,140,.6)';
      ctx.beginPath();
      ctx.arc(float.x - 1.4, fy - 3.4, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.arc(float.x - 2, fy - 4, 1, 0, Math.PI * 2);
      ctx.fill();

      // rings on the water where the line goes in
      ctx.strokeStyle = 'rgba(255,255,255,' + (phase === 'bite' ? 0.85 : 0.4) + ')';
      ctx.lineWidth = 1.4;
      const r = 8 + ((t * 0.03) % 16);
      ctx.beginPath();
      ctx.ellipse(float.x, fy + 4, r, r * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
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
      rr(ctx, W / 2 - 84, 140, 168, 30, 15);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.font = '700 13px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tr('fish.cast'), W / 2, 156);
    }
  }

  const stop = loop((t, dt) => {
    cv.fit();
    if (splash > 0) splash = Math.max(0, splash - dt / 600);
    if (phase === 'waiting') {
      timer -= dt;
      if (timer <= 0) {
        phase = 'bite';
        timer = BITE_MS;
        biteT = 0;
        publish();
      }
    } else if (phase === 'bite') {
      timer -= dt;
      biteT += dt;
      dip = Math.min(1, biteT / 200); // ducks under fast, then stays under
      if (timer <= 0) missed();
    }
    draw(t);
  });
}
