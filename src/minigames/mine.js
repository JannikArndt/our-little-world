// The mine: a handful of tunnels, dug one tile at a time.
//
// Nothing is explained up front. A tile next to one already open can be dug;
// anything else waits. What turns up is whatever it turns up — stone, coal,
// clay, a trickle of water, or ground that plainly should not be dug past
// until somebody shores it up. That is the whole of it.

import { openPanel, el, loop } from '../ui/overlay.js';
import { tr } from '../core/i18n.js';
import { MINE_W, MINE_H, mineCellAt, mineCanDig } from '../core/world.js';

const CELL_ICON = { empty: '⬛', stone: '🪨', coal: '⚫', clay: '🟤', water: '💧' };

export function openMine(game) {
  const p = openPanel({ title: tr('mine.title'), lead: tr('mine.lead') });

  const grid = el('div', 'mine-grid');
  grid.style.cssText =
    'display:grid;grid-template-columns:repeat(' +
    MINE_W +
    ',1fr);gap:6px;max-width:260px;margin:8px auto;';
  p.body.appendChild(grid);

  const cells = [];
  for (let y = 0; y < MINE_H; y++)
    for (let x = 0; x < MINE_W; x++) {
      const b = el('button', 'btn soft');
      b.style.cssText = 'aspect-ratio:1;font-size:22px;padding:0;';
      b.addEventListener('click', () => tap(x, y));
      grid.appendChild(b);
      cells.push({ x, y, el: b });
    }

  function tap(x, y) {
    const w = game.world;
    const cell = mineCellAt(w, x, y);
    if (cell) {
      if (cell.kind === 'unstable' && !cell.supported) {
        if (game.dispatch({ type: 'mine.support', role: game.role, x, y }))
          p.readout(tr('mine.supported'));
        else p.readout(tr('mine.needPlank'));
      } else {
        p.readout(tr('mine.already'));
      }
      return;
    }
    if (!mineCanDig(w, x, y)) {
      p.readout(tr('mine.tooFar'));
      return;
    }
    if (game.dispatch({ type: 'mine.dig', role: game.role, x, y })) {
      const found = mineCellAt(w, x, y);
      p.readout(tr(found.kind === 'unstable' ? 'mine.foundUnstable' : 'mine.found.' + found.kind));
    }
  }

  function draw() {
    const w = game.world;
    for (const c of cells) {
      const cell = mineCellAt(w, c.x, c.y);
      if (!cell) {
        c.el.textContent = mineCanDig(w, c.x, c.y) ? '⛏️' : '';
        c.el.disabled = !mineCanDig(w, c.x, c.y);
      } else if (cell.kind === 'unstable' && !cell.supported) {
        c.el.textContent = '⚠️';
        c.el.disabled = false;
      } else {
        c.el.textContent = CELL_ICON[cell.kind] || '⬛';
        c.el.disabled = true;
      }
    }
  }

  const row = p.row();
  row.appendChild(
    p.button(tr('ui.done'), 'soft', () => {
      stop();
      p.close();
    }),
  );

  const stop = loop(() => draw());
  return p;
}
