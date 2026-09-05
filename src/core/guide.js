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

import {
  freeBed, homeless, kids, openSite, project, stumps,
  PROJECT, REPLANT_GOAL,
} from './world.js';
import { tr } from './i18n.js';

const A = 'A', B = 'B', EITHER = 'either';
const who = (k) => tr('guide.who.' + k);

/** Both sides of the table together: sharing is the point, not hoarding. */
function both(w, res) {
  return (w.players.A.res[res] || 0) + (w.players.B.res[res] || 0);
}
const stonesBetween = (w) => both(w, 'stone');
const planksBetween = (w) => both(w, 'plank');
const woodBetween = (w) => both(w, 'wood');

/** A step you can count: "2/3 🪨" is why it is ticked. */
function counted(icon, text, whoKey, countIcon, have, need) {
  return {
    icon, text, who: who(whoKey),
    done: have >= need,
    count: { icon: countIcon, have: Math.max(0, Math.min(have, need)), need },
  };
}

/** A step that is either done or not — no number would help. */
function step(icon, text, whoKey, done) {
  return { icon, text, who: who(whoKey), done: !!done, count: null };
}

const villagerPoint = (v) => [v.x, v.y];
const buildingPoint = (b) => [b.x + b.w / 2, b.y + b.h / 2];

export function currentProblem(w) {
  const site = openSite(w);
  const bridgeMid = [(w.bridge.site.x0 + w.bridge.site.x1) / 2 + 0.5, w.bridge.site.row + 1];

  // 1. a broken bridge stops everybody, so it comes first
  if (w.bridge.built && w.bridge.damaged) {
    return {
      id: 'bridge_broken', icon: '💨',
      title: tr('guide.bridgeBroken.title'),
      why: tr('guide.bridgeBroken.why'),
      points: [bridgeMid],
      steps: [
        counted('🪚', tr('guide.step.havePlank'), A, '🪚', planksBetween(w), 1),
        step('🔧', tr('guide.step.mend'), A, false),
      ],
    };
  }

  // 2. somebody sleeping outside
  const noBed = homeless(w);
  if (noBed.length && !freeBed(w)) {
    const person = noBed[0];
    return {
      id: 'homeless', icon: '🏠',
      title: tr('guide.homeless.title', { name: person.name }),
      why: tr('guide.homeless.why', { name: person.name }),
      subject: { kind: 'villager', id: person.id },
      points: site ? [villagerPoint(person), buildingPoint(site)] : [villagerPoint(person)],
      steps: [
        counted('🪓', tr('guide.step.fell'), A, '🪵', woodBetween(w) + planksBetween(w), 5),
        counted('🪚', tr('guide.step.saw'), A, '🪚', planksBetween(w), 5),
        counted('🪨', tr('guide.step.stones'), EITHER, '🪨', stonesBetween(w), 3),
        step('🏠', tr('guide.step.buildHouse'), A, !site),
      ],
    };
  }

  // 3. hungry people and an empty basket
  const hungry = w.villagers.filter(v => v.hunger > 70);
  if (hungry.length && w.larder.food <= 0) {
    const person = hungry[0];
    const sown = w.plots.filter(p => p.state !== 'empty').length;
    const ripe = w.plots.filter(p => p.state === 'ripe').length;
    const boat = project(w, 'boat');
    const steps = [
      counted('🌱', tr('guide.step.sow'), B, '🌱', sown, 1),
      step('💧', tr('guide.step.water'), B, ripe > 0),
      counted('🌾', tr('guide.step.reap'), B, '🌾', w.players.B.res.wheat || 0, 2),
      counted('🤝', tr('guide.step.giveWheat'), B, '🌾', w.players.A.res.wheat || 0, 2),
      counted('🌀', tr('guide.step.bake'), A, '🍞', w.players.A.res.food || 0, 1),
      counted('🧺', tr('guide.step.basket'), EITHER, '🍞', w.larder.food, 1),
    ];
    // a boat is a shortcut to supper, so it is worth saying out loud
    if (boat && boat.state === 'built') {
      steps.splice(0, 0, step('🎣', tr('guide.step.orFish'), B, (w.players.B.res.food || 0) > 0));
    }
    return {
      id: 'hungry', icon: '🍞',
      title: tr('guide.hungry.title', { name: person.name }),
      why: tr('guide.hungry.why', { name: person.name }),
      subject: { kind: 'villager', id: person.id },
      points: [villagerPoint(person), [w.larder.x, w.larder.y]],
      steps,
    };
  }

  // 4. the river in the way
  if (!w.bridge.built) {
    return {
      id: 'no_bridge', icon: '🌉',
      title: tr('guide.noBridge.title'),
      why: tr('guide.noBridge.why'),
      points: [bridgeMid],
      steps: [
        counted('🪓', tr('guide.step.fell'), A, '🪵', woodBetween(w) + planksBetween(w), 5),
        counted('🪚', tr('guide.step.saw'), A, '🪚', planksBetween(w), 5),
        counted('🪨', tr('guide.step.piers'), EITHER, '🪨', stonesBetween(w), 4),
        step('🌉', tr('guide.step.buildBridge'), A, false),
      ],
    };
  }

  // 5. wheat standing in the field
  const ripePlot = w.plots.find(p => p.state === 'ripe');
  if (ripePlot) {
    return {
      id: 'wheat_ready', icon: '🌾',
      title: tr('guide.wheat.title'),
      why: tr('guide.wheat.why'),
      points: [[ripePlot.x + 1, ripePlot.y + 1]],
      steps: [
        counted('🌾', tr('guide.step.reapNow'), B, '🌾', w.players.B.res.wheat || 0, 2),
        counted('🤝', tr('guide.step.giveWheat'), B, '🌾', w.players.A.res.wheat || 0, 2),
        counted('🌀', tr('guide.step.bake'), A, '🍞', w.players.A.res.food || 0, 1),
      ],
    };
  }

  // 6. an animal that wants something
  const needy = w.sheep.find(s => s.mood !== 'ok');
  if (needy) {
    return {
      id: 'sheep', icon: '🐑',
      title: tr('guide.sheep.title', { name: needy.name }),
      why: tr('guide.sheep.why', { name: needy.name }),
      subject: { kind: 'sheep', id: needy.id },
      points: [[needy.x, needy.y]],
      steps: [
        step('🐑', tr('guide.step.lookAfter', { name: needy.name }), B, false),
      ],
    };
  }

  // 7. the forest is looking thin
  const cut = stumps(w);
  if (cut.length >= REPLANT_GOAL) return replant(w, cut);

  // 8. nobody has to fish, but everybody would like to
  const boatPlan = project(w, 'boat');
  if (boatPlan && boatPlan.state === 'plan') return boatProblem(w, boatPlan);

  // 9. the children have nowhere to play
  const playPlan = project(w, 'play');
  if (playPlan && playPlan.state === 'plan') return playProblem(w, playPlan);

  // 10. one stump left over
  if (cut.length) return replant(w, cut);

  // 11. nothing is wrong
  return {
    id: 'calm', icon: '🌤️',
    title: tr('guide.calm.title'),
    why: tr('guide.calm.why'),
    points: [],
    steps: [
      step('🌱', tr('guide.step.sowMore'), B, false),
      step('🪓', tr('guide.step.stackPlanks'), A, false),
      step('🛤️', tr('guide.step.road'), B, false),
    ],
  };
}

/* ------------------------------------------------------------------ */
/* the three things a village builds once nobody is in trouble        */
/* ------------------------------------------------------------------ */

function boatProblem(w, plan) {
  return {
    id: 'boat', icon: '⛵',
    title: tr('guide.boat.title'),
    why: tr('guide.boat.why'),
    points: [buildingPoint(plan)],
    steps: [
      counted('🪚', tr('guide.step.boatPlanks'), A, '🪚', planksBetween(w), PROJECT.boat.plank),
      counted('🪨', tr('guide.step.boatStone'), EITHER, '🪨', stonesBetween(w), PROJECT.boat.stone),
      step('⛵', tr('guide.step.buildBoat'), A, false),
      step('🎣', tr('guide.step.fish'), B, false),
    ],
  };
}

function playProblem(w, plan) {
  const little = kids(w);
  const names = little.map(k => k.name).join(tr('w.and'));
  return {
    id: 'play', icon: '🛝',
    title: tr('guide.play.title', { names: names }),
    why: tr('guide.play.why', { names: names }),
    subject: little.length ? { kind: 'villager', id: little[0].id } : null,
    points: little.length
      ? [buildingPoint(plan), villagerPoint(little[0])]
      : [buildingPoint(plan)],
    steps: [
      counted('🪚', tr('guide.step.playPlanks'), A, '🪚', planksBetween(w), PROJECT.play.plank),
      counted('🪨', tr('guide.step.playStone'), EITHER, '🪨', stonesBetween(w), PROJECT.play.stone),
      step('🛝', tr('guide.step.buildPlay'), A, false),
    ],
  };
}

function replant(w, cut) {
  const planted = w.trees.filter(t => t.state === 'sapling' || t.grownTick).length;
  const grown = w.trees.some(t => t.grownTick);
  const need = Math.min(REPLANT_GOAL, cut.length + planted);
  return {
    id: 'replant', icon: '🌱',
    title: tr('guide.replant.title'),
    why: tr('guide.replant.why'),
    points: [[cut[0].x + 0.5, cut[0].y + 0.5]],
    steps: [
      counted('🌱', tr('guide.step.plantTree'), B, '🌱', planted, need),
      step('🌳', tr('guide.step.waitTree'), EITHER, grown),
    ],
  };
}
