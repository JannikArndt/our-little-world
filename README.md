# Our Little World

A small cooperative world that two people look after together — typically a
parent and a child, on two different devices, with FaceTime running separately.

There is no score, no streak, no currency and nothing to come back for. There is
a river, a forest, a field, some houses and a few people who could do with a
hand. You each know how to do different things, so you need each other.

```
Child:  "We need to get the sheep across the river."
Parent: "I can build the bridge."
Child:  "But we need more wood."
Parent: "I have some."
Child:  "I'll build the road on the other side."
```

## Playing

```
npm start                 # http://localhost:8080
```

The server prints a second address on your local network — open that one on the
iPad. Both players type the same world name on the first screen and they are in
the same world.

Three ways to play:

- **Two devices on the same Wi-Fi** — run `npm start` on a laptop, open the
  printed `http://192.168.x.x:8080` address on both devices. They connect
  through the small relay built into the same server.
- **Two windows on one machine** — open the page twice with the same world
  name. With no relay answering, they find each other through the browser
  itself, so this works from GitHub Pages or a plain file server too.
- **Both roles on one screen** — pick "Both, on one screen" and tap the role
  chip in the top left to swap. Good for sitting next to each other, and for
  trying things out.

There is no build step. The whole game is static files; any web server (or
GitHub Pages) will do. On load the page asks the host over plain HTTP whether it
has a relay and remembers the answer, so a static host costs one 404 on the
first visit and nothing afterwards. The relay is only needed for two separate
devices.

Useful query parameters: `?room=kitchen`, `?role=A|B|BOTH`,
`?server=wss://your-relay/relay`.

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

## Playing when you are far apart

The relay is a WebSocket on the same port as the page, so anything that runs
Node and keeps a socket open will do. There is a `Dockerfile`:

```
docker build -t our-little-world .
docker run -p 8080:8080 our-little-world      # or: docker compose up -d
```

`node:22-alpine` plus the files it serves. No dependencies, no build step, no
volumes, nothing to mount. It listens on `$PORT` (8080 by default) and answers
`/rooms`, which is also its health check.

Put it behind TLS. The page chooses `wss://` when it was loaded over `https://`
and `ws://` otherwise, so a certificate is all it takes — but a proxy in front
of it has to pass the `Upgrade` and `Connection` headers through or the relay
never sees the handshake and both players quietly end up alone. Caddy does that
by itself:

```
world.example.com {
  reverse_proxy localhost:8080
}
```

nginx needs to be told:

```
location / {
  proxy_pass http://localhost:8080;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 3600s;
}
```

Both players then open the same address, type the same world name, and pick
different roles.

### CapRover

`.github/workflows/deploy.yml` deploys on every push to `main`. It needs three
repository secrets: `CAPROVER_SERVER`, `CAPROVER_APP_TOKEN` and `CAPROVER_APP`.
The CLI tars the checked-out branch and the server builds it; `captain-definition`
points at the `Dockerfile`, so the image is the same one you get locally.

Two settings on the app's **HTTP Settings** page have to match the image:

- **Container HTTP Port: 8080** — CapRover assumes 80 when the field is empty,
  and the server listens on 8080.
- **Websocket Support: on** — CapRover's nginx only passes `Upgrade` and
  `Connection` through when that box is ticked. Without it the page loads
  perfectly and the two players never find each other.

Then add the domain, enable HTTPS, and force it.

### Where the world lives

The world lives in the browsers: whoever connects first runs the clock, and the
other player receives that world and follows it.

The relay now keeps one thing of its own — the last snapshot it saw in each
room, for half a day — and hands it to whoever joins next. So it no longer
matters who opens the page first: when nobody is running the clock, a browser
takes whichever world has got furthest, the relay's or its own save, and carries
on from there. That is the first half of holding worlds on the server properly;
the second half is running the clock there too, which `Session` is already
shaped for — see **Multiplayer** below.

## English and German

The game picks its language from the device and remembers what you choose; the
two flags at the top of the start screen switch it. A parent playing in English
and a child playing in German can share one world: notices, the journal and
everything a villager says are stored as a key and its values, never as a
finished sentence, so each screen renders them in its own language.

Adding a third language means one file in `src/i18n/`. The tests check that
every string exists in both tables, that the `{name}` and `{n}` slots match, and
that plurals come in pairs.

## The two players

|                | 🔨 The Builder                     | 🌿 The Keeper                    |
|----------------|------------------------------------|----------------------------------|
| knows how to   | fell trees, saw planks, build bridges, houses, boats, run the mill | look after animals, move them, lay roads, work the field, fish, plant trees |
| tends to have  | wood, planks                       | stone, food, wheat, wool         |

Neither can finish much alone. Bread needs the Keeper's wheat and the Builder's
mill. A bridge needs the Builder's planks and stone the Keeper is usually
carrying. A road on the far bank is no use until somebody bridges the river.

Roles are not fixed. Do something two or three times and a "show them how"
button appears on your role card — teach it across, and you both know it.

## What you can do

Starting a morning opens with one card: the most pressing thing in the world
right now, said as something to do — **"Build a house for Ted!"**, not "Ted has
nowhere to sleep tonight" — and the numbered steps that would get there, each
labelled with who can do it.

Three things keep that card honest:

- **It says what to do.** A title is an invitation, never a verdict.
- **Anybody it names is somebody you can see.** Ted is drawn on the card in the
  same lines the world draws him in, the view moves to him behind the card, and
  a soft ring follows him about for a while afterwards. A name is never just a
  name.
- **Every step that can be counted carries its count.** `3/5 🪵`, `1/5 🪚`,
  `3/3 🪨 ✓`. A tick with a number next to it explains itself; a bare tick does
  not.

Tapping any of the world's notices opens the same card.

| | |
|---|---|
| 🪓 **Fell a tree** | Pick which way it falls, then swing the axe by tapping the trunk. It goes where you cut it — unless you drop it into the wind, and then it goes wherever it likes. |
| 🪚 **Saw a log** | Every log arrives with an order — three pieces of four, two of six, four of three — drawn above the log at the same scale. Pieces that match become planks and land on the stack; the rest is kindling. Each log is measured on its own. |
| 🌉 **Build the bridge** | Stand piers in the river. A beam reaches two gaps on its own; three sags; four goes in the water, taking a villager with it. Try it before you build it — trying costs nothing. |
| 🏠 **Design a house** | Put a door, windows, beds, a stove and a table on a floor plan. The family stands outside and tells you, with their faces, what living there would be like — dark, freezing, cramped, or a bed nobody can reach. |
| 🐑 **Look after a sheep** | She does not say what she wants. She droops, or eyes the river, or gets very woolly. Drag over what you think she needs. Wrong guesses are funny and free. |
| 🛤️ **Lay a road** | Drag across the ground. One stone for every two steps, counted as you drag. People immediately start using it. |
| 🌱 **Work the field** | Sow, then carry water. The can holds three plots and the field has six. |
| 🌀 **Run the mill** | Turn the stone with your finger, then bake. Two wheat, three loaves. |
| 🪣 **Dig a well** | Until there is one, everybody drinks from the river — and sooner or later somebody has a poorly tummy: a slow walk home and a sit down, nothing worse. A well is clean water, and a trough the sheep find on their own. |
| 🚪 **Build the little house** | The one at the bottom of the garden. What used to end up in the river stops doing so, which is why the water was not safe and why the fishing was poor. Either it or the well settles the tummies; both is a tidy village. |
| 🚧 **Fence the wheat field** | Six planks of posts and rails with a gap to walk through. The sheep keep to the meadow — unless you take one in yourself, which still works. |
| ⛵ **Build the fishing boat** | Four planks and a stone at the old landing on the west bank. Then somebody has to take her out. |
| 🎣 **Go fishing** | Cast, watch the float, and tap the moment it goes under. Too early and the line comes up empty. Three casts, then row back — the fish go quiet for a while. |
| 🛝 **Build the playground** | A swing, a slide and a sandpit on the green by the water. Lina and Sam go and use it, which is the whole point of it. |
| 🌱 **Plant a sapling** | Every stump was a tree. Put a sapling in and it grows back into one while you play. |
| 🤝 **Share** | Tap any resource to send some across. Or drop food in the village basket, where the hungry go looking. |

Anything that costs materials shows the cost as the materials themselves — one
picture per plank and per stone, the ones you have in colour and the ones you
are missing greyed out. Messages from the world wait on screen until somebody
taps them away, and everything said so far is kept behind the 📜 button.

## Five minutes

Before you start, you agree on a play block: five minutes. A sun crosses the top
of the screen — no numbers unless you tap it, and never a countdown.

When the five minutes are up **nothing stops**. The light warms, the world stops
raising new problems, and a card says what you did, who is better off, and one
small thing still waiting. Then you either carry on or you don't. The world is
saved either way, exactly as it is, with nothing rotting while you are away.

## How it is put together

Plain ES modules and a 2D canvas. No framework, no bundler, no build step, no
downloaded assets — every tree, sheep and roof is drawn with `ctx` calls. It
starts fast on an old iPad and stays quiet on the battery.

```
index.html
styles/main.css
src/
  core/          the world, and nothing that draws
    grid.js      terrain, movement costs
    pathfind.js  A* — why a road is worth building
    world.js     world state, laid out and serialisable
    actions.js   the only way the world ever changes
    sim.js       villagers, sheep, crops, weather in the sky
    events.js    problems, but only when they make sense
    guide.js     the one card: what to do next, who, and how far along
    content.js   what a world is made of, as data: scenarios and projects
    migrate.js   bringing an older saved world up to date
    changelog.js what has changed, per language
    rng.js       seeded, so two browsers agree
    persist.js   localStorage
  net/
    transport.js the seam: local windows, a relay, or nothing
    session.js   one peer hosts the clock; the rest follow snapshots
  render/        art.js (sprites) and renderer.js (frames)
  ui/            hud, world taps, sharing, panels
  minigames/     one file each (chop, sawmill, bridge, house, care, fish)
server/
  serve.mjs      static files + the relay, no dependencies
  relay.mjs      a ~180 line WebSocket relay, no dependencies
tests/           deterministic simulation and relay tests
tools/           browser smoke test that plays a whole block
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

### Multiplayer

One peer hosts: it runs the clock, applies actions and broadcasts a full world
snapshot roughly once a second. Guests apply their own actions immediately so
the game feels instant, send them on, and get corrected by the next snapshot
(positions are blended in, so nobody teleports).

That is the same shape a real server needs. Moving the host into Node means
implementing `Transport` and running `Session` there; nothing above the seam
changes.

### Browser support

Targeted at Safari 12 and up — an iPad from 2015 running the last iOS it was
given. No optional chaining, no nullish coalescing, no `ResizeObserver`, and no
flexbox `gap`. Devicepixel ratio is capped at 2, terrain is painted once into an
offscreen canvas and re-used, and a frame is one blit plus a few dozen small
shapes.

## Tests

```
npm run verify          # everything: unit tests, a browser play-through, German
npm run verify -- quick # the same assertions, minus screenshots and extra screens
npm test                # just the unit tests: simulation, schema, guide, i18n
```

`npm run verify` starts its own server on a free port and stops it again, so
there is nothing to set up and nothing left listening. The parts can still be
run by hand against a server of your own (`npm start`, then `BASE=... node
tools/smoke.mjs`). It picks a role, fells a tree, saws it, designs and tests a bridge,
looks after a sheep, sows the field, lays a road, designs a house, watches
somebody move in, plants a sapling, builds the boat and goes fishing, builds the
playground, opens the changelog, asks the other player for help, runs the block
to its checkpoint, and then checks that two separate browsers see each other's
work. It also checks the opening card: that it says what to do, that whoever it
names is drawn on it and ringed in the world, and that every counted step reads
`have/need`.
It also checks that nothing overflows sideways on an iPad, an iPhone and a Mac.

## Adding to the world

The world is described as data and brought up to date on load, so adding to it
does not cost anybody their village.

- **A new project, villager, plan, role or scenario** is an entry in
  `src/core/content.js`. `ensureWorld()` runs on every load and puts anything
  new into worlds that were saved before it existed. No schema bump, no reset.
  A project row carries everything: what it costs, who knows how to make it,
  what to call it and what it changes — one action builds all of them.
- **A new task** is one entry in `CONCERNS` in `src/core/guide.js` — an `id`, a
  `when(world)` and a card — placed in the order it matters. The card says what
  to do, names who it is about, and counts what can be counted.
- **A change to what an existing field means** is the only thing that costs a
  version: a numbered step in `src/core/migrate.js` and `SCHEMA` up by one.
  Steps are small, kept forever, and run in order.
- **Anything else** has room already: `world.ext` for namespaced extension data
  and `world.flags` for one-off switches. Both are saved, loaded and sent over
  the network untouched.

A scenario is a recipe — which terrain to paint, what stands on it, who lives
there, which projects are marked out, **which roles are at the table** and
**which parts of the map are there yet** — and a world remembers which one it
was made from in `world.scenario`. A second scenario is a second entry in the
table: an island where the boat comes first, a winter valley, a hill farm.

Two things that are ready but not used yet, so that the world can grow without
another rebuild:

- **A third role.** `ROLES` is a table and `world.players` is built from it, so
  a Cook — bread, the larder, something warm out of what the other two bring
  in — is one entry plus a line in a scenario's `roles`. The seat appears in
  worlds that were saved before the role existed.
- **A map that opens up.** A scenario's `regions` are named boxes, each either
  here or not yet. A closed one is baked into the blocked overlay (so it costs
  the pathfinder nothing) and drawn as soft weather rather than a wall;
  `{ type: 'region.open' }` is how the hills stop being a rumour.

Only a world saved by a *newer* build is refused, and even then it is kept aside
in `olw.world.<room>.kept` rather than written over.

## Fitting on a phone

Two things the layout will not do, and there are tests that keep it that way:

- **Nothing hides under the notch or the home indicator.** The insets are CSS
  variables (`--safe-t`, `--safe-b`, `--safe-l`, `--safe-r`) that default to
  `env(safe-area-inset-*)`, so a headless browser can be told to pretend it is
  an iPhone.
- **A panel's buttons are always reachable.** A panel is a scrolling middle and
  a foot that does not move: however long the card is, and however much browser
  chrome sits at the bottom of the screen, the buttons are the last thing on
  screen. The visible height comes from the visual viewport (`--app-h`), not
  from `100%`, because a phone's toolbars sit on top of the page.

## What is new

The start screen says which version this is — **v1.2 · ✨ What is new** at the
bottom — and tapping it opens the changelog. The same list is under 📜 (what has
happened) once you are in the world, next to **🏡 Back to the start screen**,
which saves the village and puts you back at the front door with its name
already filled in. (The role card — tap the role chip when you are playing one
role rather than both — has the same way out.)

Every version is listed newest first, in whichever language the screen is in. It
lives in `src/core/changelog.js`, outside the language tables, so an entry can be
written once and shipped without waiting for the other language.

### Fetching the game again

Added to an iPhone or iPad Home Screen, the game runs without an address bar and
without a reload button, and iOS keeps it alive in the background for days — so
it can be a fortnight old with no way of knowing and no way out. **↻ Fetch the
game again** is that way out. It sits next to the version at the front door and
under 📜 in the world, it is always there, and it saves the village before it
goes.

Whenever the app comes back to the front it quietly asks `/version` whether a
newer build is live, and if one is, the same door says **✨ A newer version is
ready — fetch it** instead. Nothing pops up and nothing reloads underneath you.
On a plain static host there is no `/version` to ask, so it never claims anything
is out of date — the door still works, it just never lights up.

## What is deliberately missing

No streaks, daily rewards, coins, energy, loot boxes, timers that punish you,
leaderboards, notifications, chat, or anything that gets longer the more you
play. Nothing decays while you are away and nothing asks you to come back.

The conversation happens on FaceTime. The game only has to be worth talking
about.
