// Designing a house.
// You draw the rooms; a family looks at your plan and tells you, with their
// faces, what it would be like to live in it.

import { el, openPanel, makeCanvas, onPointer, loop, message } from '../ui/overlay.js';
import { rr, glyph } from '../render/art.js';

const COLS = 6, ROWS = 4, CELL = 56, OX = 34, OY = 40;
const CW = 514, CH = 300;
const WALL = 26;                       // how thick the outside wall looks
const FAMILY_X = 456;                  // they wait outside, well clear of the plan

const ITEMS = {
  door:   { icon: '🚪', label: 'door',   plank: 1, stone: 0, blocks: false, edgeOnly: true, max: 1 },
  window: { icon: '🪟', label: 'window', plank: 1, stone: 0, blocks: false, edgeOnly: true, max: 3 },
  bed:    { icon: '🛏️', label: 'bed',    plank: 1, stone: 0, blocks: false, edgeOnly: false, max: 3 },
  stove:  { icon: '🔥', label: 'stove',  plank: 0, stone: 2, blocks: true,  edgeOnly: false, max: 1 },
  table:  { icon: '🪑', label: 'table',  plank: 1, stone: 0, blocks: true,  edgeOnly: false, max: 2 },
};
const BASE = { plank: 2, stone: 1 };

export function openHouse(game, site) {
  const w = game.world;
  const p = openPanel({ title: '🏠 Build a house' });

  const cv = makeCanvas(CW, CH);
  p.body.appendChild(cv.canvas);

  const grid = {};                     // "c,r" -> item key
  let tool = 'door';

  const tools = el('div', 'tools');
  p.panel.appendChild(tools);
  const toolBtns = {};
  for (const k in ITEMS) {
    const it = ITEMS[k];
    const b = el('button', 'tool' + (k === tool ? ' on' : ''));
    b.innerHTML = '<span class="ico">' + it.icon + '</span><span class="lab">' + it.label + '</span>' +
      '<span class="cost">' + (it.plank ? it.plank + '🪚' : '') + (it.stone ? ' ' + it.stone + '🪨' : '') + '</span>';
    b.addEventListener('click', () => {
      tool = k;
      for (const n in toolBtns) toolBtns[n].className = 'tool' + (n === tool ? ' on' : '');
    });
    toolBtns[k] = b;
    tools.appendChild(b);
  }

  onPointer(cv.canvas, CW, CH, {
    down(pt) {
      const c = Math.floor((pt.x - OX) / CELL), r = Math.floor((pt.y - OY) / CELL);
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
      const key = c + ',' + r;
      if (grid[key]) { delete grid[key]; update(); return; }
      const it = ITEMS[tool];
      const onEdge = c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1;
      if (it.edgeOnly && !onEdge) { p.readout('A ' + it.label + ' has to go on an outside wall.'); return; }
      if (count(tool) >= it.max) { p.readout('One ' + it.label + ' is plenty… ' + (it.max > 1 ? '(' + it.max + ' at most)' : '')); return; }
      grid[key] = tool;
      update();
    },
  });

  const count = (k) => Object.keys(grid).filter(g => grid[g] === k).length;

  function cost() {
    let plank = BASE.plank, stone = BASE.stone;
    for (const g in grid) { plank += ITEMS[grid[g]].plank; stone += ITEMS[grid[g]].stone; }
    return { plank, stone };
  }

  function doorCell() {
    for (const g in grid) if (grid[g] === 'door') return g.split(',').map(Number);
    return null;
  }

  /** Which beds can somebody actually walk to from the door? */
  function reach() {
    const d = doorCell();
    const seen = {};
    if (!d) return seen;
    const q = [d];
    seen[d[0] + ',' + d[1]] = true;
    while (q.length) {
      const [c, r] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dx, nr = r + dy, k = nc + ',' + nr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || seen[k]) continue;
        const it = grid[k];
        if (it && ITEMS[it].blocks) continue;
        seen[k] = true; q.push([nc, nr]);
      }
    }
    return seen;
  }

  function assess() {
    const seen = reach();
    const beds = [], stranded = [];
    for (const g in grid) if (grid[g] === 'bed') (seen[g] ? beds : stranded).push(g);
    const empty = COLS * ROWS - Object.keys(grid).length;
    return {
      beds: beds.length,
      stranded: stranded.length,
      warm: count('stove') > 0,
      light: count('window') > 0,
      roomy: empty >= 4,
      hasDoor: !!doorCell(),
      seen,
    };
  }

  const row = p.row();
  const buildBtn = p.button('🏠 Build it', 'go', () => {
    const a = assess(), c = cost();
    if (!a.hasDoor || a.beds < 1) return;
    const me = w.players[game.role].res;
    if (me.plank < c.plank || me.stone < c.stone) {
      p.readout('Not quite enough. The grey ones are what is missing.');
      if (!p._ask) {
        p._ask = p.button('🙋 Ask for it', 'soft', () => {
          game.dispatch({ type: 'ask', from: game.role, to: game.other, cap: 'house', targetId: site.id });
          message('Asked for the missing pieces.');
        });
        p._ask.style.flex = '0 0 auto';
        row.insertBefore(p._ask, back);
      }
      return;
    }
    game.dispatch({
      type: 'house.build', role: game.role, siteId: site.id,
      plan: grid, beds: a.beds, warm: a.warm, light: a.light,
      roomy: a.roomy, reachable: a.stranded === 0,
      planks: c.plank, stone: c.stone,
    });
    stop(); p.close();
    message('🏠 The roof is on. Somebody will be along shortly.');
    game.look(site.x + site.w / 2, site.y + site.h / 2);
  });
  row.appendChild(buildBtn);
  const back = p.button('Later', 'soft', () => { stop(); p.close(); });
  back.style.flex = '0 0 auto';
  row.appendChild(back);

  function update() {
    const a = assess(), c = cost();
    const me = w.players[game.role].res;
    const notes = [];
    if (!a.hasDoor) notes.push('no way in');
    if (a.beds < 1) notes.push('nowhere to sleep');
    if (a.stranded) notes.push('a bed nobody can reach');
    if (!a.warm) notes.push('no stove — it would be cold');
    if (!a.light) notes.push('no window — it would be dark');
    if (!a.roomy && a.beds) notes.push('very cramped');
    p.readout(notes.length ? notes.join(' · ')
      : 'Sleeps <b>' + a.beds + '</b>. Warm, light and roomy.');
    p.cost([
      { icon: '🪚', need: c.plank, have: me.plank },
      { icon: '🪨', need: c.stone, have: me.stone },
    ]);
    buildBtn.disabled = !a.hasDoor || a.beds < 1;
  }
  update();

  /* ---------------- drawing ---------------- */

  function draw(t) {
    const ctx = cv.ctx;
    const a = assess();
    const gx = OX, gy = OY, gw = COLS * CELL, gh = ROWS * CELL;
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = '#efe4cd'; ctx.fillRect(0, 0, CW, CH);

    // the ground the house stands on
    ctx.fillStyle = '#cfe3d4';
    rr(ctx, 6, 8, CW - 12, CH - 16, 18); ctx.fill();

    // the outside wall, seen a little from above: a lit top and a dark inside
    ctx.fillStyle = 'rgba(60,50,35,.18)';
    rr(ctx, gx - WALL + 3, gy - WALL + 5, gw + WALL * 2, gh + WALL * 2, 12); ctx.fill();
    ctx.fillStyle = '#b98d5c';
    rr(ctx, gx - WALL, gy - WALL, gw + WALL * 2, gh + WALL * 2, 10); ctx.fill();
    ctx.fillStyle = '#d3a877';
    rr(ctx, gx - WALL, gy - WALL, gw + WALL * 2, gh + WALL * 2 - 5, 10); ctx.fill();
    ctx.strokeStyle = '#8a6540'; ctx.lineWidth = 2;
    rr(ctx, gx - WALL + 1, gy - WALL + 1, gw + WALL * 2 - 2, gh + WALL * 2 - 6, 10); ctx.stroke();

    // the floor inside, sunk below the wall top
    ctx.fillStyle = a.light ? '#f7eeda' : '#b9b0a0';
    ctx.fillRect(gx, gy, gw, gh);
    ctx.fillStyle = 'rgba(90,70,45,.16)';           // wall shadow falling inwards
    ctx.fillRect(gx, gy, gw, 7);
    ctx.fillRect(gx, gy, 7, gh);
    ctx.strokeStyle = 'rgba(140,110,75,.20)'; ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      ctx.beginPath(); ctx.moveTo(gx, gy + i * 23); ctx.lineTo(gx + gw, gy + i * 23); ctx.stroke();
    }

    // where somebody can walk to from the door
    for (const k in a.seen) {
      const [c, r] = k.split(',').map(Number);
      ctx.fillStyle = 'rgba(127,194,90,.20)';
      ctx.fillRect(gx + c * CELL + 2, gy + r * CELL + 2, CELL - 4, CELL - 4);
    }
    ctx.strokeStyle = 'rgba(67,55,42,.13)'; ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath(); ctx.moveTo(gx + c * CELL, gy); ctx.lineTo(gx + c * CELL, gy + gh); ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(gx, gy + r * CELL); ctx.lineTo(gx + gw, gy + r * CELL); ctx.stroke();
    }

    // doors and windows are holes in the wall, not squares on the floor
    for (const k in grid) {
      const kind = grid[k];
      if (kind !== 'door' && kind !== 'window') continue;
      const [c, r] = k.split(',').map(Number);
      const side = r === ROWS - 1 ? 'S' : r === 0 ? 'N' : c === 0 ? 'W' : 'E';
      const cx = gx + c * CELL + CELL / 2, cy = gy + r * CELL + CELL / 2;
      const horiz = side === 'N' || side === 'S';
      const ox = side === 'W' ? gx - WALL : side === 'E' ? gx + gw : cx - 23;
      const oy = side === 'N' ? gy - WALL : side === 'S' ? gy + gh : cy - 23;
      const ow = horiz ? 46 : WALL, oh = horiz ? WALL : 46;
      ctx.fillStyle = kind === 'door' ? '#7d5730' : '#cfe8f4';
      ctx.fillRect(ox, oy, ow, oh);
      ctx.strokeStyle = '#8a6540'; ctx.lineWidth = 2;
      ctx.strokeRect(ox + 1, oy + 1, ow - 2, oh - 2);
      glyph(ctx, ITEMS[kind].icon, ox + ow / 2, oy + oh / 2, 22);
    }

    // furniture stands on the floor and casts a small shadow
    for (const k in grid) {
      const kind = grid[k];
      if (kind === 'door' || kind === 'window') continue;
      const [c, r] = k.split(',').map(Number);
      const x = gx + c * CELL + CELL / 2, y = gy + r * CELL + CELL / 2;
      if (kind === 'stove' && a.warm) {
        ctx.fillStyle = 'rgba(242,163,74,' + (0.20 + 0.07 * Math.sin(t * 0.004)) + ')';
        ctx.beginPath(); ctx.arc(x, y, CELL * 0.9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(60,50,35,.20)';
      ctx.beginPath(); ctx.ellipse(x, y + 15, 17, 6, 0, 0, Math.PI * 2); ctx.fill();
      glyph(ctx, ITEMS[kind].icon, x, y, 32);
      if (kind === 'bed' && !a.seen[k]) glyph(ctx, '❓', x + 18, y - 17, 18);
    }

    // the family waits outside, well clear of the plan, and reacts to it
    const d = doorCell();
    if (d) {
      const dx = gx + d[0] * CELL + CELL / 2, dy = gy + d[1] * CELL + CELL / 2;
      const fx = FAMILY_X, fy = Math.max(104, Math.min(CH - 54, dy));
      // the path starts at the door itself, wherever it is
      const side = d[1] === ROWS - 1 ? 'S' : d[1] === 0 ? 'N' : d[0] === 0 ? 'W' : 'E';
      const sx = side === 'W' ? gx - WALL - 4 : side === 'E' ? gx + gw + WALL + 4 : dx;
      const sy = side === 'N' ? gy - WALL - 4 : side === 'S' ? gy + gh + WALL + 4 : dy;
      ctx.strokeStyle = 'rgba(160,135,95,.55)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.setLineDash([3, 11]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + (fx - sx) * 0.55, sy + (fy - sy) * 0.15, fx, fy + 22);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(60,50,35,.16)';
      ctx.beginPath(); ctx.ellipse(fx, fy + 24, 30, 9, 0, 0, Math.PI * 2); ctx.fill();
      const bob = Math.sin(t * 0.004) * 2;
      glyph(ctx, '🧑', fx - 15, fy + 2 + bob, 36);
      glyph(ctx, '🧒', fx + 16, fy + 9 - bob, 28);
      let mood = '💛';
      if (!a.beds) mood = '🛏️';
      else if (a.stranded) mood = '🤔';
      else if (!a.warm) mood = '🥶';
      else if (!a.light) mood = '🕯️';
      else if (!a.roomy) mood = '😣';
      ctx.fillStyle = 'rgba(255,253,248,.95)';
      ctx.strokeStyle = 'rgba(67,55,42,.22)'; ctx.lineWidth = 1.5;
      rr(ctx, fx - 24, fy - 68, 48, 40, 16); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(fx - 10, fy - 22, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      glyph(ctx, mood, fx, fy - 48, 26);
    } else {
      ctx.fillStyle = 'rgba(67,55,42,.6)';
      ctx.font = '700 14px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('put a door in an outside wall first', CW / 2, 24);
    }
  }

  const stop = loop((t) => { cv.fit(); draw(t); });
}
