# Our Little World — the rules for changing it

A calm cooperative browser game for two people, usually a parent and a child on
two devices in two different places, with a video call running separately.

`README.md` describes **what the game is** and how to run it. This file is
**what must be true of any change**. Where they overlap, this file wins — and
if you find them disagreeing, that is a bug in the documentation: fix it in the
same commit as the code.

Read the laws first. They are not style preferences; they are the game.

---

## 🧭 Who this is for

A **child of about six to ten who can read**, and a grown-up. Both playing at
the same time is the good case; one of them alone is the common case.

- Short sentences are fine. Long paragraphs are not.
- Numbers up to twenty are fine. Arithmetic the child has to do in their head
  to make progress is not.
- Nothing may *require* reading to be understood — a picture, a count and a
  place to tap should carry it — but reading is allowed to make it richer.
- A sitting is **five to fifteen minutes**, a few in-game days. `BLOCK_TICKS`
  (five minutes, one day) is deliberate and stays.

## ⛔ The anti-list — binding

None of these goes into this game. A future session **must ask the owner
before crossing any of them**, and "the user asked for a feature that implies
one" is not permission — say which law it crosses and wait.

- No score, no stars, no rating, no percentage of completion.
- No streak, no daily reward, no "come back tomorrow", no calendar.
- No currency, no coins, no shop, no energy, no unlocks bought with time.
- No timer that punishes, no countdown, no thing that expires unplayed.
- No leaderboard, no comparison with anybody else, ever.
- No push notification, no badge, no email, nothing that asks you to return.
- No chat, no free text between players, no emoji-pings, no request queue.
- No account, no login, no password, no personal data of any kind.
- No advertising, no analytics that belongs to a person, no third-party script.
- No generated content at runtime: everything a player sees was written or
  drawn by a human, in both languages, before it shipped.
- Nothing that gets longer the more you play. Nothing that decays while away.

## 📏 The laws

**1. One mission at a time.** The guide shows exactly one thing. No hurry, no
multitasking, no urgency — just what a next step could be. `MAX_ACTIVE = 1` in
`src/core/guide.js`, and it is not a tuning knob.

**2. The world picks the mission, by fixed priority.** `allProblems()` walks
`CONCERNS` in order and the first one that applies is *the* mission, the same
one on both screens. **The order of `CONCERNS` is therefore the whole design.**
A new concern's place in that list decides whether anybody ever sees it. Put it
where it belongs, not at the end.

**3. Nothing is laid over the world.** The village is the tap target. What
needs doing lives behind your own role chip, with a red number on the chip.
Nothing pops up over the map, and nothing reloads out from under a finger.

**4. Nobody sends anybody a message.** There is no way for one player to say
anything to the other through the game. Tapping a thing always explains what it
needs; when the hands for it belong to the other player it says *whose job* it
is (`w.theirJob`, verb from `verb.*`) and offers no button. Anything the other
player "needs from you" is **derived from the world state, never composed and
never sent**. A new thing to do needs a `verb.*` string in every language and
`theirs(game, [verb])` in its hint when `can()` says no.

**5. The game never ends.** There is always a next thing. The `calm` card is
the floor, not a finish. No completion screen exists or will.

**6. Discomfort only, and always fixable.** Somebody can be hungry, poorly,
cold, or sleeping outside — visibly, so you notice, and fixable by the two
players that same afternoon. Nobody is ever injured, nobody dies, nobody leaves,
nothing is permanently lost. A wrong guess is funny and free.

**7. Needing each other is about conversation, not gating.** The two roles know
different things so that there is something to say out loud. It is fine for one
player to finish something alone; it is not fine for the game to feel like two
separate games. When in doubt, split the *cost* across roles (planks are the
Builder's, wool and stone the Keeper's) rather than locking the *action*.

**8. Solo play is a fallback, not a design target.** One person can always do
their own half, and being blocked on the other is a feature — it is what the
call is for. Do not invest in making a lone player self-sufficient.

**9. Only kind things happen while nobody is there.** Saplings grow, wheat
ripens, wool comes in. Never hunger, never decay, never a problem that arrived
on its own. Coming back is a small gift.

**10. Coming back explains itself.** The welcome-back screen lists what the
*other player* did since you were last here — new buildings, gifts received
("5 wool, 2 planks"), resources gathered, problems solved. A list of facts, not
a message, and never a summons: it exists only once you have already chosen to
open the game.

**11. Never reset somebody's world.** See below — this one has teeth.

**12. Never take back what somebody just did.** See below — this one cost a
road once.

**13. Silence.** The game makes no sound. The audio channel is the video call
the two of them are already on, and game audio would fight it.

**14. Every string in every language, complete.** `src/i18n/` tables must all
have every key, with matching `{name}`/`{n}` slots and plurals in pairs. The
tests fail otherwise. Nothing ships half-translated; there is no runtime
fallback to English. Adding a language is welcome and is one file — finished.

---

## 🔁 The loop: verify, ship, check

```
npm run verify -- quick     # while working: unit tests + a shortened play-through
npm run verify              # before pushing anything a player can see
git add -A && git commit    # then push to main (see below)
npm run deployed            # after pushing: is that code actually live?
```

`npm run verify` brings up its own server on a free port and takes it down
again. **Do not start a server by hand for testing, and never `pkill` broadly** —
a wide `pkill` has killed a running test's browser mid-run and cost a whole
cycle. If something must be stopped, name it exactly.

- **`npm run verify`** runs the unit tests, the browser play-through
  (`tools/smoke.mjs`), the German pass (`tools/german.mjs`), the matchmaking
  pass (`tools/lobby.mjs`) and the stats page (`tools/stats.mjs`), and exits
  non-zero on the first failure. About five minutes; run it in the background
  and wait for it rather than polling — one
  `while pgrep -f 'tools/(smoke|german|lobby|stats).mjs'; do sleep 15; done`
  beats ten `sleep`s.
- **`npm run verify -- quick`** keeps the unit tests and every assertion in the
  play-through, and drops the screenshots, the second browser, the walk round
  three screen sizes, German, the lobby and the stats page. About a minute. For
  iterating, and it is enough before a push **because CI runs the full gate**.
- **CI is the real gate.** The full `npm run verify` runs in GitHub Actions and
  **a failure blocks the deploy**, so players keep the last good build. Never
  make the deploy step independent of it.

## 🚀 Branch and deploy

- **All changes go straight to `main`.** There is no dev deployment yet, so
  `main` is what people play. A push to `main` runs `.github/workflows/deploy.yml`:
  verify first, CapRover second.
- After `git push origin main`, point any session working branch at the same
  commit (`git branch -f <branch> main && git push -f origin <branch>`) so the
  two never drift.
- **A green workflow only means CapRover accepted the deploy.** To know the new
  code is being served, ask the site: `GET /version` answers
  `{ version, schema, build, startedAt }`, where `build` is a hash of every file
  that ships (`server/buildid.mjs`, also `npm run build-id`). `npm run deployed`
  compares the live `build` with the working tree's and waits up to three
  minutes for them to match. **The push is not finished until that says yes.**
- The site is <https://ourlittleworld.timpanini.com>; `npm run deployed` knows
  that address, and takes another as an argument or in `DEPLOY_URL`. If a
  sandbox will not let a session reach it, check the workflow run instead and
  say plainly that the deployment itself was not verified from here — do not
  call it live. And check the host before assuming it: this one was guessed
  wrong once, from a truncated address bar.
- Only what ships is hashed — the page, `src`, `styles`, `server`, `icons`. A
  change to the tests or the docs leaves the build id alone, which is right:
  nothing a player downloads changed, and `npm run deployed` will still say yes.
- The same id is written into the page it serves (`<meta name="olw-build">`),
  so a copy on somebody's screen knows whether it is still the one being served.
  `src/core/fresh.js` asks whenever the app comes back to the front and on a
  slow timer besides, and then **fetches the newer build itself** — nobody on a
  Home Screen ever reads a door. It waits for a quiet moment first (no panel,
  no menu, no mode, no finger down, nothing half typed), saves the village to
  this device *and* the server, and says one line on its way out. Never in the
  first twenty seconds of a page's life and never twice: a reload loop is far
  worse than a stale copy. Nothing pops up, and nothing reloads out from under
  a finger. The **↻ Fetch the game again** doors stay, for anybody deep in a
  mini-game while the fetch politely waits. Test it against a stamped server:
  the page is `content="dev"` on disk and on any host that does not stamp it,
  and that is the signal to keep quiet, not a bug.
- **The static-host path stays supported.** Served from a plain file server or
  GitHub Pages there is no directory, no relay and no `/version`; the page asks
  `/api/health` once, remembers the answer, pairs browser-to-browser and never
  claims to be out of date. Do not add anything that only works with the Node
  server without a graceful nothing-happens on a static host.

## 📓 Changelog and version

`src/core/changelog.js` holds `VERSION` and the entries, outside the language
tables, so an entry can be written and shipped without waiting for a translation.

- **Real features earn an entry and a version bump**, written warmly, in every
  language, newest first. The changelog is something a parent and a child
  actually read together.
- **Bug fixes, refactors and internals ship silently.** No entry, no bump.
- Nowhere else states the version. If you find a version number written into a
  doc or a page, delete it rather than updating it — it will go stale again.

---

## 🏡 Never reset somebody's world

A saved world is brought up to date on load; it is never thrown away.

- **Adding something** — a project, a villager, a plan, a scenario, a field
  with a sensible default — goes in `src/core/content.js` and is picked up by
  `ensureWorld()` in `src/core/world.js`. **No schema bump.**
- **Changing what an existing field means** needs a numbered step in
  `src/core/migrate.js` *and* `SCHEMA` in `world.js` going up by one, in the
  same commit. Never delete an old step.
- Free-form room for extensions already exists: `w.ext` (namespaced data) and
  `w.flags` (one-off switches). Both survive save, load and the network.
- Roles come from the `ROLES` table and regions from a scenario's `regions`;
  both are filled in by `ensureWorld()`, so a third role or a new part of the
  map costs nobody their village either.
- Only a world saved by a *newer* build is refused, and `persist.js` keeps it
  under `olw.world.<room>.kept` rather than overwriting it.
- **Three things remember a world**: this device (`persist.js`), the relay's
  in-memory copy, and the directory's file on disk. Clearing one of them clears
  nothing — the other two hand the world straight back on the next visit. That
  is what `Session.startOver()` is for, and why the directory takes a tick 0
  world only when it is told this is a reset.

## ↩️ Never take back what somebody just did

A guest applies its own actions at once so the game feels instant, and the host
is still the authority — but a snapshot that left before the action arrived must
never be allowed to undo it. That cost a road once, on the screen that laid it.

- `Session.dispatch()` names every action and, on a guest, keeps it in
  `pending`. The host acks each action it applies; `reconcile()` replays
  everything still pending onto an incoming snapshot before adopting it.
- Five seconds without an ack and it is let go, so an action the host really
  refused does not haunt every snapshot for ever.
- So an action must stay safe to apply twice. The reducer already does this by
  checking state first — a felled tree is not standing, a laid road is already
  road — and a new action has to hold that line or it will double up in the
  race window.
- The handshake matters too: a reconnect says hello again, an undecided peer
  echoes hello back, and anybody who hears a lower peer id than their own waits
  rather than racing for the clock. `tests/session.test.mjs` wires two real
  sessions together and covers all of it.

## 🪑 A seat belongs to a person, not to a browser

A world holds two spots and the directory gives one to whichever browser asked
first, remembered by a random `device` string in `localStorage`. That is fine
until the same person turns up in a second browser — a new phone, a private
window, or the Home Screen copy of a world already open in Safari, which has
storage of its own. They arrive as a third person at their own village.

- So **a full world is never a closed door**. `enter()` in `start.js` plays
  anyway whenever it knows which of the two you are; when it does not, the
  `seat` step asks, and answering is enough. Nobody is evicted — the relay is
  what actually pairs two players, and it is happy to.
- `?world=X&role=A` is that answer written down. `openSeat()` hands it to you
  from behind your own chip, for your own second device. It is not the
  invitation: `shareWorld()` stays roleless, because the other player should
  get a seat of their own rather than yours.
- **`site.webmanifest` deliberately has no `start_url`.** iOS would use it
  instead of the address a world was added from, and the world's name lives in
  that address — a `start_url` would quietly send every Home Screen icon to an
  empty front door. `tools/smoke.mjs` fails if one appears.
- The icons are generated, not drawn: `node tools/icons.mjs` rewrites
  `icons/app-*.png` from one `colourAt()` function. They are committed because
  a browser asking for an icon cannot wait for a build step, and they are in
  the build hash and in the Dockerfile's `COPY` list like anything else that
  ships.

---

## ➕ Adding things

### A project

One row in `PROJECTS` in `src/core/content.js` (cost, which capability builds
it, how to ask for it, its journal icon, the message when it goes up, and the
`text` keys for its bubble), one `plans` entry in the scenario saying where it
goes, art in `render/art.js` plus a line in the renderer's building switch,
strings in **every** language table, a `CONCERNS` entry if the guide should
mention it — **placed where it matters in the order, see law 2** — and a step in
the smoke test's project loop. `project.build` is the only action needed; there
is no per-project action.

Split the cost across roles on purpose (law 7). A project one role can pay for
alone is a missed conversation.

### Something to put in a house

A house is raised in one action and furnished for ever. One row in `HOUSE_STUFF`
in `src/core/content.js` is the whole cost of another thing: what it costs,
whether it hangs on the wall or stands on the floor, the one plain thing it
`gives`, and what it adds to `comfort`. Then its name in every language table,
its place in `HOUSE_SHELF`, and **a row in `SHAPES` in `trace.js`** (see below).

- **Nothing else writes a house's `beds`, `warm`, `light`, `flame` or
  `comfort`.** `houseFit()` in `world.js` derives all five from `b.stuff`, so
  they can never drift from the furniture actually in the room. `ensureWorld()`
  calls it on load, and a house saved before any of this existed gets the
  furniture it was already behaving as though it had.
- **`b.lamp` belongs to the simulation**, and means a lamp is burning this
  minute. `b.flame` is the derived "there is something in here to light" that
  it checks. Do not confuse them; that cost a round-trip test once.
- **Furniture is named by the slot it stands in**, never by an id. An id handed
  out on one device is not the same id on the other, and `house.move` has to
  mean the same thing on both screens.
- Both `house.put` and `house.move` refuse a slot that is already occupied,
  which is also what makes them safe to apply twice — see *Never take back what
  somebody just did*.
- What somebody is doing in the room is worked out from the furniture and
  `w.tick`, with no rng anywhere, so both screens show the same room doing the
  same thing without exchanging a word about it.

### Tracing something into being

Furniture is written or drawn before it can be placed, **because a tap is free
and free is the wrong price**. Effort is the point; the letters are how the
effort is spent, not a literacy exercise the game owes anybody.

`src/minigames/trace.js` does it; `src/core/letters.js` is the alphabet, as the
strokes a hand makes rather than the shapes a printer prints.

- **Both ways have to exist for every thing.** A row in `HOUSE_STUFF` needs a
  row in `SHAPES` in `trace.js` as well as its name in every language table, or
  the picture half has nothing to show. The play-through traces one of each.
- The word traced is `tr('house.' + kind)` uppercased, so it is the word in the
  language being played. A letter with no strokes is skipped rather than
  blocking, and a word with no traceable letters at all simply hands the thing
  over.
- **It forgives on purpose.** Every unfinished stroke is offered every point the
  finger passes, so strokes can be done in any order; a lifted finger keeps its
  progress; the gap between two frames is filled in; and nothing is ever marked
  wrong. Changing that changes what the game is for.
- `game.tracing` is the live tracer, and exists only so a test can follow a line
  whose shape it has no other way of knowing. Nothing in the game reads it.
- **It is currently pitched too young** for a six-to-ten-year-old reader. It is
  meant to grow up — see `TODO.md`.

### A task for the guide

One entry in `CONCERNS` in `src/core/guide.js`, **in the order it matters**, plus
a card function. A card says what to *do*, names who it is about (`subject`, so
the card can draw them and the view can find them), and gives every countable
step a `count` so a tick explains itself.

Three rules keep a card honest:

- **It says what to do.** "Build a house for Ted!", never "Ted has nowhere to
  sleep." A title is an invitation, never a verdict.
- **Anybody it names is somebody you can see.** Drawn on the card in the same
  lines the world draws them in, the view moves to them, a soft ring follows
  them about afterwards.
- **Every step that can be counted carries its count.** `3/5 🪵`, `1/5 🪚`,
  `3/3 🪨 ✓`. A bare tick explains nothing.

Only the **first** applicable concern is ever shown (law 1), so where you put it
in the list is the decision. Everything else is the queue behind it.

### A deed, a notice, a language

- A tally of what somebody has done is one row in `DEEDS` in `hud.js` plus its
  strings; it reads the `done` count `actions.js` already keeps.
- `w.notices` still exists and the simulation still raises them. They surface
  under *What has happened*, except where `NOTICE_JOB` in `hud.js` says the
  mission already covers one — the empty bread basket is not worth saying twice.
- A language is one file in `src/i18n/`, complete, with the tests green.

---

## 🔭 The camera reaches every corner

`clampCamera()` lets the camera travel anywhere from `0` to `WORLD_W`/`WORLD_H`
in both directions — **not** only far enough to keep the world filling the
screen. Anything a player has to tap can be brought to the middle, away from
the top bar and the notch, and its bubble opens in clear air.

That is easy to undo by accident: the world is framed to *cover* the viewport,
which makes one axis fit exactly, and any rule of the form "if this axis fits,
pin it to the middle" silently kills panning on that axis — on a phone, always
the vertical one. The maximum zoom is a size on the glass (`MAX_TILE_PX`), not
a bare number, because the same number means a different thing on a phone and
on a laptop. `tools/smoke.mjs` checks both on every screen size it walks.

## 📊 Counting how much this gets played

`/stats` is public, so the rule is simple: **nothing that belongs to anybody
goes into `server/stats.mjs`.** No addresses, no device ids, no world names, no
times of day — a calendar day is the finest grain, and `tests/stats.test.mjs`
reads the whole report back to make sure none of those has crept in.

Counting rides along with what the directory already writes: each world carries
which days it has been counted on and the furthest it got, and a world folds
that last part into the ledger on its way out. A new entry in `PROJECTS` becomes
a milestone on its own — give it a line in `MILESTONES` and `DEEDS` in
`stats.html` so it is called something, and there is nothing else to do.

The page is `stats.html`, served at `/stats`, and it is in the build hash like
anything else that ships. One green (`#5d9150`, the Keeper's) for every chart,
because every chart there has one series; bars are capped at 24px so they never
fill their slot; and every chart keeps its numbers in a table underneath, so no
value is reachable only by hovering. `tools/stats.mjs` looks at it in a browser
during `npm run verify`.

## 🧪 Writing browser tests

- **People answer a tap before the ground does.** A villager standing on the
  workshop door or the landing will open their own bubble instead. Use the
  `tapTile` helper in `tools/smoke.mjs`, or `tapWorld` in `tools/german.mjs`:
  they pick a spot nobody is standing on *and* check `document.elementFromPoint`
  really lands on the canvas, so a toast or a panel cannot swallow the tap.
- **Wait for what the tap should open, not for something to open.** A bubble
  appearing is not proof it is the right bubble; say which words you expect and
  try again until they are there. That is the difference between a test that
  fails once a fortnight and one that means something.
- Prefer waiting for a condition (`waitForFunction`) over a fixed sleep, and
  poll for arrival rather than assuming a walk takes n ticks — sheep wander off
  again once they get there.
- The relay remembers the last world per room for half a day, the directory
  keeps one on disk, and one server process outlives several runs, so use a
  fresh world name (`'world=' + Math.random()`) whenever a test needs an
  untouched world. `npm run verify` also gives its server a throwaway
  `DATA_DIR`, so a run never inherits what an earlier one left.
- `tools/look.mjs` is not part of the gate: it takes a screenshot of a world so
  a human can look at it. Handy, not a test.

## ✍️ House style

- Comments say why, not what, and read like the game does: plain, warm, no
  jargon. Names are things in the world (`larder`, `plan`, `landing`).
- Every change to the world is an action in `src/core/actions.js`; the
  simulation stays deterministic (fixed 100 ms ticks, seeded rng in the world).
  Mini-games run entirely on the device that opened them — only the outcome is
  an action, so a wobbly bridge test never travels over the network.
- Strings live in `src/i18n/` — every table, always; the tests check.
- **It has to work on an iPhone and on an iPad**, on current iOS Safari, in the
  browser and saved to the Home Screen. That is the whole target: there is no
  old-Safari floor any more. Layout still uses the `--safe-t/-b/-l/-r`
  variables for the notch and `--app-h` for the part of the screen the browser
  is actually showing, because those are what a phone needs.
- **Modern JavaScript everywhere.** The code was once written down to Safari 12
  and avoids optional chaining, `??` and flexbox `gap`. That floor is gone and
  a one-off sweep to modern syntax is planned (`TODO.md`); until it lands, write
  new code modern and do not imitate the old style.
- A panel is a scrolling middle and a foot that does not move; buttons live in
  the foot so nothing can push them off a phone screen.
- **The art is drawn in code by default** — every tree, sheep and roof is `ctx`
  calls, which is why it is tiny, themeable and sharp at any zoom. This is a
  strong default, not a law: if a real illustration would genuinely make the
  village better, an image asset is allowed. It then ships in the build hash and
  the Dockerfile's `COPY` list like everything else, and it must not delay first
  paint.

## 🌱 Kept warm on purpose

Two things exist in the code, unused, and are **the plan** rather than dead
weight. Do not remove them; build toward them.

- **A third role.** `ROLES` is a table and `world.players` is built from it, so
  a Cook — bread, the larder, something warm out of what the other two bring in
  — is one entry plus a line in a scenario's `roles`. The seat appears in worlds
  saved before the role existed. Note it does not weaken law 7: more roles means
  more to say, not more gates.
- **A map that opens up.** A scenario's `regions` are named boxes, each either
  here or not yet. A closed one is baked into the blocked overlay (so it costs
  the pathfinder nothing) and drawn as soft weather rather than a wall;
  `{ type: 'region.open' }` is how the hills stop being a rumour.

A second scenario is a second entry in `SCENARIOS` — an island where the boat
comes first, a winter valley, a hill farm — and `w.scenario` remembers which one
a saved world came from.
