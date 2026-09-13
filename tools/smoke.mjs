// A real browser plays the game: pick a role, run a play block, poke at things.
// Playwright is a devDependency, so normally it resolves by name. One sandbox
// has it installed globally with nothing to resolve it from; the absolute path
// is for that sandbox, and for nowhere else.
const { chromium } = await import('playwright').catch(
  () => import('/opt/node22/lib/node_modules/playwright/index.mjs'),
);

const BASE = process.env.BASE || 'http://localhost:8099';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
const errors = [];

// QUICK=1 keeps every assertion and drops what only a person would look at:
// the screenshots, the second browser, and the walk round three screen sizes.
// For iterating. The full run is what a push waits for.
const QUICK = process.env.QUICK === '1';

// The three shapes it has to work in. The iPad is the 11" Pro in landscape,
// which is what this is actually played on; the phone is an iPhone in portrait.
const DEVICES = {
  ipad: { width: 1194, height: 834, dpr: 2, touch: true },
  iphone: { width: 393, height: 852, dpr: 3, touch: true },
  mac: { width: 1280, height: 800, dpr: 2, touch: false },
};

function watch(page, tag) {
  page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(tag + ' console: ' + m.text());
  });
  page.on('requestfailed', r => errors.push(tag + ' request failed: ' + r.url()));
}

const step = async (page, name, ms = 400) => {
  await page.waitForTimeout(ms);
  if (!QUICK) await page.screenshot({ path: SHOTS + name + '.png' });
};

async function main() {
  const browser = await chromium.launch();

  /* ---------- 1. the whole flow on an iPad ---------- */
  const ipad = await browser.newContext({
    viewport: { width: DEVICES['ipad'].width, height: DEVICES['ipad'].height },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await ipad.newPage();
  watch(page, 'ipad');
  await page.goto(BASE + '/?room=smoke', { waitUntil: 'load' });
  await step(page, '01-start');

  // the front door says which version this is, and what changed in it
  const version = (await page.textContent('#versionBtn')).trim();
  console.log('the start screen says:', version);
  if (!/^v\d+\.\d+/.test(version)) throw new Error('no version on the start screen');
  await page.click('#versionBtn');
  await page.waitForTimeout(400);
  const startLog = await page.textContent('.panel');
  if (!/What is new/.test(startLog))
    throw new Error('the changelog does not open from the start screen');
  await page.click('text=Close');
  await page.waitForTimeout(300);

  // a Home Screen app has no address bar, so the page carries its own way back
  // to the server: the build it was served, and a door that fetches it again
  const build = await page.getAttribute('meta[name="olw-build"]', 'content');
  const served = await (await fetch(BASE + '/version')).json();
  console.log('the page knows which build it is:', build, '· the server serves:', served.build);
  if (build !== served.build)
    throw new Error('the page was not stamped with the build it came from');
  const reload = (await page.textContent('#reloadBtn')).trim();
  console.log('the front door offers:', reload);

  // The picture on a Home Screen, and the manifest that names it. The manifest
  // deliberately has no start_url: iOS would use it instead of the address the
  // world was added from, and the world name lives in that address.
  const icon = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="apple-touch-icon"]');
    const man = document.querySelector('link[rel="manifest"]');
    if (!link || !man) return { link: !!link, man: !!man };
    const i = await fetch(link.href),
      m = await fetch(man.href);
    const j = m.ok ? await m.json() : null;
    return {
      link: true,
      man: true,
      iconOk: i.ok,
      type: i.headers.get('content-type'),
      manOk: m.ok,
      icons: j && j.icons ? j.icons.length : 0,
      name: j && j.short_name,
      startUrl: (j && j.start_url) || null,
    };
  });
  console.log('the Home Screen icon:', JSON.stringify(icon));
  if (!icon.link || !icon.man) throw new Error('the page does not point at an icon and a manifest');
  if (!icon.iconOk || String(icon.type).indexOf('image/png') !== 0)
    throw new Error('the Home Screen icon is not being served');
  if (!icon.manOk || !icon.icons) throw new Error('the manifest is not being served');
  if (icon.startUrl) throw new Error('a start_url would drop the world out of a Home Screen link');
  if (!reload || reload === '↻') throw new Error('no reload door on the start screen');

  // and asking twice costs nothing: the second answer comes out of the cupboard
  const again = await fetch(BASE + '/', {
    headers: { 'if-none-match': (await fetch(BASE + '/')).headers.get('etag') },
  });
  console.log('asking for the page again:', again.status, '(304 means it only had to check)');
  if (again.status !== 304) throw new Error('the page has no working tag to revalidate with');

  await page.click('[data-role="BOTH"]');
  await page.waitForSelector('#game:not(.hidden)');
  await page.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 8000 });
  // the day now starts on its own, with no offer panel to click through
  await page.waitForFunction(() => window.OLW.world.block.active, null, { timeout: 8000 });
  await step(page, '02-world', 900);

  // The mission is its own button now, next to the role chips (law 1): one
  // icon, no text, no number, and it is there from the moment the village is
  // on screen — it never disappears, calm or not.
  if (!(await page.$('#missionChip'))) throw new Error('no mission button in the top row');
  // the red badge it replaced is gone everywhere, not relabelled somewhere else
  if (await page.$('.r-todo')) throw new Error('the old todo badge is still in the page');

  await page.click('#missionChip');
  await step(page, '02c-guide', 900);
  const guide = await page.textContent('.panel');
  console.log('opening card says:', guide.replace(/\s+/g, ' ').trim().slice(0, 150));
  if (!/Build a house for|Build a bridge|Mend the bridge/.test(guide))
    throw new Error('the card does not say what to do');
  if ((await page.$$eval('.step', ns => ns.length)) < 2) throw new Error('the card has no steps');
  // a named person is drawn on the card and ringed out in the world
  const named = await page.evaluate(() => {
    const g = window.OLW;
    return { face: !!document.querySelector('.guide-who .who-face'), ring: !!g.spotlightAt() };
  });
  console.log('the card shows who it is about:', JSON.stringify(named));
  if (!named.face || !named.ring) throw new Error('the card names somebody it never shows');
  // and every counted step reads "have/need"
  const counts = await page.$$eval('.step .s-count', ns => ns.map(n => n.textContent.trim()));
  console.log('counted steps:', counts.join(', '));
  if (!counts.length || !counts.every(c => /^\d+\/\d+/.test(c)))
    throw new Error('steps carry no counts');
  await page.click('text=Right, got it');
  await step(page, '03-world', 1200);

  // 👥 — everybody who lives here, by name, with whose house they are in
  await page.click('#folkChip');
  await page.waitForTimeout(300);
  const folk = await page.textContent('.menu');
  const someone = await page.evaluate(() => window.OLW.world.villagers[0]);
  console.log('the village list starts:', folk.replace(/\s+/g, ' ').trim().slice(0, 160));
  if (folk.indexOf(someone.name) < 0) throw new Error('the villagers menu does not name anybody');
  if (!/Lives in|Nowhere to sleep/.test(folk))
    throw new Error('the villagers menu does not say where they live');
  if (folk.indexOf('Cloud') < 0) throw new Error('the sheep are not in the village list');
  // tapping a row takes the world to them, and rings them while you look
  await page.click('.menu .menu-item:not(.off) >> nth=0');
  await page.waitForTimeout(400);
  const ringed = await page.evaluate(() => !!window.OLW.spotlightAt());
  console.log('tapping a name rings them in the world:', ringed);
  if (!ringed) throw new Error('tapping a villager in the list does not show them');

  // 🧺 — the basket, said as a sum rather than a number
  await page.evaluate(() => {
    window.OLW.world.larder.food = 7;
  });
  // "the hungry come here on their own" is the whole point of the basket, so
  // somebody is often standing right on it — and a person answers a tap
  // before the basket does. Wait for the spot to clear rather than poke them.
  let basketShown = false;
  for (let go = 0; go < 20 && !basketShown; go++) {
    const basketPt = await page.evaluate(() => {
      const g = window.OLW,
        w = g.world;
      const canvas = document.getElementById('world');
      const r = canvas.getBoundingClientRect();
      g.look(w.larder.x, w.larder.y, 2.4);
      const p = g.renderer.toScreen(w.larder.x * 24, w.larder.y * 24);
      const x = r.left + p.x,
        y = r.top + p.y;
      const busy =
        w.villagers.some(v => Math.abs(v.x - w.larder.x) < 1 && Math.abs(v.y - w.larder.y) < 1) ||
        document.elementFromPoint(x, y) !== canvas;
      return { x, y, busy };
    });
    if (basketPt.busy) {
      await page.waitForTimeout(300);
      continue;
    }
    await page.mouse.click(basketPt.x, basketPt.y);
    basketShown = await page
      .waitForSelector('.panel', { timeout: 500 })
      .then(() => true)
      .catch(() => false);
  }
  if (!basketShown) throw new Error('tapping the basket never opened its panel');
  const basket = (await page.textContent('.panel')).replace(/\s+/g, ' ').trim();
  console.log('the basket says:', basket.slice(0, 200));
  if (!/loaves in the basket/.test(basket))
    throw new Error('the basket does not say how much is inside');
  if (!/people eat about/.test(basket))
    throw new Error('the basket does not say what the village eats in a day');
  if (!/days of meals/.test(basket))
    throw new Error('the basket does not say how many days that lasts');
  await page.click('.panel-foot >> text=Close');
  await page.waitForTimeout(300);

  const api = async (fn, arg) => page.evaluate(fn, arg);

  /**
   * Tap a tile, choosing whichever of the given ones nobody is standing on —
   * people answer a tap before the ground does, which is right in the game and
   * flaky in a test. Candidates are tile coordinates; the tap lands in the
   * middle of the tile, so a fraction moves it about within one.
   *
   * It never taps a point it has not just looked at. The camera is moved to
   * the candidate it means to tap (or to `lookAt`, when the framing matters),
   * the world is given a moment to settle, and only then is the same tile
   * checked again with the click one round trip away. A candidate that fails
   * three times is dropped, and when nothing is left it says what was in the
   * way rather than tapping a spot it has never looked at — which is how a
   * sapling once went to the tile Anna was standing on.
   */
  const tapTile = async (cands, lookAt) => {
    const strikes = cands.map(() => 0);
    let why = 'there were no tiles to try';
    for (let go = 0; go < 8; go++) {
      // whom the tile has to be clear of, before a camera move is spent on it
      const i = await api(
        arg => {
          const w = window.OLW.world;
          const busy = c =>
            w.villagers.some(v => Math.abs(v.x - c[0]) < 1.3 && Math.abs(v.y - c[1]) < 1.3) ||
            w.sheep.some(sh => Math.abs(sh.x - c[0]) < 1.3 && Math.abs(sh.y - c[1]) < 1.3);
          return arg.cands.findIndex((c, n) => arg.strikes[n] < 3 && !busy(c));
        },
        { cands, strikes },
      );
      if (i < 0) {
        why = 'somebody was standing on every one of them';
        await page.waitForTimeout(400);
        continue;
      }
      await api(arg => window.OLW.look(arg.at[0], arg.at[1], 2), { at: lookAt || cands[i] });
      await page.waitForTimeout(300); // the world redraws, and people move on
      const seen = await api(
        arg => {
          const g = window.OLW,
            w = g.world,
            c = arg.c;
          const canvas = document.getElementById('world');
          const r = canvas.getBoundingClientRect();
          if (
            w.villagers.some(v => Math.abs(v.x - c[0]) < 1.3 && Math.abs(v.y - c[1]) < 1.3) ||
            w.sheep.some(sh => Math.abs(sh.x - c[0]) < 1.3 && Math.abs(sh.y - c[1]) < 1.3)
          )
            return { why: 'somebody walked onto it' };
          const p = g.renderer.toScreen(c[0] * 24 + 12, c[1] * 24 + 12);
          const x = r.left + p.x,
            y = r.top + p.y;
          if (x < r.left + 4 || x > r.right - 4 || y < r.top + 4 || y > r.bottom - 4)
            return { why: 'it sits off the edge of the screen' };
          const on = document.elementFromPoint(x, y);
          if (on !== canvas)
            return {
              why: 'a ' + ((on && (on.className || on.tagName)) || 'nothing') + ' covers it',
            };
          return { x, y };
        },
        { c: cands[i] },
      );
      if (seen.why) {
        strikes[i]++;
        why = seen.why + ' (tile ' + cands[i] + ')';
        continue;
      }
      await page.mouse.click(seen.x, seen.y);
      return seen;
    }
    throw new Error('none of these tiles could be tapped: ' + JSON.stringify(cands) + ' — ' + why);
  };

  /**
   * Tap until the thing that should open has opened. People and sheep answer
   * before the ground does, and a plan can have somebody standing on every
   * tile of it for a few seconds — she wanders off again, so the cure is
   * another tap rather than a longer wait.
   */
  const tapFor = async (cands, lookAt, words) => {
    let last = '';
    for (let go = 0; go < 6; go++) {
      try {
        await tapTile(cands, lookAt);
        await page.waitForSelector('text=' + words, { timeout: 2500 });
        return;
      } catch (e) {
        last = e.message;
        await page.waitForTimeout(500);
      }
    }
    throw new Error('six taps and nothing offered "' + words + '": ' + last);
  };

  // world sanity
  const info = await api(() => {
    const w = window.OLW.world;
    return {
      tick: w.tick,
      block: w.block.active,
      villagers: w.villagers.length,
      sheep: w.sheep.length,
      trees: w.trees.length,
    };
  });
  console.log('world:', JSON.stringify(info));
  if (!info.block) throw new Error('the play block did not start');

  // tap a tree -> the felling game. Every standing tree is a candidate, so a
  // person loitering under one costs a tree rather than the run.
  const anyTree = await api(() =>
    window.OLW.world.trees.filter(t => t.state === 'standing').map(t => [t.x, t.y]),
  );
  await tapFor(anyTree, null, 'Fell this tree');
  await step(page, '04-tree-bubble', 400);
  await page.click('text=Fell this tree');
  await step(page, '05-chop', 600);

  // Swing at the mark wherever it has moved to. Landing every one of them is
  // the best a tree can be cut, so this also says what a clean fell is worth.
  const before = await api(() => window.OLW.world.players.A.res.wood);
  // clicking the element rather than the screen, so a picture taller than the
  // window is scrolled to before the axe lands rather than swung at blind
  const pic = page.locator('.panel canvas');
  let swings = 0;
  for (let i = 0; i < 12; i++) {
    const aim = await api(() => window.OLW._chop);
    if (!aim) break;
    const box = await pic.boundingBox();
    await pic.click({ position: { x: box.width * 0.5, y: box.height * (aim.y / aim.H) } });
    swings++;
    await page.waitForTimeout(150);
    // the notch half cut and the logs stacking up beside it
    if (swings === 3) await step(page, '05b-notch', 0);
  }
  await step(page, '05c-timber', 500);
  console.log('swings to fell it:', swings);
  if (swings > 6) throw new Error('a clean notch should take five swings, not ' + swings);
  await step(page, '06-chopped', 2600);

  // The wood is partly carried off and partly still lying there as a log, so
  // count the lot: what the player has, what is on the ground, what is in arms.
  const got = await api(() => {
    const w = window.OLW.world;
    let n = 0;
    for (const l of w.logs) n += l.wood;
    for (const v of w.villagers) if (v.carrying) n += v.carrying.wood;
    return {
      wood: w.players.A.res.wood,
      loose: n,
      felled: w.trees.filter(t => t.state !== 'standing').length,
    };
  });
  console.log('after felling:', JSON.stringify(got));
  if (!got.felled) throw new Error('the tree is still standing');
  const gained = got.wood - before + got.loose;
  if (gained < 7) throw new Error('a clean fell should give 2 wood and 5 logs, got ' + gained);

  // The day can end in the middle of a swing — the day's card wipes the
  // overlay from under the felling game. It has to notice and let go, rather
  // than draw on into a canvas nobody can see and close somebody else's card
  // a second later. Taking the overlay away is exactly what that looks like.
  const stillStanding = await api(() =>
    window.OLW.world.trees.filter(t => t.state === 'standing').map(t => [t.x, t.y]),
  );
  await tapTile(stillStanding);
  await page.waitForTimeout(400);
  const fellBtn = await page.$('text=Fell this tree');
  if (fellBtn) {
    await fellBtn.click();
    await page.waitForTimeout(500);
    if (!(await api(() => !!window.OLW._chop))) throw new Error('the felling game did not open');

    // Cut it right through first: the tree has to be on its way over when the
    // overlay goes, because that is the case that used to bite — the settle
    // ran on and then closed whatever card had taken its place.
    const pic2 = page.locator('.panel canvas');
    const standing = await api(
      () => window.OLW.world.trees.filter(t => t.state === 'standing').length,
    );
    for (let i = 0; i < 12; i++) {
      const aim = await api(() => window.OLW._chop);
      if (!aim) break;
      const b = await pic2.boundingBox();
      await pic2.click({ position: { x: b.width * 0.5, y: b.height * (aim.y / aim.H) } });
      await page.waitForTimeout(150);
    }
    await api(() => window.OLW.startDay(false)); // the day turns as it falls
    await page
      .waitForFunction(() => window.OLW._chop === null, null, { timeout: 4000 })
      .catch(() => {
        throw new Error('the felling game held on after the overlay went');
      });
    await page.waitForTimeout(2200); // longer than its fall and settle
    const stillCut = await api(
      n => window.OLW.world.trees.filter(t => t.state === 'standing').length < n,
      standing,
    );
    if (!stillCut) throw new Error('a tree cut right through was not felled when the day ended');
    const shut = await page.evaluate(() =>
      document.getElementById('overlay').classList.contains('hidden'),
    );
    console.log('the overlay after a swing was interrupted, hidden:', shut);
    if (!shut) throw new Error('the felling game left a card open behind the new morning');
    await page.waitForTimeout(500);
  }

  // sawmill
  await api(() => {
    window.OLW.world.players.A.res.wood = 6;
  });
  // somebody standing in the doorway would answer the tap instead of the
  // workshop, so offer every corner and let tapTile take a clear one
  const workshop = await api(() => {
    const b = window.OLW.world.buildings.find(b => b.type === 'workshop');
    return {
      tiles: [
        [b.x, b.y],
        [b.x + b.w - 1, b.y],
        [b.x, b.y + 1],
      ],
      at: [b.x + b.w / 2, b.y + b.h / 2],
    };
  });
  await tapFor(workshop.tiles, workshop.at, 'Saw wood into planks');
  await step(page, '07-workshop-bubble', 400);
  await page.click('text=Saw wood into planks');
  await step(page, '08-sawmill', 500);
  // cut the log the way this log's order asks for
  const planksBefore = await api(() => window.OLW.world.players.A.res.plank);
  const order = await api(() => window.OLW._saw);
  console.log('the order:', order.pieces + ' x ' + order.size);
  const cv = await page.$('.panel canvas');
  const box = await cv.boundingBox();
  const at = u => ({
    x: box.x + box.width * ((96 + 24 * u) / 480),
    y: box.y + box.height * (128 / 236),
  });
  for (let i = 1; i < order.pieces; i++) {
    const pt = at(i * order.size);
    await page.mouse.click(pt.x, pt.y);
  }
  await step(page, '09-cuts', 300);
  await page.click('text=Saw it');
  await step(page, '10-sawn', 1800);
  const planks = (await api(() => window.OLW.world.players.A.res.plank)) - planksBefore;
  console.log('planks from this log:', planks, '(the order was', order.pieces + ')');
  if (planks !== order.pieces) throw new Error('cutting to the order did not fill it');
  // a second log has to be measured again: no "same again" shortcut
  await page.click('text=The next log');
  const order2 = await api(() => window.OLW._saw);
  console.log('the next log asks for:', order2.pieces + ' x ' + order2.size);
  await page.locator('.panel .row .btn.soft').last().click();

  // bridge
  await api(() => {
    const w = window.OLW.world;
    w.players.A.res.plank = 9;
    w.players.A.res.stone = 9;
  });
  // the whole crossing, so somebody on the near bank costs nothing
  const crossing = await api(() => {
    const s = window.OLW.world.bridge.site;
    const tiles = [];
    for (let x = s.x0; x <= s.x1; x++) tiles.push([x, s.row + 0.5]);
    const mid = Math.round((s.x0 + s.x1) / 2);
    tiles.sort((a, b) => Math.abs(a[0] - mid) - Math.abs(b[0] - mid));
    return { tiles, at: [(s.x0 + s.x1 + 1) / 2, s.row + 1] };
  });
  await tapFor(crossing.tiles, crossing.at, 'Build a bridge here');
  await step(page, '11-crossing-bubble', 400);
  await page.click('text=Build a bridge here');
  await step(page, '12-bridge-design', 600);
  const bcv = await page.$('.panel canvas');
  const bbox = await bcv.boundingBox();
  const bx = i => ({
    x: bbox.x + bbox.width * ((62 + (356 / 5) * i) / 480),
    y: bbox.y + bbox.height * (150 / 250),
  });
  await page.mouse.click(bx(2).x, bx(2).y);
  await page.mouse.click(bx(4).x, bx(4).y);
  await step(page, '13-piers', 400);
  await page.click('text=Try it');
  await step(page, '14-test-walk', 2600);
  await page.click('text=Build it');
  await step(page, '15-bridge-built', 1500);
  const built = await api(() => window.OLW.world.bridge.built);
  console.log('bridge built:', built);
  if (!built) throw new Error('the bridge was not built');

  // swap to the Keeper and look after a sheep
  await page.click('#roleBar button.me');
  await step(page, '15b-menu', 300);
  await page.click('text=Play as the Keeper');
  await step(page, '16-keeper', 500);
  // A deliberate tap on somebody, not on the ground: she is the point. Leave
  // it alone — the next audit of world taps is not meant to "fix" this one.
  // She is a moving target near the top of a short world. Nothing is laid over
  // the world any more, so it is only her: frame her, check the tap really
  // lands on the canvas, and try again.
  // Any old bubble is not good enough: a villager wandering past her opens
  // their own, and then "Look after her" is nowhere. Keep going until it is
  // hers, putting the wrong one away each time.
  for (let attempt = 0; attempt < 8 && !(await page.$('text=Look after her')); attempt++) {
    const pt = await api(
      dys => {
        const g = window.OLW,
          s = g.world.sheep[0];
        g.setMode(null); // whatever came up last time, away
        const canvas = document.getElementById('world');
        for (const dy of dys) {
          g.look(s.x, s.y + dy, 2);
          const p = g.renderer.toScreen(s.x * 24, s.y * 24);
          const r = canvas.getBoundingClientRect();
          const x = r.left + p.x,
            y = r.top + p.y;
          if (x < r.left + 20 || x > r.right - 20 || y < r.top + 20 || y > r.bottom - 20) continue;
          if (document.elementFromPoint(x, y) !== canvas) continue;
          // somebody standing on her would answer first; wait for them to move on
          if (g.world.villagers.some(v => Math.abs(v.x - s.x) < 1.1 && Math.abs(v.y - s.y) < 1.1))
            continue;
          return { x, y };
        }
        return null;
      },
      [-2, 0, -4, 2, -6],
    );
    if (!pt) {
      await page.waitForTimeout(400);
      continue;
    }
    await page.mouse.click(pt.x, pt.y); // straight away: a notice can arrive
    await page.waitForTimeout(400);
  }
  await step(page, '17-sheep-bubble', 400);
  await page.click('text=Look after her');
  await step(page, '18-care', 700);
  // tapping an item is enough — no dragging required
  const cbox = await (await page.$('.panel canvas')).boundingBox();
  const item = i => ({
    x: cbox.x + cbox.width * ((60 + i * 100) / 420),
    y: cbox.y + cbox.height * (258 / 300),
  });
  const fluffBefore = await api(() => window.OLW.world.sheep[0].fluff);
  await page.mouse.click(item(2).x, item(2).y); // the shears
  await page.waitForTimeout(1100);
  const fluffAfter = await api(() => window.OLW.world.sheep[0].fluff);
  console.log('shearing by tapping: fluff', fluffBefore, '->', fluffAfter);
  if (!(fluffAfter < fluffBefore)) throw new Error('tapping an item did nothing');
  await step(page, '18b-sheared', 400);
  await page.click('text=Done');

  // roads are not restricted to a starting point any more
  await api(() => {
    const g = window.OLW;
    g.world.players.B.res.stone = 9;
    g.setMode(null);
  });

  // farming: sow and water
  await api(() => {
    const g = window.OLW,
      w = g.world;
    for (const p of w.plots) g.dispatch({ type: 'plot.plant', role: 'B', plotId: p.id });
    for (const p of w.plots) g.dispatch({ type: 'plot.water', role: 'B', plotId: p.id });
    g.look(29, 17, 1.6);
  });
  await step(page, '19-field', 900);

  // a road
  await api(() => {
    const g = window.OLW;
    g.world.players.B.res.stone = 8;
    const tiles = [];
    for (let x = 20; x < 26; x++) tiles.push({ x, y: 13 });
    g.dispatch({ type: 'road.build', role: 'B', tiles });
    g.look(23, 13, 1.6);
  });
  await step(page, '20-road', 900);

  // a house
  await api(() => {
    const g = window.OLW,
      w = g.world;
    w.players.A.res.plank = 9;
    w.players.A.res.stone = 9;
    g.role = 'A';
    g.other = 'B';
    const site = w.buildings.find(b => b.state === 'site');
    g.look(site.x + 1.5, site.y + 1, 1.8);
    return site.id;
  });
  await page.waitForTimeout(300);
  // every tile of the plot, so tapTile can pick one nobody is standing on. Ted
  // has nowhere to sleep and hangs about the empty plot, and a person answers a
  // tap before the ground does — this failed in CI having passed here three
  // times, which is exactly how this kind of tap behaves.
  const siteTiles = await api(() => {
    const s = window.OLW.world.buildings.find(b => b.state === 'site');
    const out = [];
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) out.push([x, y]);
    return { tiles: out, at: [s.x + s.w / 2, s.y + s.h / 2] };
  });
  await tapFor(siteTiles.tiles, siteTiles.at, 'Build a house here');
  await step(page, '21-site-bubble', 400);
  await page.click('text=Build a house here');
  await step(page, '22-house-plan', 600);
  await page.click('text=Put it up');
  await page.waitForTimeout(900);
  const houses = await api(
    () => window.OLW.world.buildings.filter(b => b.type === 'house' && b.state === 'built').length,
  );
  console.log('houses:', houses);
  if (houses < 3) throw new Error('the house was not built');

  // It opens on the inside by itself, because the inside is the point: a house
  // is raised in one tap and then furnished for ever, a piece at a time.
  await page.waitForSelector('.tools .tool', { timeout: 5000 });
  const newHouse = () =>
    api(() => {
      const b = window.OLW.world.buildings.filter(
        x => x.type === 'house' && x.builtTick != null,
      )[0];
      return {
        id: b.id,
        stuff: b.stuff.length,
        comfort: b.comfort,
        beds: b.beds,
        flame: !!b.flame,
      };
    });
  const roomWas = await newHouse();
  console.log('a new house starts with:', JSON.stringify(roomWas));
  if (roomWas.stuff !== 2 || roomWas.beds !== 1)
    throw new Error('a new house is not a window and a bed');

  const hcv = await page.$('.panel canvas');
  const hbox = await hcv.boundingBox();
  const spot = (lx, ly) => ({
    x: hbox.x + hbox.width * (lx / 514),
    y: hbox.y + hbox.height * (ly / 300),
  });

  /**
   * Nothing is bought with a tap: a thing is written or drawn into being
   * first. So follow the line it puts up — the only way to know its shape is
   * to ask the tracer, which is what `OLW.tracing` is there for.
   */
  const startTrace = async label => {
    await page.click('.tools .tool:has-text("' + label + '")');
    await page.waitForFunction(() => window.OLW.tracing, null, { timeout: 5000 });
  };
  const followTrace = async () => {
    const strokes = await api(() =>
      window.OLW.tracing.strokes.map(s => s.pts.map(p => [p.x, p.y])),
    );
    for (const pts of strokes) {
      const first = spot(pts[0][0], pts[0][1]);
      await page.mouse.move(first.x, first.y);
      await page.mouse.down();
      for (const [lx, ly] of pts) {
        const q = spot(lx, ly);
        await page.mouse.move(q.x, q.y);
      }
      await page.mouse.up();
    }
    await page.waitForFunction(() => !window.OLW.tracing, null, { timeout: 5000 });
    return { strokes: strokes.length, points: strokes.reduce((k, p) => k + p.length, 0) };
  };
  const traceIt = async label => {
    await startTrace(label);
    return followTrace();
  };

  // something on the floor: write it, then say where it goes
  const wrote = await traceIt('chair');
  console.log('writing CHAIR:', JSON.stringify(wrote));
  const asking = await page.textContent('.readout');
  console.log('and then it asks:', asking.replace(/\s+/g, ' ').trim().slice(0, 60));
  if (!/Where shall the chair go/.test(asking))
    throw new Error('writing it did not put it in your hand');
  await page.mouse.click(spot(216, 246).x, spot(216, 246).y); // a front-row floor slot
  await page.waitForTimeout(400);

  // and one drawn rather than written, which is the other way to earn it
  await startTrace('lamp');
  await page.click('.p-rows button:has-text("Picture")');
  await page.waitForTimeout(200);
  const drew = await followTrace();
  console.log('drawing a lamp instead of writing it:', JSON.stringify(drew));
  await page.mouse.click(spot(140, 88).x, spot(140, 88).y); // a wall slot
  await page.waitForTimeout(400);
  await step(page, '23-house-designed', 400);

  const roomNow = await newHouse();
  console.log('after furnishing it:', JSON.stringify(roomNow));
  if (roomNow.stuff !== roomWas.stuff + 2) throw new Error('the chair and the lamp did not go in');
  if (!(roomNow.comfort > roomWas.comfort)) throw new Error('furnishing it did not make it nicer');
  if (!roomNow.flame) throw new Error('a lamp is something to light');

  // a thing cannot go where it does not belong, and says so rather than sulking
  await startTrace('bed');
  await page.click('.p-rows button:has-text("Letters")'); // back to writing
  await page.waitForTimeout(200);
  await followTrace();
  await page.mouse.click(spot(220, 88).x, spot(220, 88).y); // a bed, at the wall
  await page.waitForTimeout(300);
  const told = await page.textContent('.readout');
  if (!/stands on the floor/.test(told)) throw new Error('putting a bed on the wall said nothing');
  await page.click('text=Never mind');
  const feels = await page.textContent('.readout');
  console.log('the room says:', feels.replace(/\s+/g, ' ').trim().slice(0, 90));
  if (!/It feels/.test(feels)) throw new Error('the room does not say how it feels');
  await page.click('.p-rows button:has-text("Close")');
  await step(page, '24-house-built', 1200);

  // and tapping the house again goes back in, because it is a place now
  const theHouse = await api(() => {
    const b = window.OLW.world.buildings.filter(x => x.type === 'house' && x.builtTick != null)[0];
    const tiles = [];
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) tiles.push([x, y]);
    return { tiles, at: [b.x + b.w / 2, b.y + b.h / 2] };
  });
  await tapTile(theHouse.tiles, theHouse.at);
  await page.waitForSelector('.tools .tool', { timeout: 5000 });
  console.log('tapping a built house opens the room again: good');
  await page.click('.p-rows button:has-text("Close")');
  await page.waitForTimeout(300);

  // the Keeper cannot fell trees: the tree still says what it is, and says
  // whose job it is, and offers no button that would only send a message
  const theirTrees = await api(() => {
    const g = window.OLW;
    g.role = 'B';
    g.other = 'A';
    return g.world.trees.filter(t => t.state === 'standing').map(t => [t.x, t.y]);
  });
  await tapTile(theirTrees);
  await page.waitForSelector('.bubble', { timeout: 5000 });
  const treeSays = (await page.textContent('.bubble')).replace(/\s+/g, ' ').trim();
  console.log('the Keeper taps a tree:', treeSays.slice(0, 110));
  if (!/Only the Builder can fell that tree/.test(treeSays))
    throw new Error('the tree does not say whose job felling is');
  if (await page.$('text=Ask the Builder to fell that tree'))
    throw new Error('asking the other player is supposed to be gone');
  await step(page, '25a-theirs', 300);
  await page.click('.bubble button.ghost'); // its own Close, so nothing is left open
  await page.waitForTimeout(300);
  await api(() => {
    window.OLW.role = 'A';
    window.OLW.other = 'B';
  });
  await page.waitForTimeout(700);

  // the mission button still shows a real icon, never a count — a number
  // that always says "1" would nag rather than inform
  const missionIcon = await page.textContent('#missionChip .m-icon');
  if (!missionIcon || !missionIcon.trim()) throw new Error('the mission button lost its icon');

  // teaching: having done it a few times, you can show the other player how.
  // This lives behind the OTHER role's chip now (yours is your own tools).
  await api(() => {
    window.OLW.world.players.A.done.fell = 3;
  });
  await page.click('#roleBar button[data-role="B"]');
  await step(page, '25b-role-card', 500);
  const teach = await page.$('text=Teach them felling trees');
  if (!teach) throw new Error('no way to teach a capability across');
  await teach.click();
  await page.waitForTimeout(400);
  const learned = await api(() => !!window.OLW.world.players.B.caps.fell);
  console.log('taught the other player to fell trees:', learned);
  if (!learned) throw new Error('teaching did not stick');

  // messages wait to be read; there is no history sheet any more
  const standing = await page.$$eval('.msg', ns => ns.length);
  console.log('messages standing on screen:', standing, '(never more than 3)');
  if (standing > 3) throw new Error('messages piled up');
  if (standing > 0) {
    await page.click('.msg .m-x');
    const after = await page.$$eval('.msg', ns => ns.length);
    if (after !== standing - 1) throw new Error('the x did not put a message away');
  }

  // sharing, from the bottom resource bar
  await page.click('.res');
  await step(page, '25-share', 500);
  await page.click('text=Close');

  // planting a sapling on a stump
  await api(() => {
    const g = window.OLW;
    g.role = 'B';
    g.other = 'A';
  });
  // Every stump, scattered round the map: tapTile frames each one it means to
  // tap and checks it there, so handing it the lot costs nothing. This is the
  // tap that failed in CI having passed here three times — Anna was standing
  // on the stump, and a villager answers a tap before the ground does.
  const stumps = await api(() =>
    window.OLW.world.trees.filter(t => t.state === 'stump').map(t => [t.x, t.y]),
  );
  if (!stumps.length) throw new Error('there is no stump to plant on');
  await tapFor(stumps, null, 'Plant a sapling');
  await step(page, '25d-stump-bubble', 400);
  await page.click('text=Plant a sapling');
  await page.waitForTimeout(400);
  const planted = await api(() => window.OLW.world.trees.filter(t => t.state === 'sapling').length);
  console.log('saplings planted:', planted);
  if (!planted) throw new Error('the sapling was not planted');
  await step(page, '25e-sapling', 400);

  // the fishing boat: build it, then go out in it
  await api(() => {
    const g = window.OLW,
      w = g.world;
    g.role = 'A';
    g.other = 'B';
    w.players.A.res.plank = 9;
    w.players.A.res.stone = 9;
  });
  const landing = await api(() => {
    const b = window.OLW.world.buildings.find(b => b.type === 'boat');
    return [
      [b.x + 0.5, b.y + 0.5],
      [b.x + 1.5, b.y + 0.5],
      [b.x + 2.5, b.y + 0.5],
    ];
  });
  await tapFor(landing, null, 'Build a fishing boat');
  await step(page, '25f-landing-bubble', 400);
  await page.click('text=Build a fishing boat');
  await step(page, '25g-boat', 900);
  const boatUp = await api(() =>
    window.OLW.world.buildings.some(b => b.type === 'boat' && b.state === 'built'),
  );
  console.log('fishing boat built:', boatUp);
  if (!boatUp) throw new Error('the boat was not built');

  await api(() => {
    const g = window.OLW;
    g.role = 'B';
    g.other = 'A';
  });
  await tapFor(landing, null, 'Go fishing');
  await page.click('text=Go fishing');
  await step(page, '25h-fishing', 600);
  // three casts: tap the water, then tap again the moment the float goes under
  const fcv = await (await page.$('.panel canvas')).boundingBox();
  const water = { x: fcv.x + fcv.width * 0.62, y: fcv.y + fcv.height * 0.7 };
  for (let cast = 0; cast < 3; cast++) {
    await page.mouse.click(water.x, water.y);
    const bit = await page
      .waitForFunction(
        () => {
          const p = document.querySelector('.readout');
          return p && !/…$/.test(p.textContent.trim());
        },
        null,
        { timeout: 6000 },
      )
      .catch(() => null);
    if (!bit) break;
    await page.waitForTimeout(200);
  }
  await step(page, '25i-fished', 500);
  await page.click('text=Row back');
  await page.waitForTimeout(300);

  // the playground, the well, the little house and the fence: every project
  // is built the same way, so this walks all of them
  const projects = [
    { type: 'play', label: 'Build a playground', role: 'A', shot: '25k-playground' },
    { type: 'well', label: 'Dig a well', role: 'B', shot: '25m-well' },
    { type: 'privy', label: 'Build the little house', role: 'A', shot: '25n-privy' },
    { type: 'fence', label: 'Fence the field', role: 'A', shot: '25o-fence' },
  ];
  for (const pr of projects) {
    await api(arg => {
      const g = window.OLW,
        w = g.world;
      g.role = arg.role;
      g.other = arg.role === 'A' ? 'B' : 'A';
      w.players.A.res.plank = 9;
      w.players.A.res.stone = 9;
      w.players.B.res.plank = 9;
      w.players.B.res.stone = 9;
    }, pr);
    const spots = await api(arg => {
      const b = window.OLW.world.buildings.find(b => b.type === arg.type);
      const out = [];
      for (let dy = 0; dy < b.h; dy++)
        for (let dx = 0; dx < b.w; dx++) out.push([b.x + dx + 0.5, b.y + dy + 0.5]);
      return out;
    }, pr);
    await tapFor(spots, spots[Math.floor(spots.length / 2)], pr.label);
    await page.click('text=' + pr.label);
    await step(page, pr.shot, 800);
    const up = await api(
      arg => window.OLW.world.buildings.some(b => b.type === arg.type && b.state === 'built'),
      pr,
    );
    console.log(pr.type + ' built:', up);
    if (!up) throw new Error('the ' + pr.type + ' was not built');
  }

  // a poorly tummy is impossible once there is clean water
  const noPoorly = await api(() => {
    const g = window.OLW,
      w = g.world;
    w.villagers[0].poorly = 100;
    for (let i = 0; i < 400; i++) window.OLW.session.update(100);
    return w.villagers.filter(v => v.poorly > 0).length;
  });
  console.log('poorly villagers once the well is dug:', noPoorly);

  // what you can do, spelled out one skill to a line behind your own chip
  await page.click('#roleBar button.me');
  await page.waitForTimeout(300);
  // the skills and the tally are both lists of sub-lines, so read the one that
  // sits under the "What you can do" heading rather than every sub-line there is
  const menuLists = await page.evaluate(() => {
    const out = {};
    let head = null;
    for (const row of Array.prototype.slice.call(document.querySelectorAll('.menu-item'))) {
      const label = row.querySelector('.mi-label').textContent;
      if (!row.classList.contains('sub')) {
        head = label;
        out[head] = [];
        continue;
      }
      if (head) out[head].push(label);
    }
    return out;
  });
  const youCan = menuLists['What you can do'] || [];
  const youDid = menuLists['What you have done'] || [];
  console.log('what you can do:', JSON.stringify(youCan));
  console.log('what you have done:', JSON.stringify(youDid));
  if (youCan.length < 2) throw new Error('your own menu does not say what you can do');
  const tallied = await page.evaluate(() => {
    const g = window.OLW;
    return Object.keys(g.world.players[g.role].done).length;
  });
  if (tallied > 0 && youDid.length < 1)
    throw new Error('your own menu keeps no tally of what you did');
  // shut it the way a finger does — a tap anywhere that is not the menu
  await page.evaluate(() =>
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
  );
  await page.waitForTimeout(300);

  // the changelog, tucked behind the day now
  await page.click('#dayBadge');
  await page.waitForTimeout(300);
  await page.click('.menu-item:has-text("What is new")');
  await step(page, '25l-changelog', 500);
  const log = await page.textContent('.panel');
  if (!/What is new/.test(log))
    throw new Error('the changelog is not reachable from the world menu');
  await page.click('text=Close');
  await page.waitForTimeout(200);

  // run the block to its end quickly: the next day starts by itself, and the
  // world is saved on the way past
  const dayBefore = await api(() => window.OLW.world.day);
  await api(() => {
    const w = window.OLW.world;
    w.block.startTick = w.tick - w.block.length + 30;
  });
  await page
    .waitForFunction(d => window.OLW.world.block.active && window.OLW.world.day > d, dayBefore, {
      timeout: 15000,
    })
    .catch(() => {
      throw new Error('the next day did not begin on its own');
    });
  await step(page, '26-new-day', 1200);
  const quiet = await page.evaluate(() =>
    document.getElementById('overlay').classList.contains('hidden'),
  );
  console.log('nothing was said at the end of the day, overlay hidden:', quiet);
  if (!quiet) throw new Error('something was put on screen at the end of the day');

  // the world must still be there, and saved
  const saved = await api(() => {
    const raw = localStorage.getItem('olw.world.smoke');
    return raw ? JSON.parse(raw).buildings.length : 0;
  });
  console.log('saved buildings:', saved);
  if (saved < 4) throw new Error('the world was not saved');

  await step(page, '27-new-morning', 1000);
  await ipad.close();

  /* ---------- 1b. starting a world over really does ---------- */
  // Three things remember a world: this device, the relay, and the directory.
  // Clearing only the first hands the village straight back on the way in.
  {
    const over = await browser.newContext({ viewport: { width: 900, height: 700 } });
    const po = await over.newPage();
    watch(po, 'start-over');
    const room = 'over' + Math.floor(Math.random() * 1e6);
    await po.goto(BASE + '/?world=' + room + '&role=A', { waitUntil: 'load' });
    await po.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 15000 });

    // build up a village worth losing, and let the server hear about it
    await po.evaluate(() => {
      const g = window.OLW;
      g.world.players.A.res.wood = 42;
      for (let i = 0; i < 900; i++) g.session.update(100);
      g.session.checkpoint();
    });
    await po.waitForTimeout(1200);
    const kept = await (await fetch(BASE + '/api/worlds/' + room + '/snapshot')).json();
    console.log('the server is holding a world at tick:', kept.tick);
    if (!kept.tick) throw new Error('the server never heard about the world');

    await po.click('#dayBadge');
    await po.waitForTimeout(300);
    await po.click('.menu-item:has-text("Start this world over")');
    await po.waitForTimeout(300);
    await po.click('text=Yes, start over');
    await po
      .waitForFunction(() => window.OLW.world.players.A.res.wood !== 42, null, { timeout: 15000 })
      .catch(() => {
        throw new Error('starting over left the old world on screen');
      });
    await po.waitForTimeout(800);
    const after = await po.evaluate(() => ({
      wood: window.OLW.world.players.A.res.wood,
      day: window.OLW.world.day,
      buildings: window.OLW.world.buildings.length,
    }));
    console.log('the first morning again:', JSON.stringify(after));
    if (after.day !== 1) throw new Error('starting over did not go back to the first day');

    // and the server has it too, so walking back in does not undo it
    const fresh = await (await fetch(BASE + '/api/worlds/' + room + '/snapshot')).json();
    console.log('the server now holds a world at tick:', fresh.tick);
    if (fresh.tick > 400) throw new Error('the server is still holding the old village');

    // walking back in, on the same device: still the fresh world
    await po.close();
    const po2 = await over.newPage();
    watch(po2, 'start-over');
    await po2.goto(BASE + '/?world=' + room + '&role=A', { waitUntil: 'load' });
    await po2.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 15000 });
    await po2.waitForTimeout(600);
    const back = await po2.evaluate(() => window.OLW.world.players.A.res.wood);
    console.log('and on the way back in:', back);
    if (back === 42) throw new Error('the old world came back after starting over');
    await over.close();
  }

  /* ---------- 1c. the welcome-back screen (law 10) ---------- */
  // Two different people, two different times: A does something, then leaves
  // entirely, and only afterwards does B open the same world for the first
  // time. Separate contexts, so nothing but the server remembers either of
  // them — the same shape two devices in two places would actually have.
  {
    const room = 'wb' + Math.floor(Math.random() * 1e6);

    const ctxA = await browser.newContext({ viewport: { width: 900, height: 700 } });
    const pA = await ctxA.newPage();
    watch(pA, 'welcome-a');
    await pA.goto(BASE + '/?world=' + room + '&role=A', { waitUntil: 'load' });
    await pA.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 15000 });
    await pA.evaluate(() => {
      const w = window.OLW.world;
      w.players.A.res.wood = 5;
      window.OLW.dispatch({ type: 'give', from: 'A', to: 'B', res: 'wood', n: 3 });
      window.OLW.session.checkpoint();
    });
    await pA.waitForTimeout(1200); // give the server a moment to hear about it
    await ctxA.close();

    const ctxB = await browser.newContext({ viewport: { width: 900, height: 700 } });
    const pB = await ctxB.newPage();
    watch(pB, 'welcome-b');
    await pB.goto(BASE + '/?world=' + room + '&role=B', { waitUntil: 'load' });
    await pB.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 15000 });
    await pB
      .waitForFunction(
        () => !document.getElementById('overlay').classList.contains('hidden'),
        null,
        {
          timeout: 8000,
        },
      )
      .catch(() => {
        throw new Error('the welcome-back screen never appeared for the player coming back');
      });
    const wbText = (await pB.textContent('.panel')).replace(/\s+/g, ' ').trim();
    console.log('the welcome-back screen says:', wbText);
    if (!/wood/i.test(wbText))
      throw new Error('what the other player did is not on the welcome-back screen');
    await pB.click('text=Off to the village');
    await pB.waitForTimeout(300);
    const stillUp = await pB.evaluate(
      () => !document.getElementById('overlay').classList.contains('hidden'),
    );
    if (stillUp) throw new Error('the welcome-back screen did not put itself away');
    const left = await pB.evaluate(() => window.OLW.world.ext.since.B.length);
    if (left !== 0) throw new Error('putting it away did not clear the since-list');

    // and it does not come back on its own — coming back in finds nothing new.
    // A fresh page rather than reload(): a plain reload() would hit the
    // address bar as it is now, and joining strips `&role=` from it (see
    // main.js), and closing first (as the start-over check above does too)
    // rather than navigating the live page away avoids blaming this page for
    // whatever request its own background saving still had in flight.
    await pB.evaluate(() => window.OLW.session.checkpoint());
    await pB.waitForTimeout(600);
    await pB.close();
    const pB2 = await ctxB.newPage();
    watch(pB2, 'welcome-b-again');
    await pB2.goto(BASE + '/?world=' + room + '&role=B', { waitUntil: 'load' });
    await pB2.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 15000 });
    await pB2.waitForTimeout(600);
    const backAgain = await pB2.evaluate(
      () => !document.getElementById('overlay').classList.contains('hidden'),
    );
    if (backAgain) throw new Error('the welcome-back screen reappeared on its own');
    await ctxB.close();
  }

  /* ---------- 2. two browsers, one world ---------- */
  if (!QUICK) {
    const ctxA = await browser.newContext({ viewport: { width: 900, height: 700 } });
    const ctxB = await browser.newContext({ viewport: { width: 900, height: 700 } });
    const pa = await ctxA.newPage(),
      pb = await ctxB.newPage();
    watch(pa, 'A');
    watch(pb, 'B');
    await pa.goto(BASE + '/?room=duo&role=A');
    await pa.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 8000 });
    // the day starts on its own now, nothing to click through
    await pb.goto(BASE + '/?room=duo&role=B');
    await pb.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 8000 });
    await pb.waitForTimeout(2500);
    const how = await pa.evaluate(() => window.OLW.session.transport.constructor.name);
    console.log('transport when the relay is running:', how);
    if (how !== 'WsTransport') throw new Error('the relay was not used');

    await pa.evaluate(() => {
      window.OLW.world.players.A.res.wood = 5;
      window.OLW.dispatch({ type: 'give', from: 'A', to: 'B', res: 'wood', n: 4 });
    });
    await pb
      .waitForFunction(() => window.OLW.world.players.B.res.wood >= 4, null, { timeout: 8000 })
      .catch(() => {
        throw new Error('the gift never arrived on the other screen');
      });
    console.log('two browsers share one world: yes');

    await pb.evaluate(() => {
      const w = window.OLW.world;
      w.players.B.res.stone = 9;
      const tiles = [];
      for (let x = 22; x < 28; x++) tiles.push({ x, y: 10 });
      window.OLW.dispatch({ type: 'road.build', role: 'B', tiles });
    });
    await pa
      .waitForFunction(
        () => {
          const w = window.OLW.world;
          return w.terrain[10 * 40 + 25] === 3;
        },
        null,
        { timeout: 8000 },
      )
      .catch(() => {
        throw new Error('the road did not appear on the other screen');
      });
    console.log('building is visible to the other player: yes');

    // Appearing once used to be no guarantee: a snapshot that predated the road
    // could reach the builder and reconcile() would swap in the whole world it
    // carried, quietly taking the road back out from under the very player who
    // just laid it. A few seconds on, it has to still be standing on both screens.
    await pb.waitForTimeout(2500);
    const roadTiles = () => {
      const w = window.OLW.world;
      let n = 0;
      for (let x = 22; x < 28; x++) if (w.terrain[10 * 40 + x] === 3) n++;
      return n;
    };
    const onBuilder = await pb.evaluate(roadTiles);
    const onOther = await pa.evaluate(roadTiles);
    console.log(
      'the road a couple of seconds later — builder sees:',
      onBuilder,
      'tiles, the other player sees:',
      onOther,
    );
    if (onBuilder < 6) throw new Error('the road vanished on the screen that built it');
    if (onOther < 6) throw new Error('the road vanished on the other screen');

    await pa.screenshot({ path: SHOTS + '28-player-a.png' });
    await pb.screenshot({ path: SHOTS + '29-player-b.png' });
    await ctxA.close();
    await ctxB.close();
  }

  /* ---------- 3. other screens ---------- */
  for (const [name, d] of QUICK ? [] : Object.entries(DEVICES)) {
    const c = await browser.newContext({
      viewport: { width: d.width, height: d.height },
      deviceScaleFactor: d.dpr,
      hasTouch: d.touch,
      isMobile: d.touch,
    });
    const pg = await c.newPage();
    watch(pg, name);
    await pg.goto(BASE + '/?room=look&role=BOTH');
    await pg.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 8000 });
    await pg.waitForTimeout(1200);
    await pg.screenshot({ path: SHOTS + '30-' + name + '.png' });
    const overflow = await pg.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    console.log(name + ' horizontal overflow:', overflow);
    if (overflow > 1) throw new Error(name + ' overflows sideways');

    // Every corner of the world has to reach the middle of the screen, on this
    // shape too — an axis that happens to fit exactly used to be pinned there.
    const reach = await pg.evaluate(() => {
      const r = window.OLW.renderer;
      const got = (x, y) => {
        r.cam.x = x;
        r.cam.y = y;
        r.clampCamera();
        return [r.cam.x, r.cam.y];
      };
      const before = [r.cam.x, r.cam.y];
      const nw = got(-999, -999),
        se = got(9999, 9999);
      const zoom = { now: r.cam.zoom, max: r.maxZoom() };
      got(before[0], before[1]);
      return { nw, se, zoom };
    });
    console.log(name + ' reaches:', JSON.stringify(reach));
    if (reach.nw[0] !== 0 || reach.nw[1] !== 0)
      throw new Error(name + ' cannot reach the top left corner');
    if (reach.se[0] !== 960 || reach.se[1] !== 576)
      throw new Error(name + ' cannot reach the bottom right corner');
    if (!(reach.zoom.max > reach.zoom.now + 0.5))
      throw new Error(name + ' has nowhere left to zoom in');
    await c.close();
  }

  /* ---------- 4. a phone with a notch and a toolbar ---------- */
  // The safe-area insets are CSS variables with env() defaults, so a desktop
  // browser can be told to pretend it is an iPhone.
  const SAFE_T = 59,
    SAFE_B = 34;
  const notch = {
    content: ':root{--safe-t:' + SAFE_T + 'px !important;--safe-b:' + SAFE_B + 'px !important;}',
  };
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const ph = await phone.newPage();
  watch(ph, 'phone');
  await ph.goto(BASE + '/?room=notch&role=BOTH');
  await ph.addStyleTag(notch);
  await ph.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 8000 });
  await ph.addStyleTag(notch);
  await ph.waitForTimeout(700);

  await ph.waitForFunction(() => window.OLW.world.block.active, null, { timeout: 8000 });
  await ph.click('#missionChip');
  await ph.waitForTimeout(900);
  await ph.addStyleTag(notch);
  await step(ph, '31-phone-guide', 300);

  const fit = await ph.evaluate(
    safe => {
      const vh = window.innerHeight;
      const btns = [].slice.call(document.querySelectorAll('.panel-foot .btn'));
      const steps = [].slice.call(document.querySelectorAll('.step'));
      return {
        buttons: btns.length,
        lowest: Math.round(
          Math.max.apply(
            null,
            btns.map(b => b.getBoundingClientRect().bottom),
          ),
        ),
        floor: vh - safe.b,
        narrowest: Math.min.apply(
          null,
          steps.map(
            st =>
              st.querySelector('.s-txt').getBoundingClientRect().width /
              st.getBoundingClientRect().width,
          ),
        ),
        scrolls: (() => {
          const sc = document.querySelector('.panel-scroll');
          return sc.scrollHeight > sc.clientHeight;
        })(),
      };
    },
    { b: SAFE_B },
  );
  console.log('phone panel:', JSON.stringify(fit));
  if (!fit.buttons) throw new Error('the card has no buttons in its foot');
  if (fit.lowest > fit.floor)
    throw new Error('a panel button is hidden behind the bottom of the screen');
  if (!(fit.narrowest > 0.55))
    throw new Error('step text is squeezed into a column too narrow to read');

  // the start screen must clear the notch, and never hide its own top
  const ph2 = await phone.newPage();
  watch(ph2, 'phone-start');
  await ph2.goto(BASE + '/?room=notch2');
  await ph2.addStyleTag(notch);
  await ph2.waitForTimeout(500);
  await step(ph2, '32-phone-start', 200);
  const startTop = await ph2.evaluate(() => {
    const r = document.querySelector('.lang-row').getBoundingClientRect();
    return { top: Math.round(r.top), scrollTop: document.getElementById('start').scrollTop };
  });
  console.log('start screen clears the notch:', JSON.stringify(startTop));
  if (startTop.top < SAFE_T) throw new Error('the start screen runs under the notch');

  // and there is a way back out of the world, with the village kept
  await ph.click('text=Right, got it');
  await ph.waitForTimeout(400);

  // Pinching and having it stay pinched. Two fingers come off a pinch as two
  // touchends a moment apart, which looked exactly like the double tap that
  // means "show me the whole world" — so the zoom somebody had just chosen was
  // thrown away, and only survived if the fingers happened to lift slowly.
  // Hence "sometimes it works". The fingers here lift 60ms apart, which is
  // well inside the double-tap window and used to fail every time.
  const pinched = await ph.evaluate(async () => {
    const cv = document.getElementById('world');
    const r = cv.getBoundingClientRect();
    const cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    const touch = (id, x, y) => new Touch({ identifier: id, target: cv, clientX: x, clientY: y });
    const fire = (type, pts) => {
      const t = pts.map((p, i) => touch(i, p[0], p[1]));
      cv.dispatchEvent(
        new TouchEvent(type, {
          touches: t,
          targetTouches: t,
          changedTouches: t,
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    const wait = ms => new Promise(go => setTimeout(go, ms));
    window.OLW.renderer.userZoom = true;
    window.OLW.renderer.cam.zoom = 1.4;
    const before = window.OLW.renderer.cam.zoom;
    fire('touchstart', [
      [cx - 40, cy],
      [cx + 40, cy],
    ]);
    for (let i = 1; i <= 4; i++) {
      fire('touchmove', [
        [cx - 40 - i * 20, cy],
        [cx + 40 + i * 20, cy],
      ]);
      await wait(16);
    }
    const spread = window.OLW.renderer.cam.zoom;
    fire('touchend', [[cx - 120, cy]]); // one finger up
    await wait(60);
    fire('touchend', []); // and the other, well inside 320ms
    await wait(120);
    return { before: before, spread: spread, after: window.OLW.renderer.cam.zoom };
  });
  console.log(
    'pinching: zoom',
    pinched.before.toFixed(2),
    '->',
    pinched.spread.toFixed(2),
    '-> after the fingers lift',
    pinched.after.toFixed(2),
  );
  if (!(pinched.spread > pinched.before + 0.2)) throw new Error('pinching out did not zoom in');
  if (Math.abs(pinched.after - pinched.spread) > 0.01)
    throw new Error('the pinch snapped back when the fingers lifted');

  // A tap past the edge of the map is not a tap on the village. It used to
  // offer to build a road out there in the empty green, which is nowhere.
  await ph.evaluate(() => window.OLW.look(960, 576, 2.4));
  await ph.waitForTimeout(250);
  const offMap = await ph.evaluate(() => {
    const r = document.getElementById('world').getBoundingClientRect();
    return { x: r.left + r.width - 14, y: r.top + r.height - 14 };
  });
  await ph.mouse.click(offMap.x, offMap.y);
  await ph.waitForTimeout(350);
  if (await ph.$('.bubble'))
    throw new Error('a tap past the edge of the map still opened a bubble');
  // and the same tap inside the map does open one, so that proved something
  await ph.evaluate(() => window.OLW.look(22, 8, 2.4));
  await ph.waitForTimeout(250);
  const onMap = await ph.evaluate(() => {
    const r = document.getElementById('world').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await ph.mouse.click(onMap.x, onMap.y);
  await ph.waitForSelector('.bubble', { timeout: 5000 });
  console.log('past the edge: nothing; inside the map: a bubble. good');
  await ph.evaluate(() =>
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
  );
  await ph.waitForTimeout(200);
  await ph.evaluate(() => {
    window.OLW.renderer.userZoom = false;
    window.OLW.renderer.resize();
  });

  // Dragging the world up and down is the one that broke. A phone frames the
  // world to cover the screen, which makes the vertical axis fit exactly, and
  // an axis that fitted used to be pinned to the middle — so this drags with a
  // real pointer rather than trusting clampCamera on its own.
  const stageBox = await (await ph.$('#stage')).boundingBox();
  const mid = { x: stageBox.x + stageBox.width / 2, y: stageBox.y + stageBox.height / 2 };
  const camBefore = await ph.evaluate(() => [window.OLW.renderer.cam.x, window.OLW.renderer.cam.y]);
  await ph.mouse.move(mid.x, mid.y);
  await ph.mouse.down();
  for (let i = 1; i <= 6; i++) await ph.mouse.move(mid.x, mid.y - i * 30);
  await ph.mouse.up();
  await ph.waitForTimeout(200);
  const camAfter = await ph.evaluate(() => [window.OLW.renderer.cam.x, window.OLW.renderer.cam.y]);
  console.log('dragging up and down moved the camera:', camBefore[1], '->', camAfter[1]);
  if (Math.abs(camAfter[1] - camBefore[1]) < 20)
    throw new Error('the world does not pan up and down on a phone');

  // And the far corner really can be brought into the middle to be tapped.
  // This also catches a stale viewport: the notch stylesheet went in without a
  // resize event, exactly as a phone's address bar slides away without one, so
  // the renderer has to have noticed the stage changing height on its own.
  await ph.addStyleTag(notch);
  await ph.waitForTimeout(300);
  await ph.evaluate(() => window.OLW.look(0, 0));
  await step(ph, '31b-phone-corner', 300);
  const corner = await ph.evaluate(() => {
    const r = window.OLW.renderer,
      p = r.toScreen(0, 0),
      c = document.getElementById('world').getBoundingClientRect();
    return { x: Math.round(p.x - c.width / 2), y: Math.round(p.y - c.height / 2) };
  });
  console.log('the top left corner sits this far from the middle:', JSON.stringify(corner));
  if (Math.abs(corner.x) > 2 || Math.abs(corner.y) > 2)
    throw new Error('the corner cannot be brought to the middle');

  await ph.click('#dayBadge');
  await ph.waitForTimeout(400);
  await ph.click('.menu-item:has-text("Back to the start screen")');
  await ph.waitForTimeout(1200);
  const outAgain = await ph.evaluate(() => ({
    start: !document.getElementById('start').classList.contains('hidden'),
    world: (document.querySelector('#startBody .w-name') || {}).textContent || '',
  }));
  console.log('back at the front door:', JSON.stringify(outAgain));
  if (!outAgain.start) throw new Error('there is no way back to the start screen');
  if (outAgain.world !== 'Notch') throw new Error('the world was not waiting at the front door');

  // and with a village to go back to, starting another one is not the loud
  // thing on the screen — it is still there, one size down
  const loudness = await ph.evaluate(() => ({
    worlds: document.querySelectorAll('#startBody .world-card').length,
    loud: document.querySelectorAll('#startBody .role-btn.go').length,
    quiet: document.querySelectorAll('#startBody .role-btn.small').length,
  }));
  console.log('the front door, with a world to carry on with:', JSON.stringify(loudness));
  if (!loudness.worlds) throw new Error('the world to carry on with is not on the front door');
  if (loudness.loud) throw new Error('starting another world is still shouting');
  if (!loudness.quiet) throw new Error('the way to start another world has gone missing');

  await ph.click('#startBody .world-card');
  await ph.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 8000 });
  await ph.waitForTimeout(600);
  const kept = await ph.evaluate(() => window.OLW.world.buildings.length);
  console.log('the village was still there when we walked back in:', kept, 'buildings');
  if (kept < 9) throw new Error('the world did not come back');
  await step(ph, '33-phone-back', 200);

  // fetching the game again from inside the world: the only reload a Home
  // Screen app has. It saves first, so the village must survive the trip.
  await ph.click('#dayBadge');
  await ph.waitForTimeout(400);
  await ph.click('.menu-item:has-text("Fetch the game again")');
  await ph.waitForFunction(() => /fresh=/.test(location.search), null, { timeout: 8000 });
  await ph.waitForTimeout(900);
  const afterFetch = await ph.evaluate(() => ({
    start: !document.getElementById('start').classList.contains('hidden'),
    world: (document.querySelector('#startBody .w-name') || {}).textContent || '',
  }));
  console.log('after fetching the game again:', JSON.stringify(afterFetch));
  if (!afterFetch.start || afterFetch.world !== 'Notch')
    throw new Error('the reload door lost the world');
  await ph.click('#startBody .world-card');
  await ph.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 8000 });
  await ph.waitForTimeout(600);
  const keptAgain = await ph.evaluate(() => window.OLW.world.buildings.length);
  console.log('the village survived the reload:', keptAgain, 'buildings');
  if (keptAgain < 9) throw new Error('the world did not survive the reload');
  await phone.close();

  await browser.close();
  if (errors.length) {
    console.log('\nBROWSER ERRORS:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log(
    '\nsmoke test: all good' + (QUICK ? ' (quick: no screenshots, one browser, one screen)' : ''),
  );
}

main().catch(e => {
  console.error('\nFAILED: ' + e.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exit(1);
});
