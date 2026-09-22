// Building the bridge.
// One rule, discovered by trying: a beam can reach two gaps on its own.
// Three and it sags. Four and it goes in the river.

import { el, openPanel, makeCanvas, onPointer, loop, message } from '../ui/overlay.js';
import { C, rr, lite, dusk } from '../render/art.js';
import { tr } from '../core/i18n.js';

const PIER_STONE = 2;

export function openBridge(game) {
  const w = game.world;
  const site = w.bridge.site;
  const N = site.span; // water columns to cross
  // Closing this from outside — Escape, the day turning — has to stop the
  // loop the same way either of its own buttons does, so it goes here.
  const p = openPanel({
    title: tr(w.bridge.built ? 'bridge.titleOld' : 'bridge.titleNew'),
    lead: tr('bridge.lead'),
    onClose: () => stop(),
  });

  const cv = makeCanvas(480, 206);
  p.body.appendChild(cv.canvas);

  const piers = {}; // column -> true
  let test = null; // {t, walker, verdict, broke}
  let built = false;

  const X0 = 62,
    X1 = 418,
    DECK = 74;
  const px = i => X0 + ((X1 - X0) / (N + 1)) * i;

  onPointer(cv.canvas, 480, 206, {
    down(pt) {
      if (built) return;
      let best = -1,
        bd = 1e9;
      for (let i = 1; i <= N; i++) {
        const d = Math.abs(pt.x - px(i));
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (bd > 34) return;
      if (piers[best]) delete piers[best];
      else piers[best] = true;
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
    const s = supports(),
      out = [];
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
  const testBtn = p.button(tr('bridge.try'), 'soft', () => {
    if (built) return;
    test = { t: 0, verdict: verdict(), broke: null };
  });
  const buildBtn = p.button(tr('bridge.build'), 'go', () => {
    const c = cost(),
      v = verdict();
    if (v === 'breaks' || built) return;
    const me = w.players[game.role].res;
    if (me.plank < c.plank || me.stone < c.stone) {
      p.readout(tr('bridge.notEnough'));
      return;
    }
    built = true;
    game.dispatch({
      type: 'bridge.build',
      role: game.role,
      planks: c.plank,
      stone: c.stone,
      quality: v === 'strong' ? 3 : 2,
    });
    p.close(); // the loop stops in onClose above
    message(tr(v === 'strong' ? 'msg.bridgeStrong' : 'msg.bridgeCreaky'));
    game.look(site.x0 + site.span / 2, site.row + 1);
  });
  row.appendChild(testBtn);
  row.appendChild(buildBtn);
  const back = p.button(tr('ui.later'), 'soft', () => p.close());
  back.style.flex = '0 0 auto';
  row.appendChild(back);

  function update() {
    const c = cost(),
      v = verdict(),
      sp = spans();
    const me = w.players[game.role].res;
    const lens = sp.map(s => s.d).join(' + ');
    let msg = tr('bridge.beams', { lens: lens });
    if (v === 'breaks') msg += tr('bridge.tooLong');
    else if (v === 'creaky') msg += tr('bridge.stretch');
    else msg += tr('bridge.allShort');
    p.readout(msg);
    p.cost([
      { icon: '🪚', need: c.plank, have: me.plank },
      { icon: '🪨', need: c.stone, have: me.stone },
    ]);
    buildBtn.disabled = v === 'breaks';
    buildBtn.textContent = tr(v === 'creaky' ? 'bridge.buildAnyway' : 'bridge.build');
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
    // a section through the crossing: sky above, the river cut open below, and
    // the two banks it has eaten into either side
    const sky = ctx.createLinearGradient(0, 0, 0, 88);
    sky.addColorStop(0, '#bcdcf0');
    sky.addColorStop(1, '#e2f0f2');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 480, 88);
    const river = ctx.createLinearGradient(0, 88, 0, 206);
    river.addColorStop(0, C.waterLite);
    river.addColorStop(0.3, C.water);
    river.addColorStop(1, C.waterDeep);
    ctx.fillStyle = river;
    ctx.fillRect(0, 88, 480, 118);
    ctx.strokeStyle = 'rgba(255,255,255,.32)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const y = 108 + i * 15,
        ph = t * 0.0012 + i;
      ctx.beginPath();
      ctx.moveTo(40 + Math.sin(ph) * 10, y);
      ctx.lineTo(76 + Math.sin(ph) * 10, y);
      ctx.moveTo(300 + Math.cos(ph) * 10, y + 6);
      ctx.lineTo(340 + Math.cos(ph) * 10, y + 6);
      ctx.stroke();
    }
    // banks, in two layers: sand on top of the darker earth underneath it,
    // with stones set in the cut face the way a riverbank really shows them
    const bank = (dir, edgeX) => {
      const outer = dir < 0 ? 0 : 480;
      ctx.fillStyle = dusk(C.sand, 0.3);
      ctx.beginPath();
      ctx.moveTo(outer, 66);
      ctx.lineTo(edgeX, 72);
      ctx.lineTo(edgeX, 206);
      ctx.lineTo(outer, 206);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.sand;
      ctx.beginPath();
      ctx.moveTo(outer, 66);
      ctx.lineTo(edgeX, 72);
      ctx.lineTo(edgeX, 124);
      ctx.lineTo(outer, 118);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(70,52,34,.18)'; // the shade in the cut face
      ctx.fillRect(dir < 0 ? edgeX - 8 : edgeX, 72, 8, 134);
      ctx.fillStyle = 'rgba(150,140,120,.5)'; // stones in the earth
      for (let i = 0; i < 7; i++) {
        const sx = outer + dir * -1 * (10 + ((i * 37) % 44));
        ctx.beginPath();
        ctx.ellipse(sx, 132 + ((i * 29) % 64), 4.4, 3, (i % 3) - 1, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    bank(-1, X0 + 4);
    bank(1, X1 - 4);
    // grass along the top of each bank, with blades over the lip of it
    for (const [gx, gw] of [
      [0, X0 + 4],
      [X1 - 4, 480 - X1 + 4],
    ]) {
      ctx.fillStyle = C.grass;
      ctx.fillRect(gx, 54, gw, 14);
      ctx.fillStyle = lite(C.grass, 0.3);
      ctx.fillRect(gx, 54, gw, 4);
      ctx.strokeStyle = C.grassDark;
      ctx.lineWidth = 1.6;
      for (let i = 0; i < gw / 14; i++) {
        const bx = gx + 5 + i * 14;
        ctx.beginPath();
        ctx.moveTo(bx, 55);
        ctx.lineTo(bx + 1.6, 49);
        ctx.stroke();
      }
    }

    const load = test ? Math.min(1, test.t * 1.4) : 0.25;

    // piers
    for (let i = 1; i <= N; i++) {
      if (!piers[i]) {
        ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 0.004 + i);
        ctx.fillStyle = '#fff';
        rr(ctx, px(i) - 11, DECK + 6, 22, 46, 6);
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      // a pier of stones somebody stacked, lit on one side, standing in its
      // own little disturbance of the water
      ctx.fillStyle = 'rgba(30,60,80,.22)';
      ctx.beginPath();
      ctx.ellipse(px(i), DECK + 66, 17, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.stoneDark;
      rr(ctx, px(i) - 12, DECK + 4, 24, 62, 5);
      ctx.fill();
      ctx.save();
      rr(ctx, px(i) - 12, DECK + 4, 24, 62, 5);
      ctx.clip();
      for (let r = 0; r < 4; r++) {
        for (let k = 0; k < 2; k++) {
          ctx.fillStyle = (r + k) % 2 ? C.stone : lite(C.stone, 0.22);
          rr(ctx, px(i) - 13 + k * 12 + (r % 2) * 6, DECK + 6 + r * 15, 11, 13, 3);
          ctx.fill();
        }
      }
      ctx.fillStyle = 'rgba(70,52,34,.16)';
      ctx.fillRect(px(i) + 4, DECK + 4, 8, 62);
      ctx.restore();
    }

    // deck
    const sp = spans();
    for (const s of sp) {
      const ax = px(s.a),
        bx = px(s.b);
      const broke = test?.broke === s.a;
      const sag = broke ? 60 * Math.min(1, (test.t - 0.5) * 2) : sagOf(s.d, load);
      // the beam: a dark underside, the timber itself, and the sun along the
      // top edge — three strokes, so a beam has a top and a bottom to it
      const beam = broke ? '#8a5c30' : C.wood;
      ctx.lineCap = 'round';
      ctx.strokeStyle = dusk(beam, 0.28);
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(ax, DECK + 1);
      ctx.quadraticCurveTo((ax + bx) / 2, DECK + sag * 2 + 1, bx, DECK + 1);
      ctx.stroke();
      ctx.strokeStyle = beam;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(ax, DECK);
      ctx.quadraticCurveTo((ax + bx) / 2, DECK + sag * 2, bx, DECK);
      ctx.stroke();
      ctx.strokeStyle = lite(beam, 0.34);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ax, DECK - 2.6);
      ctx.quadraticCurveTo((ax + bx) / 2, DECK + sag * 2 - 2.6, bx, DECK - 2.6);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(90,60,32,.28)'; // one line of grain down it
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax + 4, DECK + 1.4);
      ctx.quadraticCurveTo((ax + bx) / 2, DECK + sag * 2 + 1.4, bx - 4, DECK + 1.4);
      ctx.stroke();
      if (!test) {
        ctx.fillStyle = s.d >= 4 ? '#c05b4d' : s.d === 3 ? '#c88a2f' : 'rgba(67,55,42,.55)';
        ctx.font = '700 12px -apple-system, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(s.d), (ax + bx) / 2, DECK - 16);
      }
    }

    // the abutment posts
    for (const ax of [X0 - 8, X1 - 4]) {
      ctx.fillStyle = C.woodDark;
      rr(ctx, ax, DECK - 4, 12, 26, 3);
      ctx.fill();
      ctx.fillStyle = lite(C.woodDark, 0.26);
      rr(ctx, ax, DECK - 4, 4.6, 26, 2.4);
      ctx.fill();
      ctx.fillStyle = dusk(C.woodDark, 0.24); // the sawn top of the post
      ctx.beginPath();
      ctx.ellipse(ax + 6, DECK - 4, 6, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // the volunteer
    if (test) {
      const seg = sp.find(s => px(s.a) <= test.walker && px(s.b) >= test.walker) || sp[0];
      const u = seg ? (test.walker - px(seg.a)) / (px(seg.b) - px(seg.a)) : 0;
      const sag =
        test.broke === seg.a
          ? 60 * Math.min(1, Math.max(0, (test.t - 0.5) * 2))
          : sagOf(seg.d, Math.sin(u * Math.PI));
      const wy = DECK + sag * 2 * (u * (1 - u) * 4) - 2;
      const fall = test.broke === seg.a && test.t > 0.62 ? (test.t - 0.62) * 320 : 0;
      ctx.font = '26px system-ui, "Apple Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.save();
      ctx.translate(test.walker, wy + fall);
      if (fall) ctx.rotate(fall * 0.02);
      ctx.fillText('🧍', 0, 0);
      ctx.restore();
      if (fall > 40) {
        ctx.strokeStyle = 'rgba(255,255,255,.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(test.walker, 130, 14 + fall * 0.2, 6 + fall * 0.06, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.fillStyle = 'rgba(67,55,42,.5)';
    ctx.font = '600 11px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(tr('chop.tapHint'), 8, 8);
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
          // the splash is on screen already; the readout says what to change
          setTimeout(() => {
            p.readout(tr('bridge.broke', { n: bad.d }));
            test = null;
          }, 1500);
        }
      }
      if (test?.t >= 1.05 && test.broke === null) {
        p.readout(tr(test.verdict === 'strong' ? 'bridge.holdsWell' : 'bridge.holdsCreak'));
        test = null;
      }
    }
    draw(t);
  });
}

/** Mending the bridge after the wind has had a go at it. */
export function openRepair(game) {
  const p = openPanel({ title: tr('bridge.mendTitle'), lead: tr('bridge.mendLead'), center: true });
  const have = game.world.players[game.role].res.plank;
  const r = p.row();
  if (have >= 1) {
    r.appendChild(
      p.button(tr('bridge.mendGo'), 'go', () => {
        game.dispatch({ type: 'bridge.repair', role: game.role });
        p.close();
        message(tr('msg.mended'));
      }),
    );
  } else {
    p.body.appendChild(el('p', 'lead center', tr('bridge.mendNoPlank')));
  }
  r.appendChild(p.button(tr('ui.later'), 'soft', () => p.close()));
}
