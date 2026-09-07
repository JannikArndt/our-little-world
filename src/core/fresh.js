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

/** The build this page was downloaded from, or '' where nobody stamped it. */
export const BUILD = (function () {
  const m = document.querySelector('meta[name="olw-build"]');
  const v = m ? m.getAttribute('content') : '';
  return v === 'dev' ? '' : v;                  // 'dev' is the unstamped file
})();

const QUIET_FOR = 60000;   // never ask twice in the same minute
let asked = 0;
let newer = null;

/** The newer build we have already seen, or null. No question asked. */
export function newerBuild() { return newer; }

/**
 * Ask the server what it is serving. Answers with the newer build or null.
 * Being offline is not news: whatever we last knew stands.
 */
export function askIfNewer() {
  const now = Date.now();
  if (!BUILD || newer || now - asked < QUIET_FOR) return Promise.resolve(newer);
  asked = now;
  return fetch('/version', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (v) {
      if (v && v.build && v.build !== BUILD) newer = v;
      return newer;
    })
    .catch(function () { return newer; });
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
 * Ask again whenever the app comes back to the front — which, on a Home Screen,
 * is the only moment it ever gets the chance. `onNews` is called once, if and
 * when there turns out to be something newer.
 */
export function watchForNewer(onNews) {
  const look = function () {
    if (document.hidden) return;
    askIfNewer().then(function (v) { if (v && onNews) { onNews(v); onNews = null; } });
  };
  document.addEventListener('visibilitychange', look);
  window.addEventListener('pageshow', look);
  look();
}
