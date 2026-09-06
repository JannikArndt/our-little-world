// Two browsers find each other the way a family does: one starts a world, the
// other picks it out of the list, and nobody types anything.
//
//   node server/serve.mjs 8099 &
//   node tools/lobby.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = process.env.BASE || 'http://localhost:8099';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
const errors = [];

const watch = (page, tag) => {
  page.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(tag + ' console: ' + m.text()); });
};
const shot = (page, name) => page.screenshot({ path: SHOTS + name + '.png' });
const inWorld = (page) => page.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 10000 });

const browser = await chromium.launch();

/* ---------- the child starts a world ---------- */
const kidCtx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
const kid = await kidCtx.newPage();
watch(kid, 'kid');
await kid.goto(BASE + '/', { waitUntil: 'load' });
await kid.waitForSelector('text=A new world');
await shot(kid, '70-lobby-home');

await kid.click('text=A new world');
await kid.click('[data-role="A"]');
await kid.waitForSelector('.world-card', { timeout: 8000 });
const worldName = await kid.textContent('.w-name');
console.log('the child started:', worldName);
await shot(kid, '71-lobby-made');
if (!/^[A-Z]/.test(worldName)) throw new Error('the new world has no readable name');
if (!/waiting|wartet/i.test(await kid.textContent('.w-line'))) throw new Error('the card does not say who it is waiting for');

await kid.click('text=Start playing');
await inWorld(kid);
const kidRole = await kid.evaluate(() => window.OLW.role);
console.log('the child plays:', kidRole);
if (kidRole !== 'A') throw new Error('the child did not get the role they picked');

/* ---------- the parent finds it in the list ---------- */
const dadCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const dad = await dadCtx.newPage();
watch(dad, 'dad');
await dad.goto(BASE + '/', { waitUntil: 'load' });
await dad.click('text=Join a world');
await dad.waitForSelector('.world-card', { timeout: 8000 });
await shot(dad, '72-lobby-list');
const listed = await dad.textContent('.w-name');
console.log('the list offers:', listed);
if (listed !== worldName) throw new Error('the world the child started is not the one being offered');

await dad.click('.world-card');
await inWorld(dad);
const dadRole = await dad.evaluate(() => window.OLW.role);
console.log('the parent plays:', dadRole);
if (dadRole !== 'B') throw new Error('the parent did not get the free spot');
if (await dad.evaluate(() => window.OLW.worldName) !== await kid.evaluate(() => window.OLW.worldName))
  throw new Error('the two of them are in different worlds');

/* ---------- and it is not on offer any more ---------- */
const slug = worldName.toLowerCase().replace(/ /g, '-');
const open = await (await fetch(BASE + '/api/worlds')).json();
console.log('worlds still waiting for somebody:', open.worlds.map((w) => w.name).join(', ') || 'none');
if (open.worlds.some((w) => w.name === slug))
  throw new Error('a world with both spots taken is still being offered');

/* ---------- one of them builds something, the other sees it ---------- */
await kid.evaluate(() => {
  const g = window.OLW;
  g.startBlock(false);
  g.world.players.A.res.wood = 9;
  g.dispatch({ type: 'presence', role: 'A', busy: null });
});
await kid.waitForTimeout(2500);
const seenByDad = await dad.evaluate(() => window.OLW.world.players.A.res.wood);
console.log("the parent sees the child's wood:", seenByDad);
if (seenByDad !== 9) throw new Error('the two of them are not sharing a world');
await shot(dad, '73-lobby-joined');

/* ---------- coming back a week later is one tap ---------- */
await dad.reload({ waitUntil: 'load' });
await dad.waitForSelector('text=Your worlds', { timeout: 8000 });
await shot(dad, '74-lobby-carry-on');
await dad.click('.world-card');
await inWorld(dad);
if (await dad.evaluate(() => window.OLW.role) !== 'B') throw new Error('coming back gave a different role');
console.log('coming back: same world, same role, no typing');

/* ---------- the world survives the parent being the only one to open it ---------- */
const stored = await (await fetch(BASE + '/api/worlds/' + slug + '/snapshot')).json();
console.log('the server holds a world of', String(stored.world || '').length, 'bytes at tick', stored.tick);
if (!stored.world) throw new Error('the server kept no copy of the world');

await browser.close();
if (errors.length) { console.error('\n' + errors.join('\n')); process.exit(1); }
console.log('\nlobby: all good');
