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
 * Hand the link to whatever the device uses for sharing, and fall back down
 * the ladder: the share sheet, the clipboard, and finally just telling them
 * the name. Resolves with 'shared' | 'copied' | 'none'.
 */
export function shareWorld(name, otherRole) {
  const url = worldLink(name);
  const text = tr('invite.shareText', {
    name: prettyName(name),
    emoji: worldEmoji(name),
    role: otherRole ? roleName(otherRole) : '',
  });

  if (typeof navigator !== 'undefined' && navigator.share) {
    return navigator.share({ title: tr('app.title'), text: text, url: url })
      .then(() => 'shared')
      // a cancelled share sheet is not a failure, but a browser that refuses
      // outright (no gesture, or not a secure page) should still copy
      .catch((e) => (e && e.name === 'AbortError' ? 'shared' : copy(url)));
  }
  return Promise.resolve(copy(url));
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
  } catch (e) { return 'none'; }
}

/**
 * The invitation, from inside the game: shown when the other spot is still
 * free, so the answer to "where is my dad" is one tap away.
 */
export function openInvite(game) {
  const name = game.worldName;
  const other = game.other;
  const p = openPanel({
    title: tr('invite.title'),
    lead: tr('invite.lead', { role: roleName(other), emoji: ROLE[other].emoji }),
    center: true,
  });

  const card = el('div', 'world-card wide still');
  card.appendChild(el('span', 'w-emoji', worldEmoji(name)));
  const t = el('span', 'w-text');
  t.appendChild(el('span', 'w-name', prettyName(name)));
  t.appendChild(el('span', 'w-line', tr('world.waitingFor', { role: roleName(other), emoji: ROLE[other].emoji })));
  card.appendChild(t);
  p.body.appendChild(card);

  const link = el('p', 'link-line', worldLink(name));
  p.body.appendChild(link);

  const row = p.row();
  row.appendChild(p.button('📨 ' + tr('invite.share'), 'go', () => {
    shareWorld(name, other).then((how) => {
      if (how === 'copied') message(tr('invite.copied'));
      else if (how === 'none') message(tr('invite.tellName', { name: prettyName(name) }));
      p.close();
    });
  }));
  row.appendChild(p.button(tr('ui.close'), 'soft', () => p.close()));

  p.body.appendChild(el('p', 'lead center', tr('invite.note', { name: prettyName(name) })));
  return p;
}
