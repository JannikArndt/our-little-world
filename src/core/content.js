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
/* who is playing                                                        */
/* --------------------------------------------------------------------- */

/**
 * The roles a world can have. Two, today. A third — a Cook who bakes, keeps
 * the larder and makes something warm out of what the other two bring in — is
 * an entry here plus a line in a scenario's `roles`, and everything that walks
 * `world.players` picks it up. Nothing in the world is keyed to "the other
 * player" any more than it has to be.
 */
export const ROLES = {
  A: {
    id: 'A', emoji: '🔨', colour: '#c8783c',
    caps: { fell: 1, saw: 1, bridge: 1, house: 1, mill: 1 },
    res: { wood: 2, plank: 1, stone: 2, wheat: 0, food: 0, wool: 0 },
  },
  B: {
    id: 'B', emoji: '🌿', colour: '#5d9150',
    caps: { herd: 1, care: 1, road: 1, farm: 1 },
    res: { wood: 0, plank: 0, stone: 3, wheat: 0, food: 2, wool: 0 },
  },
};

/* --------------------------------------------------------------------- */
/* projects: the things a village builds for itself                      */
/* --------------------------------------------------------------------- */

/**
 * Everything a project needs in one row: what it costs, who knows how, what to
 * call it and what it changes. Adding one here plus a plan in a scenario is the
 * whole job — ensureWorld() marks the place out in worlds that were saved
 * before the project existed.
 */
export const PROJECTS = {
  boat: {
    type: 'boat',
    cost: { plank: 4, stone: 1 },
    cap: 'bridge',            // who knows how to make it
    verb: 'boat',             // how to ask the other player for it
    journal: '⛵',
    built: 'msg.boatUp',
    text: { plan: 'w.landing', planHint: 'w.landingHint', build: 'w.buildBoat' },
  },
  play: {
    type: 'play',
    cost: { plank: 4, stone: 2 },
    cap: 'house',
    verb: 'play',
    journal: '🛝',
    built: 'msg.playUp',
    text: { plan: 'w.green', planHint: 'w.greenHint', build: 'w.buildPlay' },
  },
  well: {
    type: 'well',
    cost: { plank: 1, stone: 5 },
    cap: 'road',              // stonework, so the Keeper can do it
    verb: 'well',
    journal: '🪣',
    built: 'msg.wellUp',
    text: { plan: 'w.wellPlan', planHint: 'w.wellPlanHint', build: 'w.buildWell',
            done: 'w.well', doneHint: 'w.wellHint' },
  },
  privy: {
    type: 'privy',
    cost: { plank: 3, stone: 1 },
    cap: 'house',
    verb: 'privy',
    journal: '🚪',
    built: 'msg.privyUp',
    text: { plan: 'w.privyPlan', planHint: 'w.privyPlanHint', build: 'w.buildPrivy',
            done: 'w.privy', doneHint: 'w.privyHint' },
  },
  fence: {
    type: 'fence',
    cost: { plank: 6, stone: 0 },
    cap: 'house',
    verb: 'fence',
    journal: '🚧',
    built: 'msg.fenceUp',
    text: { plan: 'w.fencePlan', planHint: 'w.fencePlanHint', build: 'w.buildFence',
            done: 'w.fence', doneHint: 'w.fenceHint' },
  },
};

/** Just the costs, which is what most of the game asks for. */
export const PROJECT = {};
for (const k in PROJECTS) PROJECT[k] = PROJECTS[k].cost;

export const SAPLING_TICKS = 1500;   // a sapling is a tree again after ~2.5 min of play
export const REPLANT_GOAL = 3;       // stumps worth replanting before the forest looks whole

// Nobody is ever really ill in this world: a poorly tummy from river water
// means a slow walk home, a rest, and a village that can fix the cause.
export const POORLY_TICKS = 900;     // ~90 s of resting, then up again
export const POORLY_CHANCE = 0.06;   // per check, and only one person at a time

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
    roles: ['A', 'B'],
    larder: { x: 8.5, y: 14.5, food: 7 },

    // Parts of the map, and whether they are there from the start. A world
    // remembers this in `world.regions`, so a later scenario can keep the far
    // side of the hills shut until the village is ready for it, and opening
    // one is an action like any other.
    regions: [
      { id: 'valley', box: [0, 0, 39, 23], open: true },
    ],

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
      { id: 'plan_well', type: 'well', w: 1, h: 1,
        name: 'the middle of the village', anchor: { tile: [7, 12] } },
      { id: 'plan_privy', type: 'privy', w: 1, h: 1,
        name: 'the bottom of the garden', anchor: { tile: [6, 10] } },
      // the whole field: the fence goes round it, and people walk through it
      { id: 'plan_fence', type: 'fence', w: 10, h: 7, walkable: true,
        name: 'the wheat field', anchor: { tile: [25, 15] } },
    ],

    crossingRow: 12,
  },
};

export const DEFAULT_SCENARIO = 'valley';

export function scenarioOf(w) {
  return SCENARIOS[(w && w.scenario) || DEFAULT_SCENARIO] || SCENARIOS[DEFAULT_SCENARIO];
}
