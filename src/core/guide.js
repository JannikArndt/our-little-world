// What is the world's most pressing problem, and what would fix it?
//
// This is not a mission list: it reads the world and describes what is already
// wrong, in the order it matters. Every step says who can do it, so the two
// players can work out between them who does what.

import { freeBed, homeless } from './world.js';

const A = 'Builder', B = 'Keeper', EITHER = 'either of us';

function stonesBetween(w) { return (w.players.A.res.stone || 0) + (w.players.B.res.stone || 0); }
function planksBetween(w) { return (w.players.A.res.plank || 0) + (w.players.B.res.plank || 0); }
function woodBetween(w) { return (w.players.A.res.wood || 0) + (w.players.B.res.wood || 0); }

export function currentProblem(w) {
  // 1. a broken bridge stops everybody, so it comes first
  if (w.bridge.built && w.bridge.damaged) {
    return {
      id: 'bridge_broken', icon: '💨',
      title: 'The wind knocked a plank off the bridge.',
      why: 'Nobody will walk across it until it is mended.',
      steps: [
        { icon: '🪚', text: 'Have a plank ready', who: A, done: planksBetween(w) >= 1 },
        { icon: '🔧', text: 'Tap the bridge and mend it', who: A, done: false },
      ],
    };
  }

  // 2. somebody sleeping outside
  const noBed = homeless(w);
  if (noBed.length && !freeBed(w)) {
    const site = w.buildings.find(b => b.state === 'site');
    return {
      id: 'homeless', icon: '🛏️',
      title: noBed[0].name + ' has nowhere to sleep tonight.',
      why: 'There is an empty plot in the village. A house needs planks and stone.',
      steps: [
        { icon: '🪓', text: 'Fell a tree in the forest', who: A, done: woodBetween(w) + planksBetween(w) >= 5 },
        { icon: '🪚', text: 'Saw the wood into planks at the workshop', who: A, done: planksBetween(w) >= 5 },
        { icon: '🪨', text: 'Pick up stones by the river', who: EITHER, done: stonesBetween(w) >= 3 },
        { icon: '🏠', text: 'Tap the empty plot and build a house', who: A, done: !site },
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
      title: hungry[0].name + ' is hungry and the bread basket is empty.',
      why: 'Bread starts as wheat in the field and ends up in the basket in the village.',
      steps: [
        { icon: '🌱', text: 'Sow the field across the river', who: B, done: ripe || growing },
        { icon: '💧', text: 'Water it, and again when it goes dry', who: B, done: ripe },
        { icon: '🌾', text: 'Cut the wheat when it turns gold', who: B, done: (w.players.B.res.wheat || 0) >= 2 },
        { icon: '🤝', text: 'Give the wheat to the Builder', who: B, done: (w.players.A.res.wheat || 0) >= 2 },
        { icon: '🌀', text: 'Grind and bake it at the mill', who: A, done: (w.players.A.res.food || 0) >= 1 },
        { icon: '🧺', text: 'Put the bread in the village basket', who: EITHER, done: w.larder.food > 0 },
      ],
    };
  }

  // 4. the river in the way
  if (!w.bridge.built) {
    return {
      id: 'no_bridge', icon: '🌉',
      title: 'The river cuts our world in half.',
      why: 'The sheep, the field and the meadow are all on the far side, and nobody can get across.',
      steps: [
        { icon: '🪓', text: 'Fell a tree in the forest', who: A, done: woodBetween(w) + planksBetween(w) >= 5 },
        { icon: '🪚', text: 'Saw the wood into planks', who: A, done: planksBetween(w) >= 5 },
        { icon: '🪨', text: 'Pick up stones by the river for the piers', who: EITHER, done: stonesBetween(w) >= 4 },
        { icon: '🌉', text: 'Tap the narrow crossing and build the bridge', who: A, done: false },
      ],
    };
  }

  // 5. wheat standing in the field
  if (w.plots.some(p => p.state === 'ripe')) {
    return {
      id: 'wheat_ready', icon: '🌾',
      title: 'The wheat has turned gold.',
      why: 'Left standing it does nothing. Cut it, and it can become bread.',
      steps: [
        { icon: '🌾', text: 'Tap a golden plot and cut the wheat', who: B, done: (w.players.B.res.wheat || 0) >= 2 },
        { icon: '🤝', text: 'Give the wheat to the Builder', who: B, done: (w.players.A.res.wheat || 0) >= 2 },
        { icon: '🌀', text: 'Grind and bake it at the mill', who: A, done: (w.players.A.res.food || 0) >= 1 },
      ],
    };
  }

  // 6. an animal that wants something
  const needy = w.sheep.find(s => s.mood !== 'ok');
  if (needy) {
    return {
      id: 'sheep', icon: '🐑',
      title: needy.name + ' wants something.',
      why: 'She will not say what. Look at her and see what you think.',
      steps: [
        { icon: '🐑', text: 'Tap ' + needy.name + ' and look after her', who: B, done: false },
      ],
    };
  }

  // 7. nothing is wrong
  return {
    id: 'calm', icon: '🌤️',
    title: 'Nothing needs rescuing just now.',
    why: 'A good moment to make something because you feel like it.',
    steps: [
      { icon: '🌱', text: 'Sow another plot in the field', who: B, done: false },
      { icon: '🪓', text: 'Fell a tree and stack up some planks', who: A, done: false },
      { icon: '🛤️', text: 'Lay a road where people keep walking', who: B, done: false },
    ],
  };
}
