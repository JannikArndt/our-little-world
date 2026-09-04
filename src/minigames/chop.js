// Felling a tree.
// The rule you can work out by looking: a tree falls the way you cut it —
// unless you try to drop it straight into the wind.

import { el, openPanel, makeCanvas, onPointer, loop, message } from '../ui/overlay.js';
import { T, TILE, tileAt, inBounds } from '../core/grid.js';
import { C, drawTree, drawStump, drawHouse, drawSite, drawWorkshop } from '../render/art.js';
import { makeRng } from '../core/rng.js';

const DIRS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const ARROW = { N: '⬆️', S: '⬇️', E: '➡️', W: '⬅️' };
const R = 3;                      // tiles shown around the tree

function look(w, tree, dir) {
  const [dx, dy] = DIRS[dir];
  for (let i = 1; i <= 2; i++) {
    const x = tree.x + dx * i, y = tree.y + dy * i;
    if (!inBounds(x, y)) return 'edge';
    if (tileAt(w, x, y) === T.WATER) return 'water';
    if (w.buildings.some(b => b.state !== 'site' && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)) return 'house';
    if (w.trees.some(t => t.state === 'standing' && t.id !== tree.id && t.x === x && t.y === y)) return 'tree';
  }
  return 'clear';
}

const MISHAP = {
  water: ['🌊 Straight into the river! It floated off downstream.', 1, 0],
  house: ['🏠 It leaned on the roof. Everyone is fine. Everyone is laughing.', 2, 0],
  tree:  ['🌳 It got caught in the next tree and hung there.', 2, 0],
  edge:  ['🪨 It landed on the rocks and split badly.', 2, 0],
  clear: ['🪵 A good clean THUMP.', 2, 2],
};

export function openChop(game, tree) {
  const w = game.world;
  const rng = makeRng((parseInt(String(tree.id).split('_')[1], 10) * 2654435761) ^ w.seed);
  const windDir = ['N', 'S', 'E', 'W'][Math.floor(rng() * 4)];
  const around = {};
  for (const d in DIRS) around[d] = look(w, tree, d);

  const p = openPanel({
    title: '🪓 Felling a tree',
    lead: 'Choose which way it should fall. Watch the wind.',
  });

  const cv = makeCanvas(340, 300);
  p.body.appendChild(cv.canvas);

  const pad = el('div', 'row');
  p.panel.appendChild(pad);

  let chosen = null, chops = 0, falling = 0, done = false, shake = 0;

  const dirBtns = {};
  for (const d of ['W', 'N', 'S', 'E']) {
    const b = el('button', 'btn soft small');
    b.innerHTML = ARROW[d] + ' <span style="font-size:13px">' + ({ N: 'up', S: 'down', E: 'right', W: 'left' })[d] + '</span>';
    b.addEventListener('click', () => choose(d));
    dirBtns[d] = b;
    pad.appendChild(b);
  }

  const row2 = p.row();
  const chopBtn = p.button('🪓 Chop', '', () => {
    if (done || !chosen) return;
    chops++;
    shake = 1;
    if (chops >= 3) {
      done = true;
      chopBtn.disabled = true;
      falling = 0.0001;
    } else {
      p.readout('Chip… chip… <b>' + (3 - chops) + '</b> to go.');
    }
  });
  chopBtn.disabled = true;
  row2.appendChild(chopBtn);
  const leave = p.button('Leave it standing', 'soft', () => { stop(); p.close(); });
  leave.style.flex = '0 0 auto';
  row2.appendChild(leave);

  p.readout('The wind is blowing <b>' + ({ N: 'north', S: 'south', E: 'east', W: 'west' })[windDir] +
            '</b> ' + ARROW[windDir] + '. Trees do not like falling into the wind.');

  /* ---- drawing ---- */
  const S = 262 / ((R * 2 + 1) * TILE);          // the 7x7 patch around the tree
  const ox = 170, oy = 150;
  const MARK = 2 * TILE * S;                    // where the four choices sit

  function choose(d) {
    if (done) return;
    chosen = d; chops = 0;
    for (const k in dirBtns) dirBtns[k].className = 'btn ' + (k === d ? '' : 'soft') + ' small';
    chopBtn.disabled = false;
    p.readout('Cutting the notch on the <b>' + ({ N: 'far', S: 'near', E: 'right', W: 'left' })[d] +
              '</b> side. Tap the axe three times.');
  }

  function drawScene(t) {
    const ctx = cv.ctx;
    ctx.clearRect(0, 0, 340, 300);
    ctx.fillStyle = '#cfe3d4'; ctx.fillRect(0, 0, 340, 300);
    ctx.save();
    ctx.translate(ox, oy); ctx.scale(S, S);
    ctx.translate(-(tree.x * TILE + TILE / 2), -(tree.y * TILE + TILE / 2));

    for (let y = tree.y - R; y <= tree.y + R; y++)
      for (let x = tree.x - R; x <= tree.x + R; x++) {
        const tt = inBounds(x, y) ? tileAt(w, x, y) : T.ROCK;
        ctx.fillStyle = tt === T.WATER ? C.water : tt === T.SAND ? C.sand : tt === T.ROAD ? C.road
          : tt === T.FIELD ? C.field : tt === T.FOREST ? C.forest : tt === T.ROCK ? '#cfd6c8' : C.grass;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    for (const b of w.buildings) {
      if (Math.abs(b.x - tree.x) > R + 3 || Math.abs(b.y - tree.y) > R + 3) continue;
      if (b.state === 'site') drawSite(ctx, b, t);
      else if (b.type === 'workshop') drawWorkshop(ctx, b, t, w.tick);
      else drawHouse(ctx, b, t, w.tick);
    }
    for (const o of w.trees) {
      if (o.id === tree.id) continue;
      if (Math.abs(o.x - tree.x) > R || Math.abs(o.y - tree.y) > R) continue;
      if (o.state === 'standing') drawTree(ctx, o, t); else drawStump(ctx, o);
    }

    // our tree, with a ring so you can tell which one it is
    const cx = tree.x * TILE + TILE / 2, cy = tree.y * TILE + TILE / 2;
    if (!done) {
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2 / S;
      ctx.setLineDash([5 / S, 4 / S]);
      ctx.beginPath(); ctx.ellipse(cx, cy + 3, 15, 9, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.save();
    ctx.translate(cx, cy);
    if (falling > 0) {
      const e = Math.min(1, falling);
      const dir = fellDir();
      const ang = (Math.PI / 2) * (1 - Math.pow(1 - e, 3)) * (dir === 'W' ? -1 : dir === 'E' ? 1 : 0.001);
      ctx.rotate(ang);
      if (dir === 'N' || dir === 'S') ctx.scale(1, 1 - e * 0.6);
    } else if (shake > 0) {
      ctx.rotate(Math.sin(t * 0.06) * 0.05 * shake);
    }
    drawTree(ctx, { x: -0.5, y: -0.5, kind: tree.kind, sway: 0 }, falling > 0 ? 0 : t);
    ctx.restore();
    ctx.restore();

    // wind ribbon
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = '#7aa7c4'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    const [wx, wy] = DIRS[windDir];
    for (let i = 0; i < 3; i++) {
      const ph = ((t * 0.00035 + i * 0.33) % 1);
      const bx = 170 - wx * 150 + wx * 300 * ph, by = 40 + i * 16 - wy * 120 + wy * 240 * ph;
      ctx.globalAlpha = 0.55 * Math.sin(ph * Math.PI);
      ctx.beginPath();
      ctx.moveTo(bx, by); ctx.lineTo(bx + wx * 22 + (wx ? 0 : 22), by + wy * 22);
      ctx.stroke();
    }
    ctx.restore();
    ctx.font = '20px system-ui, "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'left'; ctx.fillText('💨 ' + ARROW[windDir], 10, 26);

    // direction markers with what is over there
    if (!done) {
      for (const d in DIRS) {
        const [dx, dy] = DIRS[d];
        const mx = ox + dx * MARK, my = oy + dy * MARK;
        ctx.globalAlpha = chosen === d ? 1 : 0.8;
        ctx.fillStyle = chosen === d ? '#f2c14e' : 'rgba(255,253,248,.92)';
        ctx.strokeStyle = 'rgba(67,55,42,.3)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(mx, my, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.font = '18px system-ui, "Apple Color Emoji", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const glyph = around[d] === 'water' ? '🌊' : around[d] === 'house' ? '🏠'
          : around[d] === 'tree' ? '🌳' : around[d] === 'edge' ? '🪨' : ARROW[d];
        ctx.fillText(glyph, mx, my);
      }
    }
  }

  function fellDir() {
    if (!chosen) return 'S';
    const opposite = { N: 'S', S: 'N', E: 'W', W: 'E' };
    return opposite[chosen] === windDir ? windDir : chosen;
  }

  onPointer(cv.canvas, 340, 300, {
    down(pt) {
      if (done) return;
      for (const d in DIRS) {
        const mx = ox + DIRS[d][0] * MARK, my = oy + DIRS[d][1] * MARK;
        if ((pt.x - mx) * (pt.x - mx) + (pt.y - my) * (pt.y - my) < 30 * 30) { choose(d); return; }
      }
    },
  });

  const stop = loop((t, dt) => {
    cv.fit();
    if (shake > 0) shake = Math.max(0, shake - dt / 260);
    if (falling > 0 && falling < 1.35) {
      falling += dt / 620;
      if (falling >= 1 && !p._settled) {
        p._settled = true;
        setTimeout(finish, 420);
      }
    }
    drawScene(t);
  });

  function finish() {
    const dir = fellDir();
    const what = around[dir];
    const [msg, wood, logs] = MISHAP[what];
    stop();
    game.dispatch({ type: 'tree.fell', role: game.role, treeId: tree.id, dir, wood, logs, mishap: what !== 'clear' });
    p.close();
    message(msg);
    if (what !== 'clear') game.hint('Have another look at the wind next time.');
  }
}
