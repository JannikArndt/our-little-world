// Touching the world: panning, pinching, and tapping things to see what can
// be done with them. Anything can be tapped and anything will say what it
// needs — but a job that belongs to the other player is theirs to do, and
// saying so across the room beats a button that sends a message.

import { TILE, T, WORLD_W, WORLD_H, tileAt, toTileX, toTileY } from '../core/grid.js';
import { ROLE, can, roleName, PROJECT, project, kids, hasWell, loavesPerDay, basketDays } from '../core/world.js';
import { PROJECTS } from '../core/content.js';
import { canPay } from '../core/actions.js';
import { tr, trn } from '../core/i18n.js';
import { el, message, renderCost, openPanel } from './overlay.js';
import { openChop } from '../minigames/chop.js';
import { openSawmill, openMill } from '../minigames/sawmill.js';
import { openBridge, openRepair } from '../minigames/bridge.js';
import { openHouse, openRaise } from '../minigames/house.js';
import { openCare } from '../minigames/care.js';
import { openFish } from '../minigames/fish.js';
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
    const btn = el('button', a.cls || '');
    btn.appendChild(el('span', 'b-label', a.label));
    // what it costs goes on its own line, never in brackets at the end of a
    // sentence where it breaks across lines
    if (a.cost) btn.appendChild(el('span', 'b-cost', a.cost));
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
/* the village basket                                                 */
/* ------------------------------------------------------------------ */

/**
 * What is in the basket, how much the village eats, and how long that leaves —
 * the three questions in the order somebody asks them. The middle one is the
 * point: a basket does not last a fixed number of days, it lasts fewer of them
 * every time somebody new moves in, and that is a sum worth seeing done.
 */
export function openBasket(game) {
  const w = game.world, r = game.role;
  const p = openPanel({ title: tr('basket.title'), lead: tr('basket.lead') });

  const sums = el('div', 'basket-sums');
  p.body.appendChild(sums);

  function draw() {
    // one picture per loaf, so it can be counted rather than read
    const pips = el('div', 'cost-pips');
    const show = Math.min(w.larder.food, 14);
    for (let i = 0; i < show; i++) pips.appendChild(el('span', 'pip', '🍞'));
    if (w.larder.food > show) pips.appendChild(el('span', 'pip more', '…'));

    const eaten = loavesPerDay(w);
    const days = basketDays(w);
    const people = w.villagers.length;

    const lines = [];
    lines.push(trn('basket.inside', w.larder.food, { n: w.larder.food }));
    if (!people) {
      lines.push(tr('basket.nobody'));
    } else {
      lines.push(trn('basket.eats', people, { n: people, loaves: Math.max(1, Math.round(eaten)) }));
      if (w.larder.food <= 0) lines.push(tr('basket.empty'));
      else if (days < 1) lines.push(tr('basket.lastsShort'));
      else lines.push(trn('basket.lasts', Math.round(days), { n: Math.round(days) }));
      lines.push(tr('basket.more'));
    }

    sums.innerHTML = '';
    if (w.larder.food > 0) sums.appendChild(pips);
    for (const t of lines) {
      const row = el('p', 'basket-line');
      row.innerHTML = t;
      sums.appendChild(row);
    }
  }
  draw();

  const row = p.row();
  const mine = () => w.players[r].res.food;
  if (mine() > 0) {
    const put = p.button(tr('w.larderPut', { n: Math.min(3, mine()) }), 'go', () => {
      game.dispatch({ type: 'larder.give', from: r, n: Math.min(3, mine()) });
      p.close();
      openBasket(game);              // reopen, so the sum is the new one
    });
    row.appendChild(put);
  }
  row.appendChild(p.button(tr(mine() > 0 ? 'w.shareDifferently' : 'w.shareSomething'), 'soft', () => { p.close(); openGive(game); }));
  row.appendChild(p.button(tr('ui.close'), 'soft', () => p.close()));
  return p;
}

/* ------------------------------------------------------------------ */
/* what is under your finger                                          */
/* ------------------------------------------------------------------ */

function hit(w, wx, wy) {
  const tx = toTileX(wx), ty = toTileY(wy);
  const near = (ex, ey, r) => {
    const dx = ex * TILE - wx, dy = ey * TILE - wy;
    return dx * dx + dy * dy < r * r;
  };
  for (const s of w.sheep) if (near(s.x, s.y - 0.2, 18)) return { kind: 'sheep', o: s };
  for (const v of w.villagers) if (!v.inside && near(v.x, v.y - 0.3, 16)) return { kind: 'villager', o: v };
  if (w.visitors) for (const c of w.visitors) if (near(c.x, c.y - 0.3, 18)) return { kind: 'deer', o: c };
  for (const l of w.logs) if (near(l.x, l.y, 16)) return { kind: 'log', o: l };
  for (const b of w.stones) if (near(b.x + 0.5, b.y + 0.5, 16)) return { kind: 'stones', o: b };
  if (near(w.larder.x, w.larder.y, 18)) return { kind: 'larder', o: w.larder };
  for (const t of w.trees) if (t.x === tx && t.y === ty) return { kind: 'tree', o: t };
  for (const t of w.trees) if (t.state === 'standing' && near(t.x + 0.5, t.y - 0.1, 16)) return { kind: 'tree', o: t };
  for (const p of w.plots) if (tx >= p.x && tx < p.x + 2 && ty >= p.y && ty < p.y + 2) return { kind: 'plot', o: p };
  for (const b of w.buildings) {
    const bw = b.type === 'boat' ? b.w + 2 : b.w;      // the boat lies off the end of the landing
    if (tx >= b.x && tx < b.x + bw && ty >= b.y - 1 && ty < b.y + b.h) return { kind: 'building', o: b };
  }
  const s = w.bridge.site;
  if (ty >= s.row - 1 && ty <= s.row + s.rows && tx >= s.x0 - 1 && tx <= s.x1 + 1) return { kind: 'crossing', o: s };
  if (tileAt(w, tx, ty) === T.WATER) return { kind: 'water', o: { x: tx, y: ty } };
  return { kind: 'ground', o: { x: tx, y: ty } };
}

/* ------------------------------------------------------------------ */
/* actions                                                            */
/* ------------------------------------------------------------------ */

/**
 * One line saying whose job this is. Tapping a thing always tells you what it
 * wants — that is how a small person learns the field is thirsty — but when
 * the hands for it belong to the other player, the answer is their name, not
 * a button. Two people in a room can just say it.
 */
function theirs(game, verbs) {
  if (!verbs.length) return '';
  const what = verbs.map(v => tr('verb.' + v)).join(tr('w.and'));
  return ' ' + tr('w.theirJob', { role: roleName(game.other), what: what });
}

/**
 * The two things the village builds for itself. No plan to draw and no test to
 * run: it is planks, stone and somebody deciding to do it.
 */
export function buildProject(game, type) {
  const w = game.world, r = game.role;
  const cost = PROJECT[type];
  const plan = project(w, type);
  if (!plan || plan.state !== 'plan') return false;
  if (!canPay(w, r, cost)) {
    const me = w.players[r].res;
    message(tr('w.projectNeeds', {
      plank: cost.plank, stone: cost.stone, hp: me.plank || 0, hs: me.stone || 0,
    }));
    return false;
  }
  const ok = game.dispatch({ type: 'project.build', role: r, what: type });
  if (ok) message(tr(PROJECTS[type].built));
  return ok;
}

/** The one button that builds any of them, in whoever's hands it belongs. */
function projectActions(game, type, label) {
  const w = game.world, r = game.role;
  const def = PROJECTS[type];
  if (!can(w, r, def.cap)) return [];
  const cost = def.cost;
  const me = w.players[r].res;
  const bits = [];
  if (cost.plank) bits.push(cost.plank + ' 🪚');
  if (cost.stone) bits.push(cost.stone + ' 🪨');
  return [{
    label: label,
    cost: bits.join(' · '),
    cls: (me.plank >= (cost.plank || 0) && me.stone >= (cost.stone || 0)) ? '' : 'soft',
    fn: () => buildProject(game, type),
  }];
}

/** A project's own bubble: what it is, and the one thing to do with it. */
function projectBubble(game, b) {
  const def = PROJECTS[b.type] || {};
  const t = def.text || {};
  if (b.state === 'plan') {
    const mine = can(game.world, game.role, def.cap);
    return {
      title: tr(t.plan),
      hint: tr(t.planHint) + (mine ? '' : theirs(game, [def.verb || def.cap])),
      actions: projectActions(game, b.type, tr(t.build)),
    };
  }
  return { title: tr(t.done), hint: tr(t.doneHint), actions: [] };
}

function actionsFor(game, h) {
  const w = game.world, r = game.role;
  const A = [];
  switch (h.kind) {

    case 'tree': {
      const tree = h.o;
      if (tree.state === 'sapling') return { title: tr('w.sapling'), hint: tr('w.saplingHint'), actions: [] };
      if (tree.state !== 'standing') {
        const mine = can(w, r, 'farm');
        if (mine) A.push({ label: tr('w.plantHere'), fn: () => {
          if (game.dispatch({ type: 'tree.plant', role: r, treeId: tree.id })) message(tr('msg.planted'));
        } });
        return { title: tr('w.stump'), hint: tr('w.stumpHint') + (mine ? '' : theirs(game, ['plant'])), actions: A };
      }
      const canFell = can(w, r, 'fell');
      if (canFell) A.push({ label: tr('w.fell'), fn: () => openChop(game, tree) });
      return { title: tr('w.tree'), hint: tr('w.treeHint') + (canFell ? '' : theirs(game, ['fell'])), actions: A };
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

    // the basket answers with a whole panel now — see openBasket, which
    // installInput reaches before actionsFor is ever called

    case 'sheep': {
      const s = h.o;
      const wants = tr(s.mood === 'hungry' ? 'w.sheepHungry' : s.mood === 'thirsty' ? 'w.sheepThirsty'
        : s.mood === 'woolly' ? 'w.sheepWoolly' : 'w.sheepOk');
      const missing = [];
      if (can(w, r, 'care')) A.push({ label: tr('w.care'), fn: () => openCare(game, s) });
      else missing.push('care');
      if (can(w, r, 'herd')) A.push({ label: tr('w.herd'), cls: 'soft', fn: () => game.setMode(sheepMode(game, s)) });
      else missing.push('herd');
      return { title: s.name, hint: wants + theirs(game, missing), actions: A };
    }

    // a tap on a villager never reaches here any more — installInput answers
    // it directly with villager.poke, before actionsFor is ever called

    case 'deer':
      return { title: tr('w.deer'), hint: tr('w.deerHint'), actions: [] };

    case 'plot': {
      const p = h.o;
      const hint = p.state === 'empty' ? tr('w.plotEmpty')
        : p.state === 'ripe' ? tr('w.plotRipe')
        : p.water <= 8 ? tr('w.plotDry')
        : tr('w.plotGrowing', { n: Math.round(p.growth) });
      if (!can(w, r, 'farm')) return { title: tr('w.plot'), hint: hint + theirs(game, ['farm']), actions: [] };
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
      if (b.type === 'boat') {
        if (b.state === 'plan') return projectBubble(game, b);
        const resting = (w.tick - (b.fishedTick || -9999)) < 600;
        const canFish = can(w, r, 'farm');
        if (canFish && !resting) A.push({ label: tr('w.goFishing'), fn: () => openFish(game, b) });
        const boatHint = resting ? tr('w.boatResting') : tr('w.boatHint');
        return { title: tr('w.boat'), hint: boatHint + (canFish ? '' : theirs(game, ['fish'])), actions: A };
      }
      if (b.type === 'play') {
        if (b.state === 'plan') return projectBubble(game, b);
        const names = kids(w).map(k => k.name).join(tr('w.and'));
        return { title: tr('w.playground'), hint: tr('w.playgroundHint', { names: names }), actions: [] };
      }
      if (b.type === 'well' || b.type === 'privy' || b.type === 'fence') return projectBubble(game, b);
      if (b.state === 'site') {
        const mine = can(w, r, 'house');
        if (mine) A.push({ label: tr('w.buildHouse'), fn: () => openRaise(game, b) });
        const siteHint = tr(b.newFamily ? 'w.siteNewFamily' : 'w.siteHint');
        return { title: tr('w.site'), hint: siteHint + (mine ? '' : theirs(game, ['house'])), actions: A };
      }
      if (b.type === 'workshop') {
        const missing = [];
        if (can(w, r, 'saw')) A.push({ label: tr('w.sawHere'), fn: () => openSawmill(game) });
        else missing.push('saw');
        if (can(w, r, 'mill')) A.push({ label: tr('w.millHere'), cls: 'soft', fn: () => openMill(game) });
        else missing.push('mill');
        return { title: tr('w.workshop'), hint: tr('w.workshopHint') + theirs(game, missing), actions: A };
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
      const canBridge = can(w, r, 'bridge');
      if (w.bridge.damaged) {
        if (canBridge) A.push({ label: tr('w.mendBridge'), fn: () => openRepair(game) });
        return {
          title: tr('w.bridge'),
          hint: tr('w.bridgeBrokenHint') + (canBridge ? '' : theirs(game, ['bridge'])),
          actions: A,
        };
      }
      if (w.bridge.built) return { title: tr('w.bridge'), hint: tr('w.bridgeFine'), actions: [] };
      if (canBridge) A.push({ label: tr('w.buildBridge'), fn: () => openBridge(game) });
      return {
        title: tr('w.crossing'),
        hint: tr('w.crossingHint', { n: w.bridge.site.span }) + (canBridge ? '' : theirs(game, ['bridge'])),
        actions: A,
      };
    }

    case 'water':
      return { title: tr('w.river'), hint: tr('w.riverHint'), actions: [] };

    default: {
      const stone = w.players[r].res.stone;
      const canRoad = can(w, r, 'road');
      if (canRoad && stone > 0) A.push({ label: tr('w.buildRoad'), fn: () => game.setMode(roadMode(game)) });
      // Offering a button that cannot work teaches nothing; say what is missing.
      const hint = canRoad && stone === 0 ? tr('w.roadNoStone') : tr('w.groundHint');
      return { title: tr('w.ground'), hint: hint + (canRoad ? '' : theirs(game, ['road'])), actions: A };
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
  let pinched = false;      // two fingers were down at some point in this gesture

  const worldFrom = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    return renderer.toWorld(clientX - r.left, clientY - r.top);
  };

  const begin = (x, y) => {
    dragging = true; moved = 0; startT = Date.now();
    lastX = x; lastY = y;
    if (game.mode && game.mode.down) {
      const p = worldFrom(x, y);
      game.mode.down(toTileX(p.x), toTileY(p.y));
      renderModeBar(game);
    }
  };

  const drag = (x, y) => {
    if (!dragging) return;
    const dx = x - lastX, dy = y - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (game.mode && game.mode.drag) {
      const p = worldFrom(x, y);
      game.mode.drag(toTileX(p.x), toTileY(p.y));
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
    // Past the edge of the map is not the village: there is nothing there to
    // build a road on. It still puts away whatever was open, which is what a
    // tap on the empty green either side of the world is usually for.
    if (p.x < 0 || p.y < 0 || p.x >= WORLD_W || p.y >= WORLD_H) { closeBubble(); return; }
    const h = hit(game.world, p.x, p.y);
    // a tap on a person gets no bubble at all: just poke them and see what
    // they do — their name floats up in the world instead of a card here
    if (h.kind === 'villager') {
      closeBubble();
      game.dispatch({ type: 'villager.poke', role: game.role, id: h.o.id });
      return;
    }
    // and the basket has more to say than a bubble holds
    if (h.kind === 'larder') { closeBubble(); openBasket(game); return; }
    // a house you can go into is a place, not a card: tapping it opens the
    // room, the same way tapping the basket opens the basket
    if (h.kind === 'building' && h.o.type === 'house' && h.o.state === 'built') {
      closeBubble();
      openHouse(game, h.o);
      return;
    }
    const opts = actionsFor(game, h);
    const r = canvas.getBoundingClientRect();
    showBubble(x - r.left, y - r.top, opts);
  };

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      dragging = false;
      pinched = true;
      const [a, b] = e.touches;
      const r = canvas.getBoundingClientRect();
      pinch = {
        d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        z: renderer.cam.zoom,
        // the bit of world between the fingers, so it can stay between them
        anchor: renderer.toWorld((a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top),
      };
      e.preventDefault();
      return;
    }
    if (e.touches.length === 1) pinched = false;
    closeBubbleIfTapOutside(e);
    begin(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (pinch && e.touches.length === 2) {
      const [a, b] = e.touches;
      const r = canvas.getBoundingClientRect();
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      renderer.cam.zoom = Math.max(1, Math.min(renderer.maxZoom(), pinch.z * (d / pinch.d)));
      renderer.userZoom = true;
      // whatever was between the fingers when they went down stays between
      // them, so the village grows out of the spot being looked at
      const mid = renderer.toWorld((a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top);
      renderer.cam.x += pinch.anchor.x - mid.x;
      renderer.cam.y += pinch.anchor.y - mid.y;
      renderer.clampCamera();
      e.preventDefault();
      return;
    }
    drag(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, { passive: false });

  const finish = (e) => {
    if (pinch && e.touches.length < 2) {
      pinch = null;
      // a finger still down carries on from where it is now, not from where
      // the first one landed a pinch ago
      if (e.touches.length === 1) { lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
      return;
    }
    const t = e.changedTouches && e.changedTouches[0];
    if (t) end(t.clientX, t.clientY);
  };
  canvas.addEventListener('touchend', finish);
  canvas.addEventListener('touchcancel', finish);

  canvas.addEventListener('mousedown', (e) => { closeBubbleIfTapOutside(e); begin(e.clientX, e.clientY); });
  window.addEventListener('mousemove', (e) => drag(e.clientX, e.clientY));
  window.addEventListener('mouseup', (e) => end(e.clientX, e.clientY));
  canvas.addEventListener('wheel', (e) => {
    renderer.cam.zoom = Math.max(1, Math.min(renderer.maxZoom(), renderer.cam.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
    renderer.userZoom = true;
    renderer.clampCamera();
    e.preventDefault();
  }, { passive: false });

  // Double tap to see the whole world again.
  //
  // This is what kept throwing a pinch away. Two fingers come off a pinch as
  // two touchends a fraction of a second apart, which is indistinguishable
  // from a double tap unless you look — so the zoom somebody had just chosen
  // snapped straight back to the whole world, and only survived when the two
  // fingers happened to lift more than a third of a second apart. Hence
  // "sometimes it works". Only a real single-finger tap counts now: nothing
  // else still down, no second finger anywhere in this gesture, and short and
  // still enough to be a tap at all.
  let lastTap = 0;
  canvas.addEventListener('touchend', (e) => {
    if (pinched || (e.touches && e.touches.length > 0)) { lastTap = 0; return; }
    if (moved > 12 || Date.now() - startT > 700) { lastTap = 0; return; }
    const now = Date.now();
    if (now - lastTap < 320) {
      renderer.userZoom = false; renderer.resize(); closeBubble();
      lastTap = 0;
      return;
    }
    lastTap = now;
  });

  function closeBubbleIfTapOutside(e) {
    if (bubble && !bubble.contains(e.target)) closeBubble();
  }
}

export { hit };
