// The frame around the world: who is playing, what we have, and what the
// world is trying to tell us.
//
// The top row belongs to the roles — one chip each, yours marked, the others
// showing whether they are here. Every chip opens a drop-down: your own holds
// what you are meant to do, what you can do and what you have already done;
// theirs the things you do together. The day on the right opens the world's
// own menu — the language and the ways out — so none of that sits in the way
// of playing.
//
// Nothing the world has to say is laid over the world any more. What needs
// doing lives behind your own chip, counted by a red number on it, so the
// village is never hidden behind a stack of cards you cannot put away.

import { el, openPanel, openMenu, message, clearMessages, loop } from './overlay.js';
import { openGive } from './share.js';
import { openInvite, openSeat } from './invite.js';
import { RESOURCES, ROLE, ROLE_ORDER, CAPS, byId, capName, roleName, dayPhase } from '../core/world.js';
import { tr, trn, LANGUAGES, currentLang, setLang } from '../core/i18n.js';
import { currentProblem, allProblems, MAX_ACTIVE } from '../core/guide.js';
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
    this.todos = { tick: -1, n: 0 };
    this.buildRoleBar();
    this.buildFolkChip();
    this.buildDayBadge();
    this.buildResources();
  }

  /* ---------------- everybody who lives here ---------------- */

  /**
   * The village, as a list. A child looks for Lina by name long before he
   * looks for "the one with nowhere to sleep", so this is names first: who
   * they are, whose house they live in, and what they want. It carries no
   * word of its own — the role chips carry the words, and on a phone this row
   * has none to spare.
   */
  buildFolkChip() {
    const chip = document.getElementById('folkChip');
    if (!chip) return;
    if (chip.openFolk) chip.removeEventListener('click', chip.openFolk);
    chip.openFolk = () => this.openFolkMenu(chip);
    chip.addEventListener('click', chip.openFolk);
    this.folkChip = chip;
  }

  /** What somebody is up to this minute, when it is worth a line at all. */
  doingLine(v) {
    const act = v.act ? v.act.kind : null;
    return DOING[act] ? tr(DOING[act]) : null;
  }

  /** Where they sleep, or that they have nowhere yet. */
  homeLine(v) {
    const w = this.game.world;
    if (!v.homeId) return tr('villagers.nowhere');
    const b = byId(w.buildings, v.homeId);
    return tr('villagers.livesIn', { house: (b && b.name) || tr('w.house') });
  }

  /** What they want, in the words the game has always used for it. */
  wantLine(v) {
    if (v.poorly > 0) return tr('w.villagerPoorly', { name: v.name });
    if (v.hunger > 72) return tr('w.villagerHungry');
    if (!v.homeId) return tr('w.villagerHomeless', { name: v.name });
    if (v.carrying) return tr('w.villagerCarrying');
    return tr('w.villagerFine');
  }

  openFolkMenu(anchor) {
    const g = this.game, w = g.world;
    const items = [];

    for (const v of w.villagers) {
      // what they are doing right now outranks what they generally want:
      // a squabble is the one line here that asks you to do something
      const doing = this.doingLine(v);
      items.push({
        icon: v.kid ? '🧒' : '🧑',
        label: v.name + (v.kid ? ' · ' + tr('villagers.kid') : ''),
        note: this.homeLine(v) + ' · ' + (doing || this.wantLine(v)),
        fn: () => g.showMe({
          points: [[v.x, v.y]],
          subject: { kind: 'villager', id: v.id },
        }, 2.2),
      });
    }

    if (w.sheep.length) {
      items.push({ divider: true });
      items.push({ icon: '🐑', disabled: true, label: tr('menu.sheepHere') });
      for (const s of w.sheep) {
        items.push({
          icon: '🐑', sub: true, label: s.name,
          note: tr(s.mood === 'hungry' ? 'w.sheepHungry' : s.mood === 'thirsty' ? 'w.sheepThirsty'
            : s.mood === 'woolly' ? 'w.sheepWoolly' : 'w.sheepOk'),
          fn: () => g.showMe({
            points: [[s.x, s.y]],
            subject: { kind: 'sheep', id: s.id },
          }, 2.2),
        });
      }
    }

    openMenu(anchor, { title: '👥  ' + tr('menu.villagers'), items });
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
      // only your own chip carries a number, and only while there is one
      chip.appendChild(el('span', 'r-todo hidden'));
      chip.addEventListener('click', () => {
        if (id === this.game.role) this.openMyMenu(chip);
        else this.openRoleMenu(chip, id);
      });
      bar.appendChild(chip);
      this.roleEls[id] = chip;
    }
  }

  /**
   * Your own chip: everything waiting for you, everything you know how to do,
   * and everything you have done so far. The list of jobs is the whole list —
   * three things wrong means three lines here, not the most pressing one and
   * silence about the rest.
   */
  openMyMenu(anchor) {
    const g = this.game;
    const items = [];

    const waiting = this.todoList();
    items.push({ icon: '📋', disabled: true, label: tr('menu.tasks') });
    if (!waiting.jobs.length) {
      items.push({ icon: '🌤️', disabled: true, sub: true, label: tr('menu.nothingToDo') });
    }
    for (const t of waiting.jobs) items.push({ icon: t.icon, label: t.label, fn: t.fn });

    // Things that have happened rather than things to do. They are worth a
    // look and not worth a red number, so they sit under their own heading.
    if (waiting.news.length) {
      items.push({ divider: true });
      items.push({ icon: '📣', disabled: true, label: tr('menu.news') });
      for (const t of waiting.news) items.push({ icon: t.icon, label: t.label, fn: t.fn });
    }

    if (g.canSwap) {
      items.push({ divider: true });
      items.push({
        icon: '⇄', label: tr('menu.swap', { role: roleName(g.other) }),
        fn: () => g.swapRole(),
      });
    } else {
      // your seat, on a second browser — the Home Screen copy, mostly
      items.push({ divider: true });
      items.push({ icon: '📱', label: tr('menu.thisDevice'), fn: () => openSeat(g) });
    }

    // What you can do, one skill to a line: a list run together into a
    // sentence is the one thing nobody reads.
    const mine = Object.keys(g.world.players[g.role].caps);
    if (mine.length) {
      items.push({ divider: true });
      items.push({ icon: '👐', disabled: true, label: tr('menu.youCan') });
      for (const c of mine) items.push({ icon: CAPS[c].icon, disabled: true, sub: true, label: capName(c) });
    }

    // And what you have already done, which is the nicest part of the menu.
    items.push({ divider: true });
    items.push({ icon: '🏅', disabled: true, label: tr('menu.youDid') });
    const deeds = deedsOf(g.world.players[g.role].done);
    if (!deeds.length) {
      items.push({ icon: '🌱', disabled: true, sub: true, label: tr('menu.didNothingYet') });
    }
    for (const d of deeds) items.push({ icon: d.icon, disabled: true, sub: true, label: d.text });

    openMenu(anchor, { title: ROLE[g.role].emoji + '  ' + roleName(g.role), items });
  }

  /**
   * What is waiting for you, in two piles.
   *
   * `jobs` is work: the two at the front of the world's queue.
   * Two, because a village always wants half a dozen
   * things and a list of eight is a chore — the rest are next, not cancelled.
   * The whole queue is still read, so a notice about something further down —
   * the wheat is golden, and it will be somebody's job in a minute — is not
   * said twice either; it waits its turn with the job it belongs to.
   *
   * `news` is everything that has merely happened: a sapling grown, somebody
   * moved in, a skill passed across. Worth a look, not worth a red number.
   */
  todoList() {
    const g = this.game, w = g.world;
    const jobs = [], news = [], covered = {};

    const queue = allProblems(w);
    for (const pr of queue) covered[pr.id] = 1;
    for (const pr of queue.slice(0, MAX_ACTIVE)) {
      jobs.push({ icon: pr.icon, label: pr.title, fn: () => this.showGuide(pr) });
    }

    for (const n of w.notices) {
      if (covered[NOTICE_JOB[n.id] || n.id]) continue;
      news.push({ icon: n.icon, label: tr(n.key, n.vars), fn: () => g.goToNotice(n) });
    }
    return { jobs, news };
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
   * starting over: redraw everything that holds words, and count the jobs
   * again, because the ones we knew about belonged to the world that was here
   * a moment ago.
   */
  relabel() {
    this.buildRoleBar();
    this.buildFolkChip();
    this.last = {};
    this.todos = { tick: -1, n: 0 };
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

      // the count belongs to whoever is holding the phone, nobody else
      const todo = chip.querySelector('.r-todo');
      const n = mine ? this.updateTodoCount() : 0;
      if (this.last['todo_' + id] !== n) {
        todo.textContent = n > 9 ? '9+' : String(n);
        todo.classList.toggle('hidden', n <= 0);
        // a new job nudges the chip, so nothing has to be laid over the world
        if (n > (this.last['todo_' + id] || 0)) {
          todo.classList.remove('bump');
          void todo.offsetWidth;
          todo.classList.add('bump');
        }
        this.last['todo_' + id] = n;
      }
    }

    // how many people live here — only touched when the number actually moves
    if (this.folkChip) {
      const n = w.villagers.length;
      if (this.last.folk !== n) {
        this.folkChip.querySelector('.f-n').textContent = String(n);
        this.last.folk = n;
      }
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
  }

  /* ---------------- how many jobs, as a number on your chip ---------------- */

  /**
   * The red number on your own chip: jobs only, so it always means the same
   * thing — this many things are waiting for you to do them. News is not
   * counted; a grown sapling is not a chore.
   *
   * Reading the world's whole list of worries is not free, so it is counted
   * once a second rather than once a frame, and the chip only changes when the
   * number does.
   */
  updateTodoCount() {
    const g = this.game, w = g.world;
    // A world handed over by the relay can be at an earlier tick than the one
    // we counted, so anything but a small step forward counts again.
    if (this.todos.tick >= 0 && w.tick >= this.todos.tick && w.tick - this.todos.tick < 10) return this.todos.n;
    this.todos.tick = w.tick;
    const n = Math.min(allProblems(w).length, MAX_ACTIVE);
    this.todos.n = n;
    return n;
  }

  /**
   * What is wrong, and what would put it right. One card, for whichever job was
   * tapped in your menu; with nothing named it falls back to the most pressing
   * one, which is what the guide used to do on its own.
   */
  showGuide(problem) {
    const g = this.game;
    const pr = problem || currentProblem(g.world);
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
}

/* ------------------------------------------------------------------ */

/**
 * Which job already says what a notice says. The world raises a notice and the
 * guide raises a card about the same thing — a hungry villager, a broken
 * bridge — and the menu should carry it once, not twice. Anything not in here
 * is news of its own and is listed after the jobs.
 */
/**
 * What somebody is doing, when it is worth saying out loud in the list. The
 * answers to a tap — a wave, a wink — are over in a second and are not; a
 * squabble is, because a tap breaks it up and somebody has to know it is
 * happening.
 */
const DOING = {
  dance: 'doing.dance',
  run: 'doing.run',
  chat: 'doing.chat',
  sit: 'doing.sit',
  eat: 'doing.eat',
  squabble: 'doing.squabble',
};

const NOTICE_JOB = {
  hungry: 'hungry',
  homeless: 'homeless',
  poorly: 'poorly',
  wheat_ready: 'wheat_ready',
  bridge_broken: 'bridge_broken',
  sheep_far: 'no_bridge',
  sheep_broken: 'bridge_broken',
  sheep_in_field: 'fence',
};

/**
 * What somebody has done, read back to them. Each line is one name in the
 * `done` tally kept by actions.js, in the order a day tends to go. A new thing
 * to be proud of is one row here plus its two strings — and a name nobody has
 * earned yet simply does not appear.
 */
const DEEDS = [
  { key: 'fell',   icon: '🪓', word: 'deed.fell' },
  { key: 'saw',    icon: '🪚', word: 'deed.saw' },
  { key: 'bridge', icon: '🌉', word: 'deed.bridge' },
  { key: 'house',  icon: '🏠', word: 'deed.house' },
  { key: 'mill',   icon: '🌀', word: 'deed.mill' },
  { key: 'well',   icon: '🪣', word: 'deed.well' },
  { key: 'privy',  icon: '🚪', word: 'deed.privy' },
  { key: 'fence',  icon: '🚧', word: 'deed.fence' },
  { key: 'boat',   icon: '⛵', word: 'deed.boat' },
  { key: 'play',   icon: '🛝', word: 'deed.play' },
  { key: 'road',   icon: '🛤️', word: 'deed.road' },
  { key: 'sow',    icon: '🌱', word: 'deed.sow' },
  { key: 'reap',   icon: '🌾', word: 'deed.reap' },
  { key: 'fish',   icon: '🎣', word: 'deed.fish' },
  { key: 'care',   icon: '🐑', word: 'deed.care' },
  { key: 'plant',  icon: '🌳', word: 'deed.plant' },
];

/** The tally as sentences, leaving out everything nobody has done yet. */
export function deedsOf(done) {
  const out = [];
  for (const d of DEEDS) {
    const n = (done && done[d.key]) || 0;
    if (n > 0) out.push({ icon: d.icon, text: trn(d.word, n) });
  }
  return out;
}

function teachKey(cap) {
  return { fell: 'fell', saw: 'saw', bridge: 'bridge', house: 'house', mill: 'mill',
           herd: 'care', care: 'care', road: 'road', farm: 'farm' }[cap] || cap;
}

