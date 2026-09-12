# What the code owes the documentation

`CLAUDE.md` was rewritten on 2026-09-12 to say what this game actually is. Some
of it describes the code as it stands; the rest is a promise the code has not
kept yet. This file is that gap, biggest first.

Each item says what law it comes from, what has to change, and roughly how big
it is. Delete an item when it lands — this file is meant to get shorter.

---

## 🔴 Laws the code does not keep yet

### 1. One mission at a time — `MAX_ACTIVE` is still 2

**Law 1.** `src/core/guide.js` has `export const MAX_ACTIVE = 2;` and the chip
shows two cards.

- `src/core/guide.js` — `MAX_ACTIVE` → `1`.
- `src/ui/hud.js:221-223` — the queue loop renders `MAX_ACTIVE` cards; check the
  panel still reads well with one (it may want the card, not a list of one).
- `src/ui/hud.js:448` — the red number is `min(allProblems().length, MAX_ACTIVE)`,
  so it becomes 0 or 1. **Decide what the number means now**: a 1 that is always
  1 is noise. Probably a dot rather than a count, or no badge when calm.
- `tests/guide.test.mjs:73-87` already uses `MAX_ACTIVE` symbolically and should
  pass unchanged. `tests/guide.test.mjs:82` reads `queue[MAX_ACTIVE]` — fine.
- `tools/smoke.mjs` — check nothing asserts two cards.

*Small, except the badge decision.* Do that one first; it is the law most
visible to a player.

### 2. The welcome-back screen does not exist

**Law 10.** Nothing tells you what the other player did while you were away.
This is the largest piece of new work on the list.

What it needs:

- **A mark for "when I was last here."** Per seat, not per world — the two
  players are away at different times. `w.ext` is the right home for it
  (namespaced, survives save/load/network, no schema bump). Something like
  `w.ext.seen = { A: tick, B: tick }`, written when a player leaves or the
  world is saved.
- **A diff worth reading.** Derived from what the world already keeps — the
  journal (capped at 40), `players[].done` tallies, buildings, `w.notices` —
  between the mark and now. Shown as a list: new buildings, gifts received
  ("5 wool, 2 planks"), resources gathered, problems solved.
- **No message, ever.** Law 4 holds: everything on that screen is computed from
  world state. The other player composes nothing and sends nothing.
- **It is not a summons.** No notification, no badge, no "come back" (anti-list).
  It appears only after somebody has already opened the game, and it must be
  dismissable in one tap into the village.
- Strings in every language table; a step in `tools/smoke.mjs` that plays as A,
  leaves, plays as B, comes back as A and reads the list.

*Large.* Worth designing on paper before writing it.

### 3. Nothing kind happens while nobody is there

**Law 9.** The world is frozen between visits; saplings only grow while
somebody is watching (`SAPLING_TICKS` is counted in play ticks).

- On load, work out how long the world was away in real time and advance **only
  the kind things**: saplings toward trees, plots toward ripe, sheep toward
  woolly. Never hunger (`HUNGER_RISE`), never `POORLY_CHANCE`, never an event
  from `events.js`.
- Cap it. A world opened after a month should not arrive as a forest — pick a
  ceiling (a few in-game days' worth) and write the number down next to the
  constant.
- It must stay deterministic and agree on both screens: derive it from the
  stored wall-clock stamp in the snapshot, apply it once on adoption, never
  from each device's own clock independently.
- Unit test in `tests/sim.test.mjs`: a world aged by N days grows and never
  starves.

*Medium.* Interacts with law 12 (never take back) — make the catch-up idempotent.

### 4. Tracing is pitched too young

The audience is now written down as **six to ten, reading**. `trace.js` traces a
single word in dotted letters, which is a five-year-old's exercise.

The rationale stays (*a tap is free and free is the wrong price*) — the effort
just has to be worth a nine-year-old's afternoon. Options, not yet chosen:

- Longer or compound words, or the word from memory after one look.
- A drawing mode with fewer guide dots as the same shape is made again.
- Difficulty that follows what this seat has already traced, kept in `w.ext`.

**Do not** add a settings screen or an age question to the front door without
asking — that is a new promise, not a tweak.

*Medium, and needs a design decision first.*

---

## 🟠 Process and infrastructure

### 5. CI runs no tests at all

`.github/workflows/deploy.yml` checks out and deploys. Nothing runs `npm test`
or `npm run verify`. The documented gate — *the full verify runs in CI and a
failure blocks the deploy* — is not true today.

- Add a job that runs `npm run verify` (needs Playwright + a browser in the
  runner; `tools/*.mjs` import Playwright from a fixed path today — see item 7).
- Make the CapRover step `needs:` that job, so a red run leaves the last good
  build serving.
- Keep `workflow_dispatch` able to deploy without the gate? **Decide and write
  it down** — an escape hatch is fine, a silent one is not.

*Medium, and it is the item that protects everybody else.*

### 6. The modern-JavaScript sweep

House style says modern JS everywhere; the code still avoids optional chaining,
`??` and flexbox `gap` from when the floor was Safari 12.

- One mechanical pass, in its own commit, touching nothing else.
- `npm run verify` in full before and after; the diff should change no behaviour.
- Do it when nothing else is in flight — it will conflict with everything.

*Medium, low risk, high noise.* Not urgent; do not interleave it with a feature.

### 7. The i18n test only knows about two languages

**Law 14** says every language must be complete, and the README invites a third.
`tests/i18n.test.mjs` imports `en` and `de` by name and compares them pairwise.

- Generalise it to walk every table in `src/i18n/` and check each against a
  reference (English), including the `{name}`/`{n}` slots and plural pairs.
- `tools/german.mjs` is the browser half and is German-specific by name; decide
  whether a third language gets its own pass or whether that tool becomes
  parameterised.

*Small, and worth doing before anybody starts a third language rather than after.*

### 8. Playwright is imported from an absolute path

`tools/look.mjs` (and the other browser tools) import from
`/opt/node22/lib/node_modules/playwright/index.mjs`. That works in this sandbox
and nowhere else, which blocks item 5.

- Resolve Playwright normally, or fall back to the absolute path when the normal
  resolve fails.

*Small, and item 5 depends on it.*

---

## 🟡 Smaller drift found while writing this down

- **The version was written into the README** (`v1.5`) while the game was on
  `2.3`. Fixed by removing it: `src/core/changelog.js` is the only place a
  version number lives. Do not re-introduce one anywhere else.
- **The file tree missed files that exist** — `src/core/letters.js`,
  `src/minigames/trace.js`, `src/minigames/modes.js`, `tools/look.mjs`,
  `tools/icons.mjs`. Fixed. When adding a file, add it to the tree in the same
  commit.
- **"a five year old cannot use"** in the README's lobby section — now six, to
  match the written-down audience.
- **`relay.mjs` was described as ~180 lines** and is 199. Fixed to ~200; prefer
  "small" to a number that goes stale.
- **`src/core/events.js` can still raise problems** (`MAX_PER_BLOCK = 3`,
  `GAP_TICKS = 520`). That is fine while somebody is playing and it obeys law 6,
  but check it never fires during the catch-up in item 3.

---

## 🟢 Decisions already made — do not reopen without asking

Recorded here so a future session does not spend the owner's time on them again:

- Silence is deliberate. No sound, no music, no ambience. The call is the audio.
- Solo play is a **fallback**, not a design target. Do not invest in making one
  player self-sufficient; being blocked is what the call is for.
- The static-host path (GitHub Pages, a file server, no relay) **stays**.
- The third role and the map that opens up are **the plan**. Do not remove them.
- The art is drawn in code by default, but that is a strong default, not a law —
  a real illustration is allowed if it genuinely makes the village better.
- The game never ends, and nothing worse than discomfort ever happens to anybody.
