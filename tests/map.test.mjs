// The map at /map is only worth having if it cannot go quietly out of date.
//
// It is built in the browser from the game's own tables, so it cannot show a
// project that does not exist. The risk runs the other way: something added to
// the game and left off the map. These tests are that direction, and they are
// the reason /map does not need remembering.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { buildGraph, VIEWS, KINDS, CEILINGS, wordsFor } from '../src/map/graph.js';
// layout() draws nothing and touches no DOM, so the real placement can be checked
// here rather than only in a browser
import { layout } from '../src/map/view.js';
import { CAPS, RESOURCES, createWorld } from '../src/core/world.js';
import {
  ROLES,
  PROJECTS,
  VILLAGER_SKILLS,
  SKILL_ORDER,
  HOUSE_STUFF,
  HOUSE_SHELF,
} from '../src/core/content.js';
import { ACTIONS, EVENTS } from '../src/core/actions/index.js';
import { applyAction } from '../src/core/actions.js';
import { catchUp } from '../src/core/sim.js';
import { CONCERNS, MAX_ACTIVE } from '../src/core/guide.js';
import { STRINGS, LANGUAGES } from '../src/core/i18n.js';

const graph = buildGraph();
const ids = new Set(graph.nodes.map(n => n.id));
const of = kind => graph.nodes.filter(n => n.kind === kind);

test('everything the game is made of is on the map', () => {
  const want = [
    ...Object.keys(ROLES).map(k => 'role:' + k),
    ...Object.keys(CAPS).map(k => 'cap:' + k),
    ...Object.keys(ACTIONS).map(k => 'action:' + k),
    ...RESOURCES.map(r => 'res:' + r.key),
    ...Object.keys(PROJECTS).map(k => 'project:' + k),
    ...Object.keys(VILLAGER_SKILLS).map(k => 'skill:' + k),
    ...Object.keys(HOUSE_STUFF).map(k => 'stuff:' + k),
    ...CONCERNS.map(c => 'concern:' + c.id),
    ...Object.keys(EVENTS).map(k => 'event:' + k),
  ];
  for (const id of want) assert.ok(ids.has(id), id + ' is in the game but not on the map');
});

test('and nothing is on the map that is not in the game', () => {
  const real = {
    role: ROLES,
    cap: CAPS,
    action: ACTIONS,
    project: PROJECTS,
    skill: VILLAGER_SKILLS,
    stuff: HOUSE_STUFF,
    event: EVENTS,
  };
  for (const n of graph.nodes) {
    const table = real[n.kind];
    if (!table) continue; // res, store, game, gives and concern are checked below
    assert.ok(table[n.name], n.id + ' is on the map but nowhere in the game');
  }
  for (const n of of('res'))
    assert.ok(
      RESOURCES.some(r => r.key === n.name),
      n.id + ' is no real thing',
    );
  for (const n of of('concern'))
    assert.ok(
      CONCERNS.some(c => c.id === n.name),
      n.id + ' is no real concern',
    );
});

test('every box says where in the code to look, and is right about it', () => {
  for (const n of graph.nodes) {
    assert.ok(KINDS[n.kind], n.id + ' is a kind of thing the map has no name for');
    assert.ok(n.file, n.id + ' does not say which file it lives in');
    // readFileSync throwing is half the test: a file that has moved fails here
    const src = readFileSync(new URL('../' + n.file, import.meta.url), 'utf8');
    assert.ok(src.length > 0, n.file + ' is empty');
    // For anything named after a row in a table, the name has to appear in the
    // file it claims — that is what stops a rename leaving the map pointing at
    // the wrong place. A mini-game is named after its file instead, so opening
    // the file at all is the whole check there.
    if (n.kind === 'game') continue;
    assert.ok(src.includes(n.name), n.id + ' is not mentioned in ' + n.file);
  }
});

test('every mini-game on the map is a file that really exists', () => {
  const onDisk = readdirSync(new URL('../src/minigames/', import.meta.url))
    .filter(f => f.endsWith('.js'))
    .map(f => f.slice(0, -3));
  const shown = of('game').map(n => n.name);
  for (const g of shown)
    assert.ok(onDisk.includes(g), 'the map shows a mini-game that is gone: ' + g);
  // the other direction is a real gap worth knowing about: a mini-game no action
  // opens is a mini-game nobody can reach
  for (const g of onDisk)
    assert.ok(shown.includes(g), 'no action opens src/minigames/' + g + '.js — is it reachable?');
});

test('no arrow points at a box that is not there', () => {
  for (const e of graph.edges) {
    assert.ok(ids.has(e.from), 'an arrow starts at nothing: ' + e.from);
    assert.ok(ids.has(e.to), 'an arrow ends at nothing: ' + e.to);
  }
  assert.ok(
    graph.edges.length > 100,
    'only ' + graph.edges.length + ' arrows — did a table stop being read?',
  );
});

test('every word the map shows exists in every language', () => {
  for (const n of graph.nodes)
    for (const wd of wordsFor(n))
      for (const l of LANGUAGES)
        assert.ok(
          wd.said[l.id] != null,
          n.id + ' shows ' + wd.key + ', which ' + l.id + ' has no word for',
        );
});

test('the words the map shows are the words the game has, not a copy', () => {
  // if this ever passes by accident it is because the map stopped reading the
  // tables, so check one known string both ways
  const fell = graph.nodes.find(n => n.id === 'cap:fell');
  const words = wordsFor(fell);
  const capWord = words.find(w => w.key === 'cap.fell');
  assert.ok(capWord, 'the map no longer shows what a capability is called');
  assert.equal(capWord.said.en, STRINGS.en['cap.fell']);
  assert.equal(capWord.said.de, STRINGS.de['cap.fell']);
});

test('every concern is on the map in the order that decides the design', () => {
  const shown = of('concern').sort((a, b) => a.rank - b.rank);
  assert.equal(shown.length, CONCERNS.length);
  shown.forEach((n, i) => {
    assert.equal(n.name, CONCERNS[i].id, 'the map has the concerns in the wrong order');
    assert.equal(n.rank, i + 1);
  });
  // and every one of them drew a card, so the steps really are on the map
  for (const n of shown)
    assert.ok(n.cardId, n.id + ' drew no card, so the map cannot show its steps');
});

test('the villagers only ever gather into somewhere that is not a player own', () => {
  // law 9, as an arrow: nothing a villager brings in lands in a player hands
  for (const e of graph.edges) {
    if (e.kind !== 'gathers into') continue;
    assert.notEqual(e.to, 'store:players', e.from + ' gathers straight into a player own hands');
  }
  for (const key of SKILL_ORDER)
    assert.ok(
      graph.edges.some(e => e.from === 'skill:' + key && e.kind === 'gathers into'),
      'nothing says where ' + key + ' puts what it brings in',
    );
});

test('the two orderings are complete covers of what they order', () => {
  assert.deepEqual([...SKILL_ORDER].sort(), Object.keys(VILLAGER_SKILLS).sort());
  assert.deepEqual([...HOUSE_SHELF].sort(), Object.keys(HOUSE_STUFF).sort());
});

test('the ceilings are the ones the anti-list is about, with their real values', () => {
  const by = Object.fromEntries(CEILINGS.map(c => [c.name, c.value]));
  assert.equal(by.MAX_ACTIVE, MAX_ACTIVE, 'law 1');
  assert.equal(by.MAX_SKILLS, 2, 'two jobs each, ever');
  assert.equal(by.BAG_CAP, 6);
  assert.equal(by.PILE_CAP, 20);
  assert.equal(by.AWAY_JOBS_CAP, 8);
  for (const c of CEILINGS) assert.ok(c.why, c.name + ' does not say what it is for');
});

test('every view has something in it, and between them they show the lot', () => {
  // laid out for real, not just by kind: a view cuts itself back to what is
  // about the point of it, and a box cut from every view is a box nobody sees
  const seen = new Set();
  for (const v of VIEWS) {
    const plan = layout(graph, v.id);
    assert.ok(plan.placed.size > 3, 'the "' + v.id + '" view is nearly empty');
    assert.ok(plan.lines.length > 2, 'the "' + v.id + '" view has almost no arrows');
    assert.ok(v.title && v.blurb, v.id + ' does not say what it is');
    for (const id of plan.placed.keys()) seen.add(id);
  }
  for (const n of graph.nodes)
    assert.ok(seen.has(n.id), n.id + ' is laid out on no view, so nobody can see it');
});

test('a view that says what it is about does not just show everything', () => {
  // the point of cutting back: the ladder is about the concerns, not about all
  // thirty-five actions, and if that stops being true it reads like a wall
  const all = layout(graph, 'doing').placed.size;
  for (const v of VIEWS.filter(x => x.primary)) {
    const plan = layout(graph, v.id);
    assert.ok(plan.placed.size < all, 'the "' + v.id + '" view shows as much as the reference one');
    for (const id of plan.placed.keys()) {
      const node = graph.nodes.find(n => n.id === id);
      assert.ok(
        v.kinds.includes(node.kind),
        v.id + ' shows a ' + node.kind + ', which it did not ask for',
      );
    }
  }
});

test('the page really is built at load rather than written out somewhere', () => {
  // The whole promise of /map is that there is no generated copy to go stale.
  // If one ever appears, this is where it gets noticed.
  const page = readFileSync(new URL('../map.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /<script type="module" src="src\/map\/page\.js">/,
    'the page stopped loading the code',
  );
  assert.ok(
    !/<script(?![^>]*\bsrc=)/.test(page),
    'map.html grew an inline script — keep it CSP-ready',
  );
  assert.ok(!/<style/.test(page), 'map.html grew an inline style — keep it CSP-ready');
  for (const n of graph.nodes)
    assert.ok(
      !page.includes('"' + n.id + '"'),
      'map.html mentions ' + n.id + ' — the page must not hold content of its own',
    );
});

test('what is served, what is hashed and what ships all know about the map', () => {
  const serve = readFileSync(new URL('../server/serve.mjs', import.meta.url), 'utf8');
  const build = readFileSync(new URL('../server/buildid.mjs', import.meta.url), 'utf8');
  const docker = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(serve, /'\/map\.html'/, 'a browser may not fetch map.html — PUBLIC_FILES');
  assert.match(serve, /=== '\/map'/, 'nothing rewrites /map to /map.html');
  assert.match(build, /'map\.html'/, 'map.html is not in the build hash — SERVED');
  assert.match(docker, /COPY map\.html/, 'map.html does not ship — the Dockerfile COPY list');
});

test('a world can still be made in here, which is what the live line needs', () => {
  const w = createWorld(42);
  assert.ok(
    w.villagers.length > 0,
    'the map page builds a world to show what the guide would ask for',
  );
});

test('what a job says it brings in is what it really brings in', () => {
  // `brings` is what puts a skill next to a resource on the map, and a wrong one
  // would draw a confident arrow at the wrong thing. So it is not taken on
  // trust: each job is shown to somebody, the village is left alone, and
  // whatever turns up is compared with what the row claims.
  for (const key of SKILL_ORDER) {
    const skill = VILLAGER_SKILLS[key];
    const w = createWorld(11);
    applyAction(w, { type: 'block.start', length: 1000000 });
    for (const id in w.players)
      Object.assign(w.players[id].done, { fell: 9, stone: 9, farm: 9, care: 9, fish: 9 });
    for (const v of w.villagers) v.hunger = 5;
    // a village with something for every job to actually do: a row standing
    // ready to reap, and a sheep worth shearing. Without these, farming only
    // sows and shearing finds nothing on.
    w.plots[0].state = 'ripe';
    w.plots[0].growth = 100;
    for (const sh of w.sheep) sh.fluff = 90;
    // whatever has to be standing first, stand it up
    if (skill.needs) {
      const plan = w.buildings.find(b => b.type === PROJECTS[skill.needs].type);
      plan.state = 'built';
      plan.fishedTick = -9999;
    }
    const worker = w.villagers.filter(v => v.homeId && !v.kid)[0];
    assert.ok(worker, 'nobody in this village is settled enough to be shown a job');
    for (const v of w.villagers) v.skills = [];
    worker.skills = [{ what: key, by: 'A' }];

    const before = snapshot(w, worker);
    w.ext.awayAt = Date.now() - 6 * 60 * 60 * 1000;
    catchUp(w, Date.now());
    const after = snapshot(w, worker);

    const grew = Object.keys(after).filter(k => after[k] > before[k]);
    assert.ok(
      grew.includes(skill.brings),
      key +
        ' says it brings in ' +
        skill.brings +
        ', but what turned up was: ' +
        (grew.join(', ') || 'nothing'),
    );
  }
});

/** Everything a villager job could put anywhere, counted in one place. */
function snapshot(w, v) {
  const out = {};
  for (const r of RESOURCES) {
    out[r.key] =
      (w.pile[r.key] || 0) +
      (v.bag?.[r.key] || 0) +
      (w.larder[r.key] || 0) +
      (v.carrying?.res === r.key ? v.carrying.n : 0);
  }
  return out;
}
