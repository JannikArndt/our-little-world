// Giving things to the other player. One screen, big buttons, no trade menu.

import { el, openPanel, toast } from './overlay.js';
import { RESOURCES, ROLE } from '../core/world.js';

export function openGive(game, focusKey) {
  const w = game.world;
  const mine = w.players[game.role].res;
  const other = ROLE[game.other];

  const p = openPanel({
    title: '🤝 Sharing',
    lead: 'What should go over to the ' + other.name + '?',
  });

  const amounts = {};
  let any = false;

  for (const r of RESOURCES) {
    const have = mine[r.key] || 0;
    if (have <= 0) continue;
    any = true;
    amounts[r.key] = (focusKey === r.key) ? Math.min(1, have) : 0;

    const row = el('div', 'give-row');
    row.appendChild(el('span', 'g-ico', r.icon));
    const name = el('span', 'g-name', r.name);
    name.appendChild(el('span', '', ''));
    row.appendChild(name);
    const count = el('span', '', 'you have ' + have);
    count.style.cssText = 'color:#7a6a56;font-size:13px;margin-right:8px;';
    row.appendChild(count);

    const st = el('div', 'stepper');
    const minus = el('button', '', '−');
    const val = el('span', 'val', String(amounts[r.key]));
    const plus = el('button', '', '+');
    minus.addEventListener('click', () => { amounts[r.key] = Math.max(0, amounts[r.key] - 1); val.textContent = amounts[r.key]; });
    plus.addEventListener('click', () => { amounts[r.key] = Math.min(have, amounts[r.key] + 1); val.textContent = amounts[r.key]; });
    st.appendChild(minus); st.appendChild(val); st.appendChild(plus);
    row.appendChild(st);
    p.body.appendChild(row);
  }

  if (!any) p.body.appendChild(el('p', 'lead', 'Your side of the table is empty just now.'));

  const row = p.row();
  if (any) {
    row.appendChild(p.button('Give it to the ' + other.name + ' ' + other.emoji, 'go', () => {
      let n = 0;
      for (const k in amounts) {
        if (amounts[k] > 0 && game.dispatch({ type: 'give', from: game.role, to: game.other, res: k, n: amounts[k] })) n += amounts[k];
      }
      p.close();
      toast(n ? '🤝 ' + n + ' sent across.' : 'Nothing chosen.');
    }));
  }
  if ((mine.food || 0) > 0) {
    row.appendChild(p.button('🧺 Into the village basket', 'soft', () => {
      const n = Math.min(3, mine.food);
      game.dispatch({ type: 'larder.give', from: game.role, n });
      p.close();
      toast('🍞 ' + n + ' in the basket. The hungry ones will come.');
    }));
  }
  row.appendChild(p.button('Close', 'soft', () => p.close()));
}
