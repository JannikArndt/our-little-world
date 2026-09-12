# Our Little World — working notes

A calm cooperative browser game for two people. Plain ES modules, a 2D canvas,
no build step, no dependencies. Read `README.md` first; this file is the short
list of rules for changing it.

## The loop: verify, ship, check

```
npm run verify -- quick     # while working: unit tests + a shortened play-through
npm run verify              # before pushing: everything, incl. German and the lobby
git add -A && git commit    # then push to main (see below)
npm run deployed            # after pushing: is that code actually live?
```

`npm run verify` brings up its own server on a free port and takes it down
again. **Do not start a server by hand for testing, and never `pkill` broadly** —
a wide `pkill` has killed a running test's browser mid-run and cost a whole
cycle. If something must be stopped, name it exactly.

- **`npm run verify`** is the gate before every push of anything a player can
  see. It runs the unit tests, the browser play-through (`tools/smoke.mjs`), the
  German pass (`tools/german.mjs`) and the matchmaking pass (`tools/lobby.mjs`),
  and exits non-zero on the first failure. It takes about five minutes; run it
  in the background and wait for it rather than polling — one
  `while pgrep -f 'tools/(smoke|german|lobby).mjs'; do sleep 15; done` beats
  ten `sleep`s.
- **`npm run verify -- quick`** keeps the unit tests and every assertion in the
  play-through, and drops the screenshots, the second browser, the walk round
  three screen sizes, German and the lobby. About a minute. For iterating,
  never as the gate.

## Branch and deploy

- **All changes go straight to `main`.** There is no dev deployment yet, so
  `main` is what people play. A push to `main` deploys to CapRover through
  `.github/workflows/deploy.yml`.
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
- Only what ships is hashed — the page, `src`, `styles`, `server`. A change to
  the tests or the docs leaves the build id alone, which is right: nothing a
  player downloads changed, and `npm run deployed` will still say yes.
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

## A seat belongs to a person, not to a browser

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

## Never reset somebody's world

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

## Never take back what somebody just did

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

## Adding a project

One row in `PROJECTS` in `src/core/content.js` (cost, which capability builds
it, how to ask for it, its journal icon, the message when it goes up, and the
`text` keys for its bubble), one `plans` entry in the scenario saying where it
goes, art in `render/art.js` plus a line in the renderer's building switch,
strings in **both** language tables, a `CONCERNS` entry if the guide should
mention it, and a step in the smoke test's project loop. `project.build` is the
only action needed — there is no per-project action any more.

## Counting how much this gets played

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

## Adding something to a house

A house is raised in one action and furnished for ever, which is the opposite
of what it used to be. One row in `HOUSE_STUFF` in `src/core/content.js` is
the whole cost of another thing to put in one: what it costs, whether it hangs
on the wall or stands on the floor, the one plain thing it `gives`, and what
it adds to `comfort`. Then its name in both language tables and its place in
`HOUSE_SHELF`.

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

## Tracing something into being

Furniture is written or drawn before it can be placed, because a tap is free
and free is the wrong price — at five the effort worth spending is learning to
write. `src/minigames/trace.js` does the following; `src/core/letters.js` is
the alphabet, as the strokes a hand makes rather than shapes a printer prints.

- **Both ways have to exist for every thing.** A row in `HOUSE_STUFF` needs a
  row in `SHAPES` in `trace.js` as well as its name in both language tables,
  or the picture half has nothing to show. The play-through traces one of each.
- The word traced is `tr('house.' + kind)` uppercased, so it is the word in
  the language being played. A letter with no strokes is skipped rather than
  blocking, and a word with no traceable letters at all simply hands the thing
  over.
- **It forgives on purpose.** Every unfinished stroke is offered every point
  the finger passes, so strokes can be done in any order; a lifted finger keeps
  its progress; the gap between two frames is filled in; and nothing is ever
  marked wrong. Changing that changes what the game is for.
- `game.tracing` is the live tracer, and exists only so a test can follow a
  line whose shape it has no other way of knowing. Nothing in the game reads it.

## Adding a task to the guide

One entry in `CONCERNS` in `src/core/guide.js`, in the order it matters, plus a
card function. A card says what to *do*, names who it is about (`subject`, so
the card can draw them and the view can find them), and gives every countable
step a `count` so a tick explains itself.

**The order is the whole design.** `allProblems()` walks `CONCERNS` and returns
everything that applies; only the first `MAX_ACTIVE` (two) are ever shown, and
the rest step up as those are finished. So a new concern's place in the list
decides whether anybody will see it this morning — put it where it belongs, not
at the end.

## Nobody sends anybody a message

There used to be a button on every bubble you could not use yourself: *ask the
Builder to fell that tree*. It has gone, and it is not coming back. The two
people playing are in the same room; a line of text crossing the relay is a
worse way of saying something than saying it. Tapping still explains everything
— the field is thirsty, the sheep is woolly, the crossing is four tiles wide —
and when the hands for it belong to the other player it says so in one line
(`w.theirJob`, with the verb from `verb.*`) and offers no button.

So a new thing to do needs a `verb.*` string in both languages, and its bubble
adds `theirs(game, [verb])` to the hint when `can()` says no. Nothing is
dispatched, nothing is queued, and nothing waits behind a chip.

## Nothing is laid over the world

The village is the tap target, so nothing covers it. What needs doing lives
behind your own role chip, with a red number on the chip counting it.

- The number means **jobs**: the two active concerns at the front of the
  world's queue. Never news. A player learns what the number means once, and it
  has to keep meaning it.
- `w.notices` still exists and the simulation still raises them. They surface
  under *What has happened* in the same menu, except where `NOTICE_JOB` in
  `hud.js` says a concern already covers one — the empty bread basket is not
  worth saying twice.
- A tally of what somebody has done is one row in `DEEDS` in `hud.js` plus its
  two strings; it reads the `done` count that `actions.js` already keeps, so a
  new deed usually means one more `tally()` call and nothing else.

## The camera reaches every corner

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

## Writing browser tests

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

## House style

- Comments say why, not what, and read like the game does: plain, warm, no
  jargon. Names are things in the world (`larder`, `plan`, `landing`).
- Every change to the world is an action in `src/core/actions.js`; the
  simulation stays deterministic (fixed ticks, seeded rng in the world).
- Strings live in `src/i18n/en.js` and `de.js` — both, always; the tests check.
- **It has to work on an iPhone and on an iPad**, on current iOS Safari, in
  the browser and saved to the Home Screen. That is the whole target: there is
  no old-Safari floor to write down to any more. Layout still uses the
  `--safe-t/-b/-l/-r` variables for the notch and `--app-h` for the part of
  the screen the browser is actually showing, because those are what a phone
  needs, not what an old phone needed.
- The code as it stands avoids optional chaining, `??` and flexbox `gap` from
  when the floor was Safari 12. None of that has to be kept up. Use whatever
  current Safari has; do not go back and rewrite what already works.
- A panel is a scrolling middle and a foot that does not move; buttons live in
  the foot so nothing can push them off a phone screen.
