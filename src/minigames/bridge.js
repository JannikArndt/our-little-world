// Building the bridge.
// One rule, discovered by trying: a beam can reach two gaps on its own.
// Three and it sags. Four and it goes in the river.

import { el, openPanel, makeCanvas, onPointer, loop, message } from '../ui/overlay.js';
import { C, rr } from '../render/art.js';

const PIER_STONE = 2;

export function openBridge(game) {
  const w = game.world;
  const site = w.bridge.site;
  const N = site.span;                    // water columns to cross
  const p = openPanel({
    title: w.bridge.built ? '🌉 The bridge' : '🌉 Crossing the river',
    lead: 'Tap the water to stand a pier there. Then see whether it holds.',
  });

  const cv = makeCanvas(480, 206);
  p.body.appendChild(cv.canvas);

  const piers = {};                       // column -> true
  let test = null;                        // {t, walker, verdict, broke}
  let built = false;

  const X0 = 62, X1 = 418, DECK = 74;
  const px = (i) => X0 + ((X1 - X0) / (N + 1)) * i;

  onPointer(cv.canvas, 480, 206, {
    down(pt) {
      if (built) return;
      let best = -1, bd = 1e9;
      for (let i = 1; i <= N; i++) {
        const d = Math.abs(pt.x - px(i));
        if (d < bd) { bd = d; best = i; }
      }
      if (bd > 34) return;
      if (piers[best]) delete piers[best]; else piers[best] = true;
      test = null;
      update();
    },
  });

  function supports() {
    const s = [0];
    for (let i = 1; i <= N; i++) if (piers[i]) s.push(i);
    s.push(N + 1);
    return s;
  }
  function spans() {
    const s = supports(), out = [];
    for (let i = 1; i < s.length; i++) out.push({ a: s[i - 1], b: s[i], d: s[i] - s[i - 1] });
    return out;
  }
  function cost() {
    const nPiers = Object.keys(piers).length;
    return { stone: nPiers * PIER_STONE, plank: N + 1 };
  }
  function verdict() {
    const sp = spans();
    if (sp.some(s => s.d >= 4)) return 'breaks';
    if (sp.some(s => s.d === 3)) return 'creaky';
    return 'strong';
  }

  const row = p.row();
  const testBtn = p.button('👣 Try it', 'soft', () => {
    if (built) return;
    test = { t: 0, verdict: verdict(), broke: null };
  });
  const buildBtn = p.button('Build it', 'go', () => {
    const c = cost(), v = verdict();
    if (v === 'breaks' || built) return;
    const me = w.players[game.role].res;
    if (me.plank < c.plank || me.stone < c.stone) { askForParts(); return; }
    built = true;
    game.dispatch({
      type: 'bridge.build', role: game.role,
      planks: c.plank, stone: c.stone,
      quality: v === 'strong' ? 3 : 2,
    });
    stop(); p.close();
    message(v === 'strong' ? '🌉 It holds. Solid as anything.' : '🌉 It holds — with a bit of a creak.');
    game.look(site.x0 + site.span / 2, site.row + 1);
  });
  row.appendChild(testBtn);
  row.appendChild(buildBtn);
  const back = p.button('Later', 'soft', () => { stop(); p.close(); });
  back.style.flex = '0 0 auto';
  row.appendChild(back);

  function askForParts() {
    p.readout('Not enough yet. The grey ones are what is missing.');
    if (!p._askBtn) {
      p._askBtn = p.button('🙋 Ask for it', 'soft', () => {
        game.dispatch({ type: 'ask', from: game.role, to: game.other, cap: 'bridge', targetId: null });
        message('Asked for the missing pieces.');
      });
      p._askBtn.style.flex = '0 0 auto';
      row.insertBefore(p._askBtn, back);
    }
  }

  function update() {
    const c = cost(), v = verdict(), sp = spans();
    const me = w.players[game.role].res;
    const lens = sp.map(s => s.d).join(' + ');
    let msg = 'Beams: <b>' + lens + '</b>';
    if (v === 'breaks') msg += ' — one of those is far too long.';
    else if (v === 'creaky') msg += ' — one is a bit of a stretch.';
    else msg += ' — every beam is short enough.';
    p.readout(msg);
    p.cost([
      { icon: '🪚', need: c.plank, have: me.plank },
      { icon: '🪨', need: c.stone, have: me.stone },
    ]);
    buildBtn.disabled = v === 'breaks';
    buildBtn.textContent = v === 'creaky' ? 'Build it anyway' : 'Build it';
  }
  update();

  /* ---------------- drawing ---------------- */

  function sagOf(d, load) {
    if (d <= 2) return 0.6 * load;
    if (d === 3) return 5 * load;
    return 26 * load;
  }

  function draw(t) {
    const ctx = cv.ctx;
    ctx.clearRect(0, 0, 480, 206);
    ctx.fillStyle = '#cfe6f2'; ctx.fillRect(0, 0, 480, 88);
    ctx.fillStyle = C.water; ctx.fillRect(0, 88, 480, 118);
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const y = 108 + i * 15, ph = t * 0.0012 + i;
      ctx.beginPath();
      ctx.moveTo(40 + Math.sin(ph) * 10, y); ctx.lineTo(76 + Math.sin(ph) * 10, y);
      ctx.moveTo(300 + Math.cos(ph) * 10, y + 6); ctx.lineTo(340 + Math.cos(ph) * 10, y + 6);
      ctx.stroke();
    }
    // banks
    ctx.fillStyle = C.sand;
    ctx.beginPath(); ctx.moveTo(0, 66); ctx.lineTo(X0 + 4, 72); ctx.lineTo(X0 + 4, 206); ctx.lineTo(0, 206); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(480, 66); ctx.lineTo(X1 - 4, 72); ctx.lineTo(X1 - 4, 206); ctx.lineTo(480, 206); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.grass;
    ctx.fillRect(0, 54, X0 + 4, 14); ctx.fillRect(X1 - 4, 54, 480 - X1 + 4, 14);

    const load = test ? Math.min(1, test.t * 1.4) : 0.25;

    // piers
    for (let i = 1; i <= N; i++) {
      if (!piers[i]) {
        ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 0.004 + i);
        ctx.fillStyle = '#fff';
        rr(ctx, px(i) - 11, DECK + 6, 22, 46, 6); ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.fillStyle = C.stone;
      rr(ctx, px(i) - 12, DECK + 4, 24, 62, 5); ctx.fill();
      ctx.fillStyle = C.stoneDark;
      for (let r = 0; r < 4; r++) rr(ctx, px(i) - 11, DECK + 8 + r * 15, 22, 4, 2), ctx.fill();
    }

    // deck
    const sp = spans();
    for (const s of sp) {
      const ax = px(s.a), bx = px(s.b);
      const broke = test && test.broke === s.a;
      const sag = broke ? 60 * Math.min(1, (test.t - 0.5) * 2) : sagOf(s.d, load);
      ctx.strokeStyle = broke ? '#8a5c30' : C.wood;
      ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax, DECK);
      ctx.quadraticCurveTo((ax + bx) / 2, DECK + sag * 2, bx, DECK);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ax, DECK - 2);
      ctx.quadraticCurveTo((ax + bx) / 2, DECK + sag * 2 - 2, bx, DECK - 2);
      ctx.stroke();
      if (!test) {
        ctx.fillStyle = s.d >= 4 ? '#c05b4d' : s.d === 3 ? '#c88a2f' : 'rgba(67,55,42,.55)';
        ctx.font = '700 12px -apple-system, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(s.d), (ax + bx) / 2, DECK - 16);
      }
    }

    // the abutment posts
    ctx.fillStyle = C.woodDark;
    rr(ctx, X0 - 8, DECK - 4, 12, 26, 3); ctx.fill();
    rr(ctx, X1 - 4, DECK - 4, 12, 26, 3); ctx.fill();

    // the volunteer
    if (test) {
      const seg = sp.find(s => px(s.a) <= test.walker && px(s.b) >= test.walker) || sp[0];
      const u = seg ? (test.walker - px(seg.a)) / (px(seg.b) - px(seg.a)) : 0;
      const sag = test.broke === seg.a
        ? 60 * Math.min(1, Math.max(0, (test.t - 0.5) * 2))
        : sagOf(seg.d, Math.sin(u * Math.PI));
      const wy = DECK + sag * 2 * (u * (1 - u) * 4) - 2;
      const fall = test.broke === seg.a && test.t > 0.62 ? (test.t - 0.62) * 320 : 0;
      ctx.font = '26px system-ui, "Apple Color Emoji", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.save();
      ctx.translate(test.walker, wy + fall);
      if (fall) ctx.rotate(fall * 0.02);
      ctx.fillText('🧍', 0, 0);
      ctx.restore();
      if (fall > 40) {
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(test.walker, 130, 14 + fall * 0.2, 6 + fall * 0.06, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }

    ctx.fillStyle = 'rgba(67,55,42,.5)';
    ctx.font = '600 11px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('tap the water to add or remove a pier', 8, 8);
  }

  const stop = loop((t, dt) => {
    cv.fit();
    if (test) {
      test.t += dt / 2600;
      test.walker = X0 + (X1 - X0) * Math.min(1, test.t);
      if (test.broke === null) {
        const sp = spans();
        const bad = sp.find(s => s.d >= 4 && test.walker > px(s.a) + 20);
        if (bad) {
          test.broke = bad.a;
          test.t = 0.45;
          setTimeout(() => {
            message('💦 SPLASH. Everybody is fine. The planks floated to the bank.');
            p.readout('That beam had to reach <b>' + bad.d + '</b> gaps on its own. Try a pier under it.');
            test = null;
          }, 1500);
        }
      }
      if (test && test.t >= 1.05 && test.broke === null) {
        p.readout(test.verdict === 'strong'
          ? '<b>Not a wobble.</b> Every beam is short enough.'
          : '<b>It creaked, but it held.</b> One beam is a bit of a stretch.');
        test = null;
      }
    }
    draw(t);
  });
}

/** Mending the bridge after the wind has had a go at it. */
export function openRepair(game) {
  const p = openPanel({
    title: '🔧 Mending the bridge',
    lead: 'One plank is missing. One plank will fix it.',
    center: true,
  });
  const have = game.world.players[game.role].res.plank;
  const r = p.row();
  if (have >= 1) {
    r.appendChild(p.button('🪚 Put a plank back', 'go', () => {
      game.dispatch({ type: 'bridge.repair', role: game.role });
      p.close();
      message('🌉 Mended. People are crossing again.');
    }));
  } else {
    p.body.appendChild(el('p', 'lead center', 'You have no planks. The sawmill turns wood into planks.'));
  }
  r.appendChild(p.button('Later', 'soft', () => p.close()));
}
