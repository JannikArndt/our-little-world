// A real browser plays the game: pick a role, run a play block, poke at things.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = process.env.BASE || 'http://localhost:8099';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
const errors = [];

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
  await page.screenshot({ path: SHOTS + name + '.png' });
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

  await page.click('[data-role="BOTH"]');
  await page.waitForSelector('#game:not(.hidden)');
  await page.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 8000 });
  await step(page, '02-offer-block', 900);

  await page.click('text=Five minutes together');
  await step(page, '02b-guide', 900);
  const guide = await page.textContent('.panel');
  console.log('opening card says:', guide.replace(/\s+/g, ' ').trim().slice(0, 150));
  if (!/nowhere to sleep|river cuts/.test(guide)) throw new Error('the opening card names no problem');
  if ((await page.$$eval('.step', ns => ns.length)) < 2) throw new Error('the opening card has no steps');
  await page.click('text=Off we go');
  await step(page, '03-world', 1200);

  const api = async (fn, arg) => page.evaluate(fn, arg);

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
    const p = g.renderer.toScreen(t.x * 24 + 12, t.y * 24 + 12);
    const r = document.getElementById('world').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y, id: t.id };
  });
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
    const g = window.OLW, b = g.world.buildings.find(b => b.type === 'workshop');
    const p = g.renderer.toScreen((b.x + b.w / 2) * 24, (b.y + b.h) * 24 - 10);
    const r = document.getElementById('world').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.mouse.click(wsPt.x, wsPt.y);
  await step(page, '07-workshop-bubble', 400);
  await page.click('text=Saw wood into planks');
  await step(page, '08-sawmill', 500);
  // place two cuts at 4 and 8
  const cv = await page.$('.panel canvas');
  const box = await cv.boundingBox();
  const at = (u) => ({ x: box.x + box.width * ((40 + (400 / 12) * u) / 480), y: box.y + box.height * (92 / 200) });
  await page.mouse.click(at(4).x, at(4).y);
  await page.mouse.click(at(8).x, at(8).y);
  await step(page, '09-cuts', 300);
  await page.click('text=Saw it');
  await step(page, '10-sawn', 1800);
  const planks = await api(() => window.OLW.world.players.A.res.plank);
  console.log('planks:', planks);
  if (planks < 3) throw new Error('the sawmill produced nothing');
  await page.click('text=Done');

  // bridge
  await api(() => { const w = window.OLW.world; w.players.A.res.plank = 9; w.players.A.res.stone = 9; });
  const crossPt = await api(() => {
    const g = window.OLW, s = g.world.bridge.site;
    const p = g.renderer.toScreen((s.x0 + s.x1 + 1) * 12, (s.row + 1) * 24);
    const r = document.getElementById('world').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
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

  /* ---------- 3. other screens ---------- */
  for (const [name, d] of Object.entries(DEVICES)) {
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

  await browser.close();
  if (errors.length) { console.log('\nBROWSER ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('\nsmoke test: all good');
}

main().catch(e => { console.error('\nFAILED: ' + e.message); if (errors.length) console.error(errors.join('\n')); process.exit(1); });
