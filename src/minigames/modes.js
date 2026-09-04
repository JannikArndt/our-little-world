// Three things you do by touching the world itself rather than a panel:
// laying a road, walking a sheep somewhere, and carrying water to the field.

import { T, TILE, tileAt, walkable, inBounds } from '../core/grid.js';
import { message } from '../ui/overlay.js';

/* ------------------------------------------------------------------ */
/* road                                                               */
/* ------------------------------------------------------------------ */

export function roadMode(game) {
  const tiles = [];
  const has = () => game.world.players[game.role].res.stone;
  const cost = () => Math.ceil(tiles.length / 2);
  const key = (x, y) => x + ',' + y;
  const seen = {};

  const add = (x, y) => {
    if (!inBounds(x, y) || seen[key(x, y)]) return;
    const t = tileAt(game.world, x, y);
    if (t === T.WATER || t === T.ROAD || t === T.BRIDGE) return;
    if (!walkable(game.world, x, y)) return;
    if (tiles.length && Math.abs(tiles[tiles.length - 1].x - x) + Math.abs(tiles[tiles.length - 1].y - y) > 2) return;
    if (Math.ceil((tiles.length + 1) / 2) > has()) { mode.hint = 'That is all the stone you have.'; return; }
    seen[key(x, y)] = 1;
    tiles.push({ x, y });
    mode.hint = null;
  };

  const mode = {
    kind: 'road',
    title: '🛤️ Laying a road',
    hint: null,
    say() {
      return 'Drag across the ground. <b>' + tiles.length + '</b> step' + (tiles.length === 1 ? '' : 's') +
             ' · costs <b>' + cost() + ' 🪨</b> of your ' + has() +
             (mode.hint ? ' — ' + mode.hint : '');
    },
    down(tx, ty) { add(tx, ty); },
    drag(tx, ty) { add(tx, ty); },
    up() {},
    overlay(ctx) {
      ctx.save();
      for (const t of tiles) {
        ctx.fillStyle = 'rgba(220,196,147,.85)';
        ctx.fillRect(t.x * TILE + 1, t.y * TILE + 1, TILE - 2, TILE - 2);
      }
      if (tiles.length) {
        const last = tiles[tiles.length - 1];
        ctx.fillStyle = 'rgba(67,55,42,.8)';
        ctx.font = '700 11px -apple-system, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(cost() + ' 🪨', last.x * TILE + TILE / 2, last.y * TILE - 4);
      }
      ctx.restore();
    },
    buttons: [
      { label: 'Lay it', cls: 'go', fn() {
        if (!tiles.length) return;
        if (game.dispatch({ type: 'road.build', role: game.role, tiles: tiles.slice() })) {
          message('🛤️ ' + tiles.length + ' steps of road. Watch them use it.');
        }
        game.setMode(null);
      } },
      { label: 'Start over', cls: 'soft', fn() { tiles.length = 0; for (const k in seen) delete seen[k]; } },
      { label: 'Done', cls: 'soft', fn() { game.setMode(null); } },
    ],
  };
  return mode;
}

/* ------------------------------------------------------------------ */
/* walking a sheep                                                    */
/* ------------------------------------------------------------------ */

export function sheepMode(game, sheep) {
  const mode = {
    kind: 'sheep',
    title: '🐑 Where should ' + sheep.name + ' go?',
    say() { return 'Tap a spot in the world and she will walk there — if she can get to it.'; },
    highlight: () => ({ x: sheep.x, y: sheep.y, r: 18 }),
    down(tx, ty) {
      if (!inBounds(tx, ty) || !walkable(game.world, tx, ty)) { message('She cannot stand there.'); return; }
      game.dispatch({ type: 'sheep.send', role: game.role, sheepId: sheep.id, x: tx, y: ty });
      game.setMode(null);
    },
    overlay(ctx) {
      const s = game.world.sheep.find(x => x.id === sheep.id);
      if (!s) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.ellipse(s.x * TILE, s.y * TILE + 3, 16, 9, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    },
    buttons: [{ label: 'Never mind', cls: 'soft', fn() { game.setMode(null); } }],
  };
  return mode;
}

/* ------------------------------------------------------------------ */
/* the watering can                                                   */
/* ------------------------------------------------------------------ */

const CAN = 3;

export function waterMode(game) {
  let drops = 0;
  const mode = {
    kind: 'water',
    title: '🪣 Watering the field',
    say() {
      return drops > 0
        ? 'The can holds <b>' + drops + '</b> more ' + (drops === 1 ? 'plot' : 'plots') + '. Tap a plot.'
        : 'The can is empty. Tap the <b>river</b> to fill it (it holds ' + CAN + ').';
    },
    down(tx, ty) {
      const w = game.world;
      if (tileAt(w, tx, ty) === T.WATER) { drops = CAN; message('🪣 Filled — ' + CAN + ' plots\' worth.'); return; }
      const p = w.plots.find(p => tx >= p.x && tx < p.x + 2 && ty >= p.y && ty < p.y + 2);
      if (!p) return;
      if (p.state === 'empty') { message('Nothing planted here yet.'); return; }
      if (drops <= 0) { message('The can is empty. Fill it at the river.'); return; }
      if (game.dispatch({ type: 'plot.water', role: game.role, plotId: p.id })) drops--;
    },
    overlay(ctx) {
      const w = game.world;
      ctx.save();
      for (const p of w.plots) {
        if (p.state === 'empty' || p.water > 30) continue;
        ctx.strokeStyle = 'rgba(110,180,215,.9)'; ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(p.x * TILE + 2, p.y * TILE + 2, TILE * 2 - 4, TILE * 2 - 4);
      }
      ctx.restore();
    },
    buttons: [{ label: 'Done', cls: 'soft', fn() { game.setMode(null); } }],
  };
  return mode;
}
