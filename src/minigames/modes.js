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
  // where the finger was a moment ago, and the square a tap would take back
  let from = null;
  let undo = null;

  const put = (x, y) => {
    if (!inBounds(x, y) || seen[key(x, y)]) return;
    const t = tileAt(game.world, x, y);
    // Say why, rather than quietly doing nothing. A road already laid is
    // invisible under a building that was put up over it, and a tree you
    // have not felled yet looks like ordinary ground to a finger.
    if (t === T.ROAD || t === T.BRIDGE) {
      mode.hint = tr('road.already');
      return;
    }
    if (t === T.WATER || !walkable(game.world, x, y)) {
      mode.hint = tr('road.inTheWay');
      return;
    }
    if (Math.ceil((tiles.length + 1) / 2) > has()) {
      mode.hint = tr('road.noMore');
      return;
    }
    seen[key(x, y)] = 1;
    tiles.push({ x, y });
    mode.hint = null;
  };

  /** Taking one back. Nothing has been built yet, so nothing is undone. */
  const drop = (x, y) => {
    const k = key(x, y);
    if (!seen[k]) return;
    delete seen[k];
    const at = tiles.findIndex(t => t.x === x && t.y === y);
    if (at >= 0) tiles.splice(at, 1);
    mode.hint = null;
  };

  // A finger moves faster than the tile it is over, so fill in the tiles
  // between the one it was over a moment ago and this one. No other
  // restriction: draw anywhere.
  //
  // It is where the finger was, not the end of the list, because a finger
  // that comes down on a square already planned adds nothing — and a line
  // drawn from wherever the list happened to end would lay road out of
  // nowhere.
  const add = (x, y) => {
    if (from) {
      const steps = Math.max(Math.abs(x - from.x), Math.abs(y - from.y));
      for (let i = 1; i < steps; i++)
        put(
          Math.round(from.x + (x - from.x) * (i / steps)),
          Math.round(from.y + (y - from.y) * (i / steps)),
        );
    }
    put(x, y);
  };

  const mode = {
    kind: 'road',
    title: tr('road.title'),
    hint: null,
    say() {
      if (!tiles.length) return tr('road.draw');
      // either why the last touch did nothing, or — when it all went fine —
      // that a square is not final until the road is laid
      return (
        trn('road.steps', tiles.length, { n: tiles.length }) +
        ' — ' +
        (mode.hint ?? tr('road.tapAgain'))
      );
    },
    // The same counted picture the panels use: one stone per stone.
    costItems() {
      if (!tiles.length) return null;
      return [{ icon: '🪨', need: cost(), have: has() }];
    },
    down(tx, ty) {
      from = { x: tx, y: ty };
      // A square already planned is taken back instead — but only once the
      // finger lifts without having gone anywhere, or a line that crossed
      // its own path would rub itself out as it was being drawn.
      undo = seen[key(tx, ty)] ? { x: tx, y: ty } : null;
      if (!undo) put(tx, ty);
    },
    drag(tx, ty) {
      if (from && tx === from.x && ty === from.y) return;
      undo = null;
      add(tx, ty);
      from = { x: tx, y: ty };
    },
    up() {
      if (undo) drop(undo.x, undo.y);
      undo = null;
      from = null;
    },
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
      // No toast when this lands: the road is right there on the ground.
      {
        label: tr('road.lay'),
        cls: 'go',
        enabled: () => tiles.length > 0 && cost() <= has(),
        fn() {
          if (!tiles.length || cost() > has()) return;
          game.dispatch({ type: 'road.build', role: game.role, tiles: tiles.slice() });
          game.setMode(null);
        },
      },
      {
        label: tr('ui.startOver'),
        cls: 'soft',
        fn() {
          tiles.length = 0;
          for (const k in seen) delete seen[k];
          mode.hint = null;
        },
      },
      {
        label: tr('ui.done'),
        cls: 'soft',
        fn() {
          game.setMode(null);
        },
      },
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
    say() {
      return tr('herd.say');
    },
    highlight: () => ({ x: sheep.x, y: sheep.y, r: 18 }),
    down(tx, ty) {
      if (!inBounds(tx, ty) || !walkable(game.world, tx, ty)) {
        message(tr('msg.cannotStand'));
        return;
      }
      game.dispatch({ type: 'sheep.send', role: game.role, sheepId: sheep.id, x: tx, y: ty });
      game.setMode(null);
    },
    overlay(ctx) {
      const s = game.world.sheep.find(x => x.id === sheep.id);
      if (!s) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.ellipse(s.x * TILE, s.y * TILE + 3, 16, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },
    buttons: [
      {
        label: tr('ui.neverMind'),
        cls: 'soft',
        fn() {
          game.setMode(null);
        },
      },
    ],
  };
  return mode;
}
