# Our Little World

"Our little world" is a browser game where two players build, manage and grow a small village together, either at the same time or at different times.
They fell trees to build houses, grow wheat to make bread, create infrastructure and discover the world.
The game is aimed at a child of about seven, who can read and write but for whom neither is effortless yet.
A sitting is five to fifteen minutes, a few days in the village time.
The players have different roles (builder, keeper) with different capabilities, so playing together is part of the point.
The game is deliberately non-addictive, doesn't punish not playing, has no currency, no score, no streaks, no ads, no notifications and no monetization.
It has no server dependency for two people sharing a browser (two windows/tabs talk to each other directly), which is enough to try the GitHub Pages version (https://jannikarndt.github.io/our-little-world/).
A small server (https://ourlittleworld.timpanini.com) is what lets two separate devices play together, at the same time or at different times.
Communication between the players has to happen outside the game, on a call or in person.

### Roles

The builder can

- fell trees
- cut wood into planks
- build houses, boats and bridges
- turn wheat into bread

The keeper can

- plant trees
- sow and harvest wheat
- care for the animals
- fish

Skills can also be taught from one player to the other.

### World

The map has

- a large river for water and fishing
- a forest for wood and animals
- houses and buildings
- villagers and animals
- fields for growing wheat

### Mini Games

To make actions in the game cost something, mini-games require the players to do more than just click:

- felling a tree needs precise hits with an axe
- sawing planks into the required sizes
- adding furniture to a house requires tracing letters
- milling grain visualizes percentages
- build a bridge (engineering)
- fishing (reaction time)
- animal care

### Languages

The game currently supports

- English
- German

## Development

> **Changing the game?** `CLAUDE.md` is the rulebook: the laws a change has to
> respect, the things this game will never have, and how to add a project, a
> task or a language without costing anybody their village. This file is what
> the game *is* and how to run it.

```
npm install   # once, for the dev tooling (lint, tests, verify)
npm start     # http://localhost:8080 — also prints a LAN address for a second device
```

Plain ES modules and a 2D canvas. No framework, no bundler, no build step, and
nothing downloaded — every tree, sheep and roof is drawn with `ctx` calls. It
starts fast on a phone and stays quiet on the battery.

```
index.html
stats.html       the page at /stats: how much this gets played
styles/main.css
src/
  core/          the world, and nothing that draws
    grid.js      terrain, movement costs
    pathfind.js  A* — why a road is worth building
    world.js     world state, laid out and serialisable
    actions.js   the only way the world ever changes
    sim.js       villagers, sheep, crops, weather in the sky
    events.js    problems, but only when they make sense
    guide.js     the one mission: what to do next, who, and how far along
    content.js   what a world is made of, as data: scenarios and projects
    letters.js   the alphabet, as strokes a hand makes
    migrate.js   bringing an older saved world up to date
    changelog.js what has changed, per language
    i18n.js      one string table per language, and the lookup
    rng.js       seeded, so two browsers agree
    persist.js   localStorage: the world, and which worlds are ours
    names.js     sunny-otter 🦦 — shared by the browser and the server
    fresh.js     is the page on the screen still the one being served?
  net/
    transport.js the seam: local windows, a relay, or nothing
    session.js   one peer hosts the clock; the rest follow snapshots
    directory.js the world list, from the browser's side
  render/        art.js (sprites) and renderer.js (frames)
  ui/            start.js (the front door), hud.js, interact.js (world taps),
                 overlay.js (panels), share.js, invite.js, whatsnew.js
  minigames/     chop, sawmill, bridge, house, care, fish, trace (writing and
                 drawing), and modes.js (which of the two you last chose)
server/
  serve.mjs      static files + the relay + the directory, no dependencies
  relay.mjs      a ~200 line WebSocket relay, no dependencies
  worlds.mjs     which worlds exist, who is in them, how each was left
  api.mjs        the JSON endpoints the start screen talks to
  stats.mjs      how much this gets played, in numbers that are nobody's
  buildid.mjs    a hash of everything that ships, for /version
tests/           simulation, schema, guide, i18n, relay, session, worlds, stats
tools/           verify.mjs and what it runs: smoke, german, lobby, stats;
                 deployed.mjs, icons.mjs, and look.mjs for a quick screenshot
```

Two rules keep it honest:

1. **Every change to the world is an action.** `applyAction(world, action)` is
   the only mutation. Actions are small JSON objects, so they broadcast, replay
   and test cleanly.
2. **The simulation is deterministic.** Fixed 100 ms ticks and a seeded PRNG
   carried inside the world. The same seed and the same actions give the same
   world, which is what makes two browsers agree and makes the tests mean
   something.

Mini-games run entirely on the device that opened them. Only the outcome is an
action, so a wobbly bridge test never travels over the network.

### Deployment

- `deploy-dev` deploys any branch to https://ourlittleworld-dev.timpanini.com/
- the `main` branch is deployed to https://ourlittleworld.timpanini.com/
- changes and deployments must never break an existing game
- Runtime: see `server/` and `Dockerfile`. Runs on port 8080 and requires websocket support.
- `.github/workflows/deploy.yml` runs on every push to `main`: it runs the full `npm run verify` first and only deploys if that passes, so a broken push leaves the last good build serving the people playing
- to deploy to caprover, five repository secrets are needed: `CAPROVER_SERVER`, and per app `CAPROVER_APP`/`CAPROVER_APP_TOKEN` (prod) and `CAPROVER_APP_DEV`/`CAPROVER_APP_TOKEN_DEV` (dev)
- caprover must define a **persistent directory** mapped to `/app/data` for each app (otherwise a redeploy forgets which worlds exist and what was in them)

#### Environment variables worth knowing about

| | |
|---|---|
| `DATA_DIR` | where worlds are kept (`/app/data` in the image) |
| `WORLD_TTL_DAYS` | how long a world nobody opens survives (14) |

## Playing and game state

### Where the world lives

The world lives in the browsers: whoever connects first runs the clock, and the
other player receives that world and follows it.

Two things outside the browsers remember it as well. The relay keeps the last
snapshot it saw in each room, in memory, for half a day and hands it to whoever
joins next. The host also posts the world to the directory every 30 seconds and
whenever a play block ends, and that copy is on disk: it survives a redeploy, an
empty room, and a fortnight of nobody playing.

Worlds are forgotten when nobody has opened them for **14 days** (`WORLD_TTL_DAYS`). Anything played in keeps itself alive indefinitely.

A running server answers `/version` with the version, the world schema, and a
`build` hash of every file that ships — so "is the thing I just deployed actually
live?" has an answer rather than an assumption:

```
npm run deployed                       # https://ourlittleworld.timpanini.com
npm run deployed -- https://mine/      # or anywhere else
```

It compares the live hash with the working tree's and waits for them to match.

The page carries the same hash: the server writes it into `<meta
name="olw-build">` on the way out, so the copy on a screen always knows which
build it came from and can ask `/version` whether that is still the one being
served. Files go out as `no-cache` with an `ETag`, so coming back costs one small
question per file and a stale copy can never quietly win.

### Finding each other

The server keeps a small directory of worlds. It is a lobby, not an account system (no passwords, no logins).
A world is a random two-word name, a list of which spots are taken, and the world itself as its last host left it.

```
GET  /api/health                  is there a directory on this host at all
GET  /api/worlds                  the worlds with a free spot, newest first
POST /api/worlds                  start one; the server names it
GET  /api/worlds/:name            one world, or 404
POST /api/worlds/:name/join       take the free spot (or get your own back)
POST /api/worlds/:name/seen       still here — keeps the world from expiring
POST /api/worlds/:name/leave      give the spot back
GET  /api/worlds/:name/snapshot   the world as it was last left
POST /api/worlds/:name/snapshot   the world as it is now (from the host)
GET  /api/stats                   how much this gets played (a page at /stats)
```

A browser makes up a random "device" string for itself and keeps it in
`localStorage`. That is how an iPad gets *its own* spot back a fortnight later
instead of a new one. It is not a login and is not treated as one: anybody who
knows a world's name can ask for that world. There is nothing there to protect
— no chat, no personal data, nothing but a world with some sheep in it — and a
matchmaking list that needs a password is a matchmaking list a six year old
cannot use.

### Stats

<https://ourlittleworld.timpanini.com/stats> is public and answers two questions —
*does anybody play this* and *how far do they get before they stop*. It does not leak any player data, because the server stores none.

```
/stats            a page: the week, every day, how far worlds get, what got built
/api/stats        the same numbers as JSON, cached for half a minute
```

## Tests

```
npm run check           # seconds: format, lint, unit tests
npm run fix             # apply what check can apply
npm run verify -- quick # ~1 min: check + a shortened play-through
npm run verify          # ~5 min: everything, incl. German, the lobby and /stats
npm run deployed        # after pushing: is that code actually live?
```

The tests exist to stop whoever is changing the code from slipping, and to keep
the laws in `CLAUDE.md` true without anybody having to remember them. They are
not a specification and not a report card; there is no coverage target.

`npm run verify` starts its own server on a free port and stops it again, so
there is nothing to set up and nothing left listening. It runs five things in
order and stops at the first failure: the unit tests, `tools/smoke.mjs`,
`tools/german.mjs`, `tools/lobby.mjs` and `tools/stats.mjs`. The parts can still
be run by hand against a server of your own (`npm start`, then
`BASE=... node tools/smoke.mjs`).

The same full run is the gate in CI: a push to `main` runs it and only deploys
if it passes, so nothing broken ever reaches the people playing.

The play-through picks a role, fells a tree, saws it, designs and tests a bridge,
looks after a sheep, sows the field, lays a road, designs a house, watches
somebody move in, plants a sapling, builds the boat and goes fishing, builds the
playground, the well, the little house and the fence, opens the changelog,
checks a job that is not yours says so and offers no button, pinches the world
and checks the zoom stays put, taps past the edge of the map and checks nothing
opens, runs the day to its checkpoint, starts a world over
and checks the old one does not come back, and then checks that two separate
browsers see each other's work. It also checks the task card: that it says what
to do, that whoever it names is drawn on it and ringed in the world, and that
every counted step reads `have/need`.
It also checks that nothing overflows sideways on an iPad, an iPhone and a Mac.

`tools/lobby.mjs` is the matchmaking half: one browser starts a world, a second
one picks it out of the list, they share a world, the world stops being listed,
and reloading the page puts the second player straight back in with the same
role.

`tools/stats.mjs` puts three worlds of different ages into the directory and
then reads `/stats` in a browser: that the week's numbers are there, that the
day chart drew something, that a median is stated, that the milestones and the
deeds have their rows, that every chart has its table of numbers, that hovering
a day says more than the column does, and that nothing hangs off the side of a
phone.

`npm run verify -- quick` keeps the unit tests and the play-through and drops
the rest — the screenshots, the second browser, the walk round three screen
sizes, German, the lobby and the stats page. About a minute, for iterating.

## Adding to the world

The world is described as data and brought up to date on load, so adding to it
does not cost anybody their village. `CLAUDE.md` has the full recipes; the shape
of it is:

- **A new project, villager, plan, role or scenario** is an entry in
  `src/core/content.js`. `ensureWorld()` runs on every load and puts anything
  new into worlds that were saved before it existed. No schema bump, no reset.
- **A new task** is one entry in `CONCERNS` in `src/core/guide.js` — and *where*
  you put it in that list is the decision, because only the first one that
  applies is ever shown.
- **A change to what an existing field means** is the only thing that costs a
  version: a numbered step in `src/core/migrate.js` and `SCHEMA` up by one.
- **Anything else** has room already: `world.ext` for namespaced extension data
  and `world.flags` for one-off switches.

A scenario is a recipe — which terrain to paint, what stands on it, who lives
there, which projects are marked out, **which roles are at the table** and
**which parts of the map are there yet** — and a world remembers which one it
was made from in `world.scenario`. A second scenario is a second entry in the
table: an island where the boat comes first, a winter valley, a hill farm.

Two things are built and waiting, so the world can grow without another rebuild:
**a third role** (a Cook — bread, the larder, something warm out of what the
other two bring in) and **a map that opens up** (a scenario's `regions`, each
either here or not yet, opened with `{ type: 'region.open' }`). Both are the
plan, not spare parts.
