// Small DOM helpers shared by every mini-game: a panel, a canvas that knows
// about fingers, and a message. Nothing clever, just fewer repeated lines.

import { tr, trn } from '../core/i18n.js';

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

const overlay = () => document.getElementById('overlay');

export function openPanel(opts) {
  const ov = overlay();
  ov.innerHTML = '';
  ov.classList.remove('hidden');

  const panel = el('div', 'panel');
  if (opts.title) panel.appendChild(el('h2', opts.center ? 'center' : '', opts.title));
  if (opts.lead) panel.appendChild(el('p', opts.center ? 'lead center' : 'lead', opts.lead));
  const body = el('div', 'panel-body');
  panel.appendChild(body);
  ov.appendChild(panel);

  let closed = false;
  const api = {
    panel, body,
    close() {
      if (closed) return;
      closed = true;
      ov.classList.add('hidden');
      ov.innerHTML = '';
      if (opts.onClose) opts.onClose();
    },
    row() { const r = el('div', 'row'); panel.appendChild(r); return r; },
    button(label, cls, fn) {
      const b = el('button', 'btn ' + (cls || ''), label);
      b.addEventListener('click', fn);
      return b;
    },
    readout(text) {
      if (!api._ro) { api._ro = el('div', 'readout'); panel.appendChild(api._ro); }
      api._ro.innerHTML = text;
      return api._ro;
    },
    /** What this costs, drawn as the things themselves. */
    cost(items) {
      if (!api._cost) {
        api._cost = el('div', 'cost');
        if (api._ro) panel.insertBefore(api._cost, api._ro);
        else panel.appendChild(api._cost);
      }
      renderCost(api._cost, items);
      return api._cost;
    },
  };
  return api;
}

/**
 * A cost you can count instead of read: one picture per thing needed, the ones
 * you already have in colour and the ones you are missing greyed out.
 * items: [{ icon, need, have, name }]
 */
export function renderCost(host, items) {
  host.innerHTML = '';
  for (const it of items) {
    if (!it.need) continue;
    const enough = it.have >= it.need;
    const row = el('div', 'cost-row' + (enough ? ' ok' : ''));
    const pips = el('div', 'cost-pips');
    const show = Math.min(it.need, 14);
    for (let i = 0; i < show; i++) {
      pips.appendChild(el('span', 'pip' + (i < it.have ? '' : ' off'), it.icon));
    }
    if (it.need > show) pips.appendChild(el('span', 'pip more', '…'));
    row.appendChild(pips);
    const txt = el('span', 'cost-txt');
    txt.appendChild(document.createTextNode(tr('ui.have') + ' '));
    txt.appendChild(el('b', 'n-have', String(it.have)));
    txt.appendChild(document.createTextNode(' · ' + tr('ui.need') + ' '));
    txt.appendChild(el('b', 'n-need', String(it.need)));
    row.appendChild(txt);
    host.appendChild(row);
    if (!enough) {
      const short = el('div', 'cost-short');
      short.appendChild(el('b', '', String(it.need - it.have)));
      short.appendChild(document.createTextNode(' ' + it.icon + ' ' + trn('ui.stillMissing', it.need - it.have)));
      host.appendChild(short);
    }
  }
  return host;
}

export function isPanelOpen() { return !overlay().classList.contains('hidden'); }

export function closePanel() {
  const ov = overlay();
  ov.classList.add('hidden');
  ov.innerHTML = '';
}

/** A canvas sized in logical units that scales to whatever width it gets. */
export function makeCanvas(w, h) {
  const c = el('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = c.getBoundingClientRect();
    if (!rect.width) return;
    const bw = Math.round(rect.width * dpr), bh = Math.round(rect.width * (h / w) * dpr);
    if (c.width !== bw) { c.width = bw; c.height = bh; }
    ctx.setTransform(bw / w, 0, 0, bw / w, 0, 0);
  };
  return { canvas: c, ctx, fit, W: w, H: h };
}

/** Map touches and mouse to logical canvas coordinates. */
export function onPointer(canvas, logicalW, logicalH, handlers) {
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches && e.touches.length ? e.touches[0] : (e.changedTouches && e.changedTouches[0]) || e;
    return { x: (t.clientX - r.left) / r.width * logicalW, y: (t.clientY - r.top) / r.height * logicalH };
  };
  let down = false;
  const start = (e) => { e.preventDefault(); down = true; if (handlers.down) handlers.down(pos(e)); };
  const move = (e) => { if (!down) { if (handlers.hover) handlers.hover(pos(e)); return; } e.preventDefault(); if (handlers.move) handlers.move(pos(e)); };
  const end = (e) => { if (!down) return; down = false; if (handlers.up) handlers.up(pos(e)); };
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
  canvas.addEventListener('touchcancel', end);
  canvas.addEventListener('mousedown', start);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  return () => {
    canvas.removeEventListener('touchstart', start);
    canvas.removeEventListener('touchmove', move);
    canvas.removeEventListener('touchend', end);
    canvas.removeEventListener('touchcancel', end);
    canvas.removeEventListener('mousedown', start);
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', end);
  };
}

/* ------------------------------------------------------------------ */
/* messages                                                           */
/* ------------------------------------------------------------------ */
// Nothing disappears on a timer: a message waits until somebody has read it
// and tapped it away. Only three stand at once; older ones step back into
// the history by themselves.

const MAX_ON_SCREEN = 3;
const history = [];
let onHistoryChange = null;

export function messages() { return history; }
export function onMessages(fn) { onHistoryChange = fn; }

function stack() {
  const layer = document.getElementById('toastLayer');
  let s = layer.querySelector('.msg-stack');
  if (!s) { s = el('div', 'msg-stack'); layer.appendChild(s); }
  return s;
}

export function message(text) {
  history.push({ text, at: Date.now() });
  if (history.length > 40) history.shift();
  if (onHistoryChange) onHistoryChange();

  const s = stack();
  const card = el('div', 'msg');
  card.appendChild(el('span', 'm-text', text));
  const x = el('button', 'm-x', '×');
  x.setAttribute('aria-label', 'ok');
  x.addEventListener('click', () => { if (card.parentNode) card.parentNode.removeChild(card); });
  card.appendChild(x);
  s.appendChild(card);
  while (s.children.length > MAX_ON_SCREEN) s.removeChild(s.firstChild);
}

/** Clear the standing messages, e.g. when a new morning starts. */
export function clearMessages() {
  const s = stack();
  while (s.firstChild) s.removeChild(s.firstChild);
}

/** A tiny animation loop that stops itself when the panel goes away. */
export function loop(fn) {
  let raf = 0, last = 0, stopped = false;
  const step = (t) => {
    if (stopped) return;
    const dt = last ? Math.min(50, t - last) : 16;
    last = t;
    fn(t, dt);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}
