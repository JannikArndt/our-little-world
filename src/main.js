// Our Little World — start here.

import { Session } from './net/session.js';
import { LocalTransport, WsTransport, SoloTransport } from './net/transport.js';
import { Renderer } from './render/renderer.js';
import { Hud } from './ui/hud.js';
import { installInput, renderModeBar, closeBubble, buildProject } from './ui/interact.js';
import { openPanel, message, closePanel } from './ui/overlay.js';
import { ROLE, otherRole, byId, roleName, can } from './core/world.js';
import { tr, detectLang, setLang, currentLang, LANGUAGES } from './core/i18n.js';
import { TILE } from './core/grid.js';
import { rememberRole, recallRole } from './core/persist.js';
import { showChangelog, VERSION } from './ui/whatsnew.js';
import { openChop } from './minigames/chop.js';
import { openSawmill, openMill } from './minigames/sawmill.js';
import { openBridge, openRepair } from './minigames/bridge.js';
import { openHouse } from './minigames/house.js';
import { openCare } from './minigames/care.js';
import { openFish } from './minigames/fish.js';

const qs = new URLSearchParams(location.search);

/* ------------------------------------------------------------------ */
/* start screen                                                       */
/* ------------------------------------------------------------------ */

/** Fill in the start screen in whichever language, and offer the other one. */
function applyStartText() {
  document.title = tr('app.title');
  const version = document.getElementById('versionBtn');
  if (version) version.textContent = 'v' + VERSION + ' · ' + tr('hist.whatsNewShort');
  const nodes = document.querySelectorAll('[data-t]');
  for (let i = 0; i < nodes.length; i++) nodes[i].textContent = tr(nodes[i].getAttribute('data-t'));
  const row = document.getElementById('langRow');
  row.innerHTML = '';
  for (const l of LANGUAGES) {
    const b = document.createElement('button');
    b.className = 'lang-btn' + (l.id === currentLang() ? ' on' : '');
    b.type = 'button';
    b.textContent = l.flag + ' ' + l.name;
    b.addEventListener('click', () => { setLang(l.id); applyStartText(); });
    row.appendChild(b);
  }
}

/**
 * How tall the browser is actually showing us. On a phone the toolbars sit on
 * top of the page, so 100% of the body reaches under them and the last thing on
 * screen ends up behind the address bar. The visual viewport knows better.
 */
function trackViewportHeight() {
  const vv = window.visualViewport;
  const apply = () => {
    // while the keyboard is up the viewport is tiny; leave the layout alone
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    const h = Math.round((vv && vv.height) || window.innerHeight || 0);
    if (h > 0) document.documentElement.style.setProperty('--app-h', h + 'px');
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 300));
  if (vv) {
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
  }
  document.addEventListener('focusout', () => setTimeout(apply, 60));
}

function boot() {
  trackViewportHeight();
  detectLang();
  applyStartText();
  const start = document.getElementById('start');
  const roomInput = document.getElementById('roomInput');
  roomInput.value = (qs.get('room') || 'home').slice(0, 24);

  document.getElementById('versionBtn').addEventListener('click', () => showChangelog());

  const remembered = recallRole();
  if (remembered) {
    const b = start.querySelector('[data-role="' + remembered + '"]');
    if (b) b.style.borderColor = ROLE[remembered] ? ROLE[remembered].colour : '#d9c9ae';
  }

  start.addEventListener('click', (e) => {
    const btn = e.target.closest ? e.target.closest('[data-role]') : null;
    if (!btn) return;
    const role = btn.getAttribute('data-role');
    const room = (roomInput.value || 'home').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'home';
    rememberRole(role);
    start.classList.add('hidden');
    document.getElementById('game').classList.remove('hidden');
    startGame(role, room);
  });

  const auto = qs.get('role');
  if (auto === 'A' || auto === 'B' || auto === 'BOTH') {
    const b = start.querySelector('[data-role="' + auto + '"]');
    if (b) setTimeout(() => b.click(), 0);
  }
}

/** Use the relay if one is answering; otherwise two windows on this device. */
async function chooseTransport(room, solo) {
  if (solo) return new SoloTransport();

  // An explicit ?server= is a promise that a relay is there, so just use it.
  const given = qs.get('server');
  if (given) return new WsTransport(given, room);

  // Otherwise ask over plain HTTP whether this host has one. A 404 is a
  // perfectly normal answer (a static host has no relay) and costs nothing;
  // opening a doomed WebSocket would fill the console with red instead.
  if (location.protocol.indexOf('http') !== 0) return new LocalTransport(room);
  if (await hasRelay()) {
    return new WsTransport((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/relay', room);
  }
  return new LocalTransport(room);
}

const RELAY_KEY = 'olw.relay.' + location.host;

function hasRelay() {
  if (typeof fetch !== 'function') return Promise.resolve(false);
  // remembered from last time, so a static host is not asked twice
  try {
    const seen = localStorage.getItem(RELAY_KEY);
    if (seen === 'yes') return Promise.resolve(true);
    if (seen === 'no') return Promise.resolve(false);
  } catch (e) { /* no storage, just ask */ }

  const remember = (v) => {
    try { localStorage.setItem(RELAY_KEY, v ? 'yes' : 'no'); } catch (e) { /* fine */ }
    return v;
  };
  const ask = fetch('rooms', { method: 'GET' })
    .then(r => remember(r.ok && (r.headers.get('content-type') || '').indexOf('json') >= 0))
    .catch(() => remember(false));
  const giveUp = new Promise(r => setTimeout(() => r(false), 1500));
  return Promise.race([ask, giveUp]);
}

/* ------------------------------------------------------------------ */
/* the game object everything else talks to                           */
/* ------------------------------------------------------------------ */

async function startGame(chosenRole, room) {
  const solo = chosenRole === 'BOTH';
  const transport = await chooseTransport(room, solo);
  const session = new Session({ room, role: solo ? 'A' : chosenRole, transport, solo });

  const canvas = document.getElementById('world');
  const renderer = new Renderer(canvas);

  const game = {
    session, renderer,
    role: solo ? 'A' : chosenRole,
    other: solo ? 'B' : otherRole(chosenRole),
    canSwap: solo,
    mode: null,
    partnerOnline: false,
    get world() { return session.world; },

    dispatch(a) { return session.dispatch(a); },

    setMode(m) {
      game.mode = m;
      closeBubble();
      renderModeBar(game);
    },

    spotlight: null,

    look(tx, ty, zoom, exact) {
      renderer.cam.x = tx * TILE;
      renderer.cam.y = ty * TILE;
      if (zoom) {
        renderer.cam.zoom = exact ? zoom : Math.max(zoom, renderer.cam.zoom);
        renderer.userZoom = true;
      }
      renderer.clampCamera();
    },

    hint(text) { message(text); },

    /**
     * Out of the world and back to the front door. Everything is saved first,
     * and the world's name goes in the address, so coming back is one tap and
     * the village is exactly as it was.
     */
    leave() {
      session.checkpoint();
      location.href = location.pathname + '?room=' + encodeURIComponent(room);
    },

    swapRole() {
      game.role = game.role === 'A' ? 'B' : 'A';
      game.other = otherRole(game.role);
      game.setMode(null);
      hud.last = {};
    },

    /**
     * Take us to whatever the guide is talking about — all of it at once, and
     * with a ring around whoever was named, so a name is never just a name.
     */
    showMe(problem, maxZoom) {
      const pts = (problem && problem.points) || [];
      game.spotlight = null;
      if (!pts.length) { renderer.userZoom = false; renderer.resize(); return; }

      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (const p of pts) {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
      // everything named, plus room to see what is around it
      const spanX = (maxX - minX) + 8, spanY = (maxY - minY) + 6;
      const vw = renderer.view.w || 640, vh = renderer.view.h || 480;
      const fits = Math.min(vw / (spanX * TILE), vh / (spanY * TILE)) / (renderer.fit || 1);
      game.look((minX + maxX) / 2, (minY + maxY) / 2,
                Math.max(1, Math.min(maxZoom || 2.2, fits)), true);

      if (problem.subject) {
        game.spotlight = {
          kind: problem.subject.kind, id: problem.subject.id,
          r: problem.subject.kind === 'sheep' ? 20 : 17,
          until: Date.now() + 25000,
        };
      }
    },

    /** Where the ring is right now — people walk about while you read. */
    spotlightAt() {
      const sp = game.spotlight;
      if (!sp) return null;
      if (Date.now() > sp.until) { game.spotlight = null; return null; }
      const w = game.world;
      const o = sp.kind === 'sheep' ? byId(w.sheep, sp.id) : byId(w.villagers, sp.id);
      if (!o) { game.spotlight = null; return null; }
      return { x: o.x, y: o.y, r: sp.r };
    },

    pointAtSite() {
      const s = game.world.buildings.find(b => b.state === 'site');
      if (s) { game.look(s.x + s.w / 2, s.y + s.h / 2, 1.8); message(tr('msg.plotHere')); }
    },

    goToNotice(n) {
      const w = game.world;
      const at = {
        hungry: () => [w.larder.x, w.larder.y],
        poorly: () => { const v = w.villagers.find(x => x.poorly > 0); return v ? [v.x, v.y] : null; },
        homeless: () => { const s = w.buildings.find(b => b.state === 'site'); return s ? [s.x + 1.5, s.y + 1] : null; },
        sheep_far: () => [w.sheep[0].x, w.sheep[0].y],
        sheep_in_field: () => { const s = w.sheep.find(s => s.x > 24); return s ? [s.x, s.y] : null; },
        wheat_ready: () => { const p = w.plots.find(p => p.state === 'ripe'); return p ? [p.x + 1, p.y + 1] : null; },
        bridge_broken: () => [(w.bridge.site.x0 + w.bridge.site.x1) / 2 + 0.5, w.bridge.site.row + 1],
        newfamily: () => { const b = byId(w.buildings, 'site_east'); return b ? [b.x + 1.5, b.y + 1] : null; },
        critter: () => (w.visitors && w.visitors[0]) ? [w.visitors[0].x, w.visitors[0].y] : null,
      }[n.id];
      const p = at ? at() : null;
      if (p) game.look(p[0], p[1], 1.9);
      game.dispatch({ type: 'notice.dismiss', id: n.id });
    },

    goToAsk(a) {
      const w = game.world;
      // some asks are about one particular thing rather than a whole trade
      const target = a.targetId ? byId(w.buildings, a.targetId) : null;
      if (target && target.type === 'boat') {
        game.look(target.x + target.w, target.y + 0.5, 2);
        if (target.state === 'plan') { if (can(w, game.role, 'bridge')) buildProject(game, 'boat'); else message(tr('teach.cannot')); }
        else if (can(w, game.role, 'farm')) openFish(game, target);
        else message(tr('teach.cannot'));
        return;
      }
      if (target && target.type === 'play') {
        game.look(target.x + target.w / 2, target.y + target.h / 2, 2);
        if (can(w, game.role, 'house')) buildProject(game, 'play');
        else message(tr('teach.cannot'));
        return;
      }
      if (a.cap === 'farm' && a.targetId && byId(w.trees, a.targetId)) {
        const t = byId(w.trees, a.targetId);
        game.look(t.x + 0.5, t.y + 0.5, 2);
        if (!can(w, game.role, 'farm')) { message(tr('teach.cannot')); return; }
        if (game.dispatch({ type: 'tree.plant', role: game.role, treeId: t.id })) message(tr('msg.planted'));
        return;
      }
      const open = {
        fell: () => { const t = byId(w.trees, a.targetId); if (t && t.state === 'standing') { game.look(t.x, t.y, 2); openChop(game, t); } },
        saw: () => openSawmill(game),
        mill: () => openMill(game),
        bridge: () => { game.look((w.bridge.site.x0 + w.bridge.site.x1) / 2, w.bridge.site.row + 1, 1.8); w.bridge.damaged ? openRepair(game) : openBridge(game); },
        house: () => { const b = byId(w.buildings, a.targetId) || w.buildings.find(x => x.state === 'site'); if (b) { game.look(b.x + 1.5, b.y + 1, 1.8); openHouse(game, b); } },
        care: () => { const s = byId(w.sheep, a.targetId) || w.sheep[0]; if (s) { game.look(s.x, s.y, 2); openCare(game, s); } },
        herd: () => { const s = byId(w.sheep, a.targetId) || w.sheep[0]; if (s) game.look(s.x, s.y, 2); },
        road: () => game.setMode(null),
        farm: () => { const p = w.plots[0]; if (p) game.look(p.x + 1, p.y + 1, 1.6); },
      }[a.cap];
      if (!w.players[game.role].caps[a.cap]) {
        message(tr('teach.cannot'));
        return;
      }
      if (open) open();
    },

    startBlock(newDay) {
      session.startBlock(newDay);
      closePanel();
      setTimeout(() => hud.showGuide({ first: true }), 120);
    },
    endBlock() {
      session.dispatch({ type: 'block.end' });
      session.checkpoint();
      hud.showSummary();
    },
  };

  const hud = new Hud(game);
  game.hud = hud;

  session.on((what, data) => {
    if (what === 'block-ended') { session.checkpoint(); hud.showSummary(); }
    if (what === 'status') updatePartner();
    // if the other player starts the morning, put our invitation away
    if (what === 'acted' && data && data.type === 'block.start' && game._offer) {
      game._offer.close(); game._offer = null;
      message(tr('block.otherStarted', { role: roleName(game.other) }));
    }
  });

  await session.start();
  renderer.resize();
  installInput(game, renderer, canvas);

  window.addEventListener('resize', () => renderer.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 300));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) session.checkpoint(); });
  window.addEventListener('pagehide', () => session.checkpoint());

  function updatePartner() {
    const w = session.world;
    if (!w) return;
    game.partnerOnline = solo ? true : (w.tick - (w.players[game.other].seen || -9999)) < 120;
  }

  // presence heartbeat
  let lastBeat = -999;
  function beat() {
    const w = session.world;
    if (!w) return;
    if (w.tick - lastBeat < 40) return;
    lastBeat = w.tick;
    session.dispatch({ type: 'presence', role: game.role, busy: null });
    if (solo) session.dispatch({ type: 'presence', role: game.other, busy: null });
    updatePartner();
  }

  /* ---------------- the frame loop ---------------- */

  let last = 0, frame = 0;
  function step(t) {
    const dt = last ? Math.min(100, t - last) : 16;
    last = t;
    session.update(dt);
    const w = session.world;
    if (w) {
      renderer.render(w, t, {
        overlay: game.mode && game.mode.overlay ? (ctx) => game.mode.overlay(ctx) : null,
        highlight: game.mode && game.mode.highlight ? game.mode.highlight() : null,
        spotlight: game.spotlightAt(),
      });
      if ((frame++ % 5) === 0) { hud.update(); beat(); }
      if (game.mode && (frame % 5) === 0) renderModeBar(game);
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);

  // a phone held upright shows very little of the world
  if (window.innerHeight > window.innerWidth * 1.25) {
    setTimeout(() => message(tr('msg.sideways')), 2600);
  }

  // the shared ritual: agree to play for five minutes
  if (!session.world.block.active) offerBlock(game);
  else message(tr('block.joined'));

  window.OLW = game;      // handy when poking at it from a console
}

function offerBlock(game) {
  const w = game.world;
  const returning = w.tick > 0;
  const p = openPanel({
    title: tr(returning ? 'block.titleBack' : 'block.titleNew'),
    lead: tr(returning ? 'block.leadBack' : 'block.leadNew'),
    center: true,
  });
  game._offer = p;
  const r = p.row();
  r.appendChild(p.button(tr('block.start'), 'go', () => { game._offer = null; p.close(); game.startBlock(returning); }));
  r.appendChild(p.button(tr('block.look'), 'soft', () => { game._offer = null; p.close(); game.hud.showGuide(); }));
  const note = document.createElement('p');
  note.className = 'lead center';
  note.style.marginTop = '10px';
  note.textContent = tr('block.note');
  p.body.appendChild(note);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
