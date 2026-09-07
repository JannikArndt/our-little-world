// A real browser plays the game: pick a role, run a play block, poke at things.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = process.env.BASE || 'http://localhost:8099';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
const errors = [];

// QUICK=1 keeps every assertion and drops what only a person would look at:
// the screenshots, the second browser, and the walk round three screen sizes.
// For iterating. The full run is what a push waits for.
const QUICK = process.env.QUICK === '1';

const DEVICES = {
  'ipad-old':  { width: 1024, height: 768, dpr: 2, touch: true },
  'iphone':    { width: 390,  height: 844, dpr: 3, touch: true },
  'mac':       { width: 1280, height: 800, dpr: 2, touch: false },
};

function watch(page, tag) {
  page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(tag + ' console: ' + m.text()); });
  page.on('requestfailed', r => errors.push(tag + ' request failed: ' + r.url()));
}

const step = async (page, name, ms = 400) => {
  await page.waitForTimeout(ms);
  if (!QUICK) await page.screenshot({ path: SHOTS + name + '.png' });
};

async function main() {
  const browser = await chromium.launch();

  /* ---------- 1. the whole flow on an old iPad ---------- */
  const ipad = await browser.newContext({
    viewport: { width: DEVICES['ipad-old'].width, height: DEVICES['ipad-old'].height },
    deviceScaleFactor: 2, hasTouch: true, isMobile: true,
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
  if (!/What is new/.test(startLog)) throw new Error('the changelog does not open from the start screen');
  await page.click('text=Close');
  await page.waitForTimeout(300);

  // a Home Screen app has no address bar, so the page carries its own way back
  // to the server: the build it was served, and a door that fetches it again
  const build = await page.getAttribute('meta[name="olw-build"]', 'content');
  const served = await (await fetch(BASE + '/version')).json();
  console.log('the page knows which build it is:', build, '· the server serves:', served.build);
  if (build !== served.build) throw new Error('the page was not stamped with the build it came from');
  const reload = (await page.textContent('#reloadBtn')).trim();
  console.log('the front door offers:', reload);
  if (!reload || reload === '↻') throw new Error('no reload door on the start screen');

  // and asking twice costs nothing: the second answer comes out of the cupboard
  const again = await fetch(BASE + '/', { headers: { 'if-none-match': (await fetch(BASE + '/')).headers.get('etag') } });
  console.log('asking for the page again:', again.status, '(304 means it only had to check)');
  if (again.status !== 304) throw new Error('the page has no working tag to revalidate with');

  await page.click('[data-role="BOTH"]');
  await page.waitForSelector('#game:not(.hidden)');
  await page.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 8000 });
  await step(page, '02-offer-block', 900);

  await page.click('text=Five minutes together');
  await step(page, '02b-guide', 900);
  const guide = await page.textContent('.panel');
  console.log('opening card says:', guide.replace(/\s+/g, ' ').trim().slice(0, 150));
  if (!/Build a house for|Build a bridge|Mend the bridge/.test(guide)) throw new Error('the opening card does not say what to do');
  if ((await page.$$eval('.step', ns => ns.length)) < 2) throw new Error('the opening card has no steps');
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
  if (!counts.length || !counts.every(c => /^\d+\/\d+/.test(c))) throw new Error('steps carry no counts');
  await page.click('text=Off we go');
  await step(page, '03-world', 1200);

  const api = async (fn, arg) => page.evaluate(fn, arg);

  /**
   * Tap a tile, choosing whichever of the given ones nobody is standing on —
   * people answer a tap before the ground does, which is right in the game and
   * flaky in a test.
   */
  const tapTile = async (cands, lookAt) => {
    const pt = await api((arg) => {
      const g = window.OLW, w = g.world;
      const canvas = document.getElementById('world');
      const r = canvas.getBoundingClientRect();
      g.look(arg.at[0], arg.at[1], 2);
      const busy = (c) => w.villagers.some(v => Math.abs(v.x - c[0]) < 1.3 && Math.abs(v.y - c[1]) < 1.3) ||
                          w.sheep.some(sh => Math.abs(sh.x - c[0]) < 1.3 && Math.abs(sh.y - c[1]) < 1.3);
      // a spot nobody is standing on, that nothing on top of the world covers
      for (const c of arg.cands) {
        if (busy(c)) continue;
        const p = g.renderer.toScreen(c[0] * 24, c[1] * 24);
        const x = r.left + p.x, y = r.top + p.y;
        if (x < r.left + 4 || x > r.right - 4 || y < r.top + 4 || y > r.bottom - 4) continue;
        if (document.elementFromPoint(x, y) !== canvas) continue;
        return { x, y };
      }
      const p = g.renderer.toScreen(arg.cands[0][0] * 24, arg.cands[0][1] * 24);
      return { x: r.left + p.x, y: r.top + p.y };
    }, { cands, at: lookAt || cands[0] });
    await page.waitForTimeout(300);
    await page.mouse.click(pt.x, pt.y);
    return pt;
  };

  // world sanity
  const info = await api(() => {
    const w = window.OLW.world;
    return { tick: w.tick, block: w.block.active, villagers: w.villagers.length, sheep: w.sheep.length, trees: w.trees.length };
  });
  console.log('world:', JSON.stringify(info));
  if (!info.block) throw new Error('the play block did not start');

  // tap a tree -> the felling game
  const treePt = await api(() => {
    const g = window.OLW, w = g.world;
    const t = w.trees.find(t => t.state === 'standing');
    g.look(t.x, t.y, 1.8);                     // the opening card left us looking at Ted
    const p = g.renderer.toScreen(t.x * 24 + 12, t.y * 24 + 12);
    const r = document.getElementById('world').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y, id: t.id };
  });
  await page.waitForTimeout(300);
  await page.mouse.click(treePt.x, treePt.y);
  await step(page, '04-tree-bubble', 400);
  await page.click('text=Fell this tree');
  await step(page, '05-chop', 600);
  await page.click('text=up');
  // three swings at the trunk itself, in the middle of the picture
  const trunk = await page.locator('.panel canvas').boundingBox();
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(trunk.x + trunk.width * 0.5, trunk.y + trunk.height * 0.5);
    await page.waitForTimeout(160);
  }
  await step(page, '06-chopped', 2200);

  const wood = await api(() => window.OLW.world.players.A.res.wood);
  console.log('wood after felling:', wood);
  if (wood < 2) throw new Error('felling gave no wood');

  // sawmill
  await api(() => { window.OLW.world.players.A.res.wood = 6; });
  const wsPt = await api(() => {
    const g = window.OLW, w = g.world, b = w.buildings.find(b => b.type === 'workshop');
    g.look(b.x + b.w / 2, b.y + b.h / 2, 1.8);
    // somebody standing in the doorway would answer the tap instead of the
    // workshop, so aim at whichever corner nobody is loitering in
    const cands = [[b.x + 0.5, b.y + 0.3], [b.x + b.w - 0.5, b.y + 0.3], [b.x + 0.5, b.y + 1.3]];
    const clear = cands.find(c => !w.villagers.some(v => Math.abs(v.x - c[0]) < 1.2 && Math.abs(v.y - c[1]) < 1.2)) || cands[0];
    const p = g.renderer.toScreen(clear[0] * 24, clear[1] * 24);
    const r = document.getElementById('world').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.waitForTimeout(300);
  await page.mouse.click(wsPt.x, wsPt.y);
  await step(page, '07-workshop-bubble', 400);
  await page.click('text=Saw wood into planks');
  await step(page, '08-sawmill', 500);
  // cut the log the way this log's order asks for
  const planksBefore = await api(() => window.OLW.world.players.A.res.plank);
  const order = await api(() => window.OLW._saw);
  console.log('the order:', order.pieces + ' x ' + order.size);
  const cv = await page.$('.panel canvas');
  const box = await cv.boundingBox();
  const at = (u) => ({ x: box.x + box.width * ((96 + 24 * u) / 480), y: box.y + box.height * (128 / 236) });
  for (let i = 1; i < order.pieces; i++) {
    const pt = at(i * order.size);
    await page.mouse.click(pt.x, pt.y);
  }
  await step(page, '09-cuts', 300);
  await page.click('text=Saw it');
  await step(page, '10-sawn', 1800);
  const planks = await api(() => window.OLW.world.players.A.res.plank) - planksBefore;
  console.log('planks from this log:', planks, '(the order was', order.pieces + ')');
  if (planks !== order.pieces) throw new Error('cutting to the order did not fill it');
  // a second log has to be measured again: no "same again" shortcut
  await page.click('text=The next log');
  const order2 = await api(() => window.OLW._saw);
  console.log('the next log asks for:', order2.pieces + ' x ' + order2.size);
  await page.locator('.panel .row .btn.soft').last().click();

  // bridge
  await api(() => { const w = window.OLW.world; w.players.A.res.plank = 9; w.players.A.res.stone = 9; });
  const crossPt = await api(() => {
    const g = window.OLW, s = g.world.bridge.site;
    g.look((s.x0 + s.x1 + 1) / 2, s.row + 1, 1.8);
    const p = g.renderer.toScreen((s.x0 + s.x1 + 1) * 12, (s.row + 1) * 24);
    const r = document.getElementById('world').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.waitForTimeout(300);
  await page.mouse.click(crossPt.x, crossPt.y);
  await step(page, '11-crossing-bubble', 400);
  await page.click('text=Build a bridge here');
  await step(page, '12-bridge-design', 600);
  const bcv = await page.$('.panel canvas');
  const bbox = await bcv.boundingBox();
  const bx = (i) => ({ x: bbox.x + bbox.width * ((62 + (356 / 5) * i) / 480), y: bbox.y + bbox.height * (150 / 250) });
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
  await page.click('#roleChip');
  await step(page, '16-keeper', 500);
  const sheepPt = await api(() => {
    const g = window.OLW, s = g.world.sheep[0];
    g.look(s.x, s.y, 2);
    const p = g.renderer.toScreen(s.x * 24, s.y * 24);
    const r = document.getElementById('world').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.waitForTimeout(300);
  await page.mouse.click(sheepPt.x, sheepPt.y);
  await step(page, '17-sheep-bubble', 400);
  await page.click('text=Look after her');
  await step(page, '18-care', 700);
  // tapping an item is enough — no dragging required
  const cbox = await (await page.$('.panel canvas')).boundingBox();
  const item = (i) => ({ x: cbox.x + cbox.width * ((60 + i * 100) / 420), y: cbox.y + cbox.height * (258 / 300) });
  const fluffBefore = await api(() => window.OLW.world.sheep[0].fluff);
  await page.mouse.click(item(2).x, item(2).y);          // the shears
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
    const g = window.OLW, w = g.world;
    for (const p of w.plots) g.dispatch({ type: 'plot.plant', role: 'B', plotId: p.id });
    for (const p of w.plots) g.dispatch({ type: 'plot.water', role: 'B', plotId: p.id });
    g.look(29, 17, 1.6);
  });
  await step(page, '19-field', 900);

  // a road
  await api(() => {
    const g = window.OLW;
    g.world.players.B.res.stone = 8;
    const tiles = []; for (let x = 20; x < 26; x++) tiles.push({ x, y: 13 });
    g.dispatch({ type: 'road.build', role: 'B', tiles });
    g.look(23, 13, 1.6);
  });
  await step(page, '20-road', 900);

  // a house
  await api(() => {
    const g = window.OLW, w = g.world;
    w.players.A.res.plank = 9; w.players.A.res.stone = 9;
    g.role = 'A'; g.other = 'B';
    const site = w.buildings.find(b => b.state === 'site');
    g.look(site.x + 1.5, site.y + 1, 1.8);
    return site.id;
  });
  await page.waitForTimeout(300);
  const sitePt = await api(() => {
    const g = window.OLW, site = g.world.buildings.find(b => b.state === 'site');
    const p = g.renderer.toScreen((site.x + site.w / 2) * 24, (site.y + site.h / 2) * 24);
    const r = document.getElementById('world').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.mouse.click(sitePt.x, sitePt.y);
  await step(page, '21-site-bubble', 400);
  await page.click('text=Build a house here');
  await step(page, '22-house-plan', 600);
  const hcv = await page.$('.panel canvas');
  const hbox = await hcv.boundingBox();
  const cell = (c, r) => ({ x: hbox.x + hbox.width * ((34 + c * 56 + 28) / 514), y: hbox.y + hbox.height * ((40 + r * 56 + 28) / 300) });
  await page.mouse.click(cell(2, 3).x, cell(2, 3).y);            // door on the bottom wall
  await page.click('text=window'); await page.mouse.click(cell(0, 1).x, cell(0, 1).y);
  await page.click('text=bed');    await page.mouse.click(cell(4, 1).x, cell(4, 1).y);
  await page.mouse.click(cell(5, 1).x, cell(5, 1).y);
  await page.click('text=stove');  await page.mouse.click(cell(1, 1).x, cell(1, 1).y);
  await step(page, '23-house-designed', 400);
  await page.click('text=Build it');
  await step(page, '24-house-built', 1800);
  const houses = await api(() => window.OLW.world.buildings.filter(b => b.type === 'house' && b.state === 'built').length);
  console.log('houses:', houses);
  if (houses < 3) throw new Error('the house was not built');

  // the Keeper cannot fell trees, and is offered a way to ask instead
  const standingPt = await api(() => {
    const g = window.OLW, w = g.world;
    g.role = 'B'; g.other = 'A';
    const t = w.trees.find(t => t.state === 'standing');
    g.look(t.x, t.y, 2);
    const p = g.renderer.toScreen(t.x * 24 + 12, t.y * 24 + 12);
    const r = document.getElementById('world').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.waitForTimeout(300);
  await page.mouse.click(standingPt.x, standingPt.y);
  await page.waitForTimeout(300);
  const askTree = await page.$('text=Ask the Builder to fell that tree');
  if (!askTree) throw new Error('the Keeper was not offered a way to ask');
  await askTree.click();
  await page.waitForTimeout(300);
  const askMade = await api(() => window.OLW.world.asks.length);
  if (!askMade) throw new Error('the ask was not recorded');
  await api(() => { window.OLW.role = 'A'; window.OLW.other = 'B'; });
  await page.waitForTimeout(700);
  const noticeText = await page.textContent('#noticeLayer');
  console.log('the other player sees:', noticeText.replace(/\s+/g, ' ').trim().slice(0, 80));
  if (!/asks/.test(noticeText)) throw new Error('the ask did not reach the other player');
  await step(page, '25a-ask', 300);

  // teaching: having done it a few times, you can show the other player how
  await api(() => {
    const g = window.OLW;
    g.canSwap = false;                       // make the role chip open the card
    g.world.players.A.done.fell = 3;
  });
  await page.click('#roleChip');
  await step(page, '25b-role-card', 500);
  const teach = await page.$('text=teach felling trees');
  if (!teach) throw new Error('no way to teach a capability across');
  await teach.click();
  await page.waitForTimeout(400);
  const learned = await api(() => !!window.OLW.world.players.B.caps.fell);
  console.log('taught the other player to fell trees:', learned);
  if (!learned) throw new Error('teaching did not stick');
  await api(() => { window.OLW.canSwap = true; });

  // messages wait to be read and then go into the history
  const standing = await page.$$eval('.msg', ns => ns.length);
  console.log('messages standing on screen:', standing, '(never more than 3)');
  if (standing > 3) throw new Error('messages piled up');
  if (standing > 0) {
    await page.click('.msg .m-x');
    const after = await page.$$eval('.msg', ns => ns.length);
    if (after !== standing - 1) throw new Error('the x did not put a message away');
  }
  await page.click('#historyChip');
  await step(page, '25c-history', 400);
  const hist = await page.$$eval('.hist-line', ns => ns.length);
  console.log('messages kept in the history:', hist);
  if (hist < 3) throw new Error('the history is not keeping messages');
  await page.click('text=Close');

  // sharing
  await page.click('#partnerChip');
  await step(page, '25-share', 500);
  await page.click('text=Close');

  // planting a sapling on a stump
  await api(() => { const g = window.OLW; g.role = 'B'; g.other = 'A'; });
  const stumpPt = await api(() => {
    const g = window.OLW, t = g.world.trees.find(t => t.state === 'stump');
    g.look(t.x, t.y, 2);
    const p = g.renderer.toScreen(t.x * 24 + 12, t.y * 24 + 12);
    const r = document.getElementById('world').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.waitForTimeout(300);
  await page.mouse.click(stumpPt.x, stumpPt.y);
  await step(page, '25d-stump-bubble', 400);
  await page.click('text=Plant a sapling');
  await page.waitForTimeout(400);
  const planted = await api(() => window.OLW.world.trees.filter(t => t.state === 'sapling').length);
  console.log('saplings planted:', planted);
  if (!planted) throw new Error('the sapling was not planted');
  await step(page, '25e-sapling', 400);

  // the fishing boat: build it, then go out in it
  await api(() => {
    const g = window.OLW, w = g.world;
    g.role = 'A'; g.other = 'B';
    w.players.A.res.plank = 9; w.players.A.res.stone = 9;
  });
  const landing = await api(() => {
    const b = window.OLW.world.buildings.find(b => b.type === 'boat');
    return [[b.x + 0.5, b.y + 0.5], [b.x + 1.5, b.y + 0.5], [b.x + 2.5, b.y + 0.5]];
  });
  await tapTile(landing);
  await step(page, '25f-landing-bubble', 400);
  await page.click('text=Build a fishing boat');
  await step(page, '25g-boat', 900);
  const boatUp = await api(() => window.OLW.world.buildings.some(b => b.type === 'boat' && b.state === 'built'));
  console.log('fishing boat built:', boatUp);
  if (!boatUp) throw new Error('the boat was not built');

  await api(() => { const g = window.OLW; g.role = 'B'; g.other = 'A'; });
  await tapTile(landing);
  await page.waitForTimeout(300);
  await page.click('text=Go fishing');
  await step(page, '25h-fishing', 600);
  // three casts: tap the water, then tap again the moment the float goes under
  const fcv = await (await page.$('.panel canvas')).boundingBox();
  const water = { x: fcv.x + fcv.width * 0.62, y: fcv.y + fcv.height * 0.7 };
  for (let cast = 0; cast < 3; cast++) {
    await page.mouse.click(water.x, water.y);
    const bit = await page.waitForFunction(() => {
      const p = document.querySelector('.readout');
      return p && !/…$/.test(p.textContent.trim());
    }, null, { timeout: 6000 }).catch(() => null);
    if (!bit) break;
    await page.waitForTimeout(200);
  }
  await step(page, '25i-fished', 500);
  await page.click('text=Row back');
  await page.waitForTimeout(300);

  // the playground, the well, the little house and the fence: every project
  // is built the same way, so this walks all of them
  const projects = [
    { type: 'play',  label: 'Build a playground', role: 'A', shot: '25k-playground' },
    { type: 'well',  label: 'Dig a well',         role: 'B', shot: '25m-well' },
    { type: 'privy', label: 'Build the little house', role: 'A', shot: '25n-privy' },
    { type: 'fence', label: 'Fence the field',    role: 'A', shot: '25o-fence' },
  ];
  for (const pr of projects) {
    await api((arg) => {
      const g = window.OLW, w = g.world;
      g.role = arg.role; g.other = arg.role === 'A' ? 'B' : 'A';
      w.players.A.res.plank = 9; w.players.A.res.stone = 9;
      w.players.B.res.plank = 9; w.players.B.res.stone = 9;
    }, pr);
    const spots = await api((arg) => {
      const b = window.OLW.world.buildings.find(b => b.type === arg.type);
      const out = [];
      for (let dy = 0; dy < b.h; dy++)
        for (let dx = 0; dx < b.w; dx++) out.push([b.x + dx + 0.5, b.y + dy + 0.5]);
      return out;
    }, pr);
    await tapTile(spots, spots[Math.floor(spots.length / 2)]);
    await page.waitForTimeout(300);
    await page.click('text=' + pr.label);
    await step(page, pr.shot, 800);
    const up = await api((arg) => window.OLW.world.buildings.some(b => b.type === arg.type && b.state === 'built'), pr);
    console.log(pr.type + ' built:', up);
    if (!up) throw new Error('the ' + pr.type + ' was not built');
  }

  // a poorly tummy is impossible once there is clean water
  const noPoorly = await api(() => {
    const g = window.OLW, w = g.world;
    w.villagers[0].poorly = 100;
    for (let i = 0; i < 400; i++) window.OLW.session.update(100);
    return w.villagers.filter(v => v.poorly > 0).length;
  });
  console.log('poorly villagers once the well is dug:', noPoorly);

  // the changelog, tucked under the history
  await page.click('#historyChip');
  await page.waitForTimeout(300);
  await page.click('.whats-new');
  await step(page, '25l-changelog', 500);
  const log = await page.textContent('.panel');
  if (!/What is new/.test(log)) throw new Error('the changelog is not reachable from the history');
  await page.click('text=Close');
  await page.waitForTimeout(200);
  await page.click('text=Close');

  // run the block to its end quickly and check the checkpoint
  await api(() => {
    const w = window.OLW.world;
    w.block.startTick = w.tick - w.block.length + 30;
  });
  await page.waitForFunction(() => !window.OLW.world.block.active, null, { timeout: 15000 });
  await step(page, '26-summary', 1200);
  const summaryText = await page.textContent('.panel');
  console.log('summary contains:', summaryText.replace(/\s+/g, ' ').slice(0, 260));
  if (!/morning is finished/i.test(summaryText)) throw new Error('no checkpoint summary');

  // the world must still be there, and saved
  const saved = await api(() => {
    const raw = localStorage.getItem('olw.world.smoke');
    return raw ? JSON.parse(raw).buildings.length : 0;
  });
  console.log('saved buildings:', saved);
  if (saved < 4) throw new Error('the world was not saved');

  await page.click('text=Another five minutes');
  await step(page, '27-new-morning', 1000);
  await ipad.close();

  /* ---------- 2. two browsers, one world ---------- */
  if (!QUICK) {
  const ctxA = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const ctxB = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const pa = await ctxA.newPage(), pb = await ctxB.newPage();
  watch(pa, 'A'); watch(pb, 'B');
  await pa.goto(BASE + '/?room=duo&role=A');
  await pa.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 8000 });
  await pa.click('text=Five minutes together').catch(() => {});
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
  await pb.waitForFunction(() => window.OLW.world.players.B.res.wood >= 4, null, { timeout: 8000 })
    .catch(() => { throw new Error('the gift never arrived on the other screen'); });
  console.log('two browsers share one world: yes');

  await pb.evaluate(() => {
    const w = window.OLW.world;
    w.players.B.res.stone = 9;
    const tiles = []; for (let x = 22; x < 28; x++) tiles.push({ x, y: 10 });
    window.OLW.dispatch({ type: 'road.build', role: 'B', tiles });
  });
  await pa.waitForFunction(() => {
    const w = window.OLW.world;
    return w.terrain[10 * 40 + 25] === 3;
  }, null, { timeout: 8000 }).catch(() => { throw new Error('the road did not appear on the other screen'); });
  console.log('building is visible to the other player: yes');
  await pa.screenshot({ path: SHOTS + '28-player-a.png' });
  await pb.screenshot({ path: SHOTS + '29-player-b.png' });
  await ctxA.close(); await ctxB.close();
  }

  /* ---------- 3. other screens ---------- */
  for (const [name, d] of (QUICK ? [] : Object.entries(DEVICES))) {
    const c = await browser.newContext({
      viewport: { width: d.width, height: d.height },
      deviceScaleFactor: d.dpr, hasTouch: d.touch, isMobile: d.touch,
    });
    const pg = await c.newPage();
    watch(pg, name);
    await pg.goto(BASE + '/?room=look&role=BOTH');
    await pg.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 8000 });
    await pg.click('text=Five minutes together').catch(() => {});
    await pg.waitForTimeout(1200);
    await pg.screenshot({ path: SHOTS + '30-' + name + '.png' });
    const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(name + ' horizontal overflow:', overflow);
    if (overflow > 1) throw new Error(name + ' overflows sideways');
    await c.close();
  }

  /* ---------- 4. a phone with a notch and a toolbar ---------- */
  // The safe-area insets are CSS variables with env() defaults, so a desktop
  // browser can be told to pretend it is an iPhone.
  const SAFE_T = 59, SAFE_B = 34;
  const notch = { content: ':root{--safe-t:' + SAFE_T + 'px !important;--safe-b:' + SAFE_B + 'px !important;}' };
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
  });
  const ph = await phone.newPage();
  watch(ph, 'phone');
  await ph.goto(BASE + '/?room=notch&role=BOTH');
  await ph.addStyleTag(notch);
  await ph.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 8000 });
  await ph.addStyleTag(notch);
  await ph.waitForTimeout(700);

  await ph.click('text=Five minutes together');
  await ph.waitForTimeout(900);
  await ph.addStyleTag(notch);
  await step(ph, '31-phone-guide', 300);

  const fit = await ph.evaluate((safe) => {
    const vh = window.innerHeight;
    const btns = [].slice.call(document.querySelectorAll('.panel-foot .btn'));
    const steps = [].slice.call(document.querySelectorAll('.step'));
    return {
      buttons: btns.length,
      lowest: Math.round(Math.max.apply(null, btns.map(b => b.getBoundingClientRect().bottom))),
      floor: vh - safe.b,
      narrowest: Math.min.apply(null, steps.map(st =>
        st.querySelector('.s-txt').getBoundingClientRect().width / st.getBoundingClientRect().width)),
      scrolls: (() => { const sc = document.querySelector('.panel-scroll'); return sc.scrollHeight > sc.clientHeight; })(),
    };
  }, { b: SAFE_B });
  console.log('phone panel:', JSON.stringify(fit));
  if (!fit.buttons) throw new Error('the card has no buttons in its foot');
  if (fit.lowest > fit.floor) throw new Error('a panel button is hidden behind the bottom of the screen');
  if (!(fit.narrowest > 0.55)) throw new Error('step text is squeezed into a column too narrow to read');

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
  await ph.click('text=Off we go');
  await ph.waitForTimeout(400);
  await ph.click('#historyChip');
  await ph.waitForTimeout(400);
  await ph.click('text=Back to the start screen');
  await ph.waitForTimeout(1200);
  const outAgain = await ph.evaluate(() => ({
    start: !document.getElementById('start').classList.contains('hidden'),
    world: (document.querySelector('#startBody .w-name') || {}).textContent || '',
  }));
  console.log('back at the front door:', JSON.stringify(outAgain));
  if (!outAgain.start) throw new Error('there is no way back to the start screen');
  if (outAgain.world !== 'Notch') throw new Error('the world was not waiting at the front door');

  await ph.click('#startBody .world-card');
  await ph.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 8000 });
  await ph.waitForTimeout(600);
  const kept = await ph.evaluate(() => window.OLW.world.buildings.length);
  console.log('the village was still there when we walked back in:', kept, 'buildings');
  if (kept < 9) throw new Error('the world did not come back');
  await step(ph, '33-phone-back', 200);

  // fetching the game again from inside the world: the only reload a Home
  // Screen app has. It saves first, so the village must survive the trip.
  await ph.click('#historyChip');
  await ph.waitForTimeout(400);
  await ph.click('#overlay .whats-new:has-text("Fetch the game again")');
  await ph.waitForFunction(() => /fresh=/.test(location.search), null, { timeout: 8000 });
  await ph.waitForTimeout(900);
  const afterFetch = await ph.evaluate(() => ({
    start: !document.getElementById('start').classList.contains('hidden'),
    world: (document.querySelector('#startBody .w-name') || {}).textContent || '',
  }));
  console.log('after fetching the game again:', JSON.stringify(afterFetch));
  if (!afterFetch.start || afterFetch.world !== 'Notch') throw new Error('the reload door lost the world');
  await ph.click('#startBody .world-card');
  await ph.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 8000 });
  await ph.waitForTimeout(600);
  const keptAgain = await ph.evaluate(() => window.OLW.world.buildings.length);
  console.log('the village survived the reload:', keptAgain, 'buildings');
  if (keptAgain < 9) throw new Error('the world did not survive the reload');
  await phone.close();

  await browser.close();
  if (errors.length) { console.log('\nBROWSER ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('\nsmoke test: all good' + (QUICK ? ' (quick: no screenshots, one browser, one screen)' : ''));
}

main().catch(e => { console.error('\nFAILED: ' + e.message); if (errors.length) console.error(errors.join('\n')); process.exit(1); });
