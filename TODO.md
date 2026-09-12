# What the code owes the documentation

`CLAUDE.md` says what this game is. Some of it describes the code as it stands;
the rest is a promise the code has not kept yet. This file is that gap, in the
order it should be done.

Each item is meant to be one commit, one push, one thing the owner can look at
on the live site. Delete an item when it lands — this file should get shorter.

---

## 1. 🔧 Tooling and CI — do this first

Everything else is easier once a machine keeps the rules. Nothing here ships:
`devDependencies` only, no runtime dependency, no build step.

**1a. Playwright is imported from an absolute path.** `tools/look.mjs`,
`smoke.mjs`, `german.mjs`, `lobby.mjs` and `stats.mjs` import from
`/opt/node22/lib/node_modules/playwright/index.mjs`. That works in one sandbox
and nowhere else, and it blocks CI. Resolve it normally, falling back to the
absolute path only if the normal resolve throws.

**1b. Prettier and ESLint.** Flat config (`eslint.config.mjs`). ESLint rules
that earn their place: no unused variables or imports, no `var`, no implicit
globals, `eqeqeq`, and `ecmaVersion: 'latest'` so modern syntax is the floor.
Prettier for formatting, one config, no per-file overrides. **Fix every existing
violation in the same commit** — a config with a backlog is a config nobody runs.

**1c. The scripts.** Add to `package.json`:

```
check    prettier --check . && eslint . && node --test tests/*.test.mjs
fix      prettier --write . && eslint . --fix
```

and keep `verify` as it is, with `check` as its first step instead of the bare
unit tests.

**1d. The workflow.** `.github/workflows/deploy.yml` currently checks out and
deploys with no tests at all. Give it two jobs: one that runs `npm ci` and
`npm run verify` (Node 22, Playwright browsers installed), and the CapRover
step `needs:` it. **The CI job calls `npm run verify`** — never a copy of its
steps inlined into the YAML, which is how local and CI drift apart. No
escape hatch: `workflow_dispatch` runs the same gate.

**1e. Write the loop down where it is found.** `CLAUDE.md` already describes it;
make sure the scripts match the description exactly, and fix whichever is wrong.

*Definition of done: a deliberately broken test makes the workflow red and
nothing deploys.*

---

## 2. 🎯 One mission, in its own button

**Law 1 and law 3.** `MAX_ACTIVE` is still 2, and the mission still hides behind
the player's own chip under a red count.

- `src/core/guide.js` — `MAX_ACTIVE` → `1`.
- **A new button in the top row, next to the player chips.** It shows the
  mission's icon and opens its card. No red number anywhere: a count that is
  always "1" nags without informing.
- When the village is calm the button goes quiet rather than disappearing, so
  the row never jumps about as the last job is finished.
- `src/ui/hud.js` — the queue loop at ~221 renders `MAX_ACTIVE` cards and the
  badge at ~448 is `min(allProblems().length, MAX_ACTIVE)`. Both go.
- `tests/guide.test.mjs` uses `MAX_ACTIVE` symbolically and should pass
  unchanged. Add one that asserts it **is** 1 — the law is worth a test.
- `tools/smoke.mjs` — it opens the mission through the role chip today. Update
  the path, and keep every assertion about what the card says.

*Small, and the most visible thing on this list. Ship it on its own.*

---

## 3. 🎁 The welcome-back screen

**Law 10.** Nothing tells you what the other player did while you were away.
The largest piece here; worth sketching before writing.

- **A mark for "when I was last here", per seat.** The two players are away at
  different times, so this is per role, not per world. `w.ext` is the right home
  — namespaced, survives save, load and the network, no schema bump. Something
  like `w.ext.seen = { A: tick, B: tick }`, written when a player leaves and
  when the world is saved.
- **A list worth reading**, derived from what the world already keeps: the
  journal (capped at 40), the `players[].done` tallies, the buildings, and
  `w.notices`. New buildings, gifts received ("5 wool, 2 planks"), resources
  gathered, problems solved.
- **Derived, never sent.** Law 4 holds absolutely: the other player composes
  nothing. Everything on the screen is computed from world state.
- **Not a summons.** No notification, no badge, no "come back" (anti-list). It
  appears only after somebody has already opened the game, and one tap puts it
  away into the village.
- Nothing on it when nothing happened — a screen that says "nothing happened"
  is worse than no screen.
- Strings in every language table. A step in `tools/smoke.mjs`: play as A,
  leave, play as B, come back as A, read the list.

---

## 4. 🌱 Kind things while nobody is there

**Law 9.** The world is frozen between visits; saplings only grow while somebody
is watching, because `SAPLING_TICKS` counts play ticks.

- On load, work out how long the world was away and advance **only the kind
  things**: saplings toward trees, plots toward ripe, sheep toward woolly. Never
  hunger (`HUNGER_RISE`), never `POORLY_CHANCE`, never anything from
  `events.js`.
- **Cap it**, and put the number next to the constant with a comment. A world
  opened after a month must not arrive as a forest.
- Deterministic and identical on both screens: derive it from the wall-clock
  stamp stored in the snapshot, apply it once on adoption, never from each
  device's own clock independently.
- Idempotent, so law 12 holds — applying the catch-up twice must do nothing the
  second time.
- `tests/sim.test.mjs`: a world aged by N days grows, never starves, and gives
  the same result applied twice.

---

## 5. 🌍 The i18n test only knows two languages

**Law 14** says every language must be complete, and the README invites a third.
`tests/i18n.test.mjs` imports `en` and `de` by name and compares them pairwise.

- Walk every table in `src/i18n/` and check each against English: every key,
  matching `{name}`/`{n}` slots, plurals in pairs.
- `tools/german.mjs` is the browser half and is German by name. Decide whether a
  third language gets its own pass or whether that tool takes the language as an
  argument.

*Do this before anybody starts a third language, not after.*

---

## 6. 🧹 The modern-JavaScript sweep

House style says modern JS everywhere; the code still avoids optional chaining,
`??` and flexbox `gap` from when the floor was Safari 12.

- Do it **after** item 1, so ESLint can hold the line afterwards.
- One mechanical pass, its own commit, touching nothing else. `npm run verify`
  green before and after; no behaviour should change.
- Do it when nothing else is in flight — it conflicts with everything.

*Low risk, high noise, not urgent.*

---

## ✅ Settled — do not reopen without asking

- **Tracing stays exactly as it is.** A seven-year-old can read and write and
  still gets something out of practising letters and precision. No difficulty
  setting, no age question, no "growing it up".
- **Silence is deliberate.** No sound, no music, no ambience. The call is the
  audio.
- **Solo play is a fallback**, not a design target. Being blocked on the other
  player is what the call is for.
- **The static-host path stays** (GitHub Pages, a file server, no relay).
- **The third role and the map that opens up are the plan.** Do not remove them.
- **The art is drawn in code by default** — a strong default, not a law. A real
  illustration is allowed if it genuinely makes the village better.
- **The game never ends**, and nothing worse than discomfort ever happens to
  anybody.
- **Tests are for whoever changes the code.** No coverage target, no counting
  them, no test kept for its own sake.
