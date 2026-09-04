// What is the world's most pressing problem, and what would fix it?
//
// This is not a mission list: it reads the world and describes what is already
// wrong, in the order it matters. Every step says who can do it, so the two
// players can work out between them who does what.

import { freeBed, homeless } from './world.js';
import { tr } from './i18n.js';

const A = 'A', B = 'B', EITHER = 'either';
const who = (k) => tr('guide.who.' + k);

function stonesBetween(w) { return (w.players.A.res.stone || 0) + (w.players.B.res.stone || 0); }
function planksBetween(w) { return (w.players.A.res.plank || 0) + (w.players.B.res.plank || 0); }
function woodBetween(w) { return (w.players.A.res.wood || 0) + (w.players.B.res.wood || 0); }

export function currentProblem(w) {
  // 1. a broken bridge stops everybody, so it comes first
  if (w.bridge.built && w.bridge.damaged) {
    return {
      id: 'bridge_broken', icon: '💨',
      title: tr('guide.bridgeBroken.title'),
      why: tr('guide.bridgeBroken.why'),
      steps: [
        { icon: '🪚', text: tr('guide.step.havePlank'), who: who(A), done: planksBetween(w) >= 1 },
        { icon: '🔧', text: tr('guide.step.mend'), who: who(A), done: false },
      ],
    };
  }

  // 2. somebody sleeping outside
  const noBed = homeless(w);
  if (noBed.length && !freeBed(w)) {
    const site = w.buildings.find(b => b.state === 'site');
    return {
      id: 'homeless', icon: '🛏️',
      title: tr('guide.homeless.title', { name: noBed[0].name }),
      why: tr('guide.homeless.why'),
      steps: [
        { icon: '🪓', text: tr('guide.step.fell'), who: who(A), done: woodBetween(w) + planksBetween(w) >= 5 },
        { icon: '🪚', text: tr('guide.step.saw'), who: who(A), done: planksBetween(w) >= 5 },
        { icon: '🪨', text: tr('guide.step.stones'), who: who(EITHER), done: stonesBetween(w) >= 3 },
        { icon: '🏠', text: tr('guide.step.buildHouse'), who: who(A), done: !site },
      ],
    };
  }

  // 3. hungry people and an empty basket
  const hungry = w.villagers.filter(v => v.hunger > 70);
  if (hungry.length && w.larder.food <= 0) {
    const ripe = w.plots.some(p => p.state === 'ripe');
    const growing = w.plots.some(p => p.state === 'growing');
    return {
      id: 'hungry', icon: '🍞',
      title: tr('guide.hungry.title', { name: hungry[0].name }),
      why: tr('guide.hungry.why'),
      steps: [
        { icon: '🌱', text: tr('guide.step.sow'), who: who(B), done: ripe || growing },
        { icon: '💧', text: tr('guide.step.water'), who: who(B), done: ripe },
        { icon: '🌾', text: tr('guide.step.reap'), who: who(B), done: (w.players.B.res.wheat || 0) >= 2 },
        { icon: '🤝', text: tr('guide.step.giveWheat'), who: who(B), done: (w.players.A.res.wheat || 0) >= 2 },
        { icon: '🌀', text: tr('guide.step.bake'), who: who(A), done: (w.players.A.res.food || 0) >= 1 },
        { icon: '🧺', text: tr('guide.step.basket'), who: who(EITHER), done: w.larder.food > 0 },
      ],
    };
  }

  // 4. the river in the way
  if (!w.bridge.built) {
    return {
      id: 'no_bridge', icon: '🌉',
      title: tr('guide.noBridge.title'),
      why: tr('guide.noBridge.why'),
      steps: [
        { icon: '🪓', text: tr('guide.step.fell'), who: who(A), done: woodBetween(w) + planksBetween(w) >= 5 },
        { icon: '🪚', text: tr('guide.step.saw'), who: who(A), done: planksBetween(w) >= 5 },
        { icon: '🪨', text: tr('guide.step.piers'), who: who(EITHER), done: stonesBetween(w) >= 4 },
        { icon: '🌉', text: tr('guide.step.buildBridge'), who: who(A), done: false },
      ],
    };
  }

  // 5. wheat standing in the field
  if (w.plots.some(p => p.state === 'ripe')) {
    return {
      id: 'wheat_ready', icon: '🌾',
      title: tr('guide.wheat.title'),
      why: tr('guide.wheat.why'),
      steps: [
        { icon: '🌾', text: tr('guide.step.reapNow'), who: who(B), done: (w.players.B.res.wheat || 0) >= 2 },
        { icon: '🤝', text: tr('guide.step.giveWheat'), who: who(B), done: (w.players.A.res.wheat || 0) >= 2 },
        { icon: '🌀', text: tr('guide.step.bake'), who: who(A), done: (w.players.A.res.food || 0) >= 1 },
      ],
    };
  }

  // 6. an animal that wants something
  const needy = w.sheep.find(s => s.mood !== 'ok');
  if (needy) {
    return {
      id: 'sheep', icon: '🐑',
      title: tr('guide.sheep.title', { name: needy.name }),
      why: tr('guide.sheep.why'),
      steps: [
        { icon: '🐑', text: tr('guide.step.lookAfter', { name: needy.name }), who: who(B), done: false },
      ],
    };
  }

  // 7. nothing is wrong
  return {
    id: 'calm', icon: '🌤️',
    title: tr('guide.calm.title'),
    why: tr('guide.calm.why'),
    steps: [
      { icon: '🌱', text: tr('guide.step.sowMore'), who: who(B), done: false },
      { icon: '🪓', text: tr('guide.step.stackPlanks'), who: who(A), done: false },
      { icon: '🛤️', text: tr('guide.step.road'), who: who(B), done: false },
    ],
  };
}
