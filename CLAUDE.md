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

A **child of about seven**, who can read and write, and a grown-up. Both playing
at the same time is the good case; one of them alone is the common case.

Reading and writing are not yet effortless, and that is the point rather than a
problem: practising letters and precision is still worth an afternoon.

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

**Why villager skills are not on this list.** A villager who has been shown a
job gathers while you watch and while you are away, which sounds exactly like
the thing the last line forbids — so the ceiling is the whole point of it.
There are six villagers and each holds **two** jobs, ever (`MAX_SKILLS`), and
what they can hold is capped where you can see it: six of a thing in their
arms (`BAG_CAP`), twenty on the pile by the workshop door (`PILE_CAP`), eight
jobs brought back from any absence however long (`AWAY_JOBS_CAP`). Twelve jobs
between them is as much as this village will ever do, and it is as much on the
first afternoon as on the hundredth. Raising any of those numbers, or adding a
third job, is the step that would put this on the list — so it needs the
owner, not a session that has just found a reason.

## 📏 The laws

**1. One mission at a time.** The guide shows exactly one thing. No hurry, no
multitasking, no urgency — just what a next step could be. `MAX_ACTIVE = 1` in
`src/core/guide.js`, and it is not a tuning knob.

It lives in **its own button in the top row, next to the player chips** — not
behind your own chip, and with no red number on anything. A count that is
always "1" is nagging without information. The button shows the mission's icon
and opens the card; when the village is calm it is quiet rather than gone, so
the row never jumps about.

**2. The world picks the mission, by fixed priority.** `allProblems()` walks
`CONCERNS` in order and the first one that applies is *the* mission, the same
one on both screens. **The order of `CONCERNS` is therefore the whole design.**
A new concern's place in that list decides whether anybody ever sees it. Put it
where it belongs, not at the end.

**3. Nothing is laid over the world.** The village is the tap target. What
needs doing lives in the mission button; what you have done lives behind your
own role chip. Nothing pops up over the map, and nothing reloads out from under
a finger.

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
ripens, wool comes in, and a villager who has been shown a job gets on with it
— fells and replants in the same step, gathers a stone, sows a row, shears a
sheep, brings a fish home. That is a kind thing and belongs here: it only ever
*adds*. Never hunger, never decay, never a problem that arrived on its own,
nothing taken from the larder or from a player, no stump left standing where
a tree was. A villager who was hungry, homeless or poorly when you left
brought nothing in, because nobody in this village works their way out of
trouble. Coming back is a small gift.

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

## 🔁 The dev loop

One command while working, one gate before shipping. Everything is an npm
script so there is nothing to remember and nothing to look up.

```
npm run check      # seconds:  format + lint + unit tests. After every edit.
npm run verify -- quick   # ~1 min: check + a shortened play-through in a browser
npm run verify     # ~5 min: everything, incl. German, the lobby and /stats
npm run verify -- only=german   # one pass on its own, for the middle of a fix
npm run shipped    # one question, answered now: is what is here what is live?
npm run deployed   # only when you want to sit and wait for a push to land
```

- **`npm run check`** is the inner loop: Prettier in check mode, ESLint, and
  `node --test`. If it is red, nothing else matters yet. Run it after every
  meaningful edit, not once at the end.
- **`npm run fix`** applies what `check` can apply (Prettier write, ESLint
  `--fix`). Run it before committing; never commit a formatting-only diff mixed
  into a behaviour change.
- **`npm run verify -- quick`** adds the browser play-through with every
  assertion, minus the screenshots, the second browser, the three screen sizes,
  German, the lobby and the stats page. **This is the bar for a push**, and it
  is meant to be — see the next line.
- **`npm run verify`** is everything, and **it is what CI runs — so do not sit
  through it here as well.** The gate exists so that a push costs a minute
  rather than five: run `verify -- quick`, push, and let CI be the gate it was
  built to be. Running it in both places doubles the wait and catches nothing
  twice. Run the whole thing locally only when CI has gone red and you need the
  failure in front of you, and then reach for `only=` first.

- **`npm run verify -- only=<pass>`** runs one of `check`, `smoke`, `german`,
  `lobby`, `stats` against a fresh server and nothing else. It is for the middle
  of a fix — a failing pass in its own minute rather than five minutes of the
  other four — and it says so in its last line, because **it is not the gate**.

Every run ends with one line in the same shape, so it can be found without
reading the five minutes above it: `verify: all good`, or
`verify: something is broken`. The play-through and the German pass run at the
same time, because they take a minute off each other and share nothing.

**On waiting.** Three habits cost whole afternoons and none of them buy
anything: running the full gate here when CI is about to run it anyway; polling
a deploy with a quarter of an hour of dots when `npm run shipped` answers in one
second; and re-running five passes to see whether a one-line fix took, when
`only=` runs the one that failed. Push small, ask later, and let the gate work.

`npm run verify` brings up its own server on a free port and takes it down
again. **Do not start a server by hand for testing, and never `pkill` broadly** —
a wide `pkill` has killed a running test's browser mid-run and cost a whole
cycle. If something must be stopped, name it exactly.

Lint and format are not taste. They exist so that a diff shows only what
changed, so a future session is not guessing which of two styles is current,
and so the modern-JavaScript rule is enforced by a machine rather than by
somebody remembering it. A rule that is not enforced is a rule that is gone.

## 🧪 What the tests are for

**The tests are for whoever is changing the code. Nobody else reads them.**

That has consequences, and they are the opposite of the usual ones:

- **A test earns its place by catching a mistake that is easy to make here.**
  Not by covering a line. There is no coverage target and there never will be;
  a number of tests is not an achievement and is never worth reporting.
- **Every law in this file that can be checked, should be checked.** That is
  what they are best at: `MAX_ACTIVE` is 1, every string exists in every
  language, no world name reaches `/stats`, an action applied twice does not
  double up, a saved world from an older schema still loads. A law with a test
  behind it survives a session that has not read this file.
- **Prefer one test that would have caught a real bug** over five that restate
  the implementation. The road that got taken back, the lamp that was confused
  with the flame, the pinch that reset the zoom — those are the shape to aim
  for.
- **Delete tests that no longer protect anything.** A test kept for its own
  sake is a cost with no payer.
- If a change breaks a test, the first question is always *which is wrong* —
  and if the test is right, the fix is the code. Do not weaken a test to get
  green.

## 🚦 When to deploy, and when not to

`main` is the only thing the owner can look at, and pushing to `main` deploys.
So **deciding when to push is part of the job, not a question to hand over.**

Push to `main` when all of these are true:

1. `npm run verify` is green in full.
2. The change is complete — not a spike, not half a refactor, not a feature
   with one language's strings missing.
3. What is live afterwards is better than what is live now, for somebody who
   opens the game in the next five minutes.
4. It breaks no law in this file, and crosses nothing on the anti-list.

Hold it back when any of those fails, and say plainly what is being held and
why. Also hold when the change is only interesting to look at — a screenshot or
a description costs the owner nothing and an unfinished village costs them a
Saturday.

Otherwise **ship small and ship often**. Work banked on a branch is work the
owner cannot see, and a large push is a large thing to undo. A day's work in
four pushes is better than one, because three of them can be checked while the
fourth is still being written.

## 🚀 Branch, deploy, confirm

- **Develop straight on `main`.** There is no long-lived feature branch; the
  goal is a change reaching `main`, and from there a player, as fast as a
  clean gate allows. A push to `main` runs `.github/workflows/deploy.yml` in
  three stages, each gating the next: **`verify`, then `deploy-dev`, then
  `deploy-prod` — a stage only runs once the one before it passed.** A red
  `verify` deploys nothing at all, and a red `deploy-dev` never lets
  `deploy-prod` start; either way both apps keep serving their last good
  build.
- **`dev` is where a change gets caught before a player sees it, not a second
  review to wait on.** `deploy-dev` ships the build to
  `https://ourlittleworld-dev.timpanini.com` (`CAPROVER_APP_DEV` /
  `CAPROVER_APP_TOKEN_DEV`) and then polls its `/version` until it answers
  with this commit's own build id, so a CapRover-side failure — a bad image, a
  crash on boot — shows up on `dev` rather than on `prod`. Only once that
  holds does `deploy-prod` deploy the identical build to
  `https://ourlittleworld.timpanini.com` (`CAPROVER_APP` /
  `CAPROVER_APP_TOKEN`, unchanged) the same way. There is no manual approval
  in between — that would slow `main` down for no test it does not already
  get from `verify` and from `dev` answering `/version`.
- **The game itself needed no change for this.** Nothing in `server/` or
  `src/` is written for one hostname: CORS is wide open, nothing reads its own
  origin, and CapRover already keeps `dev` and `prod` as separate containers
  with separate persisted worlds. The same build simply runs twice.
- After `git push origin main`, point any session working branch at the same
  commit (`git branch -f <branch> main && git push -f origin <branch>`) so the
  two never drift.
- **A green workflow only means CapRover accepted the deploy.** To know the new
  code is being served, ask the site: `GET /version` answers
  `{ version, schema, build, startedAt }`, where `build` is a hash of every file
  that ships (`server/buildid.mjs`, also `npm run build-id`). `npm run deployed`
  compares the live `build` with the working tree's. **`npm run shipped` asks
  once and answers immediately** — that is the one to reach for. `npm run
  deployed` is the same question with a wait attached, for when you have just
  pushed and intend to sit there; it waits up to half an hour because the gate
  runs before either deploy does, and `dev` has to answer before `prod` even
  starts. **A push is not finished until one of them says yes**, but "not
  finished" does not mean "stand and watch".
  It waits that long because a push now goes through the whole gate before it
  deploys at all — installing, fetching a browser, five minutes of verify, a
  deploy to `dev` and a wait for `dev`'s own `/version`, and only then a deploy
  to `prod`. It waited three minutes once, which was right when a push went
  straight to one app with no gate, and which quietly meant it could never say
  yes again once the gate existed.
- **A push is not finished when the command returns, either.** Check the
  workflow run: a red gate means nothing deployed and the old build is still
  what people are playing. Saying "pushed" is not saying "live", and only the
  site can settle which.
- The site is <https://ourlittleworld.timpanini.com>, and `npm run deployed`
  knows that address by default; `dev` is
  <https://ourlittleworld-dev.timpanini.com>, reached with
  `npm run deployed -- https://ourlittleworld-dev.timpanini.com` or
  `DEPLOY_URL=https://ourlittleworld-dev.timpanini.com npm run deployed`. If a
  sandbox will not let a session reach either, check the workflow run instead
  and say plainly that the deployment itself was not verified from here — do
  not call it live. And check the host before assuming it: this one was
  guessed wrong once, from a truncated address bar.
- Only what ships is hashed — the page, `src`, `styles`, `server`, `icons`. A
  change to the tests, the tooling or the docs leaves the build id alone, which
  is right: nothing a player downloads changed, and `npm run deployed` will
  still say yes.
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

## 🧰 The tooling, and why each piece is there

Nothing here ships. The game still has **zero runtime dependencies** and no
build step; these are `devDependencies` and they never reach a player.

| | |
|---|---|
| **Prettier** | one formatting answer, so no diff is ever about whitespace |
| **ESLint** | the rules a machine can keep: no unused anything, no `var`, no accidental global, and the modern-syntax floor |
| **`node --test`** | the unit tests, no framework |
| **Playwright** | the browser passes in `tools/` |

**The modern-syntax floor is two rules of our own**, written into
`eslint.config.mjs` rather than pulled in — `olw/optional-chaining` and
`olw/nullish`, about thirty lines, no dependency. They flag only the shapes
where the old way and the new way are the same value in *every* case, because
a rule that is sometimes wrong is a rule somebody switches off. `v.task &&
v.task.kind !== 'gohome'` is **not** `v.task?.kind !== 'gohome'` — undefined is
not `'gohome'` — and widening either rule until it says so would send a
villager off at dusk with nothing to do. `tests/tooling.test.mjs` holds both
halves: what they catch, and what they must leave alone. The same floor in CSS
is a test rather than a rule, because nothing here lints a stylesheet.

`.claude/hooks/session-start.sh` installs them when a session starts in the
cloud, because a web session begins at a fresh clone and the first `npm run
check` otherwise falls over on a missing package. It does nothing on a machine
of your own, and it never fetches a browser this environment already has.

Rules for touching the tooling:

- **A new devDependency needs a reason written next to it**, in the table above.
  Anything that would end up in what ships needs the owner's say-so.
- **Never add a rule that the existing code violates without fixing the code in
  the same commit.** A lint config with a backlog is a lint config nobody runs.
- **CI runs exactly what `npm run verify` runs locally**, by calling that
  script — never a copy of its steps inlined into the workflow, which is how
  the two drift apart and how "green locally, red in CI" starts.

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

## 🔒 What stops a stranger from acting like a player

This exists for two moments: **something fundamental just broke, and the first
question is whether a security measure is the cause** — and **a periodic look
at what is actually enforced, versus what only looks like it is.** Every
mechanism below names its file, its constant, and its test. If you change one
of these, update this list in the same commit — a stale line here is worse
than no line.

**The shape of it.** There is no login (law, anti-list), so a world's name is
the only thing that lets anybody *read* it — that is by design, a link is
meant to work like a key. But a name is not meant to let anybody *write*.
Reading only needs the name; changing the village needs a seat in it too. That
second gate is newer than the first, and is where most of what follows lives.

### The path a request actually takes

`server/serve.mjs` gets every request first. It sets response headers, then
hands anything starting `/api/` to `server/api.mjs`'s `handle()`; everything
else falls through to the static file allowlist. `api.mjs` strips the request
down to `parts = ['api', 'worlds', name, what]`, runs `cleanName()` on `name`
and the shared rate limiter on it, then calls into `server/worlds.mjs` — the
one place that holds the actual state and the one place that checks whether
the caller is allowed to change it. `server/relay.mjs` is a separate path
entirely: it never touches `worlds.mjs`, and nothing about the WebSocket
upgrade goes through `api.mjs`'s checks.

### `server/serve.mjs` — the front door

- **Static files are an allowlist, not a blocklist.** `PUBLIC_FILES`
  (`index.html`, `stats.html`, `site.webmanifest`) and `PUBLIC_DIRS` (`src`,
  `styles`, `icons`) are the only things a browser may fetch by path; anything
  else 404s before the filesystem is even touched. This is not just tidiness:
  `DATA_DIR` (every world's save file) defaults to living right under the same
  root this server hands out files from, so before this allowlist existed,
  `/data/<name>.json` served a world's raw save — device ids and all — to
  anyone who could guess or enumerate a name. `tools/smoke.mjs` fetches
  `/server/api.mjs`, `/package.json`, and `/data/anything-at-all.json` and
  fails unless all three 404.
- **Headers set on every response**, before routing: `x-content-type-options:
  nosniff`, `referrer-policy: no-referrer`, `x-frame-options: DENY`,
  `content-security-policy: frame-ancestors 'none'`. This is not a full CSP —
  see "what's deliberately not done" below.
- **`headersTimeout` (20s) and `requestTimeout` (30s)** bound a slow-trickled
  connection. These govern only the HTTP request/header phase; a relay socket
  is handed off to `attachRelay`'s own upgrade handling the moment it arrives
  and is never subject to them.
- **The boot log prints whether `TRUST_PROXY` is on**, right after the "N
  world(s) remembered" line — a `rate limits:` line saying which of the two
  modes described below this instance is actually running in. A config that
  only lives in an environment variable is invisible until something asks; now
  every restart says it in the one place an operator already looks.

### `server/api.mjs` — the gate

- **No cookies, ever** — `device` travels in the request body, not a header a
  browser attaches automatically, so CORS is deliberately wide open
  (`access-control-allow-origin: *`). There is no credential for a foreign
  origin to ride along with, which is what makes that safe here and would not
  be if a session cookie ever got added.
- **Two independent rate limiters**, both per-address buckets that reset every
  hour, both cleared wholesale if either map passes 5000 entries:
  `CREATE_PER_HOUR` (30) gates only world creation; `ACTIVITY_PER_HOUR` (1200)
  gates every other `/api/worlds/:name/...` route — GET or POST — once a name
  passes `cleanName()`. Before this, only creation was throttled and the
  900-word name space (see `src/core/names.js`) made every other route free to
  hammer or enumerate.
- **`clientIp()` decides which address a request counts against.** By default
  it is `req.socket.remoteAddress` — behind a reverse proxy, that is the
  proxy's own address, so every visitor shares one bucket. Setting
  `TRUST_PROXY=1` switches it to, in order: **`X-Real-IP`**, if present, or
  else the **last** entry in `X-Forwarded-For`. `X-Real-IP` is preferred
  because there is nothing to get wrong about it — a well-behaved proxy always
  overwrites it with its own directly-observed peer, so a client cannot make
  it say anything else. `X-Forwarded-For` is the fallback for a proxy that
  only sets that one: a standard proxy *appends* its own idea of the address
  rather than replacing what arrived, so the last entry is the only one it
  actually vouches for — a client can write anything it likes earlier in the
  list. Taking the first entry instead was a real bug here for a short time;
  `tests/worlds.test.mjs` simulates a client prepending a fresh lie on every
  request and checks it buys nothing, and a second test checks `X-Real-IP`
  wins whenever both headers are present. **`TRUST_PROXY` defaults off in the
  code** because this only tells the truth when every request provably comes
  through one trusted proxy — flip it on only after confirming, for wherever
  this is deployed, that the app container is not reachable except through
  that proxy, and that nothing else (a CDN, another load balancer) sits in
  front adding its own hop. For CapRover specifically, both headers are
  confirmed set correctly — `template/server-block-conf.ejs` in CapRover's own
  source sets `X-Real-IP $remote_addr` and
  `X-Forwarded-For $proxy_add_x_forwarded_for`
  (<https://raw.githubusercontent.com/caprover/caprover/master/template/server-block-conf.ejs>,
  fetched to confirm this) — so enabling it is safe there once the "nothing
  else sits in front of CapRover's nginx" precondition is confirmed
  separately. **Currently on for `dev`, not yet for `prod`** — the deployer
  flips prod once dev is confirmed working; the boot log's `rate limits:` line
  (`server/serve.mjs`, above) is the live source of truth for which is
  currently true on a given running instance, since this note will not update
  itself.
- **`MAX_BODY` (1 MB)** is enforced incrementally as chunks arrive, with an
  immediate `req.destroy()` past the limit — never buffered unbounded first.
- **Every route checks its own method**; a wrong verb is a `405`, not a
  silent 200.

### `server/worlds.mjs` — the seat

- **`inWorld(w, device)`** is the one real authorization check in this
  codebase: true only if `device` currently holds one of the world's role
  slots. **`putSnapshot()` refuses to write unless `inWorld()` says yes** —
  before this, knowing a world's name was enough to overwrite or reset a
  family's saved village outright, with only an easily-bypassed "tick must not
  go backwards" guard in the way. `tests/worlds.test.mjs`: *"a stranger who
  only knows the name cannot touch the saved world."*
- **`touch()` (the "seen" heartbeat) claims a spot via `claim()`**, the same
  function `join()` uses, rather than only refreshing a slot it already knows
  about. This matters because of the check above: a `join()` request that
  never reached the server (a dropped request, not a refusal) would otherwise
  leave a device "registered" client-side but seatless server-side, and every
  future snapshot would then fail `inWorld()` for a device that only ever had
  bad luck once. The heartbeat fires immediately on entering a world and every
  60 seconds after, so it self-heals within one cycle. `tests/worlds.test.mjs`:
  *"a heartbeat claims a spot for a device that never managed to join."*
- **`leave()` only ever removes a slot whose device matches** — always did;
  a mismatched device is a no-op, not an error.
- **`MAX_SNAPSHOT` (512 KB)** caps a single write; a real world is ~10 KB.
- **Defense in depth on the filesystem, unreachable today, kept anyway:**
  `flush()` refuses to write a file for any name that is not already
  `cleanName()`-clean, and `load()` keys a world by its filename, not by a
  `name` field inside the file. Every caller already cleans a name before it
  gets this far — `api.mjs` on the way in — so neither path can currently be
  hit through the HTTP API. This is the backstop for whatever reads or writes
  `DATA_DIR` next, not for what does today.

### `server/relay.mjs` — the wire between two open tabs

- **No authentication at all: a room is whoever connects with the same
  `?room=` name.** This is a known, deliberate gap — see "what's deliberately
  not done" below, not something to "fix" by adding a cap alone.
- **`MAX_PEERS_PER_ROOM` (20) is a resource bound, not a seat model.** It used
  to be 2, on the assumption of one connection per role; that broke the
  ordinary "a seat belongs to a person, not a browser" case (above) the first
  time it shipped, caught by `tools/lobby.mjs`'s full-verify pass. It is 20
  now specifically so it is never mistaken for "two seats" again — real
  headroom for a phone and an iPad both open, while still refusing something
  unbounded connecting over and over.
- **A fragmented WebSocket frame is closed, not buffered.** Opcode `0x0`, or
  any data frame with `FIN` unset, ends the connection immediately. Nothing on
  either side of this ever sends a message in more than one frame
  (`src/net/transport.js` makes one `.send()` call per message), so believing
  a peer that claims "more is coming" would only grow an attacker's share of
  memory for free. `tests/relay.test.mjs`: *"a frame that claims more is
  coming is closed, not believed."*
- **`KEEP_MAX` (3 MB), `KEEP_ROOMS` (200), `KEEP_MS` (12h)** bound the
  in-memory "last snapshot seen per room" cache that lets a second joiner
  never start from nothing.
- A 25-second ping sweeps dead sockets: a write that throws closes the peer.

### `server/stats.mjs` — the one endpoint anyone can call, by design

- **`DEED_TYPES` and `PROJECT_TYPES` allowlist what `deedsOf()`/`marksOf()`
  will read out of a posted snapshot.** A snapshot's `players.*.done` and
  `buildings` content comes from whoever holds a seat — legitimately a real
  player, but the server has no way to tell that content apart from anything
  else that shape. Before `DEED_TYPES` existed, `deedsOf()` copied every key
  in `done` verbatim; a snapshot with an arbitrary string in it would appear
  on the public `/stats` page within 30 seconds and persist forever once the
  world was forgotten. `marksOf()` was never vulnerable to this — it always
  checked building types against `PROJECT_TYPES` first.
- **Never a device id, an IP, a world name, or anything finer than a calendar
  day** — `tests/stats.test.mjs`'s *"nothing in the report belongs to
  anybody"* reads the whole report back looking for all four.

### `server/buildid.mjs` — a different list, on purpose

Three lists exist and they are not the same thing, which is worth naming
explicitly because conflating them once was an easy mistake to nearly make:

1. **The Dockerfile's `COPY` list** — what physically ships in the image
   (includes `package.json`).
2. **`buildid.mjs`'s `SERVED`** — what the `/version` build hash is computed
   over (includes `server/`, because a change there changes what is running,
   even though a browser never fetches it directly).
3. **`serve.mjs`'s `PUBLIC_FILES`/`PUBLIC_DIRS`** — what a browser may actually
   request over HTTP (excludes both `server/` and `package.json`).

A file can appear in any subset of the three. `server/*.mjs` is in the first
two and not the third; `package.json` is in the first only. Adding something
new that should be public needs the third list, specifically — being in the
build hash does not make a thing servable.

### CI/CD and the supply chain

- **GitHub Actions are pinned to commit SHAs**, not mutable tags (`actions/
  checkout@3d3c42e…` with the tag it corresponds to in a comment), and the
  **Dockerfile's base image is pinned by digest**
  (`node:24-alpine@sha256:50c8e8ca…`) — both verified against the real
  registries when pinned, not taken from a rendered webpage.
- **`caprover` is pinned to an exact version** in `deploy.yml` and its deploy
  token travels as the `CAPROVER_APP_TOKEN` environment variable, never a CLI
  argument — an argument sits in plain sight of anything else that runs in the
  same step; an env var does not.
- **`deploy-dev` deploys `github.ref_name`** — whichever branch a run was
  dispatched from — so a branch can be tested on dev without touching `main`.
  **`deploy-prod` only runs `if: github.event_name == 'push'`**, which,
  combined with the existing `on.push.branches: [main]` filter, is the one
  gate that keeps a manual dispatch of anything but `main` from ever reaching
  production.
- **`.github/dependabot.yml`** watches `npm`, `docker`, and `github-actions`
  weekly — including the two pins above, so they get proposed bumps instead of
  quietly going stale.

### If something fundamental just broke, check here

| Symptom | Most likely cause |
|---|---|
| A legitimate save/join/seen suddenly `403`s | `inWorld()` in `worlds.mjs` — the device string changed, or the world never actually held that seat |
| A legitimate request suddenly `429`s | `CREATE_PER_HOUR`/`ACTIVITY_PER_HOUR` buckets in `api.mjs` — check whether `TRUST_PROXY` is misconfigured and collapsing many real visitors onto one bucket |
| A file that should load `404`s | `PUBLIC_FILES`/`PUBLIC_DIRS` in `serve.mjs` — a new top-level file or directory needs adding there, being referenced from HTML is not enough |
| Two of somebody's own devices can't both stay connected to one room | `MAX_PEERS_PER_ROOM` in `relay.mjs` |
| A WebSocket closes right after connecting, no obvious reason | Check whether whatever connected sent a fragmented frame — `readFrames()` in `relay.mjs` closes on sight |
| A word appears in `/stats` that is not a real deed or milestone | `DEED_TYPES`/`PROJECT_TYPES` in `stats.mjs` |
| A world's save is missing or looks wrong after a redeploy | `DATA_DIR`'s mount, or `cleanName()` disagreeing with what `flush()`/`load()` expect — see "defense in depth" above |

### What's deliberately not done, and why

- **The public lobby (`GET /api/worlds`) lists every world with a free spot,
  touched in the last week, by name** — not a full or old world, but still
  nothing stops a stranger from taking that free seat before the real second
  player arrives. **Kept as is, on purpose: the owner weighed this against
  scoping discovery to the creating device and chose the risk over the
  ease-of-use cost.** Revisit only if that trade-off stops feeling right — see
  law 7 and the "🪑 A seat belongs to a person" section above for the
  legitimate case this has to keep working.
- **The relay has no server-side notion of "host."** Any connected peer's
  `t:'snap'` message is trusted and remembered; the client-side host-election
  protocol (`src/net/session.js`) has no matching backstop at the transport
  layer. Bounded today by the room-peer cap above and by laws 6 and 12
  (nothing here is ever destructive or permanent) — genuinely fixing it means
  teaching the relay about devices and seats, which it currently knows nothing
  about at all.
- **No CSP beyond `frame-ancestors`/`X-Frame-Options`.** `index.html` has no
  inline script and exactly one inline `style=` (the `<noscript>` fallback,
  trivial to move into `styles/main.css`), so a real `script-src`/`style-src`
  CSP is cheap to add there. `stats.html` is not: its entire script and
  stylesheet are inline, not external files, so a strict CSP would break it
  outright — that page needs its code extracted first, a real if mechanical
  refactor, before it can share whatever CSP `index.html` gets.

### A periodic checklist

| Category | What exists | Where |
|---|---|---|
| Access control | name reads, a held seat writes | `inWorld()`/`claim()`, `worlds.mjs` |
| Rate limiting | per-address, two tiers | `CREATE_PER_HOUR`/`ACTIVITY_PER_HOUR`, `api.mjs`; `MAX_PEERS_PER_ROOM`, `relay.mjs` |
| Input validation | names cleaned before they become paths; snapshot type-checked; deed/mark keys allowlisted | `cleanName()`, `src/core/names.js`; `putSnapshot()`, `worlds.mjs`; `DEED_TYPES`, `stats.mjs` |
| Resource exhaustion | body/snapshot/frame size caps; fragment rejection; bounded in-memory caches | `MAX_BODY`, `api.mjs`; `MAX_SNAPSHOT`, `worlds.mjs`; `readFrames()`, `KEEP_*`, `relay.mjs` |
| Information disclosure | static file allowlist; nothing personal ever counted | `PUBLIC_FILES`/`PUBLIC_DIRS`, `serve.mjs`; `stats.mjs` |
| Transport headers | nosniff, referrer-policy, frame-ancestors, timeouts | `serve.mjs` |
| TLS | terminated by CapRover's proxy, outside this repo | — |
| Supply chain | Actions pinned to SHAs, base image pinned by digest, `caprover` version-pinned, dependabot | `.github/workflows/deploy.yml`, `Dockerfile`, `.github/dependabot.yml` |
| Logging | none of this ever logs an IP, device id, or world content | disk-error codes, the boot-time LAN address, and the boot-time `rate limits:` line are the only things printed anywhere |
| **Known gaps** | no relay host authority; `stats.html` has no CSP path | see above |
| **Accepted trade-offs** | public lobby lists every joinable world by name, on purpose (owner decision) | see above |

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

### A villager skill

Villagers gather; the two of you make. The five in `VILLAGER_SKILLS`
(`src/core/content.js`) are the whole list, and a sixth is a deliberate
decision rather than a tidy-up — see the ceiling note in the anti-list section.

A new one is one row in `VILLAGER_SKILLS` — its icon, the `cap` a teacher
needs (null means either of you), the `tally` in their `done` that has to
reach `TEACH_TIMES`, the `verb.*` key for whose job it is when it is not
yours, and a `needs` when something has to be standing first — plus its place
in `SKILL_ORDER`. Then:

- **something to walk to**, in `workTarget()` in `sim.js`, which returns
  nothing at all when there is no real target: a full bag, a full pile, a
  forest at its floor.
- **what it does**, in `doVillagerJob()` in `sim.js`, returning false when
  whatever they walked over for has gone. Every effect is `fx()`, a `say.*`
  line, and one thing added — never one taken.
- **where the yield goes.** Wood and wheat are hauled to `w.pile` (nobody's,
  `PILE_CAP`); stone and wool go into `v.bag` (theirs until a player asks,
  `BAG_CAP`); food goes straight into `w.larder`. Nothing a villager gathers
  ever lands on a player's own side of the table.
- **it has to be renewable.** A tree is replanted in the same step, the river
  brings more stones, wheat and wool and fish come again on their own. A job
  that takes something that does not come back breaks law 9 the first night
  somebody leaves the village alone.
- **strings in every language**: `skill.<key>` as an infinitive phrase ("fell
  trees"), so `j.taughtVillager` and `teach.villagerNotice` read as sentences
  in both.
- **a test in `tests/skills.test.mjs`**, and a line in `catchUp`'s away test
  if the job can happen while nobody is watching.

The `stone` skill is the odd one: it has no capability behind it, so
`stone.take` carries `tally(w, a.role, 'stone')` purely to be the gate for
teaching it. A deed of its own needs its rows in `DEEDS` (`hud.js` and
`stats.html`) and in `DEED_TYPES` (`server/stats.mjs`) — see the three-lists
note before assuming anything else needs changing.

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
- **The pitch is right and settled.** A child of about seven can read and write
  and still gets something out of practising letters and precision. Do not
  "grow it up", and do not add a difficulty setting or an age question — that
  would be a new promise, not a tweak.

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
- A language is one file in `src/i18n/` plus its line in `LANGUAGES` in
  `src/core/i18n.js`, complete, with the tests green. `tests/i18n.test.mjs`
  finds the file on disk rather than being told about it, so a table nobody can
  pick and a flag with no table both fail.
- **`tools/german.mjs` stays German**, and a new language gets its own small
  pass modelled on it rather than a parameter. Its assertions are literal
  translated words on a real screen — that is the whole point of it, and a pass
  that took the language as an argument could only check that *something*
  rendered.

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
  and wrote around optional chaining, `??` and flexbox `gap`. That floor is
  gone, the sweep has landed, and ESLint keeps it — see the tooling table. What
  is left of the old style is deliberate: a handful of `a && a.b` that do not
  mean the same thing written the new way, each of them a comparison rather
  than a plain read.
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
