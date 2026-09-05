// What a world is made of, written down rather than built by hand.
//
// Everything here is data: a scenario says which terrain to paint and what
// stands on it, a project says what it costs and who can make it. Adding to
// these tables is how the world grows — and because `ensureWorld` reads them
// every time a world is loaded, a saved world picks up whatever is new without
// anybody having to reset it.
//
// The rules for adding:
//   - Something new and additive (a project, a villager, a plan) goes in a
//     table here and needs no schema bump at all.
//   - Something that changes the meaning of an existing field needs a step in
//     migrate.js, and the schema number goes up by one.

/* --------------------------------------------------------------------- */
/* projects: the things a village builds for itself                      */
/* --------------------------------------------------------------------- */

export const PROJECTS = {
  boat: {
    type: 'boat',
    cost: { plank: 4, stone: 1 },
    cap: 'bridge',            // who knows how to make it
    verb: 'boat',             // how to ask the other player for it
    journal: '⛵',
  },
  play: {
    type: 'play',
    cost: { plank: 4, stone: 2 },
    cap: 'house',
    verb: 'play',
    journal: '🛝',
  },
};

/** Just the costs, which is what most of the game asks for. */
export const PROJECT = {
  boat: PROJECTS.boat.cost,
  play: PROJECTS.play.cost,
};

export const SAPLING_TICKS = 1500;   // a sapling is a tree again after ~2.5 min of play
export const REPLANT_GOAL = 3;       // stumps worth replanting before the forest looks whole

/* --------------------------------------------------------------------- */
/* the valley: the one world there is, so far                            */
/* --------------------------------------------------------------------- */

/**
 * A scenario is a recipe. `terrain` names a painter in world.js; everything
 * else is a list of things to put on it. A second scenario is a second entry
 * here — an island where the boat comes first, a winter valley, a hill farm —
 * and `w.scenario` remembers which one a saved world was made from.
 */
export const SCENARIOS = {
  valley: {
    id: 'valley',
    terrain: 'valley',
    larder: { x: 8.5, y: 14.5, food: 7 },

    houses: [
      { key: 'house_a', x: 4,  y: 12, w: 3, h: 2, name: "Anna & Bo's house", beds: 3 },
      { key: 'house_b', x: 10, y: 12, w: 3, h: 2, name: "Mira's house", beds: 2 },
    ],
    sites: [
      { key: 'site_village', x: 4, y: 18, w: 3, h: 2, name: 'an empty plot' },
    ],
    works: [
      { key: 'workshop', type: 'workshop', x: 9, y: 16, w: 4, h: 3, name: 'the workshop' },
    ],
    roads: [[5, 14, 8, 15], [8, 15, 11, 14], [8, 15, 11, 19]],

    forest: { count: 15, x: 1, w: 11, y: 1, h: 8, apart: 3 },
    extraTrees: [[24, 3, 2], [30, 12, 3], [35, 6, 1]],

    plots: [[26, 16], [29, 16], [32, 16], [26, 19], [29, 19], [32, 19]],

    sheep: [
      { name: 'Cloud',  at: [27, 6],  fluff: 94 },
      { name: 'Pip',    at: [31, 9],  thirst: 82 },
      { name: 'Nutmeg', at: [24, 11], hunger: 84 },
    ],

    // `home` is an index into `houses`; the people already living somewhere
    // hold their beds, which is why somebody has none.
    villagers: [
      { key: 'anna', name: 'Anna', colour: '#d96a5f', at: [6, 15],  home: 0 },
      { key: 'bo',   name: 'Bo',   colour: '#4f83b8', at: [9, 13],  home: 0 },
      { key: 'mira', name: 'Mira', colour: '#b47ec0', at: [11, 15], home: 1 },
      { key: 'ted',  name: 'Ted',  colour: '#4f9c8a', at: [7, 17],  home: null },
      { key: 'lina', name: 'Lina', colour: '#e0a03e', at: [5, 15],  home: 0, kid: true },
      { key: 'sam',  name: 'Sam',  colour: '#7a86c9', at: [12, 14], home: 1, kid: true },
    ],

    stones: [[15, 20], [21, 4]],

    // A plan is a place where something could go: nothing stands there, nothing
    // is blocked, and the guide knows about it. `anchor` is either a tile or a
    // search — 'sandNear' finds the river bank close to a point.
    plans: [
      { id: 'plan_boat', type: 'boat', w: 2, h: 1, walkable: true,
        name: 'the old landing', anchor: { sandNear: [15, 11], offset: [-1, 0] } },
      { id: 'plan_play', type: 'play', w: 3, h: 2, walkable: true,
        name: 'the green by the water', anchor: { tile: [13, 18] } },
    ],

    crossingRow: 12,
  },
};

export const DEFAULT_SCENARIO = 'valley';

export function scenarioOf(w) {
  return SCENARIOS[(w && w.scenario) || DEFAULT_SCENARIO] || SCENARIOS[DEFAULT_SCENARIO];
}
