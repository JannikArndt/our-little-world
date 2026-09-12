# Our Little World

A small cooperative world that two people look after together — typically a
parent and a child, on two different devices, usually in two different places,
with a video call running separately.

There is no score, no streak, no currency and nothing to come back for. There is
a river, a forest, a field, some houses and a few people who could do with a
hand. You each know how to do different things, so you have something to say to
each other.

```
Child:  "We need to get the sheep across the river."
Parent: "I can build the bridge."
Child:  "But we need more wood."
Parent: "I have some."
Child:  "I'll build the road on the other side."
```

It is meant for a child of about **six to ten** who can read, and a grown-up. A
sitting is five to fifteen minutes — a few days in the village — and either of
you can potter about alone in between.

> **Changing the game?** `CLAUDE.md` is the rulebook: the laws a change has to
> respect, the things this game will never have, and how to add a project, a
> task or a language without costing anybody their village. This file is what
> the game *is* and how to run it.

## Playing

```
npm start                 # http://localhost:8080
```

The server prints a second address on your local network — open that one on the
iPad. Nobody types anything to find each other:

1. One of you taps **A new world** and picks a role. The server gives the world
   a name and a picture of its own — *Sunny Otter* 🦦 — and keeps the second
   spot free.
2. The other one taps **Join a world** and sees *Sunny Otter* sitting at the top
   of the list, with the free spot named. One tap and they are in it.
3. From then on the world is on the front page of both devices under **Your
   worlds**, and going back into it is one tap for as long as you keep playing.

There is also a **Share the link** button, for when you are not in the same
room: it hands the address `…/?world=sunny-otter` to whatever the device uses
for sharing, and falls back to the clipboard. Saying "Sunny Otter" out loud
works just as well — the name is the invitation.

Once both spots are taken the world stops being listed, so nobody wanders into
a game that is already two people.

Three ways to play:

- **Two devices, anywhere** — both open the same address; one starts the world,
  the other joins it from the list. They talk through the small relay built
  into the same server. This is the normal case.
- **Two windows on one machine** — open the page twice and pick the same world.
  With no relay answering, they find each other through the browser itself, so
  this works from GitHub Pages or a plain file server too.
- **Both roles on one screen** — pick "Both, on one screen" and tap the role
  chip in the top left to swap. Good for sitting next to each other, and for
  trying things out.

There is no build step. The whole game is static files plus one small Node
server. On a static host (GitHub Pages, a file server) there is no directory
and no relay: the page asks once over plain HTTP, remembers the answer, and
falls back to "start a world, then both of you type its name".

Useful query parameters: `?world=sunny-otter` (`?room=` still works),
`?role=A|B|BOTH`, `?server=wss://your-relay/relay`.

### Playing at different times

You do not have to be in the village at the same time. Whoever opens it runs the
clock; the other one picks it up later from wherever it got to. While nobody is
there, **only kind things happen** — saplings grow, wheat ripens, wool comes in.
Nothing goes hungry, nothing decays, no problem arrives on its own.

When you come back, the game tells you what the other player got up to while you
were away: what they built, what they left you, what they sorted out. It is a
list of things that happened, not a message from them — the game carries no
words between the two of you, on purpose. And nothing ever asks you to come
back: there are no notifications, and that screen only exists once you have
already decided to open the game.

## Finding each other

The server keeps a small directory of worlds. It is a lobby, not an account
system — there are no passwords, no logins, no email addresses and nothing
anybody typed about themselves. A world is a random two-word name, a list of
which spots are taken, and the world itself as its last host left it.

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

The page asks `/api/health` once per host and remembers the answer, which is how
it knows whether there is a directory and a relay here or whether it is being
served from a plain static host.

A browser makes up a random "device" string for itself and keeps it in
`localStorage`. That is how an iPad gets *its own* spot back a fortnight later
instead of a new one. It is not a login and is not treated as one: anybody who
knows a world's name can ask for that world. There is nothing there to protect
— no chat, no personal data, nothing but a world with some sheep in it — and a
matchmaking list that needs a password is a matchmaking list a six year old
cannot use.

What the spots do buy is the thing that actually goes wrong: a stranger, or a
third device, quietly ending up in somebody else's world. A full world is not
listed and cannot be joined. A spot nobody has used for three days can be taken
over, so a reinstalled iPad is not locked out of its own world for ever.

Worlds are forgotten when nobody has opened them for **14 days**
(`WORLD_TTL_DAYS`). Anything played in keeps itself alive: the game says "still
here" once a minute while you are in it, so a world you visit every weekend
lasts indefinitely.

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

## Who plays, and how far they get

<https://ourlittleworld.timpanini.com/stats> is public, and it can be, because
there is nothing in it that belongs to anybody. It answers two questions —
*does anybody play this* and *how far do they get before they stop* — out of
numbers that were never attached to a person in the first place.

```
/stats            a page: the week, every day, how far worlds get, what got built
/api/stats        the same numbers as JSON, cached for half a minute
```

The page leads with one number — spots taken in the last seven days — then a
column per calendar day, two histograms for how far worlds get, and a bar per
milestone and per deed. One green for every chart, because every chart here has
one series; hovering a column says the rest of that day, and every chart has its
numbers as a table underneath, so nothing is only reachable by hovering.

| | |
|---|---|
| `now` | worlds the directory is holding, spots still free, rooms with somebody in them this second |
| `week` | worlds started, worlds played in, spots taken, minutes played |
| `days` | one row per calendar day, up to 90 of them |
| `howFar` | how far worlds got, as a histogram of days and of minutes, with the middle of each |
| `milestones` | how many worlds ever got a bridge, a house somebody lives in, a well, a boat… |
| `deeds` | how many trees have been felled, logs sawn, roads laid, sheep looked after |

A **spot** is one role in one world on one day, and it is as close to "a person"
as this gets: two spots is a parent and a child, or one person playing twice.
Nothing distinguishes those two, on purpose.

What it does not contain, and cannot be made to: no addresses, no device ids, no
world names, and no times of day — a calendar day is the finest grain kept
anywhere. There is a test that reads the whole report back and fails if a world
name or a device id has found its way into it.

The counting rides along with what the directory already writes down. Each world
remembers which days it has been counted on (so a world is not counted twice for
one day) and the furthest it ever got; when a world is forgotten after its
fortnight, that last part is folded into `data/stats.json` — a few integers per
day, kept for as long as you like — and the world's name goes with the world. A
project added to `PROJECTS` becomes a milestone by itself, with nothing to
change in the counting.

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

`.github/workflows/deploy.yml` runs on every push to `main`: it runs the full
`npm run verify` first and only deploys if that passes, so a broken push leaves
the last good build serving the people playing.

It needs three repository secrets: `CAPROVER_SERVER`, `CAPROVER_APP_TOKEN` and
`CAPROVER_APP`. The CLI tars the checked-out branch and the server builds it;
`captain-definition` points at the `Dockerfile`, so the image is the same one
you get locally.

Give the app a **persistent directory** mapped to `/app/data` (Apps → your app
→ App Configs → Persistent Directories). Without one the game still works, but
a redeploy forgets which worlds exist and what was in them; the players' own
devices do not, so they can simply carry on and the world is re-registered on
the next visit.

Two settings on the app's **HTTP Settings** page have to match the image:

- **Container HTTP Port: 8080** — CapRover assumes 80 when the field is empty,
  and the server listens on 8080.
- **Websocket Support: on** — CapRover's nginx only passes `Upgrade` and
  `Connection` through when that box is ticked. Without it the page loads
  perfectly and the two players never find each other.

Then add the domain, enable HTTPS, and force it.

Two environment variables are worth knowing about:

| | |
|---|---|
| `DATA_DIR` | where worlds are kept (`/app/data` in the image) |
| `WORLD_TTL_DAYS` | how long a world nobody opens survives (14) |

### How much data is this, and when does it fall over

Measured, not guessed. `npm test` keeps the shape of it honest — not the exact
byte counts, which would go stale on every content change, but the claim that
matters: that a world is about this size and that playing it does not make it
grow.

- **A world is about 10 KB** serialised, and it stays that size. The terrain
  grid dominates it and the journal is capped at 40 entries, so a world played
  every weekend for a year is the same size as a fresh one: 9,630 bytes fresh,
  10,372 after ten play blocks, 10,380 after thirty. Gzipped it is 1.9 KB.
- **A world on disk is ~10 KB** including its directory entry. So 1,000 worlds
  alive at once is 10 MB, and 100,000 is about 1 GB. With a 14 day expiry,
  "alive" means "played in the last fortnight". Storage is not going to be the
  problem.
- **The relay is the problem, and it is bandwidth.** The host broadcasts a full
  world snapshot every 1.2 seconds: about 70 kbit/s per playing pair, in and
  out again. Measured on this code with real snapshots: 200 pairs is
  14 Mbit/s, 1,000 pairs is 70 Mbit/s, and the relay's CPU cost is small enough
  that a single Node process is nowhere near it (22% of one core at 1,000
  pairs, and that number includes the 2,000 simulated browsers).

So one small box gets uncomfortable somewhere under **1,000 concurrent
pairs**, on egress. A play block is five minutes, so if daily play is spread
over four evening hours, that is roughly 50,000 families playing every day. To
get past it, in the order the effort is worth it:

1. **Snapshot less often, or only what changed.** Guests already apply their own
   actions immediately; the snapshot is a correction, not the game. Halving the
   rate halves the bill.
2. **Turn on `permessage-deflate`.** These snapshots gzip 5:1.
3. **Run more than one.** Rooms never talk to each other, so any proxy that
   hashes the room name to a backend scales the relay out sideways. The
   directory is the only shared state, and it is small and mostly reads.

### Where the world lives

The world lives in the browsers: whoever connects first runs the clock, and the
other player receives that world and follows it.

Two things outside the browsers remember it as well. The relay keeps the last
snapshot it saw in each room, in memory, for half a day and hands it to whoever
joins next. The host also posts the world to the directory every 30 seconds and
whenever a play block ends, and that copy is on disk: it survives a redeploy, an
empty room, and a fortnight of nobody playing.

So it no longer matters who opens the page first, or whether the child's iPad
has been wiped since Saturday. When nobody is running the clock, a browser takes
whichever world has got furthest — the relay's, the directory's, or its own
save — and carries on from there. The directory refuses a snapshot older than
the one it already holds.

**Start this world over** is the one time an earlier world is meant to win, and
it is why it is not a forgetting: clearing this device would leave the relay and
the directory both holding the old village, ready to hand it back a moment
later. So it makes a fresh world instead and pushes it everywhere the old one
reached — the browser, the other player, the relay's memory, and the directory,
which takes a tick 0 world when it is told this is a reset. Then the first
morning begins where you are standing, with no trip through the front door.

Nothing about this needs a database: a world is one JSON file in `$DATA_DIR`
(`/app/data` in the image), rewritten every few seconds while it is being played
and deleted when it expires. Running the clock on the server too is still the
half that is missing, and `Session` is still shaped for it — see
**Multiplayer** below.

## Languages

The game picks its language from the device and remembers what you choose; the
flags at the top of the start screen switch it. A parent playing in English and
a child playing in German can share one world: notices, the journal and
everything a villager says are stored as a key and its values, never as a
finished sentence, so each screen renders them in its own language.

English and German ship today, and more are welcome — a language is one file in
`src/i18n/`. Every language has to be complete before it ships: the tests check
that every string exists in every table, that the `{name}` and `{n}` slots
match, and that plurals come in pairs. There is no silent fall back to English.

## The two players

|                | 🔨 The Builder                     | 🌿 The Keeper                    |
|----------------|------------------------------------|----------------------------------|
| knows how to   | fell trees, saw planks, build bridges, houses, boats, run the mill | look after animals, move them, lay roads, work the field, fish, plant trees |
| tends to have  | wood, planks                       | stone, food, wheat, wool         |

Neither gets far alone, and that is the point: it gives you something to say.
Bread needs the Keeper's wheat and the Builder's mill. A bridge needs the
Builder's planks and stone the Keeper is usually carrying. A road on the far
bank is no use until somebody bridges the river — which is widest where it runs
off the top and the bottom of the map and narrowest at the crossing, so the
place to build it is the place it looks like.

Your seat follows you, not your browser. A world has two spots and the
directory hands one to whichever browser asked first — so opening the same
world in a second browser, or saving it to the Home Screen, used to arrive as a
third person and be told the village was full. Now it asks which of the two you
are and lets you carry on, and there is a link behind your own chip that says
which seat you are so the next device never has to ask.

**Neither of you can send the other anything.** Tapping a thing always says what
it needs; when it needs the other player's hands, it says whose job it is and
stops there. You are already on a call — saying it is better than typing it, and
a message queue in a children's game is a worse version of a conversation.

Roles are not fixed. Do something two or three times and a "show them how"
button appears on your role card — teach it across, and you both know it.

## What you can do

The world shows you **one thing at a time**. It lives behind your own role chip
in the top row, with a red number on it; tapping it opens the card: the thing
said as something to do — **"Build a house for Ted!"**, not "Ted has nowhere to
sleep tonight" — and the numbered steps that would get there, each labelled with
who can do it. When that is done, the next thing steps up. No hurry, no list to
work through, no sense that you are behind.

Nothing is laid over the village itself. A card you tapped away used to come
straight back a moment later, over the very tree you were trying to fell; now
the number on the chip is the whole of the world's nagging.

Three things keep that card honest:

- **It says what to do.** A title is an invitation, never a verdict.
- **Anybody it names is somebody you can see.** Ted is drawn on the card in the
  same lines the world draws him in, the view moves to him behind the card, and
  a soft ring follows him about for a while afterwards. A name is never just a
  name.
- **Every step that can be counted carries its count.** `3/5 🪵`, `1/5 🪚`,
  `3/3 🪨 ✓`. A tick with a number next to it explains itself; a bare tick does
  not.


| | |
|---|---|
| 🪓 **Fell a tree** | Pick which way it falls, then swing the axe by tapping the trunk. It goes where you cut it — unless you drop it into the wind, and then it goes wherever it likes. |
| 🪚 **Saw a log** | Every log arrives with an order — three pieces of four, two of six, four of three — drawn above the log at the same scale. Pieces that match become planks and land on the stack; the rest is kindling. Each log is measured on its own. Cut three logs perfectly and the drawn example goes: what is left is **4 × 3** and the ruler under the log. |
| 🌉 **Build the bridge** | Stand piers in the river. A beam reaches two gaps on its own; three sags; four goes in the water, taking a villager with it. Try it before you build it — trying costs nothing. |
| 🏠 **Put a house up** | One tap and a small price: four walls, a door, a window and a bed. Somebody can move in the same afternoon. |
| 🛏️ **Furnish a house** | Tap a house and the front wall comes off. A shelf of things to put in, one small price each, and the people who live there are in the room using what you gave them. It never finishes, and either player can bring something. |
| ✏️ **Make the thing** | Nothing is bought with a tap. Take a lamp off the shelf and write LAMP, letter by letter, each one going green as it is finished — or switch to the picture and trace a candle instead. Any stroke order, no wrong answers, and the word is in whichever language you are playing. |
| 👋 **Tap a person** | Their name floats up and they wave, wink, hop, or go bashful and trot off. No card, nothing to read. Two of them squabbling stop when either is tapped. |
| 🐑 **Look after a sheep** | She does not say what she wants. She droops, or eyes the river, or gets very woolly. Drag over what you think she needs. Wrong guesses are funny and free. |
| 🛤️ **Lay a road** | Drag across the ground. One stone for every two steps, counted as you drag. People immediately start using it. |
| 🌱 **Work the field** | Sow, then carry water. The can holds three plots and the field has six. |
| 🌀 **Run the mill** | Turn the stone with your finger, then bake. Two wheat, three loaves. The ring round the stone fills as you turn it and ten boxes fill one by one beside the number, so *70%* and *seven out of ten* say the same thing at the same time. |
| 🪣 **Dig a well** | Until there is one, everybody drinks from the river — and sooner or later somebody has a poorly tummy: a slow walk home and a sit down, nothing worse. A well is clean water, and a trough the sheep find on their own. |
| 🚪 **Build the little house** | The one at the bottom of the garden. What used to end up in the river stops doing so, which is why the water was not safe and why the fishing was poor. Either it or the well settles the tummies; both is a tidy village. |
| 🚧 **Fence the wheat field** | Six planks of posts and rails with a gap to walk through. The sheep keep to the meadow — unless you take one in yourself, which still works. |
| ⛵ **Build the fishing boat** | Four planks and a stone at the old landing on the west bank. Then somebody has to take her out. |
| 🎣 **Go fishing** | Cast, watch the float, and tap the moment it goes under. Too early and the line comes up empty. Three casts, then row back — the fish go quiet for a while. |
| 🛝 **Build the playground** | A swing, a slide and a sandpit on the green by the water. Lina and Sam go and use it, which is the whole point of it. |
| 🌱 **Plant a sapling** | Every stump was a tree. Put a sapling in and it grows back into one while you play. |
| 🤝 **Share** | Tap any resource to send some across. Or drop food in the village basket, where the hungry go looking. |
| 🧺 **The basket** | Tapping it does the sum out loud: this many loaves, this many people, about this many a day — so about this many days. Somebody moving into a new house makes it fewer, which is the part worth seeing. The numbers come from the simulation's own constants, so the answer cannot drift away from what actually happens. |

Anything that costs materials shows the cost as the materials themselves — one
picture per plank and per stone, the ones you have in colour and the ones you
are missing greyed out. Messages from the world wait on screen until somebody
taps them away.

Nothing worse than discomfort ever happens to anybody. Somebody can be hungry,
poorly, cold or sleeping outside, and you will notice — but nobody is hurt,
nobody dies, nobody leaves, and everything that goes wrong can be put right the
same afternoon.

## A day

The day starts when the game does. Nobody agrees to anything first, and there is
no clock: the light says how late it is. Pale and cool at dawn, clear at midday,
gold in the afternoon, and then the sun goes and everybody walks home. Windows
come on one by one. The people who have a bed go to it; the one who hasn't is
still standing outside, which is the whole reason you notice them.

Then it is night, and the next morning follows on its own: nothing is said, no
card to tap away, the village simply wakes up again a day older. The world is
saved on the way past, exactly as it is, with nothing rotting while you are
away.

In between, the village gets on with itself. People dance, run, sit down, stop
and natter in twos, walk over to the basket when bread turns up in it, and every
so often two of them squabble until somebody taps them. None of it ever happens
instead of something that matters — it is chosen after the bread, the bed and
the log on the grass, and never before them. All of it comes out of the world's
own seeded dice, so both screens are watching the same afternoon.

The village is silent. Whatever you are saying to each other on the call is the
only soundtrack it needs.

## The two rows

The top row is the people playing: one chip per role, yours marked, the others
showing whether they are at their screen. Tapping your own opens the one thing
worth doing next, counted by the red number on the chip — what you can do, and a
tally of what you have already done: felled three trees, built a house,
harvested six fields. Tapping theirs opens what you do together: giving them
something, and teaching them anything you have done often enough to show. The
language, starting over and the way back to the start screen sit behind the day,
on the right. The bottom row is nothing but what we have.

Between them sits **👥**, and it is a list of everybody who lives here: their
name, whose house they are in, and what they want — with what they are doing
this minute in its place when they are doing something worth saying, which is
how a squabble asks to be broken up. The sheep are under a divider at the
bottom, because they have names too and a child looks for them. Tapping any row
takes the world to them and puts a ring round them while you look.

The world can be pushed about further than it fills the screen — far enough to
bring any corner of it into the middle — so anything at all can be tapped in
clear air rather than up against the top bar.

## How it is put together

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

### Multiplayer

One peer hosts: it runs the clock, applies actions and broadcasts a full world
snapshot roughly once a second. Guests apply their own actions immediately so
the game feels instant, send them on, and get corrected by the next snapshot
(positions are blended in, so nobody teleports).

The correction is not allowed to undo you, which is subtler than it sounds. A
snapshot that left before your action arrived carries a world your action never
happened in, and swapping it in whole used to take a road back out from under
the very player who had just laid it. So a guest names each action and holds
onto it until the host says it landed; anything still unacknowledged is replayed
onto an arriving snapshot before it is adopted, and let go of after five seconds
so an action the host genuinely refused does not haunt every snapshot for ever.
The host is still the authority — it just cannot silently overrule something it
has not seen yet.

That is the same shape a real server needs. Moving the host into Node means
implementing `Transport` and running `Session` there; nothing above the seam
changes.

### Browser support

It has to work on an **iPhone** and on an **iPad**, on current iOS Safari, both
in the browser and saved to the Home Screen. That is the target, and the
play-through walks all three shapes — phone, tablet, laptop — on every run.

What matters is the shape of a phone: the `--safe-t/-b/-l/-r` variables for the
notch, `--app-h` for the part of the screen actually being shown, device pixel
ratio capped at 2, terrain painted once into an offscreen canvas and re-used,
and a frame that is one blit plus a few dozen small shapes.

## Tests

```
npm run verify          # everything: unit tests, a play-through, German, the lobby, /stats
npm run verify -- quick # just the unit tests and a shortened play-through
npm test                # the unit tests: simulation, schema, guide, i18n, relay, worlds, stats
node tools/lobby.mjs    # two browsers find each other without typing anything
node tools/stats.mjs    # the page at /stats, with some worlds put in first
```

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

## What is new

The start screen says which version this is at the bottom, next to **✨ What is
new**, and tapping it opens the changelog. The same list is under 📜 (what has
happened) once you are in the world, next to **🏡 Back to the start screen**,
which saves the village and puts you back at the front door with its name
already filled in. (The role card has the same way out.)

Every version is listed newest first, in whichever language the screen is in. It
lives in `src/core/changelog.js`, outside the language tables, so an entry can be
written once and shipped without waiting for the other language. Real features
get an entry; bug fixes and internals ship quietly.

### Fetching the game again

Added to an iPhone or iPad Home Screen, the game runs without an address bar and
without a reload button, and iOS keeps it alive in the background for days — so
it can be a fortnight old with no way of knowing and no way out. **↻ Fetch the
game again** is that way out. It sits next to the version at the front door and
under 📜 in the world, it is always there, and it saves the village before it
goes.

But a door only helps somebody who thinks to open it, so the game no longer
waits to be asked. It puts the question to `/version` whenever the app comes
back to the front and on a slow timer besides — at most once a minute, however
often it is prompted — and when a newer build is live it fetches it itself.

Not straight away: it waits for a moment nothing can be lost in. No panel open,
no menu open, no road half drawn, no finger down, nothing half typed at the
front door. When that moment comes the village is saved to this device *and* to
the server, one line says what is happening, and the page comes back a blink
later on the same world. Never in the first twenty seconds of a page's life, and
never twice — a reload loop would cost far more than a stale copy does.

The doors stay, and still say **✨ A newer version is ready — fetch it**, for
anybody deep in a mini-game while the fetch politely waits. Nothing pops up and
nothing ever reloads out from under a finger. On a plain static host there is no
`/version` to ask, so nothing is ever claimed to be out of date and nothing is
ever fetched — the door still works, it just never lights up.

## What is deliberately missing

No streaks, daily rewards, coins, energy, loot boxes, timers that punish you,
leaderboards, notifications, chat, accounts, adverts, or anything that gets
longer the more you play. Nothing decays while you are away and nothing asks you
to come back.

That list is not a mood — it is written down as a binding anti-list in
`CLAUDE.md`, and nothing on it goes in without the owner saying so.

The conversation happens on the call. The game only has to be worth talking
about.
