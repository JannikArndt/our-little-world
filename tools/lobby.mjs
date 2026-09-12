// Two browsers find each other the way a family does: one starts a world, the
// other picks it out of the list, and nobody types anything.
//
//   node server/serve.mjs 8099 &
//   node tools/lobby.mjs
// Playwright is a devDependency, so normally it resolves by name. One sandbox
// has it installed globally with nothing to resolve it from; the absolute path
// is for that sandbox, and for nowhere else.
const { chromium } = await import('playwright').catch(
  () => import('/opt/node22/lib/node_modules/playwright/index.mjs'),
);

const BASE = process.env.BASE || 'http://localhost:8099';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
const errors = [];

const watch = (page, tag) => {
  page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(tag + ' console: ' + m.text());
  });
};
const shot = (page, name) => page.screenshot({ path: SHOTS + name + '.png' });
const inWorld = page =>
  page.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 10000 });

const browser = await chromium.launch();

/* ---------- the child starts a world ---------- */
const kidCtx = await browser.newContext({
  viewport: { width: 1024, height: 768 },
  hasTouch: true,
  isMobile: true,
});
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
if (!/waiting|wartet/i.test(await kid.textContent('.w-line')))
  throw new Error('the card does not say who it is waiting for');

await kid.click('text=Start playing');
await inWorld(kid);
const kidRole = await kid.evaluate(() => window.OLW.role);
console.log('the child plays:', kidRole);
if (kidRole !== 'A') throw new Error('the child did not get the role they picked');

/* ---------- the empty spot in the top row is an invitation ---------- */
await kid.click('#roleBar .role-chip[data-role="B"]');
await kid.waitForSelector('#menuLayer .menu-item', { timeout: 5000 });
const menuText = await kid.textContent('#menuLayer .menu');
if (!/📨/.test(menuText)) throw new Error('the empty spot offers no way to invite anybody');
await kid.click('#menuLayer .menu-item:has-text("📨")');
await kid.waitForSelector('.panel .link-line', { timeout: 5000 });
const invited = await kid.textContent('.panel .link-line');
console.log('the invitation offers:', invited);
if (invited.indexOf(worldName.toLowerCase().replace(/ /g, '-')) < 0)
  throw new Error('the invitation does not point at this world');
await shot(kid, '71b-lobby-invite');
await kid.click('.panel .btn.soft');

/* ---------- the parent finds it in the list ---------- */
const dadCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const dad = await dadCtx.newPage();
watch(dad, 'dad');
await dad.goto(BASE + '/', { waitUntil: 'load' });
await dad.click('text=Join a world');
await dad.waitForSelector('.world-card', { timeout: 8000 });
await shot(dad, '72-lobby-list');
const listed = await dad.textContent('.w-name');
console.log('the list offers:', listed);
if (listed !== worldName)
  throw new Error('the world the child started is not the one being offered');

await dad.click('.world-card');
await inWorld(dad);
const dadRole = await dad.evaluate(() => window.OLW.role);
console.log('the parent plays:', dadRole);
if (dadRole !== 'B') throw new Error('the parent did not get the free spot');
if (
  (await dad.evaluate(() => window.OLW.worldName)) !==
  (await kid.evaluate(() => window.OLW.worldName))
)
  throw new Error('the two of them are in different worlds');

/* ---------- and it is not on offer any more ---------- */
const slug = worldName.toLowerCase().replace(/ /g, '-');
const open = await (await fetch(BASE + '/api/worlds')).json();
console.log(
  'worlds still waiting for somebody:',
  open.worlds.map(w => w.name).join(', ') || 'none',
);
if (open.worlds.some(w => w.name === slug))
  throw new Error('a world with both spots taken is still being offered');

/* ---------- one of them builds something, the other sees it ---------- */
await kid.evaluate(() => {
  const g = window.OLW;
  g.startDay(false);
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
if ((await dad.evaluate(() => window.OLW.role)) !== 'B')
  throw new Error('coming back gave a different role');
console.log('coming back: same world, same role, no typing');

/* ---------- the world survives the parent being the only one to open it ---------- */
const stored = await (await fetch(BASE + '/api/worlds/' + slug + '/snapshot')).json();
console.log(
  'the server holds a world of',
  String(stored.world || '').length,
  'bytes at tick',
  stored.tick,
);
if (!stored.world) throw new Error('the server kept no copy of the world');

/* ---------- a Home Screen copy is a browser that has never been here ---------- */
// Saving the game to the Home Screen makes a browser with its own storage, so
// it arrives at a world that already has two players and is told it is full —
// by the very person whose village it is. Saying which chair is theirs is the
// way back in. Safari stays open — that is the situation: you are adding the
// world you are already playing to the Home Screen, not moving out of it.
const appCtx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  hasTouch: true,
  isMobile: true,
});
const app = await appCtx.newPage();
watch(app, 'app');
await app.goto(BASE + '/?world=' + slug, { waitUntil: 'load' });
await app.waitForSelector('.world-card', { timeout: 8000 });
await app.click('.world-card'); // the world the link names
await app.waitForSelector('text=Both seats are taken', { timeout: 8000 });
console.log('a browser that has never been here is asked which seat is theirs');
await shot(app, '75-lobby-seat');
await app.click('#startBody .role-btn[data-role="A"]');
await inWorld(app);
const appRole = await app.evaluate(() => window.OLW.role);
console.log('and it carries on as:', appRole);
if (appRole !== 'A') throw new Error('claiming a seat back did not work');
if (
  (await app.evaluate(() => window.OLW.worldName)) !==
  (await dad.evaluate(() => window.OLW.worldName))
)
  throw new Error('claiming a seat landed in the wrong world');

// and from in there, the link that saves anybody doing that twice
await app.click('#roleBar button.me');
await app.waitForSelector('#menuLayer .menu-item', { timeout: 5000 });
await app.click('#menuLayer .menu-item:has-text("📱")');
await app.waitForSelector('.panel .link-line', { timeout: 5000 });
const seatUrl = await app.textContent('.panel .link-line');
console.log('the link for your own second device:', seatUrl);
if (!/[?&]role=A(&|$)/.test(seatUrl)) throw new Error('the seat link does not say which seat');

await kidCtx.close();
await browser.close();
if (errors.length) {
  console.error('\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nlobby: all good');
