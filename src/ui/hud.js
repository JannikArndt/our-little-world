// The frame around the world: what we have, what time it is, what the world
// is trying to tell us, and how a play block finishes.

import { el, openPanel, message, messages, clearMessages } from './overlay.js';
import { openGive } from './share.js';
import { RESOURCES, ROLE, CAPS, blockProgress } from '../core/world.js';
import { nextTimeHint } from '../core/events.js';
import { currentProblem } from '../core/guide.js';

const PHASE = [
  [0.00, 'early morning'],
  [0.22, 'mid morning'],
  [0.48, 'midday'],
  [0.72, 'afternoon'],
  [0.88, 'evening'],
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
      if (!w.block.active) { message('The play block is finished. Everything is saved.'); return; }
      const left = Math.max(0, w.block.length - (w.tick - w.block.startTick));
      const mins = Math.floor(left / 600), secs = Math.floor((left % 600) / 10);
      message('About ' + (mins ? mins + ' min ' : '') + secs + ' s of this morning left. No hurry.');
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
    document.getElementById('roleChipName').textContent = g.canSwap ? ROLE[g.role].name + ' ⇄' : ROLE[g.role].name;

    const p = blockProgress(w);
    const sun = document.getElementById('sunArc');
    const bar = document.getElementById('sunbar');
    if (this._barW == null || this._barWAt !== window.innerWidth) { this._barW = bar.offsetWidth - 32; this._barWAt = window.innerWidth; }
    const width = this._barW;
    sun.style.transform = 'translateX(' + (6 + width * p) + 'px) translateY(' + (Math.sin(p * Math.PI) * -3) + 'px)';
    bar.querySelector('.sky').style.opacity = String(Math.max(0, (p - 0.7) / 0.3) * 0.85);
    let phase = 'a quiet moment';
    if (w.block.active) { for (const [at, name] of PHASE) if (p >= at) phase = name; }
    else phase = w.block.endedAt !== null ? 'the day is done' : 'not started';
    document.getElementById('sunLabel').textContent = phase;

    const partner = w.players[g.other];
    const online = g.partnerOnline;
    const ps = document.getElementById('partnerState');
    ps.textContent = partner.busy ? partner.busy
      : online ? ROLE[g.other].name + ' is here'
      : ROLE[g.other].name + ' — tap to share';
    document.getElementById('partnerChip').firstChild.nodeValue = ROLE[g.other].emoji + ' ';

    document.getElementById('finishBtn').textContent = w.block.active ? '🌇 Finish' : '🌅 New morning';

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
        text: 'The ' + ROLE[a.from].name + ' asks: can you ' + verbFor(a.cap) + '?',
        onTap: () => {
          g.dispatch({ type: 'ask.clear', id: a.id });
          g.goToAsk(a);
        },
      };
    }
    for (const n of w.notices) {
      wanted[n.id] = { icon: n.icon, kind: n.kind, text: n.text, onTap: () => { g.goToNotice(n); this.showGuide(); } };
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
    r.appendChild(p.button(first ? '☀️ Off we go' : 'Right, got it', 'go', () => p.close()));
    if (!first && pr.id !== 'calm') {
      r.appendChild(p.button('👀 Where?', 'soft', () => { p.close(); g.showMe(pr.id); }));
    }
    return p;
  }

  /** Everything the world has said, newest first. */
  showHistory() {
    const p = openPanel({ title: '📜 What has happened', lead: 'Every message, newest first.' });
    const list = messages().slice().reverse();
    if (!list.length) p.body.appendChild(el('p', 'lead', 'Nothing yet. The world has been quiet.'));
    const now = Date.now();
    for (const m of list.slice(0, 30)) {
      const line = el('div', 'hist-line');
      const mins = Math.floor((now - m.at) / 60000);
      line.appendChild(el('span', 't', mins < 1 ? 'just now' : mins + ' min ago'));
      line.appendChild(document.createTextNode(m.text));
      p.body.appendChild(line);
    }
    const r = p.row();
    r.appendChild(p.button('Close', 'soft', () => p.close()));
  }

  /* ---------------- what each of us knows ---------------- */

  showRoleCard() {
    const g = this.game, w = g.world;
    const p = openPanel({ title: ROLE[g.role].emoji + ' You are the ' + ROLE[g.role].name, lead: 'What you know how to do:' });
    const mine = Object.keys(w.players[g.role].caps);
    const theirs = Object.keys(w.players[g.other].caps);
    const list = el('div');
    for (const c of mine) list.appendChild(el('p', 'summary-line', CAPS[c].icon + '  ' + cap(CAPS[c].name)));
    p.body.appendChild(list);

    const canTeach = theirs.filter(c => !w.players[g.role].caps[c]);
    const iCanTeach = mine.filter(c => !w.players[g.other].caps[c] && (w.players[g.role].done[teachKey(c)] || 0) >= 2);
    if (iCanTeach.length) {
      const card = el('div', 'teach-card');
      card.appendChild(el('b', '', '👐 You could show the ' + ROLE[g.other].name + ' how to do this'));
      p.body.appendChild(card);
      for (const c of iCanTeach) {
        const b = el('button', 'btn small soft', CAPS[c].icon + ' teach ' + CAPS[c].name);
        b.style.margin = '6px 4px 0';
        b.addEventListener('click', () => {
          g.dispatch({ type: 'teach', from: g.role, to: g.other, cap: c });
          p.close();
          message('👐 You showed them how. Now you both know ' + CAPS[c].name + '.');
        });
        card.appendChild(b);
      }
    } else if (canTeach.length) {
      p.body.appendChild(el('p', 'lead', 'The ' + ROLE[g.other].name + ' knows things you do not: ' +
        canTeach.map(c => CAPS[c].icon + ' ' + CAPS[c].name).join(', ') + '. Ask them to show you.'));
    }

    const r = p.row();
    r.appendChild(p.button('Alright', 'soft', () => p.close()));
  }

  /* ---------------- the end of a play block ---------------- */

  showSummary() {
    const g = this.game, w = g.world;
    const p = openPanel({
      title: '🌇 The morning is finished',
      lead: 'Our little world is safe. Everything we made is saved.',
      center: true,
    });

    const lines = summarise(w);
    if (!lines.length) lines.push({ icon: '🌤️', text: 'we mostly watched the world go by' });
    const box = el('div');
    box.style.cssText = 'margin:6px 0 2px;';
    box.appendChild(el('p', 'lead center', 'Today we…'));
    for (const l of lines) {
      const line = el('div', 'summary-line');
      line.innerHTML = '<span class="s-ico">' + l.icon + '</span>' + escapeHtml(l.text);
      box.appendChild(line);
    }
    p.body.appendChild(box);

    const who = [];
    const housed = w.villagers.filter(v => v.homeId).length;
    who.push(housed + ' of ' + w.villagers.length + ' have a bed');
    who.push('🍞 ' + w.larder.food + ' in the basket');
    const content = w.sheep.filter(s => s.mood === 'ok').length;
    who.push(content ? content + ' of ' + w.sheep.length + ' sheep are content'
                     : '🐑 the sheep would still like a hand');
    p.body.appendChild(el('p', 'lead center', who.join(' · ')));

    const hint = nextTimeHint(w);
    const nt = el('div', 'next-time');
    nt.appendChild(el('b', '', 'Next time'));
    nt.appendChild(el('span', '', hint.icon + '  ' + hint.text));
    p.body.appendChild(nt);

    const r = p.row();
    r.appendChild(p.button('☀️ Another five minutes', 'go', () => {
      p.close();
      clearMessages();
      g.startBlock(true);
    }));
    r.appendChild(p.button('Stop here', 'soft', () => {
      p.close();
      message('Saved. It will be exactly like this when you come back.');
    }));
  }
}

/* ------------------------------------------------------------------ */

function teachKey(cap) {
  return { fell: 'fell', saw: 'saw', bridge: 'bridge', house: 'house', mill: 'mill',
           herd: 'care', care: 'care', road: 'road', farm: 'farm' }[cap] || cap;
}

function verbFor(cap) {
  return {
    fell: 'fell that tree', saw: 'saw some planks', bridge: 'sort out the bridge',
    house: 'build the house', mill: 'make some bread', herd: 'move a sheep',
    care: 'look after a sheep', road: 'build a road', farm: 'work the field',
  }[cap] || 'help';
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Turn the journal into a few plain sentences. */
export function summarise(w) {
  const n = {}, num = {};
  for (const j of w.journal) {
    n[j.icon] = (n[j.icon] || 0) + 1;
    const m = j.text.match(/(\d+)/);
    if (m) num[j.icon] = (num[j.icon] || 0) + parseInt(m[1], 10);
  }
  const out = [];
  const plural = (c, one, many) => c === 1 ? one : c + ' ' + many;
  if (n['🌳']) out.push({ icon: '🌳', text: 'felled ' + plural(n['🌳'], 'a tree', 'trees') });
  if (n['🪚']) out.push({ icon: '🪚', text: 'sawed ' + num['🪚'] + ' planks' });
  if (n['🌉']) out.push({ icon: '🌉', text: 'built the bridge across the river' });
  if (n['🔧']) out.push({ icon: '🔧', text: 'mended the bridge' });
  if (n['🏠']) out.push({ icon: '🏠', text: 'built ' + plural(n['🏠'], 'a house', 'houses') });
  if (n['🔑']) out.push({ icon: '🔑', text: plural(n['🔑'], 'somebody moved in', 'people moved in') });
  if (n['🛤️']) out.push({ icon: '🛤️', text: 'laid ' + num['🛤️'] + ' steps of road' });
  if (n['🐑']) out.push({ icon: '🐑', text: 'looked after the sheep ' + plural(n['🐑'], 'once', 'times') });
  if (n['🌾']) out.push({ icon: '🌾', text: 'harvested ' + num['🌾'] + ' wheat' });
  if (n['🍞']) out.push({ icon: '🍞', text: 'baked ' + num['🍞'] + ' loaves' });
  if (n['🧺']) out.push({ icon: '🧺', text: 'kept the village basket full' });
  if (n['🤝']) out.push({ icon: '🤝', text: 'shared things with each other ' + plural(n['🤝'], 'once', 'times') });
  if (n['👐']) out.push({ icon: '👐', text: 'taught each other something' });
  if (n['👨‍👩‍👧']) out.push({ icon: '👨‍👩‍👧', text: 'welcomed a new family' });
  if (n['🦌']) out.push({ icon: '🦌', text: 'met a deer' });
  return out;
}
