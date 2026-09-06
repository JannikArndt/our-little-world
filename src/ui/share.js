// Giving things to the other player. One screen, big buttons, no trade menu.

import { el, openPanel, message } from './overlay.js';
import { RESOURCES, ROLE, roleName, resName } from '../core/world.js';
import { tr } from '../core/i18n.js';

export function openGive(game, focusKey, toRole) {
  const w = game.world;
  const to = toRole || game.other;
  const mine = w.players[game.role].res;

  const p = openPanel({
    title: tr('give.title'),
    lead: tr('give.lead', { role: roleName(to) }),
  });

  const amounts = {};
  let any = false;

  for (const r of RESOURCES) {
    const have = mine[r.key] || 0;
    if (have <= 0) continue;
    any = true;
    amounts[r.key] = (focusKey === r.key) ? Math.min(1, have) : 0;

    const row = el('div', 'give-row');
    const head = el('div', 'g-head');
    head.appendChild(el('span', 'g-ico', r.icon));
    head.appendChild(el('span', 'g-name', resName(r.key)));

    const st = el('div', 'stepper');
    const minus = el('button', '', '−');
    const val = el('span', 'val', String(amounts[r.key]));
    const plus = el('button', '', '+');
    st.appendChild(minus); st.appendChild(val); st.appendChild(plus);
    head.appendChild(st);
    row.appendChild(head);

    // One picture per thing you own; the marked ones are the ones going across.
    const pips = el('div', 'g-pips cost-pips');
    const count = el('div', 'cost-txt g-count');
    row.appendChild(pips);
    row.appendChild(count);

    const paint = (key, howMany) => {
      amounts[key] = Math.max(0, Math.min(have, howMany));
      val.textContent = String(amounts[key]);
      pips.innerHTML = '';
      const show = Math.min(have, 12);
      for (let i = 0; i < show; i++) {
        const pip = el('span', 'pip' + (i < amounts[key] ? ' give' : ''), r.icon);
        pip.addEventListener('click', () => paint(key, i + 1 === amounts[key] ? i : i + 1));
        pips.appendChild(pip);
      }
      if (have > show) pips.appendChild(el('span', 'pip more', '…'));
      count.innerHTML = '';
      count.appendChild(document.createTextNode(tr('ui.have') + ' '));
      count.appendChild(el('b', '', String(have)));
      count.appendChild(document.createTextNode(' · ' + tr('give.give') + ' '));
      count.appendChild(el('b', 'n-give', String(amounts[key])));
    };
    minus.addEventListener('click', () => paint(r.key, amounts[r.key] - 1));
    plus.addEventListener('click', () => paint(r.key, amounts[r.key] + 1));
    paint(r.key, amounts[r.key]);
    p.body.appendChild(row);
  }

  if (!any) p.body.appendChild(el('p', 'lead', tr('give.nothing')));

  const row = p.row();
  if (any) {
    row.appendChild(p.button(tr('give.button', { role: roleName(to), emoji: ROLE[to].emoji }), 'go', () => {
      let n = 0;
      for (const k in amounts) {
        if (amounts[k] > 0 && game.dispatch({ type: 'give', from: game.role, to: to, res: k, n: amounts[k] })) n += amounts[k];
      }
      p.close();
      if (n) message(tr('msg.gaveAcross', { n: n, role: roleName(to) }));
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
