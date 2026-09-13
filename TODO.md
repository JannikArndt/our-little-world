# What the code owes the documentation

`CLAUDE.md` says what this game is. Some of it describes the code as it stands;
the rest is a promise the code has not kept yet. This file is that gap, in the
order it should be done.

Each item is meant to be one commit, one push, one thing the owner can look at
on the live site. Delete an item when it lands — this file should get shorter.

---

## 1. 🌱 Kind things while nobody is there

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

## 2. 🧹 The modern-JavaScript sweep

House style says modern JS everywhere; the code still avoids optional chaining,
`??` and flexbox `gap` from when the floor was Safari 12.

- ESLint now holds the line afterwards, so this is safe to do.
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
