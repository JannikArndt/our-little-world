// The game as boxes and arrows, worked out from the game's own tables.
//
// Nothing here is a description of the game written down a second time. Every
// node is a row in ROLES, CAPS, ACTIONS, RESOURCES, PROJECTS, VILLAGER_SKILLS,
// HOUSE_STUFF or CONCERNS, and every edge is a field of one of those rows
// pointing at another. That is the whole design: a new project is a row in
// PROJECTS and it appears here on its own, and nothing in src/map/ has any
// content of its own to go stale.
//
// It draws nothing and touches no DOM, so tests/map.test.mjs can import it and
// check that the picture still covers the game.

import { CAPS, RESOURCES, BAG_KEYS, PILE_KEYS, createWorld } from '../core/world.js';
import {
  ROLES,
  PROJECTS,
  VILLAGER_SKILLS,
  SKILL_ORDER,
  HOUSE_STUFF,
  HOUSE_SHELF,
  HOUSE_SHELL,
  HOUSE_START,
  FOODS,
  MAX_SKILLS,
  TEACH_TIMES,
  BAG_CAP,
  PILE_CAP,
  AWAY_JOBS_CAP,
  WORK_EVERY,
  TREE_FLOOR,
  SAPLING_TICKS,
} from '../core/content.js';
import { ACTIONS, EVENTS } from '../core/actions/index.js';
import { MINIGAMES } from '../minigames/list.js';
import { CONCERNS, MAX_ACTIVE, allProblems } from '../core/guide.js';
import { STRINGS, LANGUAGES } from '../core/i18n.js';

/* ------------------------------------------------------------------ */
/* the kinds of thing there are                                       */
/* ------------------------------------------------------------------ */

/**
 * Every node is one of these. `what` is the sentence the panel opens with, and
 * `column` is where it stands in a view — the layout is deterministic on
 * purpose, so "the box to the left of saw.run" means the same thing twice.
 */
export const KINDS = {
  role: {
    label: 'roles',
    column: 0,
    what: 'One of the two people playing. A row in ROLES: which capabilities it starts with, and what it starts holding.',
  },
  cap: {
    label: 'capabilities',
    column: 1,
    what: 'What a role may do. A key in CAPS — either of you can be taught any of them, which is why a column is where things start rather than a wall.',
  },
  action: {
    label: 'actions',
    column: 2,
    what: 'The only way the world ever changes: applyAction(w, a). A row in one of the group files under src/core/actions/.',
  },
  game: {
    label: 'mini-games',
    column: 3,
    what: 'What stands between wanting a thing and having it, because a tap is free and free is the wrong price. One function, opened by one action.',
  },
  res: {
    label: 'resources',
    column: 4,
    what: 'One of the things RESOURCES lists: carried, spent, and gathered.',
  },
  store: {
    label: 'stores',
    column: 5,
    what: 'Where resources sit. A player inventory is theirs; the pile, a villager arms and the larder are not.',
  },
  project: {
    label: 'projects',
    column: 3,
    what: 'Something the village builds. A row in PROJECTS: marked out on the map from the start, built once, there for good.',
  },
  skill: {
    label: 'villager skills',
    column: 2,
    what: 'A job a villager can be shown. A row in VILLAGER_SKILLS: show somebody TEACH_TIMES and they do it themselves, here and while you are away.',
  },
  stuff: {
    label: 'furniture',
    column: 4,
    what: 'A row in HOUSE_STUFF. Written or drawn before it can be placed, and a house is furnished for ever.',
  },
  gives: {
    label: 'house properties',
    column: 5,
    what: 'Something true of a house. houseFit() derives all of these from the furniture standing in the room, so they can never drift from it.',
  },
  concern: {
    label: 'concerns',
    column: 0,
    what: 'Something the guide may ask for. A row in CONCERNS — the world reads itself and the first one that applies is the mission.',
  },
  event: {
    label: 'events',
    column: 1,
    what: 'Something the world does during a play block. A row in EVENTS, never raised while nobody is watching.',
  },
};

/** The four pictures. A node belongs to a view if its kind is listed here. */
export const VIEWS = [
  {
    id: 'doing',
    title: 'Actions',
    note: 'Every way a player changes the world, what it costs and what it gives back.',
    kinds: ['role', 'cap', 'action', 'game', 'res', 'store'],
    // the reference view: everything a player can do, nothing left out
    prune: false,
  },
  {
    id: 'ladder',
    title: 'Missions',
    note:
      'CONCERNS in order. The guide shows ' +
      MAX_ACTIVE +
      ', so where a concern stands here decides whether anybody ever sees it.',
    kinds: ['concern', 'action', 'project', 'event'],
    primary: ['concern'],
  },
  {
    id: 'house',
    title: 'Houses',
    note: 'What a piece of furniture costs, and what a house ends up being because of it.',
    kinds: ['action', 'res', 'stuff', 'gives'],
    primary: ['stuff', 'gives'],
  },
  {
    id: 'alone',
    title: 'Village',
    note: 'What happens with nobody watching, and the ceilings that bound it. Only kind things: it only ever adds.',
    kinds: ['skill', 'project', 'store', 'res', 'event'],
    primary: ['skill', 'store', 'res', 'event'],
  },
];

/* ------------------------------------------------------------------ */
/* building it                                                        */
/* ------------------------------------------------------------------ */

const BY = ['byProject', 'bySkill', 'byFurniture']; // "the row it acts on decides"

/** The ceilings, gathered where they can be read in one go. */
export const CEILINGS = [
  { name: 'MAX_ACTIVE', value: MAX_ACTIVE, why: 'missions shown at once, ever' },
  { name: 'MAX_SKILLS', value: MAX_SKILLS, why: 'jobs one villager can hold, ever' },
  { name: 'TEACH_TIMES', value: TEACH_TIMES, why: 'times you do a thing before you can show it' },
  { name: 'BAG_CAP', value: BAG_CAP, why: 'things a villager carries before they stop' },
  { name: 'PILE_CAP', value: PILE_CAP, why: 'things on the pile before the hauling stops' },
  { name: 'AWAY_JOBS_CAP', value: AWAY_JOBS_CAP, why: 'jobs brought back from any absence' },
  { name: 'WORK_EVERY', value: WORK_EVERY, why: 'ticks between one villager job and the next' },
  { name: 'TREE_FLOOR', value: TREE_FLOOR, why: 'trees a villager always leaves standing' },
  { name: 'SAPLING_TICKS', value: SAPLING_TICKS, why: 'ticks before a sapling is a tree again' },
];

export function buildGraph() {
  const nodes = [];
  const edges = [];
  const add = n => {
    // `key` is what the table calls it and `name` is what the box says. They are
    // the same for almost everything, and are not for a role: ROLES.A is called
    // the Builder. Tests match on `key`, so a rename cannot slip past them.
    n.key = n.id.slice(n.id.indexOf(':') + 1);
    nodes.push(n);
    return n;
  };
  const link = (from, to, kind, label) => {
    edges.push({ from, to, kind, label: label || null });
  };

  /* --- the two people, and what they know --------------------------- */
  for (const id in ROLES) {
    const r = ROLES[id];
    add({
      id: 'role:' + id,
      kind: 'role',
      // 'A' and 'B' are how the code keys them; the Builder and the Keeper is
      // who they are, and the game's own words are where that comes from
      name: english('role.' + id + '.short') || id,
      icon: r.emoji,
      colour: r.colour,
      file: 'src/core/content.js',
      symbol: 'ROLES.' + id,
      keys: ['role.' + id + '.name', 'role.' + id + '.short', 'role.' + id + '.desc'],
      facts: [
        ['known in the code as', 'role ' + id + ' — w.players.' + id],
        ['starts knowing', Object.keys(r.caps).join(', ')],
        ['starts holding', costWords(r.res)],
      ],
    });
    for (const cap in r.caps) link('role:' + id, 'cap:' + cap, 'grants');
  }

  for (const cap in CAPS) {
    add({
      id: 'cap:' + cap,
      kind: 'cap',
      name: cap,
      icon: CAPS[cap].icon,
      file: 'src/core/world.js',
      symbol: 'CAPS.' + cap,
      keys: ['cap.' + cap, 'verb.' + cap],
      facts: [
        ['starts with', CAPS[cap].owner],
        ['can be taught', 'yes — the `teach` action hands it over'],
      ],
    });
    // anybody who holds it can hand it on, which is what law 7 is about
    link('cap:' + cap, 'action:teach', 'teachable');
  }

  /* --- things you can hold, and the places they sit ------------------ */
  for (const r of RESOURCES)
    add({
      id: 'res:' + r.key,
      kind: 'res',
      name: r.key,
      icon: r.icon,
      file: 'src/core/world.js',
      symbol: 'RESOURCES',
      keys: ['res.' + r.key],
      facts: [],
    });

  const stores = [
    {
      key: 'players',
      name: 'inventory',
      icon: '🤲',
      holds: RESOURCES.map(r => r.key),
      cap: null,
      symbol: 'w.players[role].res',
      note: 'What a player holds, one inventory each. Nothing a villager gathers ever lands here unasked (law 9).',
    },
    {
      key: 'pile',
      name: 'pile',
      icon: '🪵',
      holds: PILE_KEYS,
      cap: PILE_CAP,
      symbol: 'w.pile / PILE_KEYS',
      note: 'By the workshop door, nobody. Either of you can take from it.',
    },
    {
      key: 'bag',
      name: 'bag',
      icon: '🎒',
      holds: BAG_KEYS,
      cap: BAG_CAP,
      symbol: 'v.bag / BAG_KEYS',
      note: 'In a villager own arms, theirs until somebody asks for it.',
    },
    {
      key: 'larder',
      name: 'larder',
      icon: '🧺',
      holds: FOODS.map(f => f.key),
      cap: null,
      symbol: 'w.larder / FOODS',
      note: 'The bread basket everybody eats from, including the villagers.',
    },
  ];
  for (const s of stores) {
    add({
      id: 'store:' + s.key,
      kind: 'store',
      name: s.name,
      icon: s.icon,
      file: 'src/core/world.js',
      symbol: s.symbol,
      keys: [],
      facts: [
        ['holds', s.holds.join(', ')],
        ['holds at most', s.cap === null ? 'no ceiling — it is yours' : String(s.cap)],
        ['what it is', s.note],
      ],
    });
    for (const k of s.holds) link('store:' + s.key, 'res:' + k, 'holds');
  }
  // the one action that moves a thing from one player to the other rather than
  // spending it, which is why its row names neither a cost nor a yield. Law 7
  // is the reason it exists at all.
  link('action:give', 'store:players', 'hands over');

  /* --- every way the world changes ---------------------------------- */
  const games = new Set();
  for (const type in ACTIONS) {
    const row = ACTIONS[type];
    if (row.aliasOf) {
      add({
        id: 'action:' + type,
        kind: 'action',
        name: type,
        icon: '↩️',
        file: row.file,
        symbol: type,
        keys: [],
        alias: row.aliasOf,
        facts: [['an older name for', row.aliasOf]],
      });
      link('action:' + type, 'action:' + row.aliasOf, 'same as');
      continue;
    }
    add({
      id: 'action:' + type,
      kind: 'action',
      name: type,
      icon: iconFor(row),
      file: row.file,
      symbol: type,
      group: row.group,
      keys: row.journal && !BY.includes(row.journal) ? [row.journal] : [],
      facts: [
        [
          'who may',
          row.cap === null ? 'either of you' : BY.includes(row.cap) ? theRow(row.cap) : row.cap,
        ],
        [
          'costs',
          row.costs === null
            ? 'nothing'
            : BY.includes(row.costs)
              ? theRow(row.costs)
              : costWords(row.costs),
        ],
        ['gives back', row.yields === null ? 'nothing' : costWords(row.yields)],
        ['counts towards', row.tallies.length ? row.tallies.join(', ') : 'nothing'],
        [
          'needs standing first',
          row.needs === null ? 'nothing' : BY.includes(row.needs) ? theRow(row.needs) : row.needs,
        ],
        ['safe to apply twice because', row.twice],
      ],
    });
    if (row.cap && !BY.includes(row.cap)) link('cap:' + row.cap, 'action:' + type, 'unlocks');
    if (row.needs && !BY.includes(row.needs))
      link('project:' + row.needs, 'action:' + type, 'needed by');
    if (row.minigame) {
      games.add(row.minigame);
      link('action:' + type, 'game:' + row.minigame, 'opens');
    }
    // a resource flows in as a cost and out as a yield, so the arrows read as a flow
    if (row.costs && !BY.includes(row.costs))
      for (const k in row.costs) link('res:' + k, 'action:' + type, 'costs', String(row.costs[k]));
    if (row.yields && !BY.includes(row.yields))
      for (const k in row.yields)
        link('action:' + type, 'res:' + k, 'yields', String(row.yields[k]));
  }

  for (const g of [...games].sort()) {
    const m = MINIGAMES[g];
    add({
      id: 'game:' + g,
      kind: 'game',
      name: g,
      icon: '🎯',
      file: 'src/minigames/' + m.file,
      symbol: m.opens + '()',
      keys: [],
      facts: [
        ['what you do', m.what],
        ['opened by', m.opens + '() in src/minigames/' + m.file],
        ['runs', 'on the device that opened it — only the outcome travels as an action'],
      ],
    });
  }

  /* --- what the village builds for itself --------------------------- */
  for (const key in PROJECTS) {
    const p = PROJECTS[key];
    add({
      id: 'project:' + key,
      kind: 'project',
      name: key,
      icon: p.journal,
      file: 'src/core/content.js',
      symbol: 'PROJECTS.' + key,
      keys: [p.built, ...Object.values(p.text)],
      facts: [
        ['costs', costWords(p.cost)],
        ['who knows how', p.cap],
        ['asked for with', 'verb.' + p.verb],
        ['built by', 'project.build, with what: ' + key],
      ],
    });
    link('cap:' + p.cap, 'project:' + key, 'builds');
    link('action:project.build', 'project:' + key, 'raises');
    for (const k in p.cost) link('res:' + k, 'project:' + key, 'costs', String(p.cost[k]));
  }

  /* --- the jobs a villager can be shown ----------------------------- */
  for (const key of SKILL_ORDER) {
    const s = VILLAGER_SKILLS[key];
    const lands = whereItLands(key);
    add({
      id: 'skill:' + key,
      kind: 'skill',
      name: key,
      icon: s.icon,
      file: 'src/core/content.js',
      symbol: 'VILLAGER_SKILLS.' + key,
      keys: ['skill.' + key, ...(s.verb ? ['verb.' + s.verb] : [])],
      facts: [
        ['who can show it', s.cap === null ? 'either of you' : 'whoever holds ' + s.cap],
        ['shown after', TEACH_TIMES + '× ' + s.tally],
        ['needs standing first', s.needs || 'nothing'],
        ['brings in', s.brings || 'nothing'],
        ['which goes to', lands.join(', ') || 'nowhere a player owns'],
        ['renewable', 'yes — it has to be, or a night away would empty the valley'],
      ],
    });
    if (s.cap) link('cap:' + s.cap, 'skill:' + key, 'can show');
    if (s.needs) link('project:' + s.needs, 'skill:' + key, 'needed by');
    if (s.brings) link('skill:' + key, 'res:' + s.brings, 'brings in');
    for (const store of lands) link('skill:' + key, 'store:' + store, 'gathers into');
    for (const type in ACTIONS) {
      const row = ACTIONS[type];
      if (row.aliasOf) continue;
      // the count that earns the right to show it: whichever actions write that tally
      if (row.tallies.includes(s.tally)) link('action:' + type, 'skill:' + key, 'counts towards');
      // and the act of showing it. A row saying `bySkill` is a row the skill
      // decides for, which is the same thing as an arrow to every skill.
      if (row.cap === 'bySkill' || row.needs === 'bySkill')
        link('action:' + type, 'skill:' + key, 'shows');
    }
  }

  /* --- a house, and what ends up in it ------------------------------ */
  const givens = new Set();
  for (const key of HOUSE_SHELF) {
    const f = HOUSE_STUFF[key];
    add({
      id: 'stuff:' + key,
      kind: 'stuff',
      name: key,
      icon: f.icon,
      file: 'src/core/content.js',
      symbol: 'HOUSE_STUFF.' + key,
      keys: ['house.' + key],
      facts: [
        ['costs', costWords(f.cost)],
        ['stands', 'on the ' + f.where],
        ['gives', f.gives || 'nothing but the look of it'],
        ['adds to comfort', String(f.comfort)],
        ['made by', 'tracing the word — SHAPES in src/minigames/trace.js'],
      ],
    });
    link('action:house.put', 'stuff:' + key, 'puts up');
    // moving is the one action that changes nothing about a house except where a
    // thing stands, so this arrow is all it has — and without it the box floats
    link('action:house.move', 'stuff:' + key, 'moves');
    if (HOUSE_START.includes(key)) link('action:house.build', 'stuff:' + key, 'comes with');
    for (const k in f.cost) link('res:' + k, 'stuff:' + key, 'costs', String(f.cost[k]));
    if (f.gives) {
      givens.add(f.gives);
      link('stuff:' + key, 'gives:' + f.gives, 'gives');
    }
    // and comfort, which every piece adds to whether or not it gives anything
    // else. Without this arrow a blanket looks like it does nothing at all.
    if (f.comfort) {
      givens.add('comfort');
      link('stuff:' + key, 'gives:comfort', 'adds to', '+' + f.comfort);
    }
  }
  for (const g of [...givens].sort()) {
    const from = HOUSE_SHELF.filter(k => HOUSE_STUFF[k].gives === g);
    add({
      id: 'gives:' + g,
      kind: 'gives',
      name: g,
      icon: '✨',
      file: 'src/core/world.js',
      symbol: 'houseFit()',
      keys: [],
      facts: [
        [
          'comes from',
          g === 'comfort'
            ? 'every piece, by however much its row says'
            : from.join(' or ') + ' — nothing else gives it',
        ],
        ['read as', 'b.' + (g === 'bed' ? 'beds' : g)],
        ['never', 'written directly — that is what stops it drifting from the room'],
      ],
    });
  }

  /* --- what the guide asks for, in the order it matters ------------- */
  CONCERNS.forEach((c, i) => {
    const card = safeCard(c);
    add({
      id: 'concern:' + c.id,
      kind: 'concern',
      name: c.id,
      icon: card?.icon || '•',
      file: 'src/core/guide.js',
      symbol: 'CONCERNS[' + i + ']',
      rank: i + 1,
      cardId: card?.id || null,
      keys: card ? ['guide.' + titleKey(c.id) + '.title'] : [],
      facts: [
        ['stands', i + 1 + ' of ' + CONCERNS.length + ' — only the first that applies is shown'],
        ['draws the card', card ? card.id : '(needs a world that has this wrong)'],
        ['steps', card ? card.steps.map(s => s.role + ': ' + (s.does || 'wait')).join(' · ') : '—'],
      ],
    });
    if (i > 0) link('concern:' + CONCERNS[i - 1].id, 'concern:' + c.id, 'then');
    for (const s of card?.steps || []) {
      if (!s.does) continue;
      const [type, what] = s.does.split(':');
      link('concern:' + c.id, 'action:' + type, 'asks for', s.role);
      if (what) link('concern:' + c.id, 'project:' + what, 'asks for', s.role);
    }
  });

  /* --- and what the world does by itself ---------------------------- */
  for (const name in EVENTS) {
    const ev = EVENTS[name];
    add({
      id: 'event:' + name,
      kind: 'event',
      name,
      icon: ev.icon,
      file: 'src/core/actions/happenings.js',
      symbol: 'EVENTS.' + name,
      keys: [ev.notice],
      facts: [
        ['raises the notice', ev.raises],
        ['arrives through', 'world.event, so both screens replay it identically'],
        ['while nobody is there', 'never — catchUp() raises none of these'],
      ],
    });
    link('action:world.event', 'event:' + name, 'carries');
    // the one event that puts a concern at the top of the list
    if (CONCERNS.some(c => c.id === ev.raises))
      link('event:' + name, 'concern:' + ev.raises, 'causes');
  }

  return { nodes, edges };
}

/* ------------------------------------------------------------------ */
/* the small sums                                                     */
/* ------------------------------------------------------------------ */

/** "4 plank, 1 stone, 2 wool" — and '*' for however much the doing of it earned. */
function costWords(cost) {
  const parts = [];
  for (const k in cost) parts.push((cost[k] === '*' ? 'some' : cost[k]) + ' ' + k);
  return parts.join(', ') || 'nothing';
}

const theRow = sentinel =>
  ({
    byProject: 'whatever the project says (PROJECTS)',
    bySkill: 'whatever the skill says (VILLAGER_SKILLS)',
    byFurniture: 'whatever the piece says (HOUSE_STUFF)',
  })[sentinel];

/**
 * Where a villager job puts what it brings in. The job itself says what that is
 * (`brings`) and the two key lists say where a thing of that kind goes, so this
 * is a lookup rather than anything the map knows of its own — which is the rule
 * the whole page is built on.
 */
function whereItLands(skill) {
  const res = VILLAGER_SKILLS[skill]?.brings;
  if (!res) return [];
  if (PILE_KEYS.includes(res)) return ['pile'];
  if (BAG_KEYS.includes(res)) return ['bag'];
  if (FOODS.some(f => f.key === res)) return ['larder'];
  return [];
}

/** What the game calls something, in the language the map is written in. */
const english = key => STRINGS.en?.[key] ?? null;

/** The i18n stem for a concern, which is the card name rather than the id. */
const TITLES = {
  bridge_broken: 'bridgeBroken',
  no_bridge: 'noBridge',
  wheat_ready: 'wheat',
  replant_last: 'replant',
};
const titleKey = id => TITLES[id] || id;

/** A little picture for an action, borrowed from whatever it is mostly about. */
function iconFor(row) {
  if (row.minigame) return '🎯';
  if (row.yields) return '📦';
  if (row.costs) return '💸';
  return '⚙️';
}

/**
 * A card, if a card can be drawn without a world that has this thing wrong.
 * Most can — they only read the world — and the few that need somebody hungry
 * are drawn from the worlds below instead.
 */
const SAMPLES = sampleWorlds();
function safeCard(c) {
  for (const w of SAMPLES) {
    try {
      const card = c.card(w);
      if (card?.steps) return card;
    } catch {
      /* this world does not have that wrong; try the next */
    }
  }
  return null;
}

/**
 * Worlds with enough wrong between them that every card can be drawn. The same
 * trick tests/actions.test.mjs uses, and for the same reason: a card is a
 * function of a world, so the only honest way to read one is to draw it.
 */
function sampleWorlds() {
  const worlds = [];
  try {
    const bad = createWorld(42);
    bad.bridge.built = true;
    bad.bridge.damaged = true;
    bad.villagers[0].hunger = 90;
    bad.larder.food = 0;
    bad.larder.fish = 0;
    if (bad.villagers[1]) bad.villagers[1].poorly = 100;
    bad.plots[0].state = 'ripe';
    bad.plots[0].nibbled = 1;
    bad.sheep[0].mood = 'sad';
    for (const t of bad.trees.slice(0, 4)) t.state = 'stump';
    worlds.push(bad, createWorld(42), createWorld(3));
  } catch {
    /* if a world cannot be made there is nothing to draw anyway */
  }
  return worlds;
}

/* ------------------------------------------------------------------ */
/* the words, in every language at once                               */
/* ------------------------------------------------------------------ */

/**
 * What the game actually says about a node, in each language side by side. The
 * panel shows this on a click, because the vocabulary is half the point: these
 * are the words to use when talking about the code.
 */
export function wordsFor(node) {
  const out = [];
  for (const key of node.keys || []) {
    const said = {};
    for (const l of LANGUAGES) said[l.id] = (STRINGS[l.id] || {})[key] ?? null;
    out.push({ key, said });
  }
  return out;
}

/** The mission the guide would show for a world, so the ladder can be tried out. */
export function missionFor(w) {
  const all = allProblems(w);
  return { first: all[0] || null, queue: all.slice(MAX_ACTIVE) };
}

/** Both halves of what makes the house what it is, for the panel to state. */
export const SHELL = HOUSE_SHELL;
