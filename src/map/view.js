// Drawing the map, and the panel that explains one box at a time.
//
// The layout is deterministic — columns by kind, rows in the order the tables
// are written — so the picture is the same every time and "the box under
// saw.run" means something. Nothing is a force simulation and nothing wobbles.

import { KINDS, VIEWS, wordsFor } from './graph.js';

const BOX_W = 168;
const BOX_H = 34;
const COL_GAP = 66;
const ROW_GAP = 10;
// Past this a column wraps into another of its own. 18 is not a round number:
// it is the one that puts the 35 actions in two columns rather than three, so
// the picture comes out about as wide as a screen is rather than half as wide
// again and shrunk to fit.
const MAX_ROWS = 18;
const PAD = 40;
const HEAD = 26; // room above the first box for the column's name

/* ------------------------------------------------------------------ */
/* where everything goes                                              */
/* ------------------------------------------------------------------ */

/**
 * One view worth of boxes, placed. A kind with more rows than fit wraps into
 * side-by-side sub-columns rather than running off the bottom of a phone.
 */
export function layout(graph, viewId) {
  const view = VIEWS.find(v => v.id === viewId) || VIEWS[0];
  const mine = onlyWhatBelongs(graph, view);
  const here = new Set(mine.map(n => n.id));

  // the kinds present, in the order their columns are numbered
  const kinds = [...new Set(mine.map(n => n.kind))].sort(
    (a, b) => KINDS[a].column - KINDS[b].column,
  );

  const placed = new Map();
  let x = PAD;
  const columns = [];
  for (const kind of kinds) {
    const rows = mine.filter(n => n.kind === kind);
    if (kind === 'concern') rows.sort((a, b) => a.rank - b.rank);
    const subs = Math.ceil(rows.length / MAX_ROWS);
    const per = Math.ceil(rows.length / subs);
    columns.push({ kind, x, subs, label: KINDS[kind].label });
    rows.forEach((n, i) => {
      const sub = Math.floor(i / per);
      const row = i % per;
      placed.set(n.id, {
        node: n,
        x: x + sub * (BOX_W + 14),
        y: PAD + HEAD + row * (BOX_H + ROW_GAP),
      });
    });
    x += subs * (BOX_W + 14) - 14 + COL_GAP;
  }

  const lines = graph.edges
    .filter(e => here.has(e.from) && here.has(e.to))
    .map(e => ({ ...e, a: placed.get(e.from), b: placed.get(e.to) }));

  let height = PAD * 2 + HEAD;
  for (const p of placed.values()) height = Math.max(height, p.y + BOX_H + PAD);
  return { view, placed, lines, width: x - COL_GAP + PAD, height, columns };
}

/**
 * A view is its kinds, cut back to what is actually about the point of it. The
 * "who can do what" view keeps everything, because it is the reference. The
 * others name a `primary` kind or two and keep only the boxes with an arrow to
 * one of those — otherwise every view is all thirty-five actions and reads like
 * a wall.
 */
function onlyWhatBelongs(graph, view) {
  const inView = graph.nodes.filter(n => view.kinds.includes(n.kind));
  if (view.prune === false || !view.primary) return inView;
  const isPoint = n => view.primary.includes(n.kind);
  const pointIds = new Set(inView.filter(isPoint).map(n => n.id));
  const touches = new Set();
  for (const e of graph.edges) {
    if (pointIds.has(e.from)) touches.add(e.to);
    if (pointIds.has(e.to)) touches.add(e.from);
  }
  return inView.filter(n => isPoint(n) || touches.has(n.id));
}

/* ------------------------------------------------------------------ */
/* drawing it                                                         */
/* ------------------------------------------------------------------ */

const SVG = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => {
  const e = document.createElementNS(SVG, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};

/** A gentle curve rather than a straight line, so parallel edges stay apart. */
function curve(a, b) {
  const x1 = a.x + BOX_W,
    y1 = a.y + BOX_H / 2;
  const x2 = b.x,
    y2 = b.y + BOX_H / 2;
  // an edge that goes backwards loops under rather than through everything
  if (x2 < x1) {
    const dip = Math.max(30, Math.abs(y2 - y1) / 2 + 24);
    return (
      'M' +
      a.x +
      ' ' +
      y1 +
      ' C' +
      (a.x - dip) +
      ' ' +
      y1 +
      ' ' +
      (x2 - dip) +
      ' ' +
      y2 +
      ' ' +
      x2 +
      ' ' +
      y2
    );
  }
  const mid = (x1 + x2) / 2;
  return 'M' + x1 + ' ' + y1 + ' C' + mid + ' ' + y1 + ' ' + mid + ' ' + y2 + ' ' + x2 + ' ' + y2;
}

/**
 * Put a whole view on the sheet. Returns a small handle the page uses to move
 * the camera, light a node up and read what is showing.
 */
export function draw(sheet, plan, onPick) {
  sheet.textContent = '';
  const root = svgEl('g', {});
  const edgeLayer = svgEl('g', {});
  const nodeLayer = svgEl('g', {});
  root.appendChild(edgeLayer);
  root.appendChild(nodeLayer);
  sheet.appendChild(root);
  sheet.setAttribute('viewBox', '0 0 ' + plan.width + ' ' + plan.height);

  for (const c of plan.columns) {
    const t = svgEl('text', { x: c.x, y: PAD + 4, class: 'colhead' });
    t.textContent = c.label;
    root.insertBefore(t, edgeLayer);
  }

  const byId = new Map();
  for (const line of plan.lines) {
    const p = svgEl('path', { class: 'edge', d: curve(line.a, line.b) });
    p.dataset.from = line.from;
    p.dataset.to = line.to;
    edgeLayer.appendChild(p);
  }

  for (const [id, at] of plan.placed) {
    const n = at.node;
    const g = svgEl('g', {
      class: 'node',
      transform: 'translate(' + at.x + ' ' + at.y + ')',
      tabindex: '0',
      role: 'button',
    });
    g.dataset.id = id;
    g.setAttribute('aria-label', n.kind + ': ' + n.name);
    g.appendChild(svgEl('rect', { width: BOX_W, height: BOX_H }));
    g.appendChild(
      svgEl('rect', { class: 'tag', width: 4, height: BOX_H - 4, x: 1, y: 2, fill: colourOf(n) }),
    );
    const ic = svgEl('text', { class: 'ic', x: 12, y: BOX_H / 2 });
    ic.textContent = n.icon || '•';
    g.appendChild(ic);
    const label = svgEl('text', { x: 32, y: BOX_H / 2 });
    label.textContent = trim(n.name, 19);
    g.appendChild(label);
    if (n.rank) {
      const r = svgEl('text', { class: 'rank', x: BOX_W - 8, y: BOX_H / 2, 'text-anchor': 'end' });
      r.textContent = '#' + n.rank;
      g.appendChild(r);
    }
    g.addEventListener('click', () => onPick(id));
    g.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        onPick(id);
      }
    });
    nodeLayer.appendChild(g);
    byId.set(id, g);
  }

  return {
    /** Light up one box and everything it touches; dim the rest. */
    light(id) {
      const touching = new Set();
      for (const p of sheet.querySelectorAll('path.edge')) {
        const on = id && (p.dataset.from === id || p.dataset.to === id);
        p.classList.toggle('lit', !!on);
        p.classList.toggle('dim', !!id && !on);
        if (on) {
          touching.add(p.dataset.from);
          touching.add(p.dataset.to);
        }
      }
      for (const [nid, g] of byId) {
        g.classList.toggle('on', nid === id);
        g.classList.toggle('dim', !!id && !touching.has(nid));
      }
    },
    /** The boxes whose name matches what somebody typed. */
    find(text) {
      const q = text.trim().toLowerCase();
      let n = 0;
      for (const [nid, g] of byId) {
        const hit = !!q && nid.toLowerCase().includes(q);
        g.classList.toggle('hit', hit);
        if (hit) n++;
      }
      return n;
    },
    at(id) {
      return plan.placed.get(id);
    },
    root,
  };
}

const colourOf = n => 'var(--k-' + n.kind + ')';
const trim = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/* ------------------------------------------------------------------ */
/* the panel                                                          */
/* ------------------------------------------------------------------ */

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/** Everything known about one box, including the words the game says for it. */
export function describe(panel, graph, id, onPick) {
  const n = graph.nodes.find(x => x.id === id);
  panel.textContent = '';
  panel.hidden = false;
  if (!n) return;

  const close = el('button', 'close', '×');
  close.setAttribute('aria-label', 'close');
  close.addEventListener('click', () => onPick(null));
  panel.appendChild(close);

  panel.appendChild(el('h2', null, n.icon + ' ' + n.name));
  panel.appendChild(el('p', 'kindline', KINDS[n.kind].label));
  panel.appendChild(el('p', 'what', KINDS[n.kind].what));

  panel.appendChild(el('h3', null, 'where it lives'));
  const where = el('p');
  where.appendChild(el('code', 'where', n.file));
  if (n.symbol) {
    where.appendChild(document.createTextNode(' '));
    where.appendChild(el('code', 'where', n.symbol));
  }
  panel.appendChild(where);

  if (n.facts?.length) {
    panel.appendChild(el('h3', null, 'what it is'));
    const dl = el('dl');
    for (const [k, v] of n.facts) {
      dl.appendChild(el('dt', null, k));
      dl.appendChild(el('dd', null, String(v)));
    }
    panel.appendChild(dl);
  }

  const out = graph.edges.filter(e => e.from === id);
  const into = graph.edges.filter(e => e.to === id);
  if (out.length) panel.appendChild(related('this points at', out, 'to', graph, onPick));
  if (into.length) panel.appendChild(related('points at this', into, 'from', graph, onPick));

  const words = wordsFor(n);
  if (words.length) {
    panel.appendChild(el('h3', null, 'what the game says'));
    const table = el('table', 'says');
    const head = el('tr');
    head.appendChild(el('th', null, 'key'));
    for (const l of Object.keys(words[0].said)) head.appendChild(el('th', null, l));
    table.appendChild(head);
    for (const wd of words) {
      const tr = el('tr');
      tr.appendChild(el('td', 'k', wd.key));
      for (const l in wd.said) {
        const td = el('td', wd.said[l] == null ? 'missing' : null, wd.said[l] ?? 'missing!');
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    panel.appendChild(table);
  }
  panel.scrollTop = 0;
}

function related(title, edges, side, graph, onPick) {
  const box = document.createDocumentFragment();
  box.appendChild(el('h3', null, title));
  const ul = el('ul');
  for (const e of edges) {
    const otherId = e[side];
    const other = graph.nodes.find(x => x.id === otherId);
    const li = el('li');
    const b = el('button', 'go', (other?.icon || '') + ' ' + (other?.name || otherId));
    b.addEventListener('click', () => onPick(otherId));
    li.appendChild(el('span', 'rel', e.kind + (e.label ? ' (' + e.label + ') ' : ' ')));
    li.appendChild(b);
    ul.appendChild(li);
  }
  box.appendChild(ul);
  return box;
}

/* ------------------------------------------------------------------ */
/* moving the camera                                                  */
/* ------------------------------------------------------------------ */

/**
 * Drag to pan, wheel or pinch to zoom. Deliberately plain: the sheet has its
 * own viewBox, so everything here is one transform on one group.
 */
export function camera(sheet, getRoot, plan) {
  let scale = 1,
    ox = 0,
    oy = 0;
  const apply = () =>
    getRoot().setAttribute('transform', 'translate(' + ox + ' ' + oy + ') scale(' + scale + ')');

  const box = () => sheet.getBoundingClientRect();

  /**
   * The sheet has a viewBox and is fitted to the element, so a pixel on the
   * glass is not a unit in the picture. This is the conversion, and everything
   * that moves the camera goes through it.
   */
  const perPixel = () => {
    const b = box();
    const p = plan();
    if (!b.width || !b.height) return 1;
    return 1 / Math.min(b.width / p.width, b.height / p.height);
  };

  /** Where in the picture a point on the glass is. */
  const pointAt = (cx, cy) => {
    const b = box();
    const p = plan();
    const k = 1 / perPixel();
    // 'meet' centres the fitted picture, so account for the letterboxing
    const left = b.left + (b.width - p.width * k) / 2;
    const top = b.top + (b.height - p.height * k) / 2;
    return { x: (cx - left) * perPixel(), y: (cy - top) * perPixel() };
  };

  /**
   * Fit the whole picture, unless fitting it would make the boxes too small to
   * read — on a phone it always would, so there it zooms in and starts at the
   * top left instead, and you pan. A map you have to pinch before you can read
   * a single word is not a map.
   */
  const READABLE = 104; // how wide a box has to be on the glass, in CSS pixels
  const fit = () => {
    const onGlass = BOX_W / perPixel();
    scale = Math.max(1, Math.min(2.4, READABLE / Math.max(1, onGlass)));
    ox = 0;
    oy = 0;
    apply();
  };

  const zoomAt = (factor, cx, cy) => {
    const next = Math.min(3, Math.max(0.3, scale * factor));
    const at = pointAt(cx, cy);
    // keep whatever is under the fingers under the fingers
    ox = at.x - ((at.x - ox) * next) / scale;
    oy = at.y - ((at.y - oy) * next) / scale;
    scale = next;
    apply();
  };

  sheet.addEventListener(
    'wheel',
    ev => {
      ev.preventDefault();
      zoomAt(ev.deltaY < 0 ? 1.12 : 1 / 1.12, ev.clientX, ev.clientY);
    },
    { passive: false },
  );

  const touches = new Map();
  let last = null,
    span = 0;
  const spread = () => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };
  sheet.addEventListener('pointerdown', ev => {
    touches.set(ev.pointerId, ev);
    if (touches.size === 1) {
      last = { x: ev.clientX, y: ev.clientY };
      sheet.classList.add('dragging');
    }
    if (touches.size === 2) span = spread();
  });
  sheet.addEventListener('pointermove', ev => {
    if (!touches.has(ev.pointerId)) return;
    touches.set(ev.pointerId, ev);
    if (touches.size === 2) {
      const now = spread();
      const [a, b] = [...touches.values()];
      if (span > 0) zoomAt(now / span, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
      span = now;
      return;
    }
    if (!last) return;
    const per = perPixel();
    ox += (ev.clientX - last.x) * per;
    oy += (ev.clientY - last.y) * per;
    last = { x: ev.clientX, y: ev.clientY };
    apply();
  });
  const up = ev => {
    touches.delete(ev.pointerId);
    if (!touches.size) {
      last = null;
      sheet.classList.remove('dragging');
    }
  };
  sheet.addEventListener('pointerup', up);
  sheet.addEventListener('pointercancel', up);
  sheet.addEventListener('pointerleave', up);

  /** Bring one box to the middle, so a link in the panel actually goes there. */
  const goTo = at => {
    if (!at) return;
    const p = plan();
    ox = p.width / 2 - (at.x + BOX_W / 2) * scale;
    oy = p.height / 2 - (at.y + BOX_H / 2) * scale;
    apply();
  };

  return {
    fit,
    goTo,
    apply,
    zoom: f => {
      const b = box();
      zoomAt(f, b.left + b.width / 2, b.top + b.height / 2);
    },
  };
}
