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
    id: 'A',
    emoji: '🔨',
    colour: '#c8783c',
    caps: { fell: 1, saw: 1, bridge: 1, house: 1, mill: 1 },
    res: { wood: 2, plank: 1, stone: 2, wheat: 0, food: 0, wool: 0 },
  },
  B: {
    id: 'B',
    emoji: '🌿',
    colour: '#5d9150',
    caps: { herd: 1, care: 1, road: 1, farm: 1 },
    res: { wood: 0, plank: 0, stone: 3, wheat: 0, food: 2, wool: 0 },
  },
};

/* --------------------------------------------------------------------- */
/* a house, and everything that goes in one                              */
/* --------------------------------------------------------------------- */

/**
 * What it costs to raise the shell. Deliberately small: the house has to be
 * able to go up on the afternoon somebody needs a bed, not after a week of
 * saving. It comes with a door, a window and one bed — a home, barely — and
 * everything better than that is bought one piece at a time afterwards.
 */
export const HOUSE_SHELL = { plank: 3, stone: 2 };

/**
 * Where things can go. The wall is behind, the floor is in front of it in two
 * rows, and that is the whole geometry — the mini-game draws it, the reducer
 * only needs to know how many there are so it can refuse a slot that is not
 * really there.
 */
export const HOUSE_SLOTS = { wall: 5, cols: 6, rows: 2 };
export const HOUSE_WALL = HOUSE_SLOTS.wall;
export const HOUSE_ALL = HOUSE_SLOTS.wall + HOUSE_SLOTS.cols * HOUSE_SLOTS.rows;

/**
 * Everything you can put in a house. One row each, which is the whole cost of
 * adding another: a row here, a picture in the mini-game's drawing table, and
 * its name in both languages.
 *
 * `gives` is the one plain thing it does — a bed is somewhere to sleep, a
 * stove makes the house warm, a window or a lamp makes it light. `comfort` is
 * the other half: everything adds a little, so a room somebody has been adding
 * to for a week is a nicer place to be than a room with a bed in it.
 *
 * The costs are split on purpose. Planks are the Builder's and wool, wheat and
 * stone are usually the Keeper's, so furnishing a house is something the two
 * of them do together rather than a bill one of them picks up.
 */
export const HOUSE_STUFF = {
  window: { icon: '🪟', where: 'wall', cost: { plank: 1 }, gives: 'light', comfort: 2 },
  lamp: { icon: '🕯️', where: 'wall', cost: { plank: 1 }, gives: 'light', comfort: 1 },
  shelf: { icon: '🍞', where: 'wall', cost: { food: 1 }, comfort: 1 },
  bed: { icon: '🛏️', where: 'floor', cost: { plank: 2 }, gives: 'bed', comfort: 2 },
  stove: { icon: '🔥', where: 'floor', cost: { stone: 2 }, gives: 'warm', comfort: 3 },
  table: { icon: '🍽️', where: 'floor', cost: { plank: 1 }, gives: 'table', comfort: 2 },
  chair: { icon: '🪑', where: 'floor', cost: { plank: 1 }, gives: 'sit', comfort: 1 },
  blanket: { icon: '🧶', where: 'floor', cost: { wool: 2 }, comfort: 2 },
  flowers: { icon: '🌷', where: 'floor', cost: { wheat: 1 }, comfort: 1 },
};

/** The order they stand on the shelf: a bed first, because that is why a house. */
export const HOUSE_SHELF = [
  'bed',
  'window',
  'chair',
  'table',
  'lamp',
  'stove',
  'blanket',
  'flowers',
  'shelf',
];

/**
 * How a room feels, as five words rather than a number. An entry is the
 * comfort you have to have earned to reach it, so a new house — one window and
 * one bed — is already past 'bare' and has somewhere to go.
 */
export const HOUSE_FEEL = [0, 4, 9, 15, 22];

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
    cost: { plank: 4, stone: 1, wool: 2 },
    cap: 'bridge', // who knows how to make it
    verb: 'boat', // how to ask the other player for it
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
    cap: 'road', // stonework, so the Keeper can do it
    verb: 'well',
    journal: '🪣',
    built: 'msg.wellUp',
    text: {
      plan: 'w.wellPlan',
      planHint: 'w.wellPlanHint',
      build: 'w.buildWell',
      done: 'w.well',
      doneHint: 'w.wellHint',
    },
  },
  privy: {
    type: 'privy',
    cost: { plank: 3, stone: 1 },
    cap: 'house',
    verb: 'privy',
    journal: '🚪',
    built: 'msg.privyUp',
    text: {
      plan: 'w.privyPlan',
      planHint: 'w.privyPlanHint',
      build: 'w.buildPrivy',
      done: 'w.privy',
      doneHint: 'w.privyHint',
    },
  },
  fence: {
    type: 'fence',
    cost: { plank: 6, stone: 0 },
    cap: 'house',
    verb: 'fence',
    journal: '🚧',
    built: 'msg.fenceUp',
    text: {
      plan: 'w.fencePlan',
      planHint: 'w.fencePlanHint',
      build: 'w.buildFence',
      done: 'w.fence',
      doneHint: 'w.fenceHint',
    },
  },
};

/** Just the costs, which is what most of the game asks for. */
export const PROJECT = {};
for (const k in PROJECTS) PROJECT[k] = PROJECTS[k].cost;

export const SAPLING_TICKS = 1500; // a sapling is a tree again after ~2.5 min of play
export const REPLANT_GOAL = 3; // stumps worth replanting before the forest looks whole

// How wheat comes on. Kept here rather than in the simulation because the
// catch-up does the same sum in one step for the hours nobody was watching.
export const PLOT_GROW_WET = 0.062; // per tick, while there is water in the ground
export const PLOT_GROW_DRY = 0.004; // per tick, once it has drunk it all
export const PLOT_DRINK = 0.09; // how fast a watering is used up
export const FLUFF_RISE = 0.012; // per tick, a sheep's wool coming back in

// Kind things go on while nobody is there (law 9). The world does not race:
// an hour away grows as much as a day of playing does, and three days is as
// much as it ever adds up to — a village opened after a month is a village,
// not a forest. A minute away is not being away at all.
export const AWAY_TICKS_PER_HOUR = 5 * 60 * 10; // one in-game day, same as BLOCK_TICKS
export const AWAY_CAP_TICKS = 3 * 5 * 60 * 10; // three days, and never a fourth
export const AWAY_MIN_MS = 60 * 1000; // a reload is not an absence

// Nobody is ever really ill in this world: a poorly tummy from river water
// means a slow walk home, a rest, and a village that can fix the cause.
export const POORLY_TICKS = 900; // ~90 s of resting, then up again
export const POORLY_CHANCE = 0.06; // per check, and only one person at a time

// Hunger: how fast it climbs, when it counts as properly hungry, when a full
// basket is worth walking over for, and how much one loaf takes off. Kept
// here rather than buried in the simulation so that working out how many
// days a basket will last never means guessing these.
export const HUNGER_RISE = 0.012; // per tick, while up and about
export const HUNGRY_AT = 62; // hungry enough to mind an empty basket
export const EAGER_AT = 45; // hungry enough to go and eat, once there is bread going
export const LOAF_RELIEF = 70; // how much one loaf takes off

/**
 * Everything that fills a hungry belly, each its own resource key on a player
 * and in the basket — gathered, carried and given exactly like wood or wool.
 * A third kind of food is one more row here; loavesPerDay(), the basket panel
 * and the give screen all read this list rather than knowing bread and fish
 * by name.
 */
export const FOODS = [
  { key: 'food', icon: '🍞' }, // bread, baked at the mill
  { key: 'fish', icon: '🐟' }, // caught from the boat
];

/* --------------------------------------------------------------------- */
/* what a villager can learn                                             */
/* --------------------------------------------------------------------- */

/**
 * Villagers gather; the two of you make. These five are the whole list, and
 * they are deliberately the five that only ever take what grows back: wood
 * from a tree that is replanted in the same step, a stone the river brings
 * more of, wheat, wool and fish. Sawing, milling, bridges, houses, roads and
 * projects stay in the players' hands — that is what the afternoon is for.
 *
 * Each row says who can show it: `cap` is the capability the teacher needs
 * (null means either of you), `tally` is the count in their `done` that has
 * to be at least TEACH_TIMES, and `needs` names a project that has to be
 * standing first. Adding a sixth is a row here, a target in `villagerWork()`,
 * its effect in `finishVillagerTask()`, a name in every language, and a test.
 */
export const VILLAGER_SKILLS = {
  fell: { icon: '🪓', cap: 'fell', tally: 'fell', verb: 'fell' },
  stone: { icon: '🪨', cap: null, tally: 'stone', verb: null },
  farm: { icon: '🌾', cap: 'farm', tally: 'farm', verb: 'farm' },
  care: { icon: '🧶', cap: 'care', tally: 'care', verb: 'care' },
  fish: { icon: '🐟', cap: 'farm', tally: 'fish', verb: 'fish', needs: 'boat' },
};

/** The order they are offered in, which is the order a village learns them. */
export const SKILL_ORDER = ['fell', 'stone', 'farm', 'care', 'fish'];

// Two jobs each and no more, so six villagers can only ever hold twelve jobs
// between them — a ceiling, not a ladder. Nothing here grows the more you
// play (the anti-list); a third job would be the first step towards a village
// that works harder every week, which is not what this is.
export const MAX_SKILLS = 2;
export const TEACH_TIMES = 2; // do a thing twice and you can show somebody how

// How much anybody can hold. A villager's arms take BAG_CAP of a thing and
// then they stop; the pile by the workshop door takes PILE_CAP and then the
// hauling stops too. Both are visible where they live — in their arms and on
// the ground — so a full one is something you can see rather than be told.
export const BAG_CAP = 6;
export const PILE_CAP = 20;

// A villager gets about a third as much done as a player would: one job every
// ninety seconds of play, never two at once, and never the same second on
// both screens by accident — every choice comes out of the world's own dice.
export const WORK_EVERY = 900;
export const WORK_TICKS = 26; // how long the doing of it takes to watch
export const FISH_REST = 600; // the fish go quiet for a minute after a boat goes out
export const TREE_FLOOR = 6; // trees a villager always leaves standing
export const AWAY_JOBS_CAP = 8; // jobs one villager brings back from an absence

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
    regions: [{ id: 'valley', box: [0, 0, 39, 23], open: true }],

    houses: [
      { key: 'house_a', x: 4, y: 12, w: 3, h: 2, name: "Anna & Bo's house", beds: 3 },
      { key: 'house_b', x: 10, y: 12, w: 3, h: 2, name: "Mira's house", beds: 2 },
    ],
    sites: [{ key: 'site_village', x: 4, y: 18, w: 3, h: 2, name: 'an empty plot' }],
    // Where a family that hears about this place marks out a plot of their own.
    // Not in `sites`, because it is not there until the world puts it there —
    // the `newfamily` happening does, and only once houses are going up.
    newFamily: { key: 'site_east', x: 26, y: 6, w: 3, h: 2, name: 'a marked-out plot' },
    works: [{ key: 'workshop', type: 'workshop', x: 9, y: 16, w: 4, h: 3, name: 'the workshop' }],
    roads: [
      [5, 14, 8, 15],
      [8, 15, 11, 14],
      [8, 15, 11, 19],
    ],

    forest: { count: 15, x: 1, w: 11, y: 1, h: 8, apart: 3 },
    extraTrees: [
      [24, 3, 2],
      [30, 12, 3],
      [35, 6, 1],
    ],

    plots: [
      [26, 16],
      [29, 16],
      [32, 16],
      [26, 19],
      [29, 19],
      [32, 19],
    ],

    sheep: [
      { name: 'Cloud', at: [27, 6], fluff: 94 },
      { name: 'Pip', at: [31, 9], thirst: 82 },
      { name: 'Nutmeg', at: [24, 11], hunger: 84 },
    ],

    // `home` is an index into `houses`; the people already living somewhere
    // hold their beds, which is why somebody has none.
    villagers: [
      { key: 'anna', name: 'Anna', colour: '#d96a5f', at: [6, 15], home: 0 },
      { key: 'bo', name: 'Bo', colour: '#4f83b8', at: [9, 13], home: 0 },
      { key: 'mira', name: 'Mira', colour: '#b47ec0', at: [11, 15], home: 1 },
      { key: 'ted', name: 'Ted', colour: '#4f9c8a', at: [7, 17], home: null },
      { key: 'lina', name: 'Lina', colour: '#e0a03e', at: [5, 15], home: 0, kid: true },
      { key: 'sam', name: 'Sam', colour: '#7a86c9', at: [12, 14], home: 1, kid: true },
    ],

    stones: [
      [15, 20],
      [21, 4],
    ],

    // A plan is a place where something could go: nothing stands there, nothing
    // is blocked, and the guide knows about it. `anchor` is either a tile or a
    // search — 'sandNear' finds the river bank close to a point.
    plans: [
      {
        id: 'plan_boat',
        type: 'boat',
        w: 2,
        h: 1,
        walkable: true,
        name: 'the old landing',
        anchor: { sandNear: [15, 11], offset: [-1, 0] },
      },
      {
        id: 'plan_play',
        type: 'play',
        w: 3,
        h: 2,
        walkable: true,
        name: 'the green by the water',
        anchor: { tile: [13, 18] },
      },
      {
        id: 'plan_well',
        type: 'well',
        w: 1,
        h: 1,
        name: 'the middle of the village',
        anchor: { tile: [7, 16] },
      },
      {
        id: 'plan_privy',
        type: 'privy',
        w: 1,
        h: 1,
        name: 'the edge of the wood',
        anchor: { tile: [2, 10] },
      },
      // the whole field: the fence goes round it, and people walk through it
      {
        id: 'plan_fence',
        type: 'fence',
        w: 10,
        h: 7,
        walkable: true,
        name: 'the wheat field',
        anchor: { tile: [25, 15] },
      },
    ],

    crossingRow: 12,
  },
};

export const DEFAULT_SCENARIO = 'valley';

/** The plot the `newfamily` happening marks out. Read it, never the string. */
export function newFamilySite(w) {
  return scenarioOf(w).newFamily || null;
}

export function scenarioOf(w) {
  return SCENARIOS[w?.scenario || DEFAULT_SCENARIO] || SCENARIOS[DEFAULT_SCENARIO];
}
