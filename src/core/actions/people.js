// The people who live here: tapping one to say hello, showing one a job, and
// taking what one has been carrying about all afternoon.
//
// Also the one thing the two players do to each other — showing the other how
// to do something — which is the only way a capability ever changes hands.

import { byId, CAPS, canTeach, capName, isDusk, knows, BAG_KEYS } from '../world.js';
import { VILLAGER_SKILLS, MAX_SKILLS } from '../content.js';
import { clearAct, fx, gain, iconOf, journal, note, setAct, tally, trotAway } from './kit.js';
import { rndInt } from '../rng.js';

const POKE_TICKS = 25; // about two and a half seconds
const POKE_ANSWERS = ['wave', 'wink', 'hop', 'shy'];

export const people = {
  'villager.poke': {
    cap: null,
    minigame: null,
    costs: null,
    yields: null,
    tallies: [],
    journal: null,
    needs: null,
    once: false,
    twice: 'nothing is added or taken — it only ever sets what somebody is doing',
    apply(w, a) {
      const v = byId(w.villagers, a.id);
      if (!v) return false;

      // squabbling, and somebody tapped either one of them: that is the end of it
      if (v.act?.kind === 'squabble') {
        const other = byId(w.villagers, v.act.with);
        clearAct(v);
        v.hearts = w.tick;
        fx(w, 'hearts', v.x, v.y - 0.7);
        if (other) {
          clearAct(other);
          other.hearts = w.tick;
          fx(w, 'hearts', other.x, other.y - 0.7);
        }
        return true;
      }

      // poorly, carrying a log, or walking home at dusk: a wave, and nothing dropped
      if (v.poorly > 0 || v.carrying || isDusk(w)) {
        setAct(w, v, 'wave', POKE_TICKS);
        v.hearts = w.tick;
        fx(w, 'hearts', v.x, v.y - 0.7);
        return true;
      }

      // otherwise, an answer — the same one on both screens, since it comes
      // from the world's own seeded rng rather than anything local
      const answer = POKE_ANSWERS[rndInt(w, POKE_ANSWERS.length)];
      v.path = [];
      v.task = null;
      v.wait = POKE_TICKS;
      setAct(w, v, answer, POKE_TICKS);
      v.hearts = w.tick;
      fx(w, 'hearts', v.x, v.y - 0.7);
      if (answer === 'shy') trotAway(w, v, 4);
      return true;
    },
  },

  /**
   * One player showing the other how to do something. The only way a
   * capability moves between seats, and the reason law 7 is about conversation
   * rather than gating: a skill can be handed over, an action cannot.
   */
  teach: {
    cap: null, // the giver has to hold the cap being taught, which is checked below
    minigame: null,
    costs: null,
    yields: null,
    tallies: [],
    journal: 'j.taught',
    needs: null,
    once: true,
    twice: 'the receiver already holds it by then, which is a no',
    apply(w, a) {
      if (!CAPS[a.cap]) return false;
      if (!w.players[a.from].caps[a.cap]) return false;
      if (w.players[a.to].caps[a.cap]) return false;
      w.players[a.to].caps[a.cap] = 1;
      journal(w, '👐', 'j.taught');
      note(
        w,
        'taught_' + a.cap,
        CAPS[a.cap].icon,
        'teach.notice',
        { what: capName(a.cap) },
        'calm',
      );
      return true;
    },
  },

  /**
   * Two jobs each, ever. A villager already holding two has to give one up
   * to take a new one, and `instead` has to name one they really hold.
   */
  'villager.teach': {
    cap: 'bySkill', // VILLAGER_SKILLS[what].cap, and null there means either of you
    minigame: null,
    costs: null,
    yields: null,
    tallies: ['taught'],
    journal: 'j.taughtVillager',
    needs: 'bySkill', // VILLAGER_SKILLS[what].needs — fishing wants a boat first
    once: true,
    twice: 'by then they already know it, and knowing it is a no',
    apply(w, a) {
      const v = byId(w.villagers, a.id);
      const def = VILLAGER_SKILLS[a.what];
      if (!v || !def || !w.players[a.role]) return false;
      if (!Array.isArray(v.skills)) v.skills = [];
      if (knows(v, a.what)) return false;
      if (!canTeach(w, a.role, a.what)) return false;
      if (v.skills.length >= MAX_SKILLS) {
        const i = v.skills.findIndex(s => s.what === a.instead);
        if (!a.instead || i < 0) return false;
        v.skills.splice(i, 1);
      }
      v.skills.push({ what: a.what, by: a.role });
      v.hearts = w.tick;
      fx(w, 'float', v.x, v.y - 0.8, def.icon);
      tally(w, a.role, 'taught');
      journal(w, '👐', 'j.taughtVillager', { name: v.name, skill: a.what });
      note(
        w,
        'taught_' + v.id + '_' + a.what,
        def.icon,
        'teach.villagerNotice',
        { name: v.name, skill: a.what },
        'calm',
      );
      return true;
    },
  },

  /**
   * Taking what somebody has been carrying about all afternoon. An empty
   * pair of arms is a no, which is what makes it safe to apply twice — the
   * second time there is nothing left in them.
   */
  'villager.unload': {
    cap: null,
    minigame: null,
    costs: null,
    yields: { stone: '*', wool: '*' }, // BAG_KEYS: whatever is in their arms
    tallies: [],
    journal: null,
    needs: null,
    once: false,
    twice: 'their arms are empty by then, and empty arms are a no',
    apply(w, a) {
      const v = byId(w.villagers, a.id);
      if (!v || !v.bag || !w.players[a.role]) return false;
      const keys = a.res ? [a.res] : BAG_KEYS;
      let took = 0;
      for (const k of keys) {
        if (!BAG_KEYS.includes(k)) continue;
        const n = v.bag[k] || 0;
        if (n <= 0) continue;
        v.bag[k] = 0;
        gain(w, a.role, k, n);
        fx(w, 'float', v.x, v.y - 0.6, '+' + n + ' ' + iconOf(k));
        took += n;
      }
      if (!took) return false;
      v.hearts = w.tick;
      return true;
    },
  },
};
