// Inviting the other player: a link, a name, and a picture.
//
// There is nothing to protect here — no chat, no accounts, nothing anybody
// typed about themselves — so an invitation is simply the world's name. The
// link is a convenience; saying "Sunny Otter" out loud works just as well,
// which matters when the other player is five and on FaceTime.

import { el, openPanel, message } from './overlay.js';
import { prettyName, worldEmoji } from '../core/names.js';
import { ROLE, roleName } from '../core/world.js';
import { tr } from '../core/i18n.js';

/** The address that drops somebody straight into this world. */
export function worldLink(name) {
  return location.origin + location.pathname + '?world=' + encodeURIComponent(name);
}

/**
 * The address that also says which of the two chairs to sit in. For your own
 * second device — a Home Screen app has its own memory and arrives knowing
 * nothing, so being told is the whole difference between getting in and being
 * turned away at a world that already has two players.
 */
export function seatLink(name, role) {
  return worldLink(name) + '&role=' + encodeURIComponent(role);
}

/**
 * Hand a link to whatever the device uses for sharing, and fall back down the
 * ladder: the share sheet, the clipboard, and finally nothing.
 * Resolves with 'shared' | 'copied' | 'none'.
 */
function handOver(url, text) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    return (
      navigator
        .share({ title: tr('app.title'), text: text, url: url })
        .then(() => 'shared')
        // a cancelled share sheet is not a failure, but a browser that refuses
        // outright (no gesture, or not a secure page) should still copy
        .catch(e => (e && e.name === 'AbortError' ? 'shared' : copy(url)))
    );
  }
  return Promise.resolve(copy(url));
}

export function shareWorld(name, otherRole) {
  return handOver(
    worldLink(name),
    tr('invite.shareText', {
      name: prettyName(name),
      emoji: worldEmoji(name),
      role: otherRole ? roleName(otherRole) : '',
    }),
  );
}

function copy(url) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).catch(() => {});
    return 'copied';
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok ? 'copied' : 'none';
  } catch {
    return 'none';
  }
}

/**
 * The invitation, from inside the game: behind the chip of whoever is not
 * here yet, so the answer to "where is my dad" is one tap away.
 */
export function openInvite(game, role) {
  const name = game.worldName;
  const other = role || game.other;
  const p = openPanel({
    title: tr('invite.title'),
    lead: tr('invite.lead', { role: roleName(other), emoji: ROLE[other].emoji }),
    center: true,
  });

  const card = el('div', 'world-card wide still');
  card.appendChild(el('span', 'w-emoji', worldEmoji(name)));
  const t = el('span', 'w-text');
  t.appendChild(el('span', 'w-name', prettyName(name)));
  t.appendChild(
    el(
      'span',
      'w-line',
      tr('world.waitingFor', { role: roleName(other), emoji: ROLE[other].emoji }),
    ),
  );
  card.appendChild(t);
  p.body.appendChild(card);

  const link = el('p', 'link-line', worldLink(name));
  p.body.appendChild(link);

  const row = p.row();
  row.appendChild(
    p.button('📨 ' + tr('invite.share'), 'go', () => {
      shareWorld(name, other).then(how => {
        if (how === 'copied') message(tr('invite.copied'));
        else if (how === 'none') message(tr('invite.tellName', { name: prettyName(name) }));
        p.close();
      });
    }),
  );
  row.appendChild(p.button(tr('ui.close'), 'soft', () => p.close()));

  p.body.appendChild(el('p', 'lead center', tr('invite.note', { name: prettyName(name) })));
  return p;
}

/**
 * Taking your own seat to another browser.
 *
 * A world holds two spots and a spot belongs to whichever browser took it.
 * Saving the game to the Home Screen makes a browser with its own storage,
 * which turns up as a third person and is told the world is full. This hands
 * that browser a link that says which of the two it is, and then it simply
 * plays — the Safari tab is not thrown out, and if both are open they meet on
 * the relay like any two players.
 */
export function openSeat(game) {
  const name = game.worldName,
    role = game.role;
  const url = seatLink(name, role);
  const p = openPanel({
    title: tr('seat.moveTitle'),
    lead: tr('seat.moveLead', { role: roleName(role), emoji: ROLE[role].emoji }),
    center: true,
  });

  const card = el('div', 'world-card wide still');
  card.appendChild(el('span', 'w-emoji', worldEmoji(name)));
  const t = el('span', 'w-text');
  t.appendChild(el('span', 'w-name', prettyName(name)));
  t.appendChild(
    el('span', 'w-line', tr('world.youAre', { role: roleName(role), emoji: ROLE[role].emoji })),
  );
  card.appendChild(t);
  p.body.appendChild(card);
  p.body.appendChild(el('p', 'link-line', url));

  const row = p.row();
  row.appendChild(
    p.button(tr('seat.send'), 'go', () => {
      handOver(url, tr('seat.shareText', { name: prettyName(name), emoji: worldEmoji(name) })).then(
        how => {
          if (how === 'copied') message(tr('invite.copied'));
          p.close();
        },
      );
    }),
  );
  row.appendChild(p.button(tr('ui.close'), 'soft', () => p.close()));

  p.body.appendChild(el('p', 'lead center', tr('seat.moveNote')));
  return p;
}
