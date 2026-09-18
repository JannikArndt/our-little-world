// The things a village builds for itself, and there is one action for all of
// them: what a project costs, who knows how and what it changes all live in
// PROJECTS, so a new one is a row there and nothing here.

import { rebuildBlocked } from '../grid.js';
import { PROJECTS } from '../content.js';
import { fx, journal, pay, tally } from './kit.js';

export const projects = {
  'project.build': {
    cap: 'byProject', // PROJECTS[what].cap — the project says who knows how
    minigame: null,
    costs: 'byProject', // PROJECTS[what].cost
    yields: null,
    tallies: ['byProject'], // the project's own type, so each one counts itself
    journal: 'byProject',
    needs: null,
    twice: 'a built project is no longer a plan',
    apply(w, a) {
      const def = PROJECTS[a.what];
      if (!def) return false;
      const plan = w.buildings.find(b => b.type === def.type);
      if (!plan || plan.state !== 'plan') return false;
      if (!pay(w, a.role, def.cost)) return false;
      plan.state = 'built';
      plan.builtTick = w.tick;
      if (def.type === 'boat') plan.fishedTick = -9999;
      rebuildBlocked(w);
      fx(w, 'sparkle', plan.x + plan.w / 2, plan.y + plan.h / 2);
      // the children hear the swing go up and go straight to it
      if (def.type === 'play')
        for (const v of w.villagers)
          if (v.kid) {
            v.path = [];
            v.task = null;
            v.wait = 0;
          }
      // clean water means nobody has to feel poorly about the river
      if (def.type === 'well' || def.type === 'privy')
        for (const v of w.villagers)
          if (v.poorly > 0) {
            v.poorly = 0;
            v.hearts = w.tick;
          }
      tally(w, a.role, def.type);
      journal(w, def.journal, 'j.' + def.type);
      w.notices = w.notices.filter(n => n.id !== 'poorly' && n.id !== 'sheep_in_field');
      return true;
    },
  },

  // The two projects that shipped before there was one action for all of them.
  // Kept so a world mid-flight, or a snapshot from an older build, still
  // applies cleanly — but they are the same one thing, not two more.
  'boat.build': { aliasOf: 'project.build', as: a => ({ role: a.role, what: 'boat' }) },
  'play.build': { aliasOf: 'project.build', as: a => ({ role: a.role, what: 'play' }) },
};
