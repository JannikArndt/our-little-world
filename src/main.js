// Our Little World — start here.

import { Session } from './net/session.js';
import { LocalTransport, WsTransport, SoloTransport } from './net/transport.js';
import { Directory, apiBase } from './net/directory.js';
import { Renderer } from './render/renderer.js';
import { Hud } from './ui/hud.js';
import { installInput, renderModeBar, closeBubble } from './ui/interact.js';
import { openPanel, message, closePanel } from './ui/overlay.js';
import { ROLE, otherRole, byId, roleName } from './core/world.js';
import { tr, detectLang, setLang, currentLang, LANGUAGES } from './core/i18n.js';
import { TILE } from './core/grid.js';
import { deviceId, rememberWorld } from './core/persist.js';
import { startScreen } from './ui/start.js';
import { openInvite } from './ui/invite.js';
import { openChop } from './minigames/chop.js';
import { openSawmill, openMill } from './minigames/sawmill.js';
import { openBridge, openRepair } from './minigames/bridge.js';
import { openHouse } from './minigames/house.js';
import { openCare } from './minigames/care.js';

const qs = new URLSearchParams(location.search);
const dir = new Directory(apiBase(qs));
const device = deviceId();
let screen = null;

/* ------------------------------------------------------------------ */
/* start screen                                                       */
/* ------------------------------------------------------------------ */

/** Fill in the start screen in whichever language, and offer the other one. */
function applyStartText() {
  document.title = tr('app.title');
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
  if (screen) screen.render();
}

async function boot() {
  detectLang();
  applyStartText();

  // one question to the host: is there a world directory here? The answer is
  // remembered, so a static host is asked once ever and costs one 404.
  await dir.probe();
  applyStartText();

  screen = startScreen({
    dir: dir,
    qs: qs,
    onPlay: (choice) => {
      document.getElementById('start').classList.add('hidden');
      document.getElementById('game').classList.remove('hidden');
      startGame(choice);
    },
  });
}

/** Use the relay if the host has one; otherwise two windows on this device. */
function chooseTransport(room, solo) {
  if (solo) return new SoloTransport();
  const given = qs.get('server');
  if (given) return new WsTransport(given, room);
  if (location.protocol.indexOf('http') !== 0) return new LocalTransport(room);
  if (dir.reachable) {
    return new WsTransport((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/relay', room);
  }
  return new LocalTransport(room);
}

/* ------------------------------------------------------------------ */
/* the game object everything else talks to                           */
/* ------------------------------------------------------------------ */

async function startGame(choice) {
  const room = choice.world;
  const solo = !!choice.solo;
  const chosenRole = choice.role === 'B' ? 'B' : 'A';
  const transport = chooseTransport(room, solo);

  // A world the directory knows about keeps its state on the server as well as
  // on this device, so whoever opens the page first gets the real world back.
  const registered = !solo && dir.reachable;
  const remote = registered ? {
    load: () => dir.snapshot(room),
    save: (tick, text, beacon) => (beacon
      ? dir.beaconSnapshot(room, device, tick, text)
      : dir.putSnapshot(room, device, tick, text)),
  } : null;

  const session = new Session({ room, role: chosenRole, transport, solo, remote });

  // this device remembers the world, and the address becomes the invitation
  rememberWorld(room, solo ? null : chosenRole);
  try {
    history.replaceState(null, '', location.pathname + '?world=' + encodeURIComponent(room));
  } catch (e) { /* a file:// page has no history to rewrite */ }

  const canvas = document.getElementById('world');
  const renderer = new Renderer(canvas);

  const game = {
    session, renderer,
    role: chosenRole,
    other: otherRole(chosenRole),
    canSwap: solo,
    mode: null,
    partnerOnline: false,
    worldName: room,
    // true while the other spot in this world has never been taken: then the
    // partner chip offers an invitation instead of a way to share planks
    spotFree: registered && !!(choice.free && choice.free.length),
    get world() { return session.world; },

    invite() { openInvite(game); },

    dispatch(a) { return session.dispatch(a); },

    setMode(m) {
      game.mode = m;
      closeBubble();
      renderModeBar(game);
    },

    look(tx, ty, zoom) {
      renderer.cam.x = tx * TILE;
      renderer.cam.y = ty * TILE;
      if (zoom) { renderer.cam.zoom = Math.max(zoom, renderer.cam.zoom); renderer.userZoom = true; }
      renderer.clampCamera();
    },

    hint(text) { message(text); },

    swapRole() {
      game.role = game.role === 'A' ? 'B' : 'A';
      game.other = otherRole(game.role);
      game.setMode(null);
      hud.last = {};
    },

    /** Take us to whatever the guide is talking about. */
    showMe(id) {
      const w = game.world;
      const s = w.bridge.site;
      const at = {
        bridge_broken: () => [(s.x0 + s.x1) / 2 + 0.5, s.row + 1],
        no_bridge: () => [(s.x0 + s.x1) / 2 + 0.5, s.row + 1],
        homeless: () => { const b = w.buildings.find(b => b.state === 'site'); return b ? [b.x + 1.5, b.y + 1] : null; },
        hungry: () => { const p = w.plots[0]; return p ? [p.x + 1, p.y + 1] : [w.larder.x, w.larder.y]; },
        wheat_ready: () => { const p = w.plots.find(p => p.state === 'ripe'); return p ? [p.x + 1, p.y + 1] : null; },
        sheep: () => { const sh = w.sheep.find(x => x.mood !== 'ok') || w.sheep[0]; return [sh.x, sh.y]; },
      }[id];
      const at2 = at ? at() : null;
      if (at2) game.look(at2[0], at2[1], 2);
      else { renderer.userZoom = false; renderer.resize(); }
    },

    pointAtSite() {
      const s = game.world.buildings.find(b => b.state === 'site');
      if (s) { game.look(s.x + s.w / 2, s.y + s.h / 2, 1.8); message(tr('msg.plotHere')); }
    },

    goToNotice(n) {
      const w = game.world;
      const at = {
        hungry: () => [w.larder.x, w.larder.y],
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
  window.addEventListener('pagehide', () => session.checkpoint(true));

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
    tellServer();
  }

  // and a much slower one to the directory: it keeps the world from being
  // forgotten, and tells us whether anybody has taken the other spot yet
  let lastSeen = 0;
  function tellServer() {
    if (!registered) return;
    const now = Date.now();
    if (now - lastSeen < 60000) return;
    lastSeen = now;
    dir.seen(room, device, chosenRole).then((r) => {
      if (r && r.world) game.spotFree = r.world.free.length > 0;
    });
  }
  tellServer();

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

  // nobody has taken the other spot yet: say so once, quietly, rather than
  // putting an invitation in front of a child who wants to play
  if (game.spotFree) {
    setTimeout(() => message(tr('invite.hint', { role: roleName(game.other) })), 1800);
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
