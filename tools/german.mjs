// Play the game in German and check no untranslated key leaks into the UI.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = process.env.BASE || 'http://localhost:8099';
const out = new URL('./shots/', import.meta.url).pathname;
const errs = [];
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'de-DE' });
const p = await c.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });

// any text that still looks like a key is a hole in the tables
const KEYISH = /\b(?:ui|w|msg|sum|guide|chop|saw|mill|bridge|house|care|road|herd|notice|say|give|teach|ask|verb|res|cap|next|app|role|start|day|menu|over|deed)\.[a-zA-Z][a-zA-Z0-9_.]*\b/;
const scan = async (where) => {
  const txt = await p.evaluate(() => document.body.innerText);
  const m = txt.match(KEYISH);
  if (m) errs.push('untranslated key at ' + where + ': ' + m[0]);
};

await p.goto(BASE + '/?room=de' + Math.random().toString(36).slice(2, 6));
await p.waitForTimeout(500);
await scan('start');
await p.screenshot({ path: out + '60-de-start.png' });
if (!/Unsere kleine Welt/.test(await p.textContent('.start-card'))) throw new Error('start screen is not German');

// the whole way in — starting a world, being invited, looking for one — in German
await p.click('text=Eine neue Welt');
await p.waitForTimeout(300);
await scan('new world');
await p.click('[data-role="A"]');
await p.waitForSelector('.world-card', { timeout: 8000 });
await scan('invite card');
const welt = await p.textContent('.w-name');
console.log('neue Welt:', welt);
await p.screenshot({ path: out + '60b-de-welt.png' });
if (!/Wartet auf/.test(await p.textContent('.w-line'))) throw new Error('the invite card is not German');
await p.click('text=Zurück');
await p.waitForTimeout(200);
await p.click('text=Bei einer Welt mitmachen');
await p.waitForTimeout(900);
await scan('join list');
await p.screenshot({ path: out + '60c-de-liste.png' });
await p.click('text=Zurück');
await p.waitForTimeout(200);

await p.click('[data-role="BOTH"]');
await p.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 8000 });
// the day starts on its own now, no offer panel to click through
await p.waitForFunction(() => window.OLW.world.block.active, null, { timeout: 8000 });
await p.waitForTimeout(700);
await scan('world');

// the jobs live behind your own role chip now, one line each — the heading is
// only a heading, so the thing to tap is the first job under it
await p.click('#roleBar button.me');
await p.waitForTimeout(300);
await scan('menu');
const meinMenue = await p.textContent('.menu');
if (!/Was zu tun ist/.test(meinMenue)) throw new Error('the jobs are not behind your own chip');
if (!/Was du geschafft hast/.test(meinMenue)) throw new Error('the tally is not behind your own chip');
await p.click('.menu .menu-item:not(.off) >> nth=0');
await p.waitForTimeout(900);
await scan('guide');
await p.screenshot({ path: out + '61-de-guide.png' });
const guide = await p.textContent('.panel');
console.log('Wegweiser:', guide.replace(/\s+/g, ' ').trim().slice(0, 120));
await p.click('text=Verstanden');
await p.waitForTimeout(800);

// the language and the ways out sit behind the day now, on the right
await p.click('#dayBadge');
await p.waitForTimeout(300);
await scan('world menu');
await p.screenshot({ path: out + '61b-de-weltmenue.png' });
const weltMenue = await p.textContent('.menu');
if (!/Zurück zum Startbildschirm/.test(weltMenue)) throw new Error('the world menu is not behind the day');
if (!/Deutsch/.test(weltMenue)) throw new Error('the language picker did not move with it');
// shut it the way a finger does — a tap anywhere that is not the menu
await p.evaluate(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await p.waitForTimeout(300);

const api = (fn, a) => p.evaluate(fn, a);

/**
 * Tap something in the world and wait for what it should open.
 *
 * People answer a tap before the ground does — a villager standing on the
 * workshop door opens their own bubble instead — so this is the same rule the
 * smoke test's `tapTile` follows: shuffle about the spot until we find one
 * nobody is standing on that the canvas really receives, and try again if the
 * wrong thing came up. `wants` is the German text the tap should bring on.
 */
const tapWorld = async (fn, wants) => {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (wants && await p.$('text=' + wants)) return;
    await api(() => { if (window.OLW.setMode) window.OLW.setMode(null); });   // put a wrong bubble away
    const pt = await api(fn);
    await p.waitForTimeout(250);
    if (pt) await p.mouse.click(pt.x, pt.y);
    await p.waitForTimeout(400);
    if (!wants) return;
  }
  if (!(await p.$('text=' + wants))) throw new Error('tapping never brought up: ' + wants);
};

/** The tile a getter names, as a place on screen nothing else is answering for. */
const pointAt = (getter) => new Function('return (' + `() => {
  const g = window.OLW, w = g.world;
  const o = (${getter})(w);
  const canvas = document.getElementById('world');
  g.look(o[0], o[1], 2);
  const r = canvas.getBoundingClientRect();
  // whoever is standing here answers the tap instead — except at the spot we
  // are aiming at, which is the sheep herself when the sheep is the point
  const at = (o2, x, y) => Math.abs(o2.x - x) < 1.1 && Math.abs(o2.y - y) < 1.1;
  const aim = (x, y) => Math.abs(x - o[0]) < 0.5 && Math.abs(y - o[1]) < 0.5;
  const busy = (x, y) => w.villagers.some(v => at(v, x, y)) ||
                         (!aim(x, y) && w.sheep.some(sh => at(sh, x, y)));
  const near = [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [0.6, 0.6], [-0.6, -0.6]];
  let fallback = null;
  for (const d of near) {
    const x = o[0] + d[0], y = o[1] + d[1];
    const s = g.renderer.toScreen(x * 24, y * 24);
    const px = r.left + s.x, py = r.top + s.y;
    if (px < r.left + 4 || px > r.right - 4 || py < r.top + 4 || py > r.bottom - 4) continue;
    if (!fallback) fallback = { x: px, y: py };
    if (busy(x, y)) continue;
    if (document.elementFromPoint(px, py) !== canvas) continue;
    return { x: px, y: py };
  }
  return fallback;
}` + ')')();

// a tree, and the whole felling panel
await tapWorld(pointAt('(w) => { const t = w.trees.find(t => t.state === "standing"); return [t.x + 0.5, t.y + 0.5]; }'), 'Diesen Baum fällen');
await scan('tree bubble');
await p.screenshot({ path: out + '62-de-bubble.png' });
await p.click('text=Diesen Baum fällen');
await p.waitForTimeout(500);
await scan('chop');
await p.screenshot({ path: out + '63-de-chop.png' });
const pic = p.locator('.panel canvas');
for (let i = 0; i < 12; i++) {
  const aim = await api(() => window.OLW._chop);
  if (!aim) break;
  const box = await pic.boundingBox();
  await pic.click({ position: { x: box.width * 0.5, y: box.height * (aim.y / aim.H) } });
  await p.waitForTimeout(150);
  await scan('chopping');
}
await p.waitForTimeout(2600);
await scan('after chop');

// the workshop, both machines
await api(() => { window.OLW.world.players.A.res.wood = 6; window.OLW.world.players.A.res.wheat = 4; });
await tapWorld(pointAt('(w) => { const b = w.buildings.find(b => b.type === "workshop"); return [b.x + b.w / 2, b.y + b.h - 0.4]; }'), 'Holz zu Brettern sägen');
await p.click('text=Holz zu Brettern sägen');
await p.waitForTimeout(500);
await scan('sawmill');
await p.screenshot({ path: out + '64-de-saw.png' });
await p.click('text=Jetzt nicht');

// the bridge
await api(() => { const w = window.OLW.world; w.players.A.res.plank = 9; w.players.A.res.stone = 9; });
await tapWorld(pointAt('(w) => [(w.bridge.site.x0 + w.bridge.site.x1) / 2 + 0.5, w.bridge.site.row + 1]'), 'Hier eine Brücke bauen');
await p.click('text=Hier eine Brücke bauen');
await p.waitForTimeout(500);
await scan('bridge');
await p.screenshot({ path: out + '65-de-bridge.png' });
await p.click('text=Später');

// the house
await tapWorld(pointAt('(w) => { const b = w.buildings.find(b => b.state === "site"); return [b.x + 1.5, b.y + 1]; }'), 'Hier ein Haus bauen');
await p.click('text=Hier ein Haus bauen');
await p.waitForTimeout(500);
await scan('house');
await p.screenshot({ path: out + '66-de-house.png' });
await p.click('text=Später');

// an animal
await api(() => { window.OLW.role = 'B'; window.OLW.other = 'A'; });
await tapWorld(pointAt('(w) => [w.sheep[0].x, w.sheep[0].y]'), 'Um sie kümmern');
await scan('sheep bubble');
await p.click('text=Um sie kümmern');
await p.waitForTimeout(500);
await scan('care');
await p.screenshot({ path: out + '67-de-care.png' });
await p.click('text=Fertig');

// sharing, from the bottom resource bar
await p.click('.res'); await p.waitForTimeout(300); await scan('share');
await p.screenshot({ path: out + '68-de-share.png' });
await p.click('text=Schließen');

// teaching now lives behind the OTHER role's chip, not your own
await api(() => { window.OLW.world.players.B.done.care = 3; });
await p.click('#roleBar button[data-role="A"]'); await p.waitForTimeout(300); await scan('role menu');
await p.screenshot({ path: out + '69-de-role.png' });
await p.click('text=Ihnen Tiere versorgen zeigen');
await p.waitForTimeout(300);

// the end of the block
await api(() => { const w = window.OLW.world; w.block.startTick = w.tick - w.block.length + 20; });
await p.waitForFunction(() => !window.OLW.world.block.active, null, { timeout: 15000 });
await p.waitForTimeout(1000);
await scan('summary');
await p.screenshot({ path: out + '70-de-summary.png' });
const sum = await p.textContent('.panel');
console.log('Rückblick:', sum.replace(/\s+/g, ' ').trim().slice(0, 180));
if (!/Tag \d+ ist vorbei/.test(sum)) throw new Error('the summary is not German');

await b.close();
if (errs.length) { console.log('\nPROBLEMS:\n' + errs.join('\n')); process.exit(1); }
console.log('\nGerman pass: all good');
