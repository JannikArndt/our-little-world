// Touching the world: panning, pinching, and tapping things to see what can
// be done with them. If you cannot do it yourself, you can ask the other
// player — which is usually the more interesting option.

import { TILE, T, tileAt } from '../core/grid.js';
import { ROLE, can, roleName } from '../core/world.js';
import { tr, trn } from '../core/i18n.js';
import { el, message, renderCost } from './overlay.js';
import { openChop } from '../minigames/chop.js';
import { openSawmill, openMill } from '../minigames/sawmill.js';
import { openBridge, openRepair } from '../minigames/bridge.js';
import { openHouse } from '../minigames/house.js';
import { openCare } from '../minigames/care.js';
import { roadMode, sheepMode } from '../minigames/modes.js';
import { openGive } from './share.js';

/* ------------------------------------------------------------------ */
/* bubbles                                                            */
/* ------------------------------------------------------------------ */

let bubble = null;

export function closeBubble() {
  if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
  bubble = null;
}

function showBubble(sx, sy, opts) {
  closeBubble();
  const layer = document.getElementById('bubbleLayer');
  const b = el('div', 'bubble');
  if (opts.title) b.appendChild(el('h4', '', opts.title));
  if (opts.hint) b.appendChild(el('p', 'hint', opts.hint));
  for (const a of opts.actions || []) {
    const btn = el('button', a.cls || '', a.label);
    btn.addEventListener('click', (e) => { e.stopPropagation(); closeBubble(); a.fn(); });
    b.appendChild(btn);
  }
  const close = el('button', 'ghost', tr('ui.close'));
  close.addEventListener('click', (e) => { e.stopPropagation(); closeBubble(); });
  b.appendChild(close);
  layer.appendChild(b);

  const r = layer.getBoundingClientRect();
  const bw = b.offsetWidth, bh = b.offsetHeight;
  const x = Math.max(bw / 2 + 6, Math.min(r.width - bw / 2 - 6, sx));
  const y = Math.max(bh + 8, Math.min(r.height - 6, sy - 10));
  b.style.left = x + 'px';
  b.style.top = y + 'px';
  bubble = b;
}

/* ------------------------------------------------------------------ */
/* what is under your finger                                          */
/* ------------------------------------------------------------------ */

function hit(w, wx, wy) {
  const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
  const near = (ex, ey, r) => {
    const dx = ex * TILE - wx, dy = ey * TILE - wy;
    return dx * dx + dy * dy < r * r;
  };
  for (const s of w.sheep) if (near(s.x, s.y - 0.2, 18)) return { kind: 'sheep', o: s };
  for (const v of w.villagers) if (near(v.x, v.y - 0.3, 16)) return { kind: 'villager', o: v };
  if (w.visitors) for (const c of w.visitors) if (near(c.x, c.y - 0.3, 18)) return { kind: 'deer', o: c };
  for (const l of w.logs) if (near(l.x, l.y, 16)) return { kind: 'log', o: l };
  for (const b of w.stones) if (near(b.x + 0.5, b.y + 0.5, 16)) return { kind: 'stones', o: b };
  if (near(w.larder.x, w.larder.y, 18)) return { kind: 'larder', o: w.larder };
  for (const t of w.trees) if (t.x === tx && t.y === ty) return { kind: 'tree', o: t };
  for (const t of w.trees) if (t.state === 'standing' && near(t.x + 0.5, t.y - 0.1, 16)) return { kind: 'tree', o: t };
  for (const p of w.plots) if (tx >= p.x && tx < p.x + 2 && ty >= p.y && ty < p.y + 2) return { kind: 'plot', o: p };
  for (const b of w.buildings) if (tx >= b.x && tx < b.x + b.w && ty >= b.y - 1 && ty < b.y + b.h) return { kind: 'building', o: b };
  const s = w.bridge.site;
  if (ty >= s.row - 1 && ty <= s.row + s.rows && tx >= s.x0 - 1 && tx <= s.x1 + 1) return { kind: 'crossing', o: s };
  if (tileAt(w, tx, ty) === T.WATER) return { kind: 'water', o: { x: tx, y: ty } };
  return { kind: 'ground', o: { x: tx, y: ty } };
}

/* ------------------------------------------------------------------ */
/* actions                                                            */
/* ------------------------------------------------------------------ */

function askAction(game, cap, targetId) {
  return {
    label: tr('ask.label', { role: roleName(game.other), what: tr('verb.' + cap) }),
    cls: 'soft',
    fn() {
      game.dispatch({ type: 'ask', from: game.role, to: game.other, cap, targetId: targetId || null });
      message(tr('ask.sent', { role: roleName(game.other) }));
    },
  };
}

function actionsFor(game, h) {
  const w = game.world, r = game.role;
  const A = [];
  switch (h.kind) {

    case 'tree': {
      const tree = h.o;
      if (tree.state !== 'standing') return { title: tr('w.stump'), hint: tr('w.stumpHint'), actions: [] };
      if (can(w, r, 'fell')) A.push({ label: tr('w.fell'), fn: () => openChop(game, tree) });
      else A.push(askAction(game, 'fell', tree.id));
      return { title: tr('w.tree'), hint: tr('w.treeHint'), actions: A };
    }

    case 'log':
      return {
        title: tr('w.log'), hint: tr('w.logHint', { n: h.o.wood }),
        actions: [{ label: tr('w.logTake'), fn: () => game.dispatch({ type: 'log.collect', role: r, id: h.o.id }) }],
      };

    case 'stones':
      return {
        title: tr('w.stones'), hint: tr('w.stonesHint', { n: h.o.count }),
        actions: h.o.count > 0
          ? [{ label: tr('w.stoneTake'), fn: () => game.dispatch({ type: 'stone.take', role: r, id: h.o.id }) }]
          : [],
      };

    case 'larder': {
      const mine = w.players[r].res.food;
      return {
        title: tr('w.larder'), hint: tr('w.larderHint', { n: w.larder.food }),
        actions: mine > 0
          ? [{ label: tr('w.larderPut', { n: Math.min(3, mine) }), fn: () => game.dispatch({ type: 'larder.give', from: r, n: Math.min(3, mine) }) },
             { label: tr('w.shareDifferently'), cls: 'soft', fn: () => openGive(game) }]
          : [{ label: tr('w.shareSomething'), cls: 'soft', fn: () => openGive(game) }],
      };
    }

    case 'sheep': {
      const s = h.o;
      const wants = tr(s.mood === 'hungry' ? 'w.sheepHungry' : s.mood === 'thirsty' ? 'w.sheepThirsty'
        : s.mood === 'woolly' ? 'w.sheepWoolly' : 'w.sheepOk');
      if (can(w, r, 'care')) A.push({ label: tr('w.care'), fn: () => openCare(game, s) });
      else A.push(askAction(game, 'care', s.id));
      if (can(w, r, 'herd')) A.push({ label: tr('w.herd'), cls: 'soft', fn: () => game.setMode(sheepMode(game, s)) });
      return { title: s.name, hint: wants, actions: A };
    }

    case 'villager': {
      const v = h.o;
      const hint = v.hunger > 72 ? tr('w.villagerHungry')
        : !v.homeId ? tr('w.villagerHomeless', { name: v.name })
        : v.carrying ? tr('w.villagerCarrying')
        : tr('w.villagerFine');
      if (!v.homeId) A.push({ label: tr('w.findPlot'), cls: 'soft', fn: () => game.pointAtSite() });
      if (v.hunger > 72 && w.players[r].res.food > 0)
        A.push({ label: tr('w.putFood'), fn: () => game.dispatch({ type: 'larder.give', from: r, n: Math.min(2, w.players[r].res.food) }) });
      return { title: v.name, hint, actions: A };
    }

    case 'deer':
      return { title: tr('w.deer'), hint: tr('w.deerHint'), actions: [] };

    case 'plot': {
      const p = h.o;
      const hint = p.state === 'empty' ? tr('w.plotEmpty')
        : p.state === 'ripe' ? tr('w.plotRipe')
        : p.water <= 8 ? tr('w.plotDry')
        : tr('w.plotGrowing', { n: Math.round(p.growth) });
      if (!can(w, r, 'farm')) return { title: tr('w.plot'), hint, actions: [askAction(game, 'farm', p.id)] };
      if (p.state === 'empty') A.push({ label: tr('w.sow'), fn: () => game.dispatch({ type: 'plot.plant', role: r, plotId: p.id, watered: false }) });
      if (p.state === 'ripe') A.push({ label: tr('w.reap'), fn: () => game.dispatch({ type: 'plot.harvest', role: r, plotId: p.id }) });
      if (p.state !== 'empty') {
        A.push({ label: tr('w.water'), cls: p.water <= 8 ? '' : 'soft', fn: () => game.dispatch({ type: 'plot.water', role: r, plotId: p.id }) });
        const dry = w.plots.filter(q => q.state !== 'empty' && q.water <= 30);
        if (dry.length > 1) A.push({
          label: tr('w.waterAll', { n: dry.length }), cls: 'soft',
          fn: () => { for (const q of dry) game.dispatch({ type: 'plot.water', role: r, plotId: q.id }); },
        });
      }
      return { title: tr('w.plot'), hint, actions: A };
    }

    case 'building': {
      const b = h.o;
      if (b.state === 'site') {
        if (can(w, r, 'house')) A.push({ label: tr('w.buildHouse'), fn: () => openHouse(game, b) });
        else A.push(askAction(game, 'house', b.id));
        return { title: tr('w.site'), hint: tr(b.newFamily ? 'w.siteNewFamily' : 'w.siteHint'), actions: A };
      }
      if (b.type === 'workshop') {
        if (can(w, r, 'saw')) A.push({ label: tr('w.sawHere'), fn: () => openSawmill(game) });
        else A.push(askAction(game, 'saw', null));
        if (can(w, r, 'mill')) A.push({ label: tr('w.millHere'), cls: 'soft', fn: () => openMill(game) });
        else A.push(askAction(game, 'mill', null));
        return { title: tr('w.workshop'), hint: tr('w.workshopHint'), actions: A };
      }
      const who = (b.residents || []).map(id => (w.villagers.find(v => v.id === id) || {}).name).filter(Boolean);
      const spare = (b.beds || 0) - (b.residents || []).length;
      return {
        title: tr('w.house'),
        hint: (who.length ? trn('w.livesHere', who.length, { names: who.join(tr('w.and')) }) : '') +
              (spare > 0 ? trn('w.spareBed', spare, { n: spare }) : tr('w.full')),
        actions: [],
      };
    }

    case 'crossing': {
      if (w.bridge.damaged) {
        if (can(w, r, 'bridge')) A.push({ label: tr('w.mendBridge'), fn: () => openRepair(game) });
        else A.push(askAction(game, 'bridge', null));
        return { title: tr('w.bridge'), hint: tr('w.bridgeBrokenHint'), actions: A };
      }
      if (w.bridge.built) return { title: tr('w.bridge'), hint: tr('w.bridgeFine'), actions: [] };
      if (can(w, r, 'bridge')) A.push({ label: tr('w.buildBridge'), fn: () => openBridge(game) });
      else A.push(askAction(game, 'bridge', null));
      return { title: tr('w.crossing'), hint: tr('w.crossingHint', { n: w.bridge.site.span }), actions: A };
    }

    case 'water':
      return { title: tr('w.river'), hint: tr('w.riverHint'), actions: [] };

    default: {
      const stone = w.players[r].res.stone;
      if (can(w, r, 'road') && stone > 0) A.push({ label: tr('w.buildRoad'), fn: () => game.setMode(roadMode(game)) });
      if (!can(w, r, 'road')) A.push(askAction(game, 'road', null));
      // Offering a button that cannot work teaches nothing; say what is missing.
      const hint = can(w, r, 'road') && stone === 0 ? tr('w.roadNoStone') : tr('w.groundHint');
      return { title: tr('w.ground'), hint, actions: A };
    }
  }
}

/* ------------------------------------------------------------------ */
/* the mode bar                                                       */
/* ------------------------------------------------------------------ */

let modeBar = null;

export function renderModeBar(game) {
  const stage = document.getElementById('stage');
  if (!game.mode) {
    if (modeBar && modeBar.parentNode) modeBar.parentNode.removeChild(modeBar);
    modeBar = null;
    stage.className = stage.className.replace(/\s*has-mode/, '');
    return;
  }
  if (stage.className.indexOf('has-mode') < 0) stage.className += ' has-mode';
  if (!modeBar) {
    modeBar = el('div', 'mode-bar');
    modeBar.style.cssText = 'position:absolute;left:8px;right:8px;bottom:8px;background:#fffdf8;' +
      'border:2px solid #d9c9ae;border-radius:16px;padding:8px 10px;box-shadow:0 6px 18px rgba(67,55,42,.2);' +
      'pointer-events:auto;z-index:20;max-width:520px;margin:0 auto;';
    stage.appendChild(modeBar);
    modeBar._title = el('div');
    modeBar._title.style.cssText = 'font-weight:800;font-size:15px;margin-bottom:2px;';
    modeBar._say = el('div');
    modeBar._say.style.cssText = 'font-size:13px;color:#7a6a56;min-height:18px;';
    modeBar._cost = el('div');
    modeBar._row = el('div', 'row');
    modeBar.appendChild(modeBar._title);
    modeBar.appendChild(modeBar._say);
    modeBar.appendChild(modeBar._cost);
    modeBar.appendChild(modeBar._row);
    modeBar._for = null;
  }
  if (modeBar._for !== game.mode) {
    modeBar._for = game.mode;
    modeBar._title.textContent = game.mode.title;
    modeBar._row.innerHTML = '';
    modeBar._btns = [];
    for (const b of game.mode.buttons || []) {
      const btn = el('button', 'btn small ' + (b.cls || ''), b.label);
      btn.addEventListener('click', () => { if (!btn.disabled) b.fn(); renderModeBar(game); });
      modeBar._row.appendChild(btn);
      modeBar._btns.push({ spec: b, el: btn });
    }
  }
  modeBar._say.innerHTML = game.mode.say ? game.mode.say() : '';
  const items = game.mode.costItems ? game.mode.costItems() : null;
  if (items && items.length) renderCost(modeBar._cost, items);
  else modeBar._cost.innerHTML = '';
  for (const b of modeBar._btns || []) b.el.disabled = b.spec.enabled ? !b.spec.enabled() : false;
}

/* ------------------------------------------------------------------ */
/* gestures                                                           */
/* ------------------------------------------------------------------ */

export function installInput(game, renderer, canvas) {
  let dragging = false, moved = 0, startT = 0;
  let lastX = 0, lastY = 0;
  let pinch = null;

  const worldFrom = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    return renderer.toWorld(clientX - r.left, clientY - r.top);
  };

  const begin = (x, y) => {
    dragging = true; moved = 0; startT = Date.now();
    lastX = x; lastY = y;
    if (game.mode && game.mode.down) {
      const p = worldFrom(x, y);
      game.mode.down(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
      renderModeBar(game);
    }
  };

  const drag = (x, y) => {
    if (!dragging) return;
    const dx = x - lastX, dy = y - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (game.mode && game.mode.drag) {
      const p = worldFrom(x, y);
      game.mode.drag(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
      renderModeBar(game);
    } else {
      const s = renderer.scale();
      renderer.cam.x -= dx / s;
      renderer.cam.y -= dy / s;
      renderer.clampCamera();
    }
    lastX = x; lastY = y;
  };

  const end = (x, y) => {
    if (!dragging) return;
    dragging = false;
    if (game.mode) { if (game.mode.up) game.mode.up(); renderModeBar(game); return; }
    if (moved > 12 || Date.now() - startT > 700) return;
    const p = worldFrom(x, y);
    if (p.x < 0 || p.y < 0) { closeBubble(); return; }
    const h = hit(game.world, p.x, p.y);
    const opts = actionsFor(game, h);
    const r = canvas.getBoundingClientRect();
    showBubble(x - r.left, y - r.top, opts);
  };

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      dragging = false;
      const [a, b] = e.touches;
      pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: renderer.cam.zoom };
      e.preventDefault();
      return;
    }
    closeBubbleIfTapOutside(e);
    begin(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (pinch && e.touches.length === 2) {
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      renderer.cam.zoom = Math.max(1, Math.min(4, pinch.z * (d / pinch.d)));
      renderer.userZoom = true;
      renderer.clampCamera();
      e.preventDefault();
      return;
    }
    drag(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, { passive: false });

  const finish = (e) => {
    if (pinch && e.touches.length < 2) pinch = null;
    const t = e.changedTouches && e.changedTouches[0];
    if (t) end(t.clientX, t.clientY);
  };
  canvas.addEventListener('touchend', finish);
  canvas.addEventListener('touchcancel', finish);

  canvas.addEventListener('mousedown', (e) => { closeBubbleIfTapOutside(e); begin(e.clientX, e.clientY); });
  window.addEventListener('mousemove', (e) => drag(e.clientX, e.clientY));
  window.addEventListener('mouseup', (e) => end(e.clientX, e.clientY));
  canvas.addEventListener('wheel', (e) => {
    renderer.cam.zoom = Math.max(1, Math.min(4, renderer.cam.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
    renderer.userZoom = true;
    renderer.clampCamera();
    e.preventDefault();
  }, { passive: false });

  // double tap to see the whole world again
  let lastTap = 0;
  canvas.addEventListener('touchend', () => {
    const now = Date.now();
    if (now - lastTap < 320) { renderer.userZoom = false; renderer.resize(); closeBubble(); }
    lastTap = now;
  });

  function closeBubbleIfTapOutside(e) {
    if (bubble && !bubble.contains(e.target)) closeBubble();
  }
}

export { hit };
