# Our Little World — working notes

A calm cooperative browser game for two people. Plain ES modules, a 2D canvas,
no build step, no dependencies. Read `README.md` first; this file is the short
list of rules for changing it.

## Branch and deploy

- **All changes go straight to `main`.** There is no dev deployment yet, so
  `main` is what people play. A push to `main` deploys to CapRover through
  `.github/workflows/deploy.yml`.
- Before pushing anything a player can see, run all three:
  ```
  npm test                              # simulation, schema, guide, i18n
  npm start &                           # on 8099, then:
  BASE=http://localhost:8099 node tools/smoke.mjs
  BASE=http://localhost:8099 node tools/german.mjs
  ```

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
- Only a world saved by a *newer* build is refused, and `persist.js` keeps it
  under `olw.world.<room>.kept` rather than overwriting it.

## Adding a task to the guide

One entry in `CONCERNS` in `src/core/guide.js`, in the order it matters, plus a
card function. A card says what to *do*, names who it is about (`subject`, so
the card can draw them and the view can find them), and gives every countable
step a `count` so a tick explains itself.

## House style

- Comments say why, not what, and read like the game does: plain, warm, no
  jargon. Names are things in the world (`larder`, `plan`, `landing`).
- Every change to the world is an action in `src/core/actions.js`; the
  simulation stays deterministic (fixed ticks, seeded rng in the world).
- Strings live in `src/i18n/en.js` and `de.js` — both, always; the tests check.
- Target Safari 12: no optional chaining, no nullish coalescing, no flexbox
  `gap`. Layout uses the `--safe-t/-b/-l/-r` variables for the notch and
  `--app-h` for the part of the screen the browser is actually showing.
