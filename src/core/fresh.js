// Is the page on the screen still the page that is being served?
//
// Added to a Home Screen, the game has no address bar and no reload button, and
// iOS keeps it alive in the background for days: come back to it next week and
// it is still exactly the copy that was downloaded last week. Nobody can get out
// of that from inside the app, so the app has to offer the way out itself.
//
// Two halves. The server writes the build it served into the page (the
// `olw-build` meta tag), and /version says which build is live now. Different
// answers mean the thing on screen is old. A plain static host does neither, so
// nothing is ever claimed to be out of date there — the door is still open, it
// just never lights up.
//
// A door only helps if somebody thinks to open it, and on a Home Screen nobody
// ever does — so the game fetches the newer build itself, the moment doing so
// costs nothing. `watchForNewer` keeps asking without being asked to, and
// `whenQuiet` waits for a moment nothing can be lost in before it acts.

/** The build this page was downloaded from, or '' where nobody stamped it. */
export const BUILD = (function () {
  const m = document.querySelector('meta[name="olw-build"]');
  const v = m ? m.getAttribute('content') : '';
  return v === 'dev' ? '' : v; // 'dev' is the unstamped file
})();

const QUIET_FOR = 60000; // never ask twice in the same minute
const POLL_EVERY = 180000; // and ask again on a slow timer even if nobody switches away and back
const STARTUP_GRACE = 20000; // never reload out from under somebody who just arrived
const startedAt = Date.now();
let asked = 0;
let newer = null;
let reloaded = false; // at most once per page life; a reload loop beats a stale copy at nothing

/** The newer build we have already seen, or null. No question asked. */
export function newerBuild() {
  return newer;
}

/**
 * Ask the server what it is serving. Answers with the newer build or null.
 * Being offline is not news: whatever we last knew stands.
 */
export function askIfNewer() {
  const now = Date.now();
  if (!BUILD || newer || now - asked < QUIET_FOR) return Promise.resolve(newer);
  asked = now;
  return fetch('/version', { cache: 'no-store' })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (v) {
      if (v && v.build && v.build !== BUILD) newer = v;
      return newer;
    })
    .catch(function () {
      return newer;
    });
}

/**
 * Download the game again, past anything the browser is holding on to.
 *
 * The room goes in the address so we come back to the same village, and a
 * throwaway number makes sure the page itself cannot come from a cupboard.
 * Everything is saved before this is called; the world is on the other side.
 */
export function reloadNow(world) {
  const q = ['fresh=' + Date.now()];
  if (world) q.push('world=' + encodeURIComponent(world));
  location.replace(location.pathname + '?' + q.join('&'));
}

/**
 * Ask whenever the app comes back to the front — which, on a Home Screen, used
 * to be the only moment it ever got the chance — and besides that, on a slow
 * timer, so a copy left open on one screen for an afternoon still finds out.
 * `onNews` is called once, if and when there turns out to be something newer;
 * `askIfNewer`'s own `QUIET_FOR` guard means none of this can turn into asking
 * more than once a minute, however often `look` runs.
 */
export function watchForNewer(onNews) {
  const look = function () {
    if (document.hidden) return;
    askIfNewer().then(function (v) {
      if (v && onNews) {
        onNews(v);
        onNews = null;
      }
    });
  };
  document.addEventListener('visibilitychange', look);
  window.addEventListener('pageshow', look);
  setInterval(look, POLL_EVERY);
  look();
}

/**
 * Do the newer build no harm in waiting for: act the instant `isQuiet()` says
 * yes, and not a moment before. A place where nothing is ever in progress —
 * the front door — can hand in a function that always says yes, and this
 * fires the first time it is asked; mid-game it is checked every couple of
 * seconds until a panel closes, a menu closes, a mode ends and a finger lifts.
 *
 * Never in the first `STARTUP_GRACE` of a page's life, so a `/version` that
 * flaps right after a deploy can never trap somebody arriving right then — and
 * never more than once ever, because a reload loop would cost far more than a
 * stale copy does.
 */
export function whenQuiet(isQuiet, go) {
  if (reloaded) return;
  const tryNow = function () {
    if (reloaded) return;
    if (Date.now() - startedAt < STARTUP_GRACE || !isQuiet()) {
      setTimeout(tryNow, 2000);
      return;
    }
    reloaded = true;
    go();
  };
  tryNow();
}
