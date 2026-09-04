// Three things you do by touching the world itself rather than a panel:
// laying a road, walking a sheep somewhere, and carrying water to the field.

import { T, TILE, tileAt, walkable, inBounds } from '../core/grid.js';
import { message } from '../ui/overlay.js';
import { tr, trn } from '../core/i18n.js';

/* ------------------------------------------------------------------ */
/* road                                                               */
/* ------------------------------------------------------------------ */

export function roadMode(game) {
  const tiles = [];
  const has = () => game.world.players[game.role].res.stone;
  const cost = () => Math.ceil(tiles.length / 2);
  const key = (x, y) => x + ',' + y;
  const seen = {};

  const put = (x, y) => {
    if (!inBounds(x, y) || seen[key(x, y)]) return;
    const t = tileAt(game.world, x, y);
    if (t === T.WATER || t === T.ROAD || t === T.BRIDGE) return;
    if (!walkable(game.world, x, y)) return;
    if (Math.ceil((tiles.length + 1) / 2) > has()) { mode.hint = tr('road.noMore'); return; }
    seen[key(x, y)] = 1;
    tiles.push({ x, y });
    mode.hint = null;
  };

  // A finger moves faster than the tile it is over, so fill in the tiles
  // between the last one and this one. No other restriction: draw anywhere.
  const add = (x, y) => {
    const last = tiles[tiles.length - 1];
    if (last) {
      const steps = Math.max(Math.abs(x - last.x), Math.abs(y - last.y));
      for (let i = 1; i < steps; i++)
        put(Math.round(last.x + (x - last.x) * (i / steps)),
            Math.round(last.y + (y - last.y) * (i / steps)));
    }
    put(x, y);
  };

  const mode = {
    kind: 'road',
    title: tr('road.title'),
    hint: null,
    say() {
      if (!tiles.length) return tr('road.draw');
      return trn('road.steps', tiles.length, { n: tiles.length }) +
             (mode.hint ? ' — ' + mode.hint : '');
    },
    // The same counted picture the panels use: one stone per stone.
    costItems() {
      if (!tiles.length) return null;
      return [{ icon: '🪨', need: cost(), have: has() }];
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
      { label: tr('road.lay'), cls: 'go', enabled: () => tiles.length > 0 && cost() <= has(), fn() {
        if (!tiles.length || cost() > has()) return;
        if (game.dispatch({ type: 'road.build', role: game.role, tiles: tiles.slice() })) {
          message(tr('msg.roadLaid', { n: tiles.length }));
        }
        game.setMode(null);
      } },
      { label: tr('ui.startOver'), cls: 'soft', fn() { tiles.length = 0; for (const k in seen) delete seen[k]; } },
      { label: tr('ui.done'), cls: 'soft', fn() { game.setMode(null); } },
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
    title: tr('herd.title', { name: sheep.name }),
    say() { return tr('herd.say'); },
    highlight: () => ({ x: sheep.x, y: sheep.y, r: 18 }),
    down(tx, ty) {
      if (!inBounds(tx, ty) || !walkable(game.world, tx, ty)) { message(tr('msg.cannotStand')); return; }
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
    buttons: [{ label: tr('ui.neverMind'), cls: 'soft', fn() { game.setMode(null); } }],
  };
  return mode;
}
