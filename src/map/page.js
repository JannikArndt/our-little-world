// The page at /map: build the graph from the game's own tables, draw it, and
// wire up the three things you can do to it — switch view, find a box, open one.
//
// There is no generated file anywhere and nothing to keep up to date. This page
// imports the same modules the game runs from, so what it shows is what is true
// of the build that served it.

import { buildGraph, VIEWS, KINDS, CEILINGS, SHELL, missionFor } from './graph.js';
import { layout, draw, describe, camera } from './view.js';
import { createWorld } from '../core/world.js';
import { setLang } from '../core/i18n.js';

// the map names things the way the code does, so the words on a card come out
// in English unless somebody asks otherwise
setLang('en');

const graph = buildGraph();
const sheet = document.getElementById('sheet');
const panel = document.getElementById('panel');
const tabs = document.getElementById('tabs');
const blurb = document.getElementById('blurb');
const count = document.getElementById('count');
const find = document.getElementById('find');
const legend = document.getElementById('legend');

let plan = null;
let drawn = null;
let picked = null;
let viewId = VIEWS[0].id;

const cam = camera(
  sheet,
  () => drawn.root,
  () => plan,
);

function pick(id) {
  picked = id;
  if (!id) {
    panel.hidden = true;
    drawn.light(null);
    return;
  }
  // a link in the panel may point at something this view does not show
  if (!plan.placed.has(id)) {
    const home = VIEWS.find(v => v.kinds.includes(graph.nodes.find(n => n.id === id)?.kind));
    if (home && home.id !== viewId) {
      show(home.id, id);
      return;
    }
  }
  describe(panel, graph, id, pick);
  drawn.light(id);
  cam.goTo(drawn.at(id));
}

function show(next, thenPick) {
  viewId = next;
  plan = layout(graph, viewId);
  drawn = draw(sheet, plan, pick);
  cam.fit();
  blurb.textContent = plan.view.blurb;
  count.textContent = plan.placed.size + ' things, ' + plan.lines.length + ' connections';
  for (const b of tabs.children) b.setAttribute('aria-pressed', String(b.dataset.view === viewId));
  drawLegend();
  if (find.value) drawn.find(find.value);
  if (thenPick) pick(thenPick);
  else if (picked && plan.placed.has(picked)) pick(picked);
  else {
    panel.hidden = true;
    picked = null;
  }
}

function drawLegend() {
  legend.textContent = '';
  for (const c of plan.columns) {
    const s = document.createElement('span');
    const i = document.createElement('i');
    i.style.background = 'var(--k-' + c.kind + ')';
    s.appendChild(i);
    s.appendChild(document.createTextNode(c.kind + ' — ' + KINDS[c.kind].label));
    legend.appendChild(s);
  }
}

for (const v of VIEWS) {
  const b = document.createElement('button');
  b.className = 'tab';
  b.textContent = v.title;
  b.dataset.view = v.id;
  b.addEventListener('click', () => show(v.id));
  tabs.appendChild(b);
}

find.addEventListener('input', () => {
  const n = drawn.find(find.value);
  find.setAttribute('aria-label', find.value ? n + ' matches' : 'find a thing');
});

document.getElementById('fit').addEventListener('click', () => cam.fit());
document.getElementById('inn').addEventListener('click', () => cam.zoom(1.25));
document.getElementById('out').addEventListener('click', () => cam.zoom(1 / 1.25));
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') pick(null);
});
window.addEventListener('resize', () => cam.apply());

show(viewId);

/* --- the one line that proves this is reading the live code -------- */
// A fresh world, right here in the page, asked what it would put in front of a
// player first. If the concern list changes, this line changes with it.
const fresh = createWorld(42);
const mission = missionFor(fresh);
document.getElementById('live').textContent =
  'In a brand new world the guide would ask for: ' +
  (mission.first ? mission.first.id : 'nothing — the calm card') +
  ' · ' +
  mission.queue.length +
  ' more waiting behind it · a house shell costs ' +
  Object.entries(SHELL)
    .map(([k, v]) => v + ' ' + k)
    .join(' and ') +
  ' · ' +
  CEILINGS.map(c => c.name + ' ' + c.value).join(', ');

// so a browser test can ask the page what it thinks rather than guess from pixels
window.olwMap = { graph, plan: () => plan, view: () => viewId, pick };
