// Deterministic PRNG (mulberry32). The seed lives inside world state so that
// two clients replaying the same actions end up with the same world.

export function nextInt(state) {
  // state.rng is a uint32 carried in the serialised world
  let t = (state.rng = (state.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0);
}

export function rnd(state) { return nextInt(state) / 4294967296; }
export function rndInt(state, n) { return nextInt(state) % n; }
export function rndRange(state, a, b) { return a + rnd(state) * (b - a); }
export function pick(state, arr) { return arr[rndInt(state, arr.length)]; }

/** Standalone stream for purely cosmetic things (never touches world state). */
export function makeRng(seed) {
  const s = { rng: seed >>> 0 };
  return () => rnd(s);
}
