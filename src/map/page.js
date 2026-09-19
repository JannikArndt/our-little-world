// The page at /map: build the graph from the game's own tables, draw it, and
// wire up the three things you can do to it — switch view, find a box, open one.
//
// There is no generated file anywhere and nothing to keep up to date. This page
// imports the same modules the game runs from, so what it shows is what is true
// of the build that served it.

import { buildGraph, VIEWS, CEILINGS, SHELL, missionFor } from './graph.js';
import { layout, draw, describe, blank, camera } from './view.js';
import { createWorld } from '../core/world.js';
import { setLang } from '../core/i18n.js';

// the map names things the way the code does, so the words on a card come out
// in English unless somebody asks otherwise
setLang('en');

const graph = buildGraph();
const sheet = document.getElementById('sheet');
const panel = document.getElementById('panel');
const tabs = document.getElementById('tabs');
const find = document.getElementById('find');
const hops = document.getElementById('hops');

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
    blank(panel, LIVE);
    drawn.light(null, 1);
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
  drawn.light(id, Number(hops.value));
  // deliberately not cam.goTo: a box you can already see does not move
  cam.reveal(drawn.at(id));
}

function show(next, thenPick) {
  viewId = next;
  plan = layout(graph, viewId);
  drawn = draw(sheet, plan, pick);
  cam.fit();
  for (const b of tabs.children) b.setAttribute('aria-pressed', String(b.dataset.view === viewId));
  if (find.value) drawn.find(find.value);
  if (thenPick) pick(thenPick);
  else if (picked && plan.placed.has(picked)) pick(picked);
  else pick(null);
}

for (const v of VIEWS) {
  const b = document.createElement('button');
  b.className = 'tab';
  b.textContent = v.title;
  b.title = v.note;
  b.dataset.view = v.id;
  b.addEventListener('click', () => show(v.id));
  tabs.appendChild(b);
}

// how far out from a box to light things up. Four is far enough to follow a
// chain — wood to plank to house — and near enough not to light the lot.
hops.addEventListener('change', () => {
  if (picked) drawn.light(picked, Number(hops.value));
});

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

/* --- the lines that prove this is reading the live code ------------- */
// A fresh world, right here in the page, asked what it would put in front of a
// player first. If the concern list changes, these lines change with it.
const fresh = createWorld(42);
const mission = missionFor(fresh);
const LIVE = [
  [
    'the first mission in a new world',
    mission.first ? mission.first.id : 'nothing — the calm card',
  ],
  ['waiting behind it', mission.queue.length + ' more concerns'],
  [
    'a house shell',
    Object.entries(SHELL)
      .map(([k, v]) => v + ' ' + k)
      .join(' and '),
  ],
  ['the ceilings', CEILINGS.map(c => c.name + ' ' + c.value).join(', ')],
];

show(viewId);

// so a browser test can ask the page what it thinks rather than guess from pixels
window.olwMap = { graph, plan: () => plan, view: () => viewId, pick };
