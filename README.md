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

The relay only passes messages along. The world itself lives in the browsers:
whoever connects first runs the clock and reads their own `localStorage`; the
other player receives that world and follows it.

So the same person should open the page first each time — otherwise a device
with no save (or an old one) can become the authority and the world that
appears is the one that device remembers. Nothing is lost while both are
playing; the risk is only in who starts.

Keeping the world on the server instead would remove that ordering rule: the
relay would hold the last snapshot per room and hand it to whoever arrives.
`Session` is already shaped for it — see **Multiplayer** below.

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
| knows how to   | fell trees, saw planks, build bridges and houses, run the mill | look after animals, move them, lay roads, work the field |
| tends to have  | wood, planks                       | stone, food, wheat, wool         |

Neither can finish much alone. Bread needs the Keeper's wheat and the Builder's
mill. A bridge needs the Builder's planks and stone the Keeper is usually
carrying. A road on the far bank is no use until somebody bridges the river.

Roles are not fixed. Do something two or three times and a "show them how"
button appears on your role card — teach it across, and you both know it.

## What you can do

Starting a morning opens with one card: the world's most pressing problem in a
sentence, and the numbered steps that would put it right, each labelled with who
can do it. Steps you have already covered are ticked. Tapping any of the world's
notices opens the same card.

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
| 🤝 **Share** | Tap any resource to send some across. Or drop food in the village basket, where the hungry go looking. |

Anything that costs materials shows the cost as the materials themselves — one
picture per plank and per stone, the ones you have in colour and the ones you
are missing greyed out. Messages from the world wait on screen until somebody
taps them away.

## A day

The day starts when the game does. Nobody agrees to anything first, and there is
no clock: the light says how late it is. Pale and cool at dawn, clear at midday,
gold in the afternoon, and then the sun goes and everybody walks home. Windows
come on one by one. The people who have a bed go to it; the one who hasn't is
still standing outside, which is the whole reason you notice them.

Then it is night, and **nothing carries on**. A card says what the day came to,
who is better off, and one small thing still waiting. The next day only begins
because somebody taps *play another day* — the game will not pull you into
another one. The world is saved either way, exactly as it is, with nothing
rotting while you are away.

## The two rows

The top row is the people playing: one chip per role, yours marked, the others
showing whether they are at their screen. Tapping your own opens what you do to
the game — what needs doing, the language, starting over, back to the start
screen. Tapping theirs opens what you do together: giving them something, and
teaching them anything you have done often enough to show. The bottom row is
nothing but what we have.

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
    rng.js       seeded, so two browsers agree
    persist.js   localStorage
  net/
    transport.js the seam: local windows, a relay, or nothing
    session.js   one peer hosts the clock; the rest follow snapshots
  render/        art.js (sprites) and renderer.js (frames)
  ui/            hud, world taps, sharing, panels
  minigames/     one file each
server/
  serve.mjs      static files + the relay, no dependencies
  relay.mjs      a ~180 line WebSocket relay, no dependencies
tests/           deterministic simulation and relay tests
tools/           browser smoke test that plays a whole day
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
npm test              # simulation determinism, costs, pathing, relay framing
node tools/smoke.mjs  # a headless browser plays a whole day
node tools/german.mjs # the same, in German, checking no untranslated key leaks
```

The smoke test needs the server running (`npm start` on port 8099, or set
`BASE`). It picks a role, fells a tree, saws it, designs and tests a bridge,
looks after a sheep, sows the field, lays a road, designs a house, watches
somebody move in, asks the other player for help, runs the day to its
checkpoint, and then checks that two separate browsers see each other's work.
It also checks that nothing overflows sideways on an iPad, an iPhone and a Mac.

## What is deliberately missing

No streaks, daily rewards, coins, energy, loot boxes, timers that punish you,
leaderboards, notifications, chat, or anything that gets longer the more you
play. Nothing decays while you are away and nothing asks you to come back.

The conversation happens on FaceTime. The game only has to be worth talking
about.
