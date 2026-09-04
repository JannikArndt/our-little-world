// The frame around the world: what we have, what time it is, what the world
// is trying to tell us, and how a play block finishes.

import { el, openPanel, message, messages, clearMessages } from './overlay.js';
import { openGive } from './share.js';
import { RESOURCES, ROLE, CAPS, capName, roleName, blockProgress } from '../core/world.js';
import { tr, trn } from '../core/i18n.js';
import { nextTimeHint } from '../core/events.js';
import { currentProblem } from '../core/guide.js';

const PHASE = [
  [0.00, 'time.earlyMorning'],
  [0.22, 'time.midMorning'],
  [0.48, 'time.midday'],
  [0.72, 'time.afternoon'],
  [0.88, 'time.evening'],
];

export class Hud {
  constructor(game) {
    this.game = game;
    this.resEls = {};
    this.last = {};
    this.noticeEls = {};
    this.buildResources();
    this.wire();
  }

  wire() {
    const g = this.game;
    document.getElementById('finishBtn').addEventListener('click', () => {
      if (g.world.block.active) g.endBlock();
      else this.showSummary();
    });
    document.getElementById('roleChip').addEventListener('click', () => {
      if (g.canSwap) g.swapRole();
      else this.showRoleCard();
    });
    document.getElementById('partnerChip').addEventListener('click', () => openGive(g));
    document.getElementById('historyChip').addEventListener('click', () => this.showHistory());
    document.getElementById('sunbar').addEventListener('click', () => {
      const w = g.world;
      if (!w.block.active) { message(tr('time.finished')); return; }
      const left = Math.max(0, w.block.length - (w.tick - w.block.startTick));
      const mins = Math.floor(left / 600), secs = Math.floor((left % 600) / 10);
      message(tr('time.left', { mins: mins ? mins + ' min ' : '', secs: secs }));
    });
  }

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

    const chip = document.getElementById('roleChip');
    chip.setAttribute('data-role', g.role);
    document.getElementById('roleChipEmoji').textContent = ROLE[g.role].emoji;
    document.getElementById('roleChipName').textContent = g.canSwap ? roleName(g.role) + ' ⇄' : roleName(g.role);

    const p = blockProgress(w);
    const sun = document.getElementById('sunArc');
    const bar = document.getElementById('sunbar');
    if (this._barW == null || this._barWAt !== window.innerWidth) { this._barW = bar.offsetWidth - 32; this._barWAt = window.innerWidth; }
    const width = this._barW;
    sun.style.transform = 'translateX(' + (6 + width * p) + 'px) translateY(' + (Math.sin(p * Math.PI) * -3) + 'px)';
    bar.querySelector('.sky').style.opacity = String(Math.max(0, (p - 0.7) / 0.3) * 0.85);
    let phase = 'time.quiet';
    if (w.block.active) { for (const [at, key] of PHASE) if (p >= at) phase = key; }
    else phase = w.block.endedAt !== null ? 'time.done' : 'time.notStarted';
    document.getElementById('sunLabel').textContent = tr(phase);

    const partner = w.players[g.other];
    const online = g.partnerOnline;
    const ps = document.getElementById('partnerState');
    ps.textContent = partner.busy ? partner.busy
      : tr(online ? 'ui.partnerHere' : 'ui.partnerTap', { role: roleName(g.other) });
    document.getElementById('partnerChip').firstChild.nodeValue = ROLE[g.other].emoji + ' ';

    document.getElementById('finishBtn').textContent = tr(w.block.active ? 'ui.finish' : 'ui.newMorning');

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
      wanted[n.id] = { icon: n.icon, kind: n.kind, text: tr(n.key, n.vars), onTap: () => { g.goToNotice(n); this.showGuide(); } };
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
   * What is wrong, and what would put it right. Shown when a morning starts
   * and whenever somebody taps one of the world's notices.
   */
  showGuide(opts) {
    const g = this.game;
    const pr = currentProblem(g.world);
    const first = opts && opts.first;
    const p = openPanel({
      title: pr.icon + '  ' + pr.title,
      lead: pr.why,
      onClose: opts && opts.onClose,
    });

    const list = el('div', 'steps');
    let n = 0;
    for (const s of pr.steps) {
      n++;
      const row = el('div', 'step' + (s.done ? ' done' : ''));
      row.appendChild(el('span', 's-n', String(n)));
      row.appendChild(el('span', 's-ico', s.icon));
      row.appendChild(el('span', 's-txt', s.text));
      if (s.done) row.appendChild(el('span', 's-tick', '✓'));
      row.appendChild(el('span', 's-who', s.who));
      list.appendChild(row);
    }
    p.body.appendChild(list);

    const r = p.row();
    r.appendChild(p.button(tr(first ? 'ui.offWeGo' : 'ui.gotIt'), 'go', () => p.close()));
    if (!first && pr.id !== 'calm') {
      r.appendChild(p.button(tr('ui.where'), 'soft', () => { p.close(); g.showMe(pr.id); }));
    }
    return p;
  }

  /** Everything the world has said, newest first. */
  showHistory() {
    const p = openPanel({ title: tr('hist.title'), lead: tr('hist.lead') });
    const list = messages().slice().reverse();
    if (!list.length) p.body.appendChild(el('p', 'lead', tr('hist.empty')));
    const now = Date.now();
    for (const m of list.slice(0, 30)) {
      const line = el('div', 'hist-line');
      const mins = Math.floor((now - m.at) / 60000);
      line.appendChild(el('span', 't', mins < 1 ? tr('hist.justNow') : tr('hist.minsAgo', { n: mins })));
      line.appendChild(document.createTextNode(m.text));
      p.body.appendChild(line);
    }
    const r = p.row();
    r.appendChild(p.button(tr('ui.close'), 'soft', () => p.close()));
  }

  /* ---------------- what each of us knows ---------------- */

  showRoleCard() {
    const g = this.game, w = g.world;
    const p = openPanel({ title: tr('teach.title', { emoji: ROLE[g.role].emoji, role: roleName(g.role) }), lead: tr('teach.lead') });
    const mine = Object.keys(w.players[g.role].caps);
    const theirs = Object.keys(w.players[g.other].caps);
    const list = el('div');
    for (const c of mine) list.appendChild(el('p', 'summary-line', CAPS[c].icon + '  ' + cap(capName(c))));
    p.body.appendChild(list);

    const canTeach = theirs.filter(c => !w.players[g.role].caps[c]);
    const iCanTeach = mine.filter(c => !w.players[g.other].caps[c] && (w.players[g.role].done[teachKey(c)] || 0) >= 2);
    if (iCanTeach.length) {
      const card = el('div', 'teach-card');
      card.appendChild(el('b', '', tr('teach.can', { role: roleName(g.other) })));
      p.body.appendChild(card);
      for (const c of iCanTeach) {
        const b = el('button', 'btn small soft', tr('teach.button', { icon: CAPS[c].icon, what: capName(c) }));
        b.style.margin = '6px 4px 0';
        b.addEventListener('click', () => {
          g.dispatch({ type: 'teach', from: g.role, to: g.other, cap: c });
          p.close();
          message(tr('teach.done', { what: capName(c) }));
        });
        card.appendChild(b);
      }
    } else if (canTeach.length) {
      p.body.appendChild(el('p', 'lead', tr('teach.theyKnow', {
        role: roleName(g.other),
        list: canTeach.map(c => CAPS[c].icon + ' ' + capName(c)).join(', '),
      })));
    }

    const r = p.row();
    r.appendChild(p.button(tr('ui.alright'), 'soft', () => p.close()));
  }

  /* ---------------- the end of a play block ---------------- */

  showSummary() {
    const g = this.game, w = g.world;
    const p = openPanel({
      title: tr('sum.title'),
      lead: tr('sum.lead'),
      center: true,
    });

    const lines = summarise(w);
    if (!lines.length) lines.push({ icon: '🌤️', text: tr('sum.nothing') });
    const box = el('div');
    box.style.cssText = 'margin:6px 0 2px;';
    box.appendChild(el('p', 'lead center', tr('sum.today')));
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
    r.appendChild(p.button(tr('sum.again'), 'go', () => {
      p.close();
      clearMessages();
      g.startBlock(true);
    }));
    r.appendChild(p.button(tr('sum.stop'), 'soft', () => {
      p.close();
      message(tr('msg.saved'));
    }));
  }
}

/* ------------------------------------------------------------------ */

function teachKey(cap) {
  return { fell: 'fell', saw: 'saw', bridge: 'bridge', house: 'house', mill: 'mill',
           herd: 'care', care: 'care', road: 'road', farm: 'farm' }[cap] || cap;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

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
  return out;
}
