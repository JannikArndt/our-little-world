// The page at /stats, in a real browser.
//
//   node server/serve.mjs 8099 &
//   node tools/stats.mjs
//
// It puts a couple of worlds into the directory first, because a page that
// only ever renders "nobody has played yet" has not really been looked at.

import { createWorld, serialize } from '../src/core/world.js';
import { applyAction } from '../src/core/actions.js';
// Playwright is a devDependency, so normally it resolves by name. One sandbox
// has it installed globally with nothing to resolve it from; the absolute path
// is for that sandbox, and for nowhere else.
const { chromium } = await import('playwright').catch(
  () => import('/opt/node22/lib/node_modules/playwright/index.mjs'),
);

const BASE = process.env.BASE || 'http://localhost:8099';
const SHOTS = new URL('./shots/', import.meta.url).pathname;

const post = (path, body) => fetch(BASE + path, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}).then((r) => r.json());

/** A world that got somewhere: a bridge, a house, a well, and some deeds. */
function playedWorld(seed, day) {
  const w = createWorld(seed);
  w.day = day;
  w.tick = day * 3000;
  w.players.A.res.plank = 40; w.players.A.res.stone = 40;
  w.players.B.res.plank = 40; w.players.B.res.stone = 40;
  const site = w.buildings.find((b) => b.type === 'site');
  applyAction(w, {
    type: 'house.build', role: 'A', siteId: site.id, planks: 4, stone: 1,
    plan: {}, beds: 2, warm: 1, light: 1, roomy: 1, reachable: 1,
  });
  applyAction(w, { type: 'project.build', role: 'B', what: 'well' });
  if (day > 2) applyAction(w, { type: 'project.build', role: 'A', what: 'privy' });
  for (const t of w.trees.slice(0, 3)) applyAction(w, { type: 'tree.fell', role: 'A', treeId: t.id, dir: 'S' });
  return w;
}

console.log('seeding the directory…');
for (const [i, day] of [1, 3, 6].entries()) {
  const made = await post('/api/worlds', { device: 'seed-' + i, role: 'A' });
  await post('/api/worlds/' + made.world.name + '/join', { device: 'seed-' + i + '-b', role: 'B' });
  const w = playedWorld(100 + i, day);
  const r = await post('/api/worlds/' + made.world.name + '/snapshot', { tick: w.tick, world: serialize(w) });
  if (!r.ok) throw new Error('the directory would not take the world: ' + JSON.stringify(r));
}

const browser = await chromium.launch();
const errors = [];

async function look(name, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(name + ' pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
  await page.goto(BASE + '/stats', { waitUntil: 'load' });
  await page.waitForSelector('.hero-n', { timeout: 8000 });
  return page;
}

const page = await look('desktop', 1100, 1400);

const hero = Number(await page.textContent('.hero-n'));
console.log('spots this week:', hero);
if (!(hero >= 6)) throw new Error('three worlds with two spots each should be at least six');

const bands = await page.$$eval('.cols:not(.hist) .band', (n) => n.length);
console.log('days drawn:', bands);
if (bands < 1) throw new Error('the day chart drew nothing');

const far = await page.textContent('.card:nth-of-type(3)');
if (!/How far a world gets/.test(far)) throw new Error('the third card is not the one about how far worlds get');
if (!/The middle world got to/.test(far)) throw new Error('no median is stated');

const marks = await page.$$eval('.rows .row-h', (n) => n.map((e) => e.textContent));
console.log('milestones:', marks.slice(0, 4).join(' · '));
for (const want of ['A well', 'The little house']) {
  if (!marks.some((m) => m.indexOf(want) >= 0)) throw new Error('no milestone row for ' + want);
}
if (!marks.some((m) => /Trees felled/.test(m))) throw new Error('nothing says how many trees were felled');

// every value is reachable without hovering anything
const tables = await page.$$eval('details table', (n) => n.length);
console.log('tables behind the charts:', tables);
if (tables < 4) throw new Error('a chart is missing its table of numbers');

// the hovering label answers, and says more than the column shows
// (the peak label sits in .cols too, so the last band is not :last-child)
await page.locator('.cols:not(.hist) .band').last().hover();
await page.waitForSelector('#tip.on', { timeout: 3000 });
const tip = await page.textContent('#tip');
console.log('the label says:', tip.replace(/\s+/g, ' ').trim());
if (!/minute/.test(tip)) throw new Error('the label does not carry the minutes');

// the one direct label sits on the busiest day, and the hovering one must not
// be standing in front of it when the picture is taken
await page.mouse.move(4, 4);
await page.waitForSelector('#tip:not(.on)', { timeout: 3000 });
const peak = await page.textContent('.peak');
console.log('the busiest day is labelled:', peak);
await page.screenshot({ path: SHOTS + '80-stats.png', fullPage: true });

// and it fits on a phone without anything hanging off the side
const phone = await look('phone', 390, 844);
const wide = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
if (wide) throw new Error('the page scrolls sideways on a phone');
await phone.screenshot({ path: SHOTS + '81-stats-phone.png', fullPage: true });

await browser.close();
if (errors.length) { console.error(errors.join('\n')); throw new Error('the page complained'); }
console.log('stats page: all good');
