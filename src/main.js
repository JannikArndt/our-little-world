// Our Little World — start here.

import { Session } from './net/session.js';
import { LocalTransport, WsTransport, SoloTransport } from './net/transport.js';
import { Directory, apiBase } from './net/directory.js';
import { Renderer } from './render/renderer.js';
import { Hud } from './ui/hud.js';
import { installInput, renderModeBar, closeBubble } from './ui/interact.js';
import { message, closePanel, closeMenu, clearMessages, isPanelOpen } from './ui/overlay.js';
import { otherRole, byId } from './core/world.js';
import { tr, detectLang, setLang, currentLang, LANGUAGES } from './core/i18n.js';
import { TILE } from './core/grid.js';
import { deviceId, rememberWorld } from './core/persist.js';
import { newerBuild, watchForNewer, reloadNow, whenQuiet } from './core/fresh.js';
import { startScreen } from './ui/start.js';
import { openInvite } from './ui/invite.js';
import { showChangelog, VERSION } from './ui/whatsnew.js';
import { showWelcomeBack } from './ui/welcome.js';

const qs = new URLSearchParams(location.search);
const dir = new Directory(apiBase(qs));
const device = deviceId();
let screen = null;
let liveGame = null; // the game object, once a world is actually up and running

// A tap in progress anywhere is not a quiet moment, wherever on the page it
// lands — this is the one thing `whenQuiet` needs that nothing else here
// already tracks, so it is watched for on its own.
let pointerDown = false;
window.addEventListener(
  'touchstart',
  () => {
    pointerDown = true;
  },
  { passive: true },
);
window.addEventListener(
  'touchend',
  () => {
    pointerDown = false;
  },
  { passive: true },
);
window.addEventListener(
  'touchcancel',
  () => {
    pointerDown = false;
  },
  { passive: true },
);
window.addEventListener('mousedown', () => {
  pointerDown = true;
});
window.addEventListener('mouseup', () => {
  pointerDown = false;
});

/* ------------------------------------------------------------------ */
/* start screen                                                       */
/* ------------------------------------------------------------------ */

/**
 * The front door's reload button. It is always there — that is the whole point
 * of it — and says so more loudly once we know there is something newer.
 */
function showReloadLabel() {
  const b = document.getElementById('reloadBtn');
  if (!b) return;
  const news = newerBuild();
  // the front door has no icon column, so the sign carries its own picture
  b.textContent = (news ? '✨ ' : '↻ ') + tr(news ? 'ui.reloadNew' : 'ui.reload');
  b.className = 'link-btn' + (news ? ' fresh' : '');
}

/**
 * Is right now a moment a reload can happen in without taking anything with
 * it? At the front door there is no world yet, so nothing ever is in progress
 * — always yes. Mid-game it means every door onto the world itself is shut: no
 * panel open, no drop-down menu open, no mode running (the road-drawing and
 * sheep-walking bar), and no finger still down.
 */
function quietForReload() {
  // half a typed world name is the one thing the front door can lose
  const typing = document.activeElement;
  if (typing?.tagName === 'INPUT') return false;
  if (!liveGame) return true;
  const menu = document.getElementById('menuLayer');
  return !isPanelOpen() && menu.classList.contains('hidden') && !liveGame.mode && !pointerDown;
}

/**
 * The fetch itself, once it is safe. Mid-game the village is saved to this
 * device and the server first, so the blink loses nothing; at the front door
 * there is no village yet to lose, so it goes straight there.
 */
function fetchNewBuild() {
  if (liveGame) {
    message(tr('ui.reloadFetching'));
    liveGame.session.checkpoint();
    reloadNow(liveGame.worldName);
  } else {
    reloadNow();
  }
}

/** Fill in the start screen in whichever language, and offer the other one. */
function applyStartText() {
  document.title = tr('app.title');
  const version = document.getElementById('versionBtn');
  if (version) version.textContent = 'v' + VERSION + ' · ✨ ' + tr('hist.whatsNewShort');
  showReloadLabel();
  const nodes = document.querySelectorAll('[data-t]');
  for (let i = 0; i < nodes.length; i++) nodes[i].textContent = tr(nodes[i].getAttribute('data-t'));
  const row = document.getElementById('langRow');
  row.innerHTML = '';
  for (const l of LANGUAGES) {
    const b = document.createElement('button');
    b.className = 'lang-btn' + (l.id === currentLang() ? ' on' : '');
    b.type = 'button';
    b.textContent = l.flag + ' ' + l.name;
    b.addEventListener('click', () => {
      setLang(l.id);
      applyStartText();
    });
    row.appendChild(b);
  }
  if (screen) screen.render();
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
    const h = Math.round(vv?.height || window.innerHeight || 0);
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

async function boot() {
  trackViewportHeight();
  detectLang();
  applyStartText();

  document.getElementById('versionBtn').addEventListener('click', () => showChangelog());

  // the way out of a Home Screen app, which has no address bar to reload from
  document.getElementById('reloadBtn').addEventListener('click', () => reloadNow());
  // coming back to the app, and now and then besides, is when it finds out
  // whether it is old. The doors say more either way, and the moment it is
  // safe to, the game fetches the newer build itself — nobody has to notice
  // the doors to get it.
  watchForNewer(() => {
    showReloadLabel();
    whenQuiet(quietForReload, fetchNewBuild);
  });

  // one question to the host: is there a world directory here? The answer is
  // remembered, so a static host is asked once ever and costs one 404.
  await dir.probe();
  applyStartText();

  screen = startScreen({
    dir: dir,
    qs: qs,
    onPlay: choice => {
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
    return new WsTransport(
      (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/relay',
      room,
    );
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
  const remote = registered
    ? {
        load: () => dir.snapshot(room),
        save: (tick, text, beacon, reset) =>
          beacon
            ? dir.beaconSnapshot(room, device, tick, text)
            : dir.putSnapshot(room, device, tick, text, reset),
      }
    : null;

  const session = new Session({ room, role: chosenRole, transport, solo, remote });

  // this device remembers the world, and the address becomes the invitation
  rememberWorld(room, solo ? null : chosenRole);
  try {
    history.replaceState(null, '', location.pathname + '?world=' + encodeURIComponent(room));
  } catch {
    /* a file:// page has no history to rewrite */
  }

  const canvas = document.getElementById('world');
  const renderer = new Renderer(canvas);

  const game = {
    session,
    renderer,
    role: chosenRole,
    other: otherRole(chosenRole),
    canSwap: solo,
    mode: null,
    partnerOnline: false,
    worldName: room,
    // the roles in this world nobody has taken yet: their chip in the top row
    // offers an invitation rather than a way to share planks
    freeRoles: (registered && choice.free) || [],
    get world() {
      return session.world;
    },

    invite(id) {
      openInvite(game, id);
    },

    dispatch(a) {
      return session.dispatch(a);
    },

    /** Is that role at the screen right now? Yours always is. */
    isOnline(id) {
      if (id === game.role) return true;
      if (solo) return true;
      const w = session.world;
      if (!w || !w.players[id]) return false;
      return w.tick - (w.players[id].seen || -9999) < 120;
    },

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

    hint(text) {
      message(text);
    },

    /**
     * Out of the world and back to the front door. Everything is saved first,
     * and the world's name goes in the address, so coming back is one tap and
     * the village is exactly as it was.
     */
    leave() {
      session.checkpoint();
      location.href = location.pathname + '?world=' + encodeURIComponent(room);
    },

    /**
     * The same door, but it fetches the game again on the way through. On a
     * Home Screen there is nothing else that can: no address bar, no reload,
     * and iOS keeps yesterday's copy running for as long as you let it.
     */
    refetch() {
      session.checkpoint();
      reloadNow(room);
    },

    swapRole() {
      game.role = game.role === 'A' ? 'B' : 'A';
      game.other = otherRole(game.role);
      game.setMode(null);
      hud.relabel();
    },

    /** The language changed: everything holding words draws itself again. */
    relabel() {
      document.title = tr('app.title');
      applyStartText();
      hud.relabel();
      renderModeBar(game);
    },

    /**
     * Everything here goes away and the first morning begins again — right
     * here, without a trip through the front door, because that is what the
     * card says will happen.
     *
     * The relay and the directory remember this world too, so forgetting it on
     * this device would only mean being handed the old village back on the way
     * in. `Session.startOver()` pushes a fresh world to all three instead.
     */
    startOver() {
      session.startOver();
      game.spotlight = null;
      game.setMode(null);
      hud.relabel();
      game.startDay(false);
    },

    /**
     * Take us to whatever the guide is talking about — all of it at once, and
     * with a ring around whoever was named, so a name is never just a name.
     */
    showMe(problem, maxZoom) {
      const pts = problem?.points || [];
      game.spotlight = null;
      if (!pts.length) {
        renderer.userZoom = false;
        renderer.resize();
        return;
      }

      let minX = 1e9,
        minY = 1e9,
        maxX = -1e9,
        maxY = -1e9;
      for (const p of pts) {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
      // everything named, plus room to see what is around it
      const spanX = maxX - minX + 8,
        spanY = maxY - minY + 6;
      const vw = renderer.view.w || 640,
        vh = renderer.view.h || 480;
      const fits = Math.min(vw / (spanX * TILE), vh / (spanY * TILE)) / (renderer.fit || 1);
      game.look(
        (minX + maxX) / 2,
        (minY + maxY) / 2,
        Math.max(1, Math.min(maxZoom || 2.2, fits)),
        true,
      );

      if (problem.subject) {
        game.spotlight = {
          kind: problem.subject.kind,
          id: problem.subject.id,
          r: problem.subject.kind === 'sheep' ? 20 : 17,
          until: Date.now() + 25000,
        };
      }
    },

    /** Where the ring is right now — people walk about while you read. */
    spotlightAt() {
      const sp = game.spotlight;
      if (!sp) return null;
      if (Date.now() > sp.until) {
        game.spotlight = null;
        return null;
      }
      const w = game.world;
      const o = sp.kind === 'sheep' ? byId(w.sheep, sp.id) : byId(w.villagers, sp.id);
      if (!o) {
        game.spotlight = null;
        return null;
      }
      return { x: o.x, y: o.y, r: sp.r };
    },

    pointAtSite() {
      const s = game.world.buildings.find(b => b.state === 'site');
      if (s) {
        game.look(s.x + s.w / 2, s.y + s.h / 2, 1.8);
        message(tr('msg.plotHere'));
      }
    },

    goToNotice(n) {
      const w = game.world;
      const at = {
        hungry: () => [w.larder.x, w.larder.y],
        poorly: () => {
          const v = w.villagers.find(x => x.poorly > 0);
          return v ? [v.x, v.y] : null;
        },
        homeless: () => {
          const s = w.buildings.find(b => b.state === 'site');
          return s ? [s.x + 1.5, s.y + 1] : null;
        },
        sheep_far: () => [w.sheep[0].x, w.sheep[0].y],
        sheep_in_field: () => {
          const s = w.sheep.find(s => s.x > 24);
          return s ? [s.x, s.y] : null;
        },
        wheat_ready: () => {
          const p = w.plots.find(p => p.state === 'ripe');
          return p ? [p.x + 1, p.y + 1] : null;
        },
        bridge_broken: () => [
          (w.bridge.site.x0 + w.bridge.site.x1) / 2 + 0.5,
          w.bridge.site.row + 1,
        ],
        newfamily: () => {
          const b = byId(w.buildings, 'site_east');
          return b ? [b.x + 1.5, b.y + 1] : null;
        },
        critter: () => (w.visitors?.[0] ? [w.visitors[0].x, w.visitors[0].y] : null),
      }[n.id];
      const p = at ? at() : null;
      if (p) game.look(p[0], p[1], 1.9);
      game.dispatch({ type: 'notice.dismiss', id: n.id });
    },

    /** A day begins. Nothing else starts one; somebody has to want it. */
    startDay(newDay) {
      closePanel();
      closeMenu();
      clearMessages();
      session.startBlock(newDay);
    },
  };

  liveGame = game; // from here on, `quietForReload` is checking this world
  const hud = new Hud(game);
  game.hud = hud;

  session.on((what, data) => {
    // one day runs into the next: a good place to save, and on we go. Only
    // the host says so, the way it does for events, so the day turns once.
    if (what === 'block-ended') {
      session.checkpoint();
      if (session.isHost) game.startDay(true);
    }
    if (what === 'status') updatePartner();
    // the other player started the next day: come along with them
    if (what === 'acted' && data?.type === 'block.start') {
      closePanel();
      clearMessages();
    }
  });

  await session.start();
  renderer.resize();
  installInput(game, renderer, canvas);

  window.addEventListener('resize', () => renderer.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 300));
  // the visual viewport moves on its own on a phone, without a window resize
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => renderer.resize());
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) session.checkpoint();
  });
  window.addEventListener('pagehide', () => session.checkpoint(true));

  function updatePartner() {
    game.partnerOnline = game.isOnline(game.other);
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
    dir.seen(room, device, chosenRole).then(r => {
      if (r?.world) game.freeRoles = r.world.free || [];
    });
  }
  tellServer();

  /* ---------------- the frame loop ---------------- */

  let last = 0,
    frame = 0;
  function step(t) {
    const dt = last ? Math.min(100, t - last) : 16;
    last = t;
    session.update(dt);
    const w = session.world;
    if (w) {
      renderer.render(w, t, {
        overlay: game.mode?.overlay ? ctx => game.mode.overlay(ctx) : null,
        highlight: game.mode?.highlight ? game.mode.highlight() : null,
        spotlight: game.spotlightAt(),
      });
      if (frame++ % 5 === 0) {
        renderer.remeasure();
        hud.update();
        beat();
      }
      if (game.mode && frame % 5 === 0) renderModeBar(game);
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);

  // The day starts with the game. If the world is already in the middle of
  // one — the other player got here first — we simply join it.
  if (!session.world.block.active) game.startDay(session.world.block.endedAt !== null);

  // Coming back explains itself (law 10) — but only once, after the day's own
  // panels are out of the way, and only when there is something to tell.
  const since = session.world.ext.since?.[chosenRole] || [];
  if (since.length) showWelcomeBack(game, since);

  window.OLW = game; // handy when poking at it from a console
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
