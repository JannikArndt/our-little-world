# Prompt: work through TODO.md

Paste this into a fresh session. It assumes nothing except the repo.

---

You are working on **Our Little World**. Read `CLAUDE.md` in full before doing
anything else — it contains the laws this game is built on and a binding
anti-list. Then read `TODO.md`, which is the work.

You are the **orchestrator**. You do not write the code yourself except where
this prompt says so. You delegate each item to a sub-agent, review what comes
back against the laws, run the gate, and decide whether it ships.

## How to delegate

Use the `Agent` tool with `subagent_type: "general-purpose"` and
`model: "sonnet"` for implementation work, `model: "haiku"` for purely
mechanical work (a rename, a path fix, a formatting pass). Reserve your own
attention for design decisions, review, and the decision to deploy.

**Every sub-agent prompt must begin with these four lines**, because a
sub-agent starts cold and will otherwise invent its own conventions:

```
Read /home/user/our-little-world/CLAUDE.md in full first. It is binding.
Work only on the files named below. Do not touch anything else.
Run `npm run check` until it is green before you report back.
Report what you changed and what you could not do. Do not commit or push.
```

Then give it the item's spec from `TODO.md`, expanded with the file paths and
line numbers you have already looked up. A sub-agent that has to search for
context burns more than it saves — **you find the files, it does the work.**

## Rules for the whole run

1. **One item, one commit, one push.** `main` is the only thing the owner can
   look at. Ship each item as soon as it is green rather than banking them.
2. **You run the gate, not the sub-agent.** After a sub-agent reports, run
   `npm run verify` yourself (full, not quick, for anything a player can see).
   A sub-agent's "it works" is a claim, not evidence.
3. **You review against the laws.** Check every diff for the anti-list and for
   laws 1–14. A sub-agent has read them once; you are responsible for them.
4. **Never let a sub-agent commit, push, or deploy.** You decide that, using
   the four conditions in `CLAUDE.md` § *When to deploy*.
5. **Never weaken a test to get green.** If a test and a change disagree, work
   out which is wrong; usually it is the change.
6. **Write the commit message yourself.** House voice: plain, warm, says why.
7. If an item turns out to need a decision the owner has not made, stop that
   item, finish the others, and ask — with the options, not just the question.

## The order, and what can run at once

Items conflict when they touch the same files. Respect these waves.

### Wave 1 — tooling, alone (TODO item 1)

Nothing else can run until this lands: item 1b reformats every file in the
repo and would conflict with any other diff.

- **1a** (`haiku`): fix the absolute Playwright import in `tools/look.mjs`,
  `smoke.mjs`, `german.mjs`, `lobby.mjs`, `stats.mjs`. Resolve normally, fall
  back to `/opt/node22/lib/node_modules/playwright/index.mjs` only if the
  normal resolve throws. Verify by running `node tools/look.mjs` against a
  server you started with `npm run verify -- quick` (never start one by hand).
- **1b + 1c** (`sonnet`): add Prettier and a flat ESLint config, fix every
  existing violation in the same commit, add the `check` and `fix` scripts and
  make `verify` call `check` first. The spec is in `TODO.md`; be strict that
  **no rule may be added that the code still violates**.
- **1d** (`sonnet`): rewrite `.github/workflows/deploy.yml` as two jobs, the
  CapRover one `needs:` the verify one. It must call `npm run verify`, not a
  copy of its steps.

Ship 1a separately if it is quick; ship 1b/1c/1d together as "the tooling".

**Done when** a deliberately broken test makes the workflow red and nothing
deploys. Prove it, then revert the break.

### Wave 2 — two independent changes, in parallel

- **Item 2, the mission button** (`sonnet`). Touches `src/core/guide.js`,
  `src/ui/hud.js`, `styles/main.css`, `tools/smoke.mjs`, `tests/guide.test.mjs`.
  This one is design-sensitive: **write the spec yourself** before delegating —
  where the button sits in the top row, what it looks like when the village is
  calm, what happens to the old badge. Do not let a sub-agent decide that.
- **Item 5, the i18n test** (`sonnet`). Touches `tests/i18n.test.mjs` and
  `tools/german.mjs`. Purely mechanical generalisation.

These do not share a file, so they can run at the same time. Review and ship
them as two commits regardless.

### Wave 3 — the world changes, sequential

Both touch `src/core/world.js`, so they cannot overlap.

- **Item 4, kind things while away** (`sonnet`) first — it is smaller and item 3
  will want to describe what happened while you were gone.
  Be explicit in the prompt that it must be **deterministic, identical on both
  screens, and idempotent** (law 12), derived from the snapshot's wall-clock
  stamp and never from the device's own clock. Demand the test.
- **Item 3, the welcome-back screen** (`sonnet`) second, and **design it
  yourself first**: what the list contains, where the per-seat mark lives in
  `w.ext`, what it looks like when nothing happened. Give the sub-agent a spec
  precise enough that it is writing, not inventing. Law 4 is the trap here —
  everything on that screen is derived, nothing is ever sent.

Both need strings in every language table and a step in `tools/smoke.mjs`.

### Wave 4 — the sweep, last and alone

- **Item 6, modern JavaScript** (`haiku` or `sonnet`). Mechanical. One commit,
  no behaviour change, `npm run verify` green before and after. It conflicts
  with everything, so it goes when nothing else is in flight.

## When you are done

Delete each finished item from `TODO.md` as it lands, in the same commit. When
the file is down to its *Settled* section, say so, and report:

- what shipped, one line each;
- anything you held back and why;
- any decision the owner still owes you.

Do not report how many tests there are.
