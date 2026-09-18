// What is the world's most pressing problem, and what would fix it?
//
// This is not a mission list: it reads the world and describes what is already
// wrong, in the order it matters. Three rules keep a card readable by a child:
//
//   1. The title says what to DO, never what is sad. "Build a house for Ted!"
//      rather than "Ted has nowhere to sleep."
//   2. Anybody the card names comes with a face and a place, so `subject` and
//      `points` say who to draw and where to look.
//   3. A step that can be counted carries its count. A tick with 2/2 🪨 next to
//      it explains itself; a bare tick does not.
//
// The concerns are a list, in the order they matter. Adding a task to the game
// is one entry in CONCERNS plus its card — no branching to unpick.

import {
  freeBed,
  homeless,
  poorly,
  kids,
  openSite,
  project,
  stumps,
  riverClean,
  fieldFenced,
  larderTotal,
  PROJECT,
  REPLANT_GOAL,
} from './world.js';
import { tr } from './i18n.js';
// the same middle of the crossing the bridge itself sparkles at, rather than
// the same sum written out twice
import { bridgeMid } from './actions/crossing.js';

const A = 'A',
  B = 'B',
  EITHER = 'either';
const who = k => tr('guide.who.' + k);

/**
 * Everybody at the table together: sharing is the point, not hoarding. It
 * counts whoever is playing rather than A and B by name, so a third role — a
 * Cook, say — is counted in without a line changing here.
 */
function between(w, res) {
  let n = 0;
  for (const id in w.players) n += w.players[id].res[res] || 0;
  return n;
}
const stonesBetween = w => between(w, 'stone');
const planksBetween = w => between(w, 'plank');
const woodBetween = w => between(w, 'wood');
const woolBetween = w => between(w, 'wool');

/**
 * A step you can count: "2/3 🪨" is why it is ticked.
 *
 * `does` names the action the step is asking for — 'saw.run', or
 * 'project.build:well' where the project is the point of it. null is for a step
 * that is only waiting, like a sapling becoming a tree. It is written down
 * rather than guessed from the wording, because the wording is a translated
 * sentence and the two do not line up: "give the wheat over" is `give`, and
 * "fill the basket" is `larder.give`.
 *
 * `role` is the same answer as `who` without the translation, so anything
 * reading a card can tell whose job a step is without reversing a sentence.
 */
function counted(icon, text, whoKey, does, countIcon, have, need) {
  return {
    icon,
    text,
    who: who(whoKey),
    role: whoKey,
    does: does || null,
    done: have >= need,
    count: { icon: countIcon, have: Math.max(0, Math.min(have, need)), need },
  };
}

/** A step that is either done or not — no number would help. */
function step(icon, text, whoKey, does, done) {
  return {
    icon,
    text,
    who: who(whoKey),
    role: whoKey,
    does: does || null,
    done: !!done,
    count: null,
  };
}

const villagerPoint = v => [v.x, v.y];
const buildingPoint = b => [b.x + b.w / 2, b.y + b.h / 2];

/* ------------------------------------------------------------------ */
/* the cards                                                          */
/* ------------------------------------------------------------------ */

function brokenBridgeCard(w) {
  return {
    id: 'bridge_broken',
    icon: '💨',
    title: tr('guide.bridgeBroken.title'),
    why: tr('guide.bridgeBroken.why'),
    points: [bridgeMid(w)],
    steps: [
      counted('🪚', tr('guide.step.havePlank'), A, 'saw.run', '🪚', planksBetween(w), 1),
      step('🔧', tr('guide.step.mend'), A, 'bridge.repair', false),
    ],
  };
}

function homelessCard(w) {
  const site = openSite(w);
  const person = homeless(w)[0];
  return {
    id: 'homeless',
    icon: '🏠',
    title: tr('guide.homeless.title', { name: person.name }),
    why: tr('guide.homeless.why', { name: person.name }),
    subject: { kind: 'villager', id: person.id },
    points: site ? [villagerPoint(person), buildingPoint(site)] : [villagerPoint(person)],
    steps: [
      counted(
        '🪓',
        tr('guide.step.fell'),
        A,
        'tree.fell',
        '🪵',
        woodBetween(w) + planksBetween(w),
        5,
      ),
      counted('🪚', tr('guide.step.saw'), A, 'saw.run', '🪚', planksBetween(w), 5),
      counted('🪨', tr('guide.step.stones'), EITHER, 'stone.take', '🪨', stonesBetween(w), 3),
      step('🏠', tr('guide.step.buildHouse'), A, 'house.build', !site),
    ],
  };
}

function hungryCard(w) {
  const person = w.villagers.filter(v => v.hunger > 70)[0];
  const sown = w.plots.filter(p => p.state !== 'empty').length;
  const ripe = w.plots.filter(p => p.state === 'ripe').length;
  const boat = project(w, 'boat');
  const steps = [
    counted('🌱', tr('guide.step.sow'), B, 'plot.plant', '🌱', sown, 1),
    step('💧', tr('guide.step.water'), B, 'plot.water', ripe > 0),
    counted('🌾', tr('guide.step.reap'), B, 'plot.harvest', '🌾', w.players.B.res.wheat || 0, 2),
    counted('🤝', tr('guide.step.giveWheat'), B, 'give', '🌾', w.players.A.res.wheat || 0, 2),
    counted('🌀', tr('guide.step.bake'), A, 'mill.run', '🍞', w.players.A.res.food || 0, 1),
    counted('🧺', tr('guide.step.basket'), EITHER, 'larder.give', '🍞🐟', larderTotal(w), 1),
  ];
  // a boat is a shortcut to supper, so it is worth saying out loud
  if (boat?.state === 'built') {
    steps.unshift(
      step('🎣', tr('guide.step.orFish'), B, 'fish.catch', (w.players.B.res.fish || 0) > 0),
    );
  }
  return {
    id: 'hungry',
    icon: '🍞',
    title: tr('guide.hungry.title', { name: person.name }),
    why: tr('guide.hungry.why', { name: person.name }),
    subject: { kind: 'villager', id: person.id },
    points: [villagerPoint(person), [w.larder.x, w.larder.y]],
    steps,
  };
}

function noBridgeCard(w) {
  return {
    id: 'no_bridge',
    icon: '🌉',
    title: tr('guide.noBridge.title'),
    why: tr('guide.noBridge.why'),
    points: [bridgeMid(w)],
    steps: [
      counted(
        '🪓',
        tr('guide.step.fell'),
        A,
        'tree.fell',
        '🪵',
        woodBetween(w) + planksBetween(w),
        5,
      ),
      counted('🪚', tr('guide.step.saw'), A, 'saw.run', '🪚', planksBetween(w), 5),
      counted('🪨', tr('guide.step.piers'), EITHER, 'stone.take', '🪨', stonesBetween(w), 4),
      step('🌉', tr('guide.step.buildBridge'), A, 'bridge.build', false),
    ],
  };
}

function wheatCard(w) {
  const plot = w.plots.find(p => p.state === 'ripe');
  return {
    id: 'wheat_ready',
    icon: '🌾',
    title: tr('guide.wheat.title'),
    why: tr('guide.wheat.why'),
    points: [[plot.x + 1, plot.y + 1]],
    steps: [
      counted(
        '🌾',
        tr('guide.step.reapNow'),
        B,
        'plot.harvest',
        '🌾',
        w.players.B.res.wheat || 0,
        2,
      ),
      counted('🤝', tr('guide.step.giveWheat'), B, 'give', '🌾', w.players.A.res.wheat || 0, 2),
      counted('🌀', tr('guide.step.bake'), A, 'mill.run', '🍞', w.players.A.res.food || 0, 1),
    ],
  };
}

function sheepCard(w) {
  const needy = w.sheep.find(s => s.mood !== 'ok');
  return {
    id: 'sheep',
    icon: '🐑',
    title: tr('guide.sheep.title', { name: needy.name }),
    why: tr('guide.sheep.why', { name: needy.name }),
    subject: { kind: 'sheep', id: needy.id },
    points: [[needy.x, needy.y]],
    steps: [step('🐑', tr('guide.step.lookAfter', { name: needy.name }), B, 'sheep.care', false)],
  };
}

/** Somebody has a poorly tummy, and the reason is the water. */
function poorlyCard(w) {
  const person = poorly(w)[0] || w.villagers[0];
  const well = project(w, 'well');
  const built = !well || well.state !== 'plan';
  return {
    id: 'poorly',
    icon: '🤒',
    title: tr('guide.poorly.title', { name: person.name }),
    why: tr('guide.poorly.why', { name: person.name }),
    subject: { kind: 'villager', id: person.id },
    points: well ? [villagerPoint(person), buildingPoint(well)] : [villagerPoint(person)],
    steps: [
      counted(
        '🪨',
        tr('guide.step.wellStones'),
        EITHER,
        'stone.take',
        '🪨',
        stonesBetween(w),
        PROJECT.well.stone,
      ),
      counted(
        '🪚',
        tr('guide.step.wellPlank'),
        A,
        'saw.run',
        '🪚',
        planksBetween(w),
        PROJECT.well.plank,
      ),
      step('🪣', tr('guide.step.buildWell'), B, 'project.build:well', built),
      step('🚪', tr('guide.step.orPrivy'), A, 'project.build:privy', riverClean(w)),
    ],
  };
}

function wellCard(w) {
  const well = project(w, 'well');
  return {
    id: 'well',
    icon: '🪣',
    title: tr('guide.well.title'),
    why: tr('guide.well.why'),
    points: [buildingPoint(well)],
    steps: [
      counted(
        '🪨',
        tr('guide.step.wellStones'),
        EITHER,
        'stone.take',
        '🪨',
        stonesBetween(w),
        PROJECT.well.stone,
      ),
      counted(
        '🪚',
        tr('guide.step.wellPlank'),
        A,
        'saw.run',
        '🪚',
        planksBetween(w),
        PROJECT.well.plank,
      ),
      step('🪣', tr('guide.step.buildWell'), B, 'project.build:well', false),
    ],
  };
}

function privyCard(w) {
  const privy = project(w, 'privy');
  return {
    id: 'privy',
    icon: '🚪',
    title: tr('guide.privy.title'),
    why: tr('guide.privy.why'),
    points: [buildingPoint(privy)],
    steps: [
      counted(
        '🪚',
        tr('guide.step.privyPlanks'),
        A,
        'saw.run',
        '🪚',
        planksBetween(w),
        PROJECT.privy.plank,
      ),
      counted(
        '🪨',
        tr('guide.step.privyStone'),
        EITHER,
        'stone.take',
        '🪨',
        stonesBetween(w),
        PROJECT.privy.stone,
      ),
      step('🚪', tr('guide.step.buildPrivy'), A, 'project.build:privy', false),
    ],
  };
}

function fenceCard(w) {
  const fence = project(w, 'fence');
  const sheepIn = w.sheep.find(sh => sh.x > 24 && sh.x < 35 && sh.y > 14 && sh.y < 22);
  return {
    id: 'fence',
    icon: '🚧',
    title: tr('guide.fence.title'),
    why: tr('guide.fence.why'),
    subject: sheepIn ? { kind: 'sheep', id: sheepIn.id } : null,
    points: fence ? [buildingPoint(fence)] : [],
    steps: [
      counted(
        '🪚',
        tr('guide.step.fencePlanks'),
        A,
        'saw.run',
        '🪚',
        planksBetween(w),
        PROJECT.fence.plank,
      ),
      step('🚧', tr('guide.step.buildFence'), A, 'project.build:fence', false),
    ],
  };
}

function calmCard(_w) {
  return {
    id: 'calm',
    icon: '🌤️',
    title: tr('guide.calm.title'),
    why: tr('guide.calm.why'),
    points: [],
    steps: [
      step('🌱', tr('guide.step.sowMore'), B, 'plot.plant', false),
      step('🪓', tr('guide.step.stackPlanks'), A, 'saw.run', false),
      step('🛤️', tr('guide.step.road'), B, 'road.build', false),
    ],
  };
}

/* ------------------------------------------------------------------ */
/* what matters, in the order it matters                              */
/* ------------------------------------------------------------------ */

const planWaiting = type => w => {
  const p = project(w, type);
  return !!(p?.state === 'plan');
};

export const CONCERNS = [
  // a broken bridge stops everybody, so it comes first
  { id: 'bridge_broken', when: w => w.bridge.built && w.bridge.damaged, card: brokenBridgeCard },
  // somebody sleeping outside
  { id: 'homeless', when: w => homeless(w).length > 0 && !freeBed(w), card: homelessCard },
  // hungry people and an empty basket
  {
    id: 'hungry',
    when: w => w.villagers.some(v => v.hunger > 70) && larderTotal(w) <= 0,
    card: hungryCard,
  },
  // the river in the way
  { id: 'no_bridge', when: w => !w.bridge.built, card: noBridgeCard },
  // wheat standing in the field
  { id: 'wheat_ready', when: w => w.plots.some(p => p.state === 'ripe'), card: wheatCard },
  // somebody has a poorly tummy, and the water is why
  { id: 'poorly', when: w => poorly(w).length > 0, card: poorlyCard },
  // an animal that wants something
  { id: 'sheep', when: w => w.sheep.some(s => s.mood !== 'ok'), card: sheepCard },
  // a sheep has been at the wheat
  {
    id: 'fence',
    when: w =>
      !fieldFenced(w) &&
      planWaiting('fence')(w) &&
      (w.plots.some(p => p.nibbled) ||
        w.sheep.some(sh => sh.x > 24 && sh.x < 35 && sh.y > 14 && sh.y < 22)),
    card: fenceCard,
  },
  // the forest is looking thin
  { id: 'replant', when: w => stumps(w).length >= REPLANT_GOAL, card: replantCard },
  // nobody has to fish, but everybody would like to
  { id: 'boat', when: planWaiting('boat'), card: boatCard },
  // the children have nowhere to play
  { id: 'play', when: planWaiting('play'), card: playCard },
  // clean water to drink, and a river worth drinking from
  { id: 'well', when: planWaiting('well'), card: wellCard },
  { id: 'privy', when: planWaiting('privy'), card: privyCard },
  // one stump left over
  { id: 'replant_last', when: w => stumps(w).length > 0, card: replantCard },
  // nothing is wrong
  { id: 'calm', when: () => true, card: calmCard },
];

/**
 * How many jobs anybody is asked to hold in their head at once — one (law 1).
 * The village might want half a dozen things; only the first of them is ever
 * shown, as the mission. The rest are not cancelled — they are next, and they
 * turn up on their own as this one is finished. Not a tuning knob.
 */
export const MAX_ACTIVE = 1;

/**
 * Everything the world is asking for, in the order it matters — not just the
 * first thing. Two concerns can describe the same job (a thin forest and one
 * last stump are both replanting), so a card is only listed once. This is the
 * whole queue; `activeProblems` is the part of it anybody is shown.
 */
export function allProblems(w) {
  const out = [],
    seen = {};
  for (const c of CONCERNS) {
    if (c.id === 'calm') continue;
    if (!c.when(w)) continue;
    const card = c.card(w);
    if (seen[card.id]) continue;
    seen[card.id] = 1;
    out.push(card);
  }
  return out;
}

/** The one at the front of the queue — what the village is actually doing. */
export function activeProblems(w) {
  return allProblems(w).slice(0, MAX_ACTIVE);
}

/** The most pressing thing in the world right now, said as something to do. */
export function currentProblem(w) {
  return allProblems(w)[0] || calmCard(w);
}

/* ------------------------------------------------------------------ */
/* the three things a village builds once nobody is in trouble        */
/* ------------------------------------------------------------------ */

function boatCard(w) {
  const plan = project(w, 'boat');
  return {
    id: 'boat',
    icon: '⛵',
    title: tr('guide.boat.title'),
    why: tr('guide.boat.why'),
    points: [buildingPoint(plan)],
    steps: [
      counted(
        '🪚',
        tr('guide.step.boatPlanks'),
        A,
        'saw.run',
        '🪚',
        planksBetween(w),
        PROJECT.boat.plank,
      ),
      counted(
        '🪨',
        tr('guide.step.boatStone'),
        EITHER,
        'stone.take',
        '🪨',
        stonesBetween(w),
        PROJECT.boat.stone,
      ),
      counted(
        '🧶',
        tr('guide.step.boatWool'),
        EITHER,
        'sheep.care',
        '🧶',
        woolBetween(w),
        PROJECT.boat.wool,
      ),
      step('⛵', tr('guide.step.buildBoat'), A, 'project.build:boat', false),
      step('🎣', tr('guide.step.fish'), B, 'fish.catch', false),
    ],
  };
}

function playCard(w) {
  const plan = project(w, 'play');
  const little = kids(w);
  const names = little.map(k => k.name).join(tr('w.and'));
  return {
    id: 'play',
    icon: '🛝',
    title: tr('guide.play.title', { names: names }),
    why: tr('guide.play.why', { names: names }),
    subject: little.length ? { kind: 'villager', id: little[0].id } : null,
    points: little.length ? [buildingPoint(plan), villagerPoint(little[0])] : [buildingPoint(plan)],
    steps: [
      counted(
        '🪚',
        tr('guide.step.playPlanks'),
        A,
        'saw.run',
        '🪚',
        planksBetween(w),
        PROJECT.play.plank,
      ),
      counted(
        '🪨',
        tr('guide.step.playStone'),
        EITHER,
        'stone.take',
        '🪨',
        stonesBetween(w),
        PROJECT.play.stone,
      ),
      step('🛝', tr('guide.step.buildPlay'), A, 'project.build:play', false),
    ],
  };
}

function replantCard(w) {
  const cut = stumps(w);
  const planted = w.trees.filter(t => t.state === 'sapling' || t.grownTick).length;
  const grown = w.trees.some(t => t.grownTick);
  const need = Math.max(1, Math.min(REPLANT_GOAL, cut.length + planted));
  return {
    id: 'replant',
    icon: '🌱',
    title: tr('guide.replant.title'),
    why: tr('guide.replant.why'),
    points: cut.length ? [[cut[0].x + 0.5, cut[0].y + 0.5]] : [],
    steps: [
      counted('🌱', tr('guide.step.plantTree'), B, 'tree.plant', '🌱', planted, need),
      step('🌳', tr('guide.step.waitTree'), EITHER, null, grown),
    ],
  };
}
