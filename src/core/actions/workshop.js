// The workshop, where one thing becomes another: wood into planks, wheat into
// bread. Both are paid for up front and both spin the wheel on the roof, which
// is how the other player sees that somebody is working.

import { fx, gain, journal, pay, tally } from './kit.js';

/** The wheel on the roof turns, and a number floats up over the door. */
function spin(w, text) {
  const ws = w.buildings.find(b => b.type === 'workshop');
  if (!ws) return;
  ws.spin = w.tick;
  fx(w, 'float', ws.x + 2, ws.y - 0.2, text);
}

export const workshop = {
  'saw.run': {
    cap: 'saw',
    minigame: 'sawmill',
    costs: { wood: '*' },
    yields: { plank: '*' },
    // A perfectly cut log — every piece the size that was ordered — is what
    // teaches the next level of the sawmill: see LEVEL2_AT in sawmill.js.
    tallies: ['saw', 'sawPerfect'],
    journal: 'j.sawed',
    needs: null,
    twice: 'it is paid for again, so a second one needs the wood for it',
    apply(w, a) {
      if (!pay(w, a.role, { wood: a.wood })) return false;
      gain(w, a.role, 'plank', a.planks);
      spin(w, '+' + a.planks + ' 🪚');
      tally(w, a.role, 'saw');
      if (a.pieces && a.planks === a.pieces) tally(w, a.role, 'sawPerfect');
      if (a.planks > 0) journal(w, '🪚', 'j.sawed', { n: a.planks });
      return true;
    },
  },

  'mill.run': {
    cap: 'mill',
    minigame: 'mill',
    costs: { wheat: '*' },
    yields: { food: '*' },
    tallies: ['mill'],
    journal: 'j.baked',
    needs: null,
    twice: 'it is paid for again, so a second one needs the wheat for it',
    apply(w, a) {
      if (!pay(w, a.role, { wheat: a.wheat })) return false;
      gain(w, a.role, 'food', a.food);
      spin(w, '+' + a.food + ' 🍞');
      tally(w, a.role, 'mill');
      journal(w, '🍞', 'j.baked', { n: a.food });
      return true;
    },
  },
};
