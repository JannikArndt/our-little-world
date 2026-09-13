// The strange machine. Nothing about it is explained: a valve is open or
// shut, a lever is up or down, and the wheel turns only when both are the
// right way at once. Working that out is the whole of what it is for.

import { openPanel, el, loop } from '../ui/overlay.js';
import { tr } from '../core/i18n.js';
import { machineSpinning } from '../core/world.js';

export function openMachine(game) {
  const p = openPanel({ title: tr('machine.title'), lead: tr('machine.lead') });

  const stage = el('div');
  stage.style.cssText = 'text-align:center;font-size:64px;padding:14px 0;';
  p.body.appendChild(stage);

  const row1 = p.row();
  const valveBtn = p.button('', '', () => {
    game.dispatch({ type: 'machine.turn', role: game.role, part: 'valve' });
  });
  row1.appendChild(valveBtn);

  const row2 = p.row();
  const leverBtn = p.button('', '', () => {
    game.dispatch({ type: 'machine.turn', role: game.role, part: 'lever' });
  });
  row2.appendChild(leverBtn);

  const doneRow = p.row();
  doneRow.appendChild(
    p.button(tr('ui.done'), 'soft', () => {
      stop();
      p.close();
    }),
  );

  function draw(t) {
    const w = game.world;
    const spinning = machineSpinning(w);
    stage.textContent = '⚙️';
    stage.style.transform = spinning ? 'rotate(' + ((t / 6) % 360) + 'deg)' : 'none';
    valveBtn.textContent = tr(
      w.machine.valve === 'open' ? 'machine.valveOpen' : 'machine.valveClosed',
    );
    leverBtn.textContent = tr(w.machine.lever ? 'machine.leverUp' : 'machine.leverDown');
    p.readout(tr(spinning ? 'machine.spinning' : 'machine.still'));
  }

  const stop = loop(t => draw(t));
  return p;
}
