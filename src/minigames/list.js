// The mini-games, listed: which function opens each one, which file it is in,
// and one line saying what a player actually does in it.
//
// This is here because `modes.js` holds three different games and `sawmill.js`
// and `bridge.js` hold two each, so a file name is not the name of a game. An
// action's `minigame` is a key in here, which makes the pair exact: one row
// opens one game.
//
// Nothing imports a mini-game to read this, so the table has no imports of its
// own and can be read anywhere — including by /map, which is the other reason
// `what` is written down. `tests/actions.test.mjs` checks every row's file is
// really there and really exports the function it names, so a rename cannot
// leave this quietly wrong.

export const MINIGAMES = {
  chop: {
    file: 'chop.js',
    opens: 'openChop',
    what: 'Aim the axe at the mark on the notch. A stroke that lands is a log; one that glances off is not, so the wood a tree gives is the wood you cut out of it.',
  },
  sawmill: {
    file: 'sawmill.js',
    opens: 'openSawmill',
    what: 'Cut the log into the equal pieces the order asks for. Wood in, planks out.',
  },
  mill: {
    file: 'sawmill.js',
    opens: 'openMill',
    what: 'Turn the stone, then bake what it grinds. Wheat in, bread out.',
  },
  bridge: {
    file: 'bridge.js',
    opens: 'openBridge',
    what: 'Set piers and lay beams across the river. A beam reaches two gaps on its own; three and it sags, four and it goes in the water.',
  },
  repair: {
    file: 'bridge.js',
    opens: 'openRepair',
    what: 'Put the one plank back where the storm took it.',
  },
  raise: {
    file: 'house.js',
    opens: 'openRaise',
    what: 'Raise the shell on a marked-out plot: four walls, a door, a window and a bed, so somebody can move in this afternoon.',
  },
  trace: {
    file: 'trace.js',
    opens: 'tracer',
    what: 'Write the word for the thing, or draw its shape — whichever you are in the mood for. Strokes may be done in any order and nothing is ever marked wrong.',
  },
  care: {
    file: 'care.js',
    opens: 'openCare',
    what: 'Work out what the sheep wants — hay, water, shearing or a pat — by looking at it. Nothing is written down.',
  },
  fish: {
    file: 'fish.js',
    opens: 'openFish',
    what: 'The float sits still, then it goes under. Tap while it is under. Three casts, then row back.',
  },
  road: {
    file: 'modes.js',
    opens: 'roadMode',
    what: 'Draw the road across the world with a finger, anywhere it can go. One stone buys two tiles.',
  },
  sheep: {
    file: 'modes.js',
    opens: 'sheepMode',
    what: 'Tap where the sheep should go, and walk it there.',
  },
};
