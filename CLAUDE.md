# Our Little World — working notes

A calm cooperative browser game for two people. Plain ES modules, a 2D canvas,
no build step, no dependencies. Read `README.md` first; this file is the short
list of rules for changing it.

## The loop: verify, ship, check

```
npm run verify -- quick     # while working: unit tests + a shortened play-through
npm run verify              # before pushing: everything, including German
git add -A && git commit    # then push to main (see below)
npm run deployed            # after pushing: is that code actually live?
```

`npm run verify` brings up its own server on a free port and takes it down
again. **Do not start a server by hand for testing, and never `pkill` broadly** —
a wide `pkill` has killed a running test's browser mid-run and cost a whole
cycle. If something must be stopped, name it exactly.

- **`npm run verify`** is the gate before every push of anything a player can
  see. It runs the unit tests, the browser play-through (`tools/smoke.mjs`) and
  the German pass (`tools/german.mjs`), and exits non-zero on the first failure.
  It takes about five minutes; run it in the background and wait for it rather
  than polling — one `while pgrep -f 'tools/(smoke|german).mjs'; do sleep 15;
  done` beats ten `sleep`s.
- **`npm run verify -- quick`** keeps every assertion but drops the
  screenshots, the second browser and the walk round three screen sizes. About
  a minute. For iterating, never as the gate.

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
  the browser downloads (`server/buildid.mjs`, also `npm run build-id`).
  `npm run deployed` compares the live `build` with the working tree's and waits
  up to three minutes for them to match.
- A sandboxed session may not be allowed to reach the live host at all. Then
  check the workflow run instead, say plainly that the deployment itself was not
  verified from here, and let somebody with a browser open `/version`.

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

## Adding a project

One row in `PROJECTS` in `src/core/content.js` (cost, which capability builds
it, how to ask for it, its journal icon, the message when it goes up, and the
`text` keys for its bubble), one `plans` entry in the scenario saying where it
goes, art in `render/art.js` plus a line in the renderer's building switch,
strings in **both** language tables, a `CONCERNS` entry if the guide should
mention it, and a step in the smoke test's project loop. `project.build` is the
only action needed — there is no per-project action any more.

## Adding a task to the guide

One entry in `CONCERNS` in `src/core/guide.js`, in the order it matters, plus a
card function. A card says what to *do*, names who it is about (`subject`, so
the card can draw them and the view can find them), and gives every countable
step a `count` so a tick explains itself.

## Writing browser tests

- **People answer a tap before the ground does.** A villager standing on the
  workshop door or the landing will open their own bubble instead. Use the
  `tapTile` helper in `tools/smoke.mjs`: it picks a tile nobody is standing on
  *and* checks `document.elementFromPoint` really lands on the canvas, so a
  toast or a panel cannot swallow the tap.
- Prefer waiting for a condition (`waitForFunction`) over a fixed sleep, and
  poll for arrival rather than assuming a walk takes n ticks — sheep wander off
  again once they get there.
- The relay remembers the last world per room for half a day, and one server
  process outlives several runs, so use a fresh room name (`'room=' +
  Math.random()`) whenever a test needs an untouched world.

## House style

- Comments say why, not what, and read like the game does: plain, warm, no
  jargon. Names are things in the world (`larder`, `plan`, `landing`).
- Every change to the world is an action in `src/core/actions.js`; the
  simulation stays deterministic (fixed ticks, seeded rng in the world).
- Strings live in `src/i18n/en.js` and `de.js` — both, always; the tests check.
- Target Safari 12: no optional chaining, no nullish coalescing, no flexbox
  `gap`. Layout uses the `--safe-t/-b/-l/-r` variables for the notch and
  `--app-h` for the part of the screen the browser is actually showing.
- A panel is a scrolling middle and a foot that does not move; buttons live in
  the foot so nothing can push them off a phone screen.
