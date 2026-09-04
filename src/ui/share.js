// Giving things to the other player. One screen, big buttons, no trade menu.

import { el, openPanel, message } from './overlay.js';
import { RESOURCES, ROLE, roleName, resName } from '../core/world.js';
import { tr } from '../core/i18n.js';

export function openGive(game, focusKey) {
  const w = game.world;
  const mine = w.players[game.role].res;

  const p = openPanel({
    title: tr('give.title'),
    lead: tr('give.lead', { role: roleName(game.other) }),
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
    const name = el('span', 'g-name', resName(r.key));
    name.appendChild(el('span', '', ''));
    row.appendChild(name);
    const count = el('span', '', tr('give.youHave', { n: have }));
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

  if (!any) p.body.appendChild(el('p', 'lead', tr('give.nothing')));

  const row = p.row();
  if (any) {
    row.appendChild(p.button(tr('give.button', { role: roleName(game.other), emoji: ROLE[game.other].emoji }), 'go', () => {
      let n = 0;
      for (const k in amounts) {
        if (amounts[k] > 0 && game.dispatch({ type: 'give', from: game.role, to: game.other, res: k, n: amounts[k] })) n += amounts[k];
      }
      p.close();
      if (n) message(tr('msg.gaveAcross', { n: n, role: roleName(game.other) }));
    }));
  }
  if ((mine.food || 0) > 0) {
    row.appendChild(p.button(tr('give.basket'), 'soft', () => {
      const n = Math.min(3, mine.food);
      game.dispatch({ type: 'larder.give', from: game.role, n });
      p.close();
      message(tr('msg.inBasket', { n: n }));
    }));
  }
  row.appendChild(p.button(tr('ui.close'), 'soft', () => p.close()));
}
