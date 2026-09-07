// The first screen: which world, and who are you in it.
//
// Three ways in, in the order a family actually needs them:
//
//   carry on      the worlds this device already belongs to — one tap, for weeks
//   start a new   the server names it and keeps the spot; you share the name
//   join          the worlds with a free spot, newest first
//
// Everything here degrades: with no directory on the host, "start a new one"
// still makes up a name and the two of you type it to each other, exactly as
// the game worked before.

import { el } from './overlay.js';
import { cleanName, prettyName, randomName, worldEmoji } from '../core/names.js';
import { deviceId, recentWorlds, rememberWorld, forgetWorld } from '../core/persist.js';
import { ROLE, roleName } from '../core/world.js';
import { tr, trn } from '../core/i18n.js';
import { shareWorld, worldLink } from './invite.js';

const MINUTE = 60000;

export function startScreen(opts) {
  const dir = opts.dir;
  const qs = opts.qs;
  const onPlay = opts.onPlay;
  const host = document.getElementById('startBody');
  const device = deviceId();

  // a link somebody sent, or an old ?room= bookmark
  const invited = cleanName((qs.get('world') || qs.get('room') || ''));

  let step = 'home';
  let pending = null;            // the world we just made, waiting for the other player
  let list = null;               // open worlds, once asked for
  let note = '';                 // one line of "that did not work"

  function go(next) { step = next; note = ''; render(); }

  function say(key, vars) { note = tr(key, vars); render(); }

  /* ---------------- entering a world ---------------- */

  function play(name, role, solo, free) {
    rememberWorld(name, solo ? null : role);
    onPlay({ world: name, role: role, solo: !!solo, free: free || null });
  }

  /**
   * Take a spot in a world we know the name of, then play it. A world named by
   * a link, a text field or an old bookmark is started if nobody has started
   * it yet; one picked off the list is not, because it should already be there.
   */
  function enter(name, wantedRole, start) {
    if (!dir.reachable) { play(name, wantedRole || guessRole(name), false); return; }
    busy(true);
    dir.join(name, device, wantedRole || null, start !== false).then((r) => {
      busy(false);
      if (!r) { play(name, wantedRole || guessRole(name), false); return; }   // server went quiet: play anyway
      if (r.status === 404) { say('join.gone'); return; }
      if (r.full || !r.role) {
        // Both spots taken. If we already know which of the two we are — our
        // own world, or a link that says so — we are not a third person and
        // this is not a door to be kept shut: the spots are there to stop
        // strangers wandering in, not to lock a family out of their village.
        if (wantedRole) { play(name, wantedRole, false, null); return; }
        say('join.full');
        return;
      }
      play(name, r.role, false, r.world ? r.world.free : null);
    });
  }

  function guessRole(name) {
    const known = recentWorlds().filter((w) => w.name === name)[0];
    return (known && known.role) || 'A';
  }

  function busy(on) {
    host.classList.toggle('busy', !!on);
  }

  /* ---------------- the steps ---------------- */

  function render() {
    host.innerHTML = '';
    if (step === 'home') renderHome();
    else if (step === 'new') renderPickRole();
    else if (step === 'made') renderMade();
    else if (step === 'join') renderJoin();
    if (note) host.appendChild(el('p', 'start-note warn', note));
  }

  function worldCard(o) {
    const b = el('button', 'world-card' + (o.wide ? ' wide' : ''));
    b.type = 'button';
    b.appendChild(el('span', 'w-emoji', worldEmoji(o.name)));
    const t = el('span', 'w-text');
    t.appendChild(el('span', 'w-name', prettyName(o.name)));
    if (o.line) t.appendChild(el('span', 'w-line', o.line));
    if (o.sub) t.appendChild(el('span', 'w-sub', o.sub));
    b.appendChild(t);
    if (o.onTap) b.addEventListener('click', o.onTap);
    return b;
  }

  function renderHome() {
    const mine = recentWorlds();

    // somebody sent a link: that world goes first, whatever else is here
    if (invited && !mine.some((w) => w.name === invited)) {
      host.appendChild(el('h2', 'start-h', tr('world.invited')));
      host.appendChild(worldCard({
        name: invited, wide: true,
        line: tr('world.joinThis'),
        onTap: () => enter(invited, null, true),
      }));
    }

    if (mine.length) {
      host.appendChild(el('h2', 'start-h', tr('world.yours')));
      for (const w of mine.slice(0, 4)) {
        host.appendChild(worldCard({
          name: w.name, wide: true,
          line: w.role ? tr('world.youAre', { role: roleName(w.role), emoji: ROLE[w.role].emoji }) : tr('role.both.name'),
          sub: ago(w.at),
          onTap: () => (w.role ? enter(w.name, w.role, true) : play(w.name, 'A', true)),
        }));
      }
    }

    host.appendChild(el('h2', 'start-h', mine.length ? tr('world.orStart') : tr('world.start')));

    const start = el('button', 'role-btn wide go');
    start.type = 'button';
    start.appendChild(el('span', 'role-emoji', '🌱'));
    start.appendChild(el('span', 'role-name', tr('world.newWorld')));
    start.appendChild(el('span', 'role-desc', tr('world.newWorldDesc')));
    start.addEventListener('click', () => go('new'));
    host.appendChild(start);

    if (dir.reachable) {
      const join = el('button', 'role-btn wide');
      join.type = 'button';
      join.appendChild(el('span', 'role-emoji', '🔭'));
      join.appendChild(el('span', 'role-name', tr('world.joinWorld')));
      join.appendChild(el('span', 'role-desc', tr('world.joinWorldDesc')));
      join.addEventListener('click', () => { go('join'); refreshList(); });
      host.appendChild(join);
    }

    const both = el('button', 'role-btn wide quiet');
    both.type = 'button';
    both.setAttribute('data-role', 'BOTH');
    both.appendChild(el('span', 'role-emoji', ROLE.A.emoji + ROLE.B.emoji));
    both.appendChild(el('span', 'role-name', tr('role.both.name')));
    both.appendChild(el('span', 'role-desc', tr('role.both.desc')));
    both.addEventListener('click', () => {
      const name = invited || (mine[0] && mine[0].name) || randomName();
      play(name, 'A', true);
    });
    host.appendChild(both);

    if (!dir.reachable) host.appendChild(el('p', 'start-note', tr('world.noServer')));
  }

  function renderPickRole() {
    host.appendChild(el('h2', 'start-h', tr('world.whoAreYou')));
    const row = el('div', 'roles');
    for (const id of ['A', 'B']) {
      const b = el('button', 'role-btn');
      b.type = 'button';
      b.setAttribute('data-role', id);
      b.appendChild(el('span', 'role-emoji', ROLE[id].emoji));
      b.appendChild(el('span', 'role-name', tr('role.' + id + '.name')));
      b.appendChild(el('span', 'role-desc', tr('role.' + id + '.desc')));
      b.addEventListener('click', () => makeWorld(id));
      row.appendChild(b);
    }
    host.appendChild(row);
    host.appendChild(back(() => go('home')));
  }

  function makeWorld(role) {
    if (!dir.reachable) {
      pending = { name: randomName(), role: role, free: [role === 'A' ? 'B' : 'A'] };
      go('made');
      return;
    }
    busy(true);
    dir.create(device, role).then((made) => {
      busy(false);
      if (!made || !made.world) { pending = { name: randomName(), role: role, free: [role === 'A' ? 'B' : 'A'] }; go('made'); return; }
      pending = { name: made.world.name, role: made.role || role, free: made.world.free };
      rememberWorld(pending.name, pending.role);
      go('made');
    });
  }

  function renderMade() {
    const other = pending.role === 'A' ? 'B' : 'A';
    host.appendChild(el('h2', 'start-h', tr('world.madeTitle')));
    host.appendChild(worldCard({
      name: pending.name, wide: true,
      line: tr('world.waitingFor', { role: roleName(other), emoji: ROLE[other].emoji }),
      sub: tr('world.tellThem'),
    }));

    const row = el('div', 'row');
    const share = el('button', 'btn go', '📨 ' + tr('invite.share'));
    share.addEventListener('click', () => {
      shareWorld(pending.name, other).then((how) => {
        if (how === 'copied') say('invite.copied');
        else if (how === 'none') say('invite.tellName', { name: prettyName(pending.name) });
      });
    });
    row.appendChild(share);
    const start = el('button', 'btn', '☀️ ' + tr('world.startPlaying'));
    start.addEventListener('click', () => play(pending.name, pending.role, false, pending.free));
    row.appendChild(start);
    host.appendChild(row);

    const link = el('p', 'link-line', worldLink(pending.name));
    link.addEventListener('click', () => selectAll(link));
    host.appendChild(link);
    host.appendChild(back(() => go('home')));
  }

  function renderJoin() {
    host.appendChild(el('h2', 'start-h', tr('join.title')));
    if (list === null) {
      host.appendChild(el('p', 'start-note', tr('join.looking')));
    } else if (!list.length) {
      host.appendChild(el('p', 'start-note', tr('join.none')));
    } else {
      for (const w of list) {
        const free = w.free[0];
        host.appendChild(worldCard({
          name: w.name, wide: true,
          line: tr('world.spotFree', { role: roleName(free), emoji: ROLE[free] ? ROLE[free].emoji : '🙂' }),
          sub: ago(w.seen),
          onTap: () => enter(w.name, free, false),
        }));
      }
    }

    const row = el('div', 'row');
    const again = el('button', 'btn soft', '🔄 ' + tr('join.again'));
    again.addEventListener('click', () => { list = null; render(); refreshList(); });
    row.appendChild(again);
    host.appendChild(row);

    // the fallback that never needs a list: you were told the name
    host.appendChild(el('h2', 'start-h', tr('join.byName')));
    const nameRow = el('div', 'name-row');
    const input = el('input');
    input.id = 'roomInput';
    input.type = 'text';
    input.autocomplete = 'off';
    input.setAttribute('autocapitalize', 'none');
    input.spellcheck = false;
    input.maxLength = 32;
    input.placeholder = 'sunny-otter';
    nameRow.appendChild(input);
    const goBtn = el('button', 'btn go', tr('join.go'));
    const tryName = () => {
      const n = cleanName(input.value);
      if (!n) { say('join.needName'); return; }
      enter(n, null, true);
    };
    goBtn.addEventListener('click', tryName);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryName(); });
    nameRow.appendChild(goBtn);
    host.appendChild(nameRow);
    host.appendChild(back(() => go('home')));
  }

  function refreshList() {
    dir.list().then((got) => {
      list = got || [];
      if (step === 'join') render();
    });
  }

  function back(fn) {
    const row = el('div', 'row');
    const b = el('button', 'btn soft', '← ' + tr('ui.back'));
    b.addEventListener('click', fn);
    row.appendChild(b);
    return row;
  }

  /* ---------------- straight in ---------------- */

  // ?world=sunny-otter&role=B, and the old ?role= on its own, skip the screen
  const auto = qs.get('role');
  if (auto === 'BOTH') play(invited || randomName(), 'A', true);
  else if (auto === 'A' || auto === 'B') { if (invited) enter(invited, auto, true); else makeWorld(auto); }
  else render();

  return { render: () => render(), forget: forgetWorld };
}

/** "playing now", "20 minutes ago", "yesterday" — no clocks, no dates. */
export function ago(at) {
  const d = Date.now() - (at || 0);
  if (d < 5 * MINUTE) return tr('ago.now');
  if (d < 90 * MINUTE) return trn('ago.minutes', Math.round(d / MINUTE), { n: Math.round(d / MINUTE) });
  if (d < 36 * 3600000) return trn('ago.hours', Math.round(d / 3600000), { n: Math.round(d / 3600000) });
  return trn('ago.days', Math.round(d / 86400000), { n: Math.round(d / 86400000) });
}

function selectAll(node) {
  try {
    const r = document.createRange();
    r.selectNodeContents(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  } catch (e) { /* selecting text is a nicety */ }
}
