// The frame around the world: who is playing, what we have, and what the
// world is trying to tell us.
//
// The top row belongs to the roles — one chip each, yours marked, the others
// showing whether they are here. Every chip opens a drop-down: your own holds
// what you are meant to do and what you can do, theirs the things you do
// together. The day on the right opens the world's own menu — the language and
// the ways out — so none of that sits in the way of playing.

import { el, openPanel, openMenu, message, clearMessages, loop } from './overlay.js';
import { openGive } from './share.js';
import { openInvite } from './invite.js';
import { RESOURCES, ROLE, ROLE_ORDER, CAPS, byId, capName, roleName, dayPhase } from '../core/world.js';
import { tr, trn, LANGUAGES, currentLang, setLang } from '../core/i18n.js';
import { nextTimeHint } from '../core/events.js';
import { currentProblem } from '../core/guide.js';
import { showChangelog as openChangelog, VERSION } from './whatsnew.js';
import { newerBuild } from '../core/fresh.js';
import { drawPortrait } from '../render/art.js';

const PHASE_ICON = {
  dawn: '🌅', morning: '🌤️', midday: '☀️',
  afternoon: '🌥️', evening: '🌇', night: '🌙',
};

export class Hud {
  constructor(game) {
    this.game = game;
    this.resEls = {};
    this.roleEls = {};
    this.last = {};
    this.noticeEls = {};
    this.buildRoleBar();
    this.buildDayBadge();
    this.buildResources();
  }

  /* ---------------- the top row: who is playing ---------------- */

  buildRoleBar() {
    const bar = document.getElementById('roleBar');
    bar.innerHTML = '';
    this.roleEls = {};
    for (const id of ROLE_ORDER) {
      const chip = el('button', 'chip role-chip');
      chip.type = 'button';
      chip.setAttribute('data-role', id);
      chip.appendChild(el('span', 'r-emoji', ROLE[id].emoji));
      chip.appendChild(el('span', 'r-name', roleName(id)));
      chip.appendChild(el('span', 'r-dot'));
      chip.addEventListener('click', () => {
        if (id === this.game.role) this.openMyMenu(chip);
        else this.openRoleMenu(chip, id);
      });
      bar.appendChild(chip);
      this.roleEls[id] = chip;
    }
  }

  /** Your own chip: what the world needs from you, and what you know how to do. */
  openMyMenu(anchor) {
    const g = this.game;
    const pr = currentProblem(g.world);
    const items = [];

    items.push({
      icon: '📋', label: tr('menu.tasks'), note: pr.title,
      fn: () => this.showGuide(),
    });

    if (g.canSwap) {
      items.push({
        icon: '⇄', label: tr('menu.swap', { role: roleName(g.other) }),
        fn: () => g.swapRole(),
      });
    }

    // What you can do, one skill to a line: a list run together into a
    // sentence is the one thing nobody reads.
    const mine = Object.keys(g.world.players[g.role].caps);
    if (mine.length) {
      items.push({ divider: true });
      items.push({ icon: '👐', disabled: true, label: tr('menu.youCan') });
      for (const c of mine) items.push({ icon: CAPS[c].icon, disabled: true, sub: true, label: capName(c) });
    }

    openMenu(anchor, { title: ROLE[g.role].emoji + '  ' + roleName(g.role), items });
  }

  /**
   * The world itself, behind the day: which language it speaks, what is new in
   * it, and every way out of it. Nothing here changes the village by accident.
   */
  openWorldMenu(anchor) {
    const g = this.game;
    const items = [];

    for (const l of LANGUAGES) {
      items.push({
        icon: l.flag, label: l.name, on: l.id === currentLang(),
        fn: () => { setLang(l.id); g.relabel(); },
      });
    }

    items.push({ divider: true });
    items.push({
      icon: '✨', label: tr('hist.whatsNew', { v: VERSION }),
      fn: () => openChangelog(),
    });
    // on a Home Screen this is the only reload there is, so it is always here
    items.push({
      icon: '↻', label: tr(newerBuild() ? 'ui.reloadNew' : 'ui.reload'),
      note: tr('ui.reloadNote'), on: !!newerBuild(),
      fn: () => g.refetch(),
    });
    items.push({ icon: '🧹', label: tr('menu.startOver'), fn: () => this.confirmStartOver() });
    items.push({ icon: '🏡', label: tr('ui.backToStart'), fn: () => g.leave() });

    openMenu(anchor, {
      title: (PHASE_ICON[dayPhase(g.world)] || '☀️') + '  ' + tr('menu.world'),
      items,
    });
  }

  /** The other players: what you can hand them, and what you can teach them. */
  openRoleMenu(anchor, id) {
    const g = this.game, w = g.world;
    const here = g.isOnline(id);
    const items = [];

    // nobody has taken this spot: the one thing worth doing here is asking
    // somebody to. It goes first, and the sharing below it still works.
    if (g.freeRoles && g.freeRoles.indexOf(id) >= 0) {
      items.push({ icon: '📨', label: tr('menu.invite', { role: roleName(id) }), fn: () => g.invite(id) });
      items.push({ divider: true });
    }
    items.push({ icon: '🤝', label: tr('menu.share'), fn: () => openGive(g, null, id) });

    const mine = Object.keys(w.players[g.role].caps);
    const teachable = mine.filter(c => !w.players[id].caps[c] && (w.players[g.role].done[teachKey(c)] || 0) >= 2);
    const known = Object.keys(w.players[id].caps).filter(c => !w.players[g.role].caps[c]);

    if (teachable.length) {
      items.push({ divider: true });
      for (const c of teachable) {
        items.push({
          icon: CAPS[c].icon, label: tr('menu.teach', { what: capName(c) }),
          fn: () => {
            g.dispatch({ type: 'teach', from: g.role, to: id, cap: c });
            message(tr('teach.done', { what: capName(c) }));
          },
        });
      }
    }
    if (known.length) {
      items.push({ divider: true });
      items.push({ icon: '👐', disabled: true, label: tr('teach.theyKnow', { role: roleName(id) }) });
      for (const c of known) items.push({ icon: CAPS[c].icon, disabled: true, sub: true, label: capName(c) });
    }

    openMenu(anchor, {
      title: ROLE[id].emoji + '  ' + roleName(id) + ' · ' + tr(here ? 'ui.here' : 'ui.away'),
      items,
    });
  }

  confirmStartOver() {
    const p = openPanel({ title: tr('over.title'), lead: tr('over.lead'), center: true });
    const r = p.row();
    r.appendChild(p.button(tr('over.yes'), 'go', () => { p.close(); this.game.startOver(); }));
    r.appendChild(p.button(tr('ui.notNow'), 'soft', () => p.close()));
  }

  /* ---------------- the day, on the right ---------------- */

  /**
   * The day is also the door to the world's menu. The badge outlives the world —
   * you can walk out of one and into another — so the old handler goes first,
   * or the door would still open onto the village you left.
   */
  buildDayBadge() {
    const badge = document.getElementById('dayBadge');
    if (!badge) return;
    if (badge.openWorldMenu) badge.removeEventListener('click', badge.openWorldMenu);
    badge.openWorldMenu = () => this.openWorldMenu(badge);
    badge.addEventListener('click', badge.openWorldMenu);
  }

  /* ---------------- the bottom row: what we have ---------------- */

  buildResources() {
    const bar = document.getElementById('resbar');
    bar.innerHTML = '';
    for (const r of RESOURCES) {
      const b = el('button', 'res');
      b.innerHTML = '<span class="ico">' + r.icon + '</span><span class="num">0</span>';
      b.addEventListener('click', () => openGive(this.game, r.key));
      bar.appendChild(b);
      this.resEls[r.key] = b;
    }
  }

  /**
   * Something big changed under us — the language, or the whole world after
   * starting over: redraw everything that holds words, and drop the notices,
   * which belong to the world that was here a moment ago.
   */
  relabel() {
    this.buildRoleBar();
    this.last = {};
    for (const id in this.noticeEls) {
      const e = this.noticeEls[id];
      if (e.parentNode) e.parentNode.removeChild(e);
      delete this.noticeEls[id];
    }
    this.update();
  }

  /* ---------------- per frame ---------------- */

  update() {
    const g = this.game, w = g.world;
    const me = w.players[g.role];

    for (const r of RESOURCES) {
      const n = me.res[r.key] || 0;
      const b = this.resEls[r.key];
      if (this.last[r.key] !== n) {
        b.querySelector('.num').textContent = String(n);
        if (this.last[r.key] != null && n > this.last[r.key]) {
          b.classList.remove('bump');
          void b.offsetWidth;
          b.classList.add('bump');
        }
        this.last[r.key] = n;
      }
      b.classList.toggle('zero', n === 0);
    }

    for (const id of ROLE_ORDER) {
      const chip = this.roleEls[id];
      if (!chip) continue;
      const mine = id === g.role;
      chip.classList.toggle('me', mine);
      chip.classList.toggle('here', mine || g.isOnline(id));
      const busy = w.players[id] && w.players[id].busy;
      const name = roleName(id) + (mine && g.canSwap ? ' ⇄' : '');
      const label = chip.querySelector('.r-name');
      if (label.textContent !== name) label.textContent = name;
      chip.title = busy || '';
    }

    const phase = dayPhase(w);
    if (this.last.phase !== phase) {
      document.getElementById('dayIcon').textContent = PHASE_ICON[phase] || '☀️';
      document.getElementById('dayBadge').setAttribute('data-phase', phase);
      this.last.phase = phase;
    }
    if (this.last.day !== w.day) {
      document.getElementById('dayNum').textContent = String(w.day);
      this.last.day = w.day;
    }

    this.renderNotices();
  }

  /* ---------------- notices and asks ---------------- */

  renderNotices() {
    const g = this.game, w = g.world;
    const layer = document.getElementById('noticeLayer');
    const wanted = {};

    for (const a of w.asks) {
      if (a.to !== g.role) continue;
      wanted['ask_' + a.id] = {
        icon: '🙋', kind: 'ask',
        text: tr('ask.notice', { role: roleName(a.from), what: tr('verb.' + a.cap) }),
        onTap: () => {
          g.dispatch({ type: 'ask.clear', id: a.id });
          g.goToAsk(a);
        },
      };
    }
    for (const n of w.notices) {
      wanted[n.id] = { icon: n.icon, kind: n.kind, text: tr(n.key, n.vars), onTap: () => g.goToNotice(n) };
    }

    for (const id in this.noticeEls) {
      if (wanted[id]) continue;
      const e = this.noticeEls[id];
      e.classList.add('fade');
      setTimeout(() => { if (e.parentNode) e.parentNode.removeChild(e); }, 520);
      delete this.noticeEls[id];
    }
    for (const id in wanted) {
      if (this.noticeEls[id]) continue;
      const n = wanted[id];
      const b = el('button', 'notice ' + (n.kind || 'calm'));
      b.innerHTML = '<span class="n-ico">' + n.icon + '</span>' + escapeHtml(n.text);
      b.addEventListener('click', n.onTap);
      layer.appendChild(b);
      this.noticeEls[id] = b;
    }
  }

  /**
   * What is wrong, and what would put it right. It lives in your own menu now,
   * so it only appears when you go looking for it.
   */
  showGuide() {
    const g = this.game;
    const pr = currentProblem(g.world);
    const p = openPanel({ title: pr.icon + '  ' + pr.title, lead: pr.why });

    // Nobody is named without being shown: the card draws them, and the world
    // behind it is already looking at them when the card goes away.
    if (pr.subject) this.addPortrait(p, pr.subject);
    g.showMe(pr);

    const list = el('div', 'steps');
    let n = 0;
    for (const s of pr.steps) {
      n++;
      const row = el('div', 'step' + (s.done ? ' done' : ''));
      row.appendChild(el('span', 's-n', String(n)));
      row.appendChild(el('span', 's-ico', s.icon));
      row.appendChild(el('span', 's-txt', s.text));
      // The count and the label go in one block, so on a narrow screen they
      // drop to a line of their own instead of squeezing the words into a
      // column one word wide.
      const meta = el('span', 's-meta');
      // A tick with no number explains nothing. 2/3 🪨 explains itself.
      if (s.count) {
        const c = el('span', 's-count' + (s.done ? ' ok' : ''));
        c.appendChild(el('b', '', s.count.have + '/' + s.count.need));
        c.appendChild(document.createTextNode(' ' + s.count.icon));
        meta.appendChild(c);
      }
      if (s.done) meta.appendChild(el('span', 's-tick', '✓'));
      meta.appendChild(el('span', 's-who', s.who));
      row.appendChild(meta);
      list.appendChild(row);
    }
    p.body.appendChild(list);

    const r = p.row();
    r.appendChild(p.button(tr('ui.gotIt'), 'go', () => p.close()));
    if (pr.points && pr.points.length) {
      r.appendChild(p.button(tr('ui.where'), 'soft', () => { p.close(); g.showMe(pr, 2.4); }));
    }
    return p;
  }

  /** The face of whoever the card is about, drawn the way the world draws them. */
  addPortrait(p, subject) {
    const w = this.game.world;
    const o = subject.kind === 'sheep' ? byId(w.sheep, subject.id) : byId(w.villagers, subject.id);
    if (!o) return;
    const card = el('div', 'guide-who');
    const cv = el('canvas', 'who-face');
    cv.width = 96; cv.height = 96;
    const ctx = cv.getContext('2d');
    card.appendChild(cv);
    const name = el('div', 'who-name', o.name);
    card.appendChild(name);
    p.body.appendChild(card);

    // room above the head for whatever they are thinking about
    const sheep = subject.kind === 'sheep';
    const stop = loop((t) => {
      if (!document.body.contains(cv)) { stop(); return; }
      const live = sheep ? byId(w.sheep, subject.id) : byId(w.villagers, subject.id);
      ctx.clearRect(0, 0, 96, 96);
      drawPortrait(ctx, subject.kind, live || o, sheep ? 44 : 40, sheep ? 74 : 84, sheep ? 2.9 : 2.0, t, w.tick);
    });
  }

  /* ---------------- the end of the day ---------------- */

  /** Night. Nothing carries on by itself: the next day is a decision. */
  showDayEnd() {
    const g = this.game, w = g.world;
    const p = openPanel({ title: tr('day.overTitle', { n: w.day }), lead: tr('day.overLead'), center: true });

    const lines = summarise(w);
    if (!lines.length) lines.push({ icon: '🌙', text: tr('sum.nothing') });
    const box = el('div');
    box.style.cssText = 'margin:6px 0 2px;';
    for (const l of lines) {
      const line = el('div', 'summary-line');
      line.innerHTML = '<span class="s-ico">' + l.icon + '</span>' + escapeHtml(l.text);
      box.appendChild(line);
    }
    p.body.appendChild(box);

    const who = [];
    const housed = w.villagers.filter(v => v.homeId).length;
    who.push(tr('sum.beds', { n: housed, total: w.villagers.length }));
    who.push(tr('sum.basket', { n: w.larder.food }));
    const content = w.sheep.filter(s => s.mood === 'ok').length;
    who.push(content ? tr('sum.sheepOk', { n: content, total: w.sheep.length }) : tr('sum.sheepNeed'));
    p.body.appendChild(el('p', 'lead center', who.join(' · ')));

    const hint = nextTimeHint(w);
    const nt = el('div', 'next-time');
    nt.appendChild(el('b', '', tr('sum.nextTime')));
    nt.appendChild(el('span', '', hint.icon + '  ' + tr(hint.key)));
    p.body.appendChild(nt);

    const r = p.row();
    r.appendChild(p.button(tr('day.another'), 'go', () => {
      p.close();
      clearMessages();
      g.startDay(true);
    }));
    r.appendChild(p.button(tr('day.stop'), 'soft', () => p.close()));
  }
}

/* ------------------------------------------------------------------ */

function teachKey(cap) {
  return { fell: 'fell', saw: 'saw', bridge: 'bridge', house: 'house', mill: 'mill',
           herd: 'care', care: 'care', road: 'road', farm: 'farm' }[cap] || cap;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Turn the journal into a few plain sentences, in whichever language. */
export function summarise(w) {
  const n = {}, num = {};
  for (const j of w.journal) {
    n[j.icon] = (n[j.icon] || 0) + 1;
    if (j.vars && typeof j.vars.n === 'number') num[j.icon] = (num[j.icon] || 0) + j.vars.n;
  }
  const out = [];
  const add = (icon, key, count, vars) => {
    if (!n[icon]) return;
    out.push({ icon, text: count == null ? tr(key, vars) : trn(key, count, vars) });
  };
  add('🌳', 'sum.felled', n['🌳'], { n: n['🌳'] });
  add('🪚', 'sum.sawed', null, { n: num['🪚'] });
  add('🌉', 'sum.bridge');
  add('🔧', 'sum.mended');
  add('🏠', 'sum.houses', n['🏠'], { n: n['🏠'] });
  add('🔑', 'sum.movedIn', n['🔑'], { n: n['🔑'] });
  add('🛤️', 'sum.road', null, { n: num['🛤️'] });
  add('🐑', 'sum.sheep', n['🐑'], { n: n['🐑'] });
  add('🌾', 'sum.wheat', null, { n: num['🌾'] });
  add('🍞', 'sum.bread', null, { n: num['🍞'] });
  add('🧺', 'sum.larder');
  add('🤝', 'sum.shared', n['🤝'], { n: n['🤝'] });
  add('👐', 'sum.taught');
  add('👨‍👩‍👧', 'sum.family');
  add('🦌', 'sum.deer');
  add('⛵', 'sum.boat');
  add('🛝', 'sum.play');
  add('🪣', 'sum.well');
  add('🚪', 'sum.privy');
  add('🚧', 'sum.fence');
  add('🎣', 'sum.fished', null, { n: num['🎣'] });
  add('🌱', 'sum.planted', n['🌱'], { n: n['🌱'] });
  return out;
}
