// Designing a house.
// You draw the rooms; a family looks at your plan and tells you, with their
// faces, what it would be like to live in it.

import { el, openPanel, makeCanvas, onPointer, loop, toast } from '../ui/overlay.js';
import { C, rr } from '../render/art.js';

const COLS = 6, ROWS = 4, CELL = 56, OX = 42, OY = 30;
const CW = 420, CH = 296;

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
  const p = openPanel({
    title: '🏠 A house for somebody',
    lead: 'Pick a thing, then tap a square. The family will tell you what they think.',
  });

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
      const need = [];
      if (me.plank < c.plank) need.push((c.plank - me.plank) + ' 🪚');
      if (me.stone < c.stone) need.push((c.stone - me.stone) + ' 🪨');
      p.readout('Not quite enough. You still need <b>' + need.join(' and ') + '</b>.');
      if (!p._ask) {
        p._ask = p.button('🙋 Ask for it', 'soft', () => {
          game.dispatch({ type: 'ask', from: game.role, to: game.other, cap: 'house', targetId: site.id });
          toast('Asked for the missing pieces.');
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
    toast('🏠 The roof is on. Somebody will be along shortly.', 3200);
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
    p.readout('Needs <b>' + c.plank + ' 🪚</b> and <b>' + c.stone + ' 🪨</b> (you have ' + me.plank + ' 🪚, ' + me.stone + ' 🪨).' +
      (notes.length ? '<br>' + notes.join(' · ') : '<br>Sleeps <b>' + a.beds + '</b>. Warm, light and roomy.'));
    buildBtn.disabled = !a.hasDoor || a.beds < 1;
  }
  update();

  /* ---------------- drawing ---------------- */

  function draw(t) {
    const ctx = cv.ctx;
    const a = assess();
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = '#efe4cd'; ctx.fillRect(0, 0, CW, CH);

    // floor
    ctx.fillStyle = a.light ? '#f7eeda' : '#cdc3ae';
    rr(ctx, OX, OY, COLS * CELL, ROWS * CELL, 8); ctx.fill();

    // squares somebody can walk to
    for (const k in a.seen) {
      const [c, r] = k.split(',').map(Number);
      ctx.fillStyle = 'rgba(127,194,90,.18)';
      ctx.fillRect(OX + c * CELL + 2, OY + r * CELL + 2, CELL - 4, CELL - 4);
    }

    ctx.strokeStyle = 'rgba(67,55,42,.16)'; ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath(); ctx.moveTo(OX + c * CELL, OY); ctx.lineTo(OX + c * CELL, OY + ROWS * CELL); ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(OX, OY + r * CELL); ctx.lineTo(OX + COLS * CELL, OY + r * CELL); ctx.stroke();
    }
    // walls
    ctx.strokeStyle = C.woodDark; ctx.lineWidth = 5;
    rr(ctx, OX, OY, COLS * CELL, ROWS * CELL, 8); ctx.stroke();

    // the things you placed
    ctx.font = '30px system-ui, "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const k in grid) {
      const [c, r] = k.split(',').map(Number);
      const x = OX + c * CELL + CELL / 2, y = OY + r * CELL + CELL / 2;
      if (grid[k] === 'stove' && a.warm) {
        ctx.fillStyle = 'rgba(242,163,74,' + (0.16 + 0.06 * Math.sin(t * 0.004)) + ')';
        ctx.beginPath(); ctx.arc(x, y, CELL * 0.85, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillText(ITEMS[grid[k]].icon, x, y + 2);
      if (grid[k] === 'bed' && !a.seen[k]) {
        ctx.font = '18px system-ui, "Apple Color Emoji", sans-serif';
        ctx.fillText('❓', x + 17, y - 15);
        ctx.font = '30px system-ui, "Apple Color Emoji", sans-serif';
      }
    }

    // the family, standing at the door with an opinion
    const d = doorCell();
    if (d) {
      // they stand just outside whichever wall the door is in
      const out = d[1] === ROWS - 1 ? [0, 1] : d[1] === 0 ? [0, -1] : d[0] === 0 ? [-1, 0] : [1, 0];
      const fx = Math.max(30, Math.min(CW - 34, OX + d[0] * CELL + CELL / 2 + out[0] * 48));
      const fy = Math.max(30, Math.min(CH - 34, OY + d[1] * CELL + CELL / 2 + out[1] * 40));
      const bob = Math.sin(t * 0.004) * 2;
      ctx.font = '22px system-ui, "Apple Color Emoji", sans-serif';
      ctx.fillText('🧑', fx - 12, fy + 4 + bob);
      ctx.fillText('🧒', fx + 12, fy + 6 - bob);
      let mood = '💛';
      if (!a.beds) mood = '🛏️';
      else if (a.stranded) mood = '🤔';
      else if (!a.warm) mood = '🥶';
      else if (!a.light) mood = '🕯️';
      else if (!a.roomy) mood = '😣';
      ctx.font = '20px system-ui, "Apple Color Emoji", sans-serif';
      ctx.fillText(mood, fx, fy - 16);
    } else {
      ctx.fillStyle = 'rgba(67,55,42,.55)';
      ctx.font = '600 13px -apple-system, system-ui, sans-serif';
      ctx.fillText('start with a door on an outside wall', CW / 2, 16);
    }
  }

  const stop = loop((t) => { cv.fit(); draw(t); });
}
