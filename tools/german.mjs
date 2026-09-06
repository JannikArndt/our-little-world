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
const KEYISH = /\b(?:ui|w|msg|sum|guide|chop|saw|mill|bridge|house|care|road|herd|notice|say|give|teach|ask|verb|res|cap|next|app|role|start|day|menu|over)\.[a-zA-Z][a-zA-Z0-9_.]*\b/;
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

await p.click('[data-role="BOTH"]');
await p.waitForFunction(() => window.OLW && window.OLW.world, null, { timeout: 8000 });
// the day starts on its own now, no offer panel to click through
await p.waitForFunction(() => window.OLW.world.block.active, null, { timeout: 8000 });
await p.waitForTimeout(700);
await scan('world');

// the task guide lives behind your own role chip now
await p.click('#roleBar button.me');
await p.waitForTimeout(300);
await scan('menu');
await p.click('text=Was zu tun ist');
await p.waitForTimeout(900);
await scan('guide');
await p.screenshot({ path: out + '61-de-guide.png' });
const guide = await p.textContent('.panel');
console.log('Wegweiser:', guide.replace(/\s+/g, ' ').trim().slice(0, 120));
await p.click('text=Verstanden');
await p.waitForTimeout(800);

const api = (fn, a) => p.evaluate(fn, a);
const tapWorld = async (fn) => {
  const pt = await api(fn);
  await p.waitForTimeout(250);
  await p.mouse.click(pt.x, pt.y);
  await p.waitForTimeout(400);
};
const pointAt = (getter) => new Function('return (' + `() => {
  const g = window.OLW, w = g.world;
  const o = (${getter})(w);
  g.look(o[0], o[1], 2);
  const s = g.renderer.toScreen(o[0] * 24, o[1] * 24);
  const r = document.getElementById('world').getBoundingClientRect();
  return { x: r.left + s.x, y: r.top + s.y };
}` + ')')();

// a tree, and the whole felling panel
await tapWorld(pointAt('(w) => { const t = w.trees.find(t => t.state === "standing"); return [t.x + 0.5, t.y + 0.5]; }'));
await scan('tree bubble');
await p.screenshot({ path: out + '62-de-bubble.png' });
await p.click('text=Diesen Baum fällen');
await p.waitForTimeout(500);
await scan('chop');
await p.screenshot({ path: out + '63-de-chop.png' });
await p.click('text=nach unten');
const trunk = await p.locator('.panel canvas').boundingBox();
for (let i = 0; i < 3; i++) { await p.mouse.click(trunk.x + trunk.width * 0.5, trunk.y + trunk.height * 0.5); await p.waitForTimeout(160); }
await p.waitForTimeout(2500);
await scan('after chop');

// the workshop, both machines
await api(() => { window.OLW.world.players.A.res.wood = 6; window.OLW.world.players.A.res.wheat = 4; });
await tapWorld(pointAt('(w) => { const b = w.buildings.find(b => b.type === "workshop"); return [b.x + b.w / 2, b.y + b.h - 0.4]; }'));
await p.click('text=Holz zu Brettern sägen');
await p.waitForTimeout(500);
await scan('sawmill');
await p.screenshot({ path: out + '64-de-saw.png' });
await p.click('text=Jetzt nicht');

// the bridge
await api(() => { const w = window.OLW.world; w.players.A.res.plank = 9; w.players.A.res.stone = 9; });
await tapWorld(pointAt('(w) => [(w.bridge.site.x0 + w.bridge.site.x1) / 2 + 0.5, w.bridge.site.row + 1]'));
await p.click('text=Hier eine Brücke bauen');
await p.waitForTimeout(500);
await scan('bridge');
await p.screenshot({ path: out + '65-de-bridge.png' });
await p.click('text=Später');

// the house
await tapWorld(pointAt('(w) => { const b = w.buildings.find(b => b.state === "site"); return [b.x + 1.5, b.y + 1]; }'));
await p.click('text=Hier ein Haus bauen');
await p.waitForTimeout(500);
await scan('house');
await p.screenshot({ path: out + '66-de-house.png' });
await p.click('text=Später');

// an animal
await api(() => { window.OLW.role = 'B'; window.OLW.other = 'A'; });
await tapWorld(pointAt('(w) => [w.sheep[0].x, w.sheep[0].y]'));
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
