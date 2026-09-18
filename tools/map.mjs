// The map at /map, in a real browser.
//
//   node tools/map.mjs          (with BASE pointing at a running server)
//
// The unit test in tests/map.test.mjs already proves the graph covers the game.
// This is the other half: that the page draws it, that clicking a box explains
// it, and that it works on a phone. Without this a broken layout would ship
// with every test green.

const { chromium } = await import('playwright').catch(
  () => import('/opt/node22/lib/node_modules/playwright/index.mjs'),
);

const BASE = process.env.BASE || 'http://localhost:8099';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', e => errors.push('page error: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

await page.goto(BASE + '/map', { waitUntil: 'load' });
await page.waitForSelector('#sheet .node', { timeout: 15000 });

// what the page thinks it drew, and what it actually drew, have to agree
const drawn = await page.evaluate(() => ({
  nodes: window.olwMap.graph.nodes.length,
  edges: window.olwMap.graph.edges.length,
  boxes: document.querySelectorAll('#sheet .node').length,
  lines: document.querySelectorAll('#sheet path.edge').length,
  views: [...document.querySelectorAll('#tabs .tab')].map(b => b.textContent),
}));
console.log('the map holds:', drawn.nodes, 'things and', drawn.edges, 'connections');
console.log('drawn on the first view:', drawn.boxes, 'boxes and', drawn.lines, 'arrows');
if (drawn.nodes < 90) throw new Error('the graph came out too small: ' + drawn.nodes);
if (!drawn.boxes) throw new Error('nothing was drawn at all');
if (drawn.views.length < 4) throw new Error('a view is missing: ' + drawn.views.join(' | '));
console.log('the views are:', drawn.views.join(' · '));

// how it looks before anybody has touched it, which is how it will be met
await page.screenshot({ path: SHOTS + '90-map.png' }).catch(() => {});

// the footer line is worked out from a real world at load, so it proves the page
// is reading the live code rather than something written out earlier
const live = await page.textContent('#live');
console.log('the live line says:', live.trim());
if (!/guide would ask for: \w+/.test(live)) throw new Error('the live line says nothing');
if (!/MAX_ACTIVE 1/.test(live)) throw new Error('the live line lost the ceilings');

// every view draws something, and the count in the bar matches the boxes
for (const title of drawn.views) {
  await page.getByRole('button', { name: title, exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('#sheet .node').length > 3);
  const seen = await page.evaluate(() => ({
    boxes: document.querySelectorAll('#sheet .node').length,
    says: document.getElementById('count').textContent,
    heads: [...document.querySelectorAll('#sheet .colhead')].map(t => t.textContent),
  }));
  const claimed = Number((seen.says.match(/^(\d+) things/) || [])[1]);
  if (claimed !== seen.boxes)
    throw new Error(title + ': the bar says ' + claimed + ' but ' + seen.boxes + ' were drawn');
  if (!seen.heads.length) throw new Error(title + ': the columns have no names');
  console.log('  ' + title + ': ' + seen.boxes + ' boxes, columns: ' + seen.heads.join(' | '));
}

// back to the first view, and open one box we can predict everything about
await page.getByRole('button', { name: drawn.views[0], exact: true }).click();
await page.waitForFunction(() => document.querySelectorAll('#sheet .node').length > 3);
await page.locator('#sheet .node[data-id="action:tree.fell"]').click();
await page.waitForSelector('#panel:not([hidden])', { timeout: 5000 });
const card = await page.evaluate(() => ({
  title: document.querySelector('#panel h2').textContent,
  where: [...document.querySelectorAll('#panel code.where')].map(c => c.textContent),
  facts: [...document.querySelectorAll('#panel dt')].map(d => d.textContent),
  said: [...document.querySelectorAll('#panel table.says td')].map(t => t.textContent),
  missing: document.querySelectorAll('#panel .missing').length,
  lit: document.querySelectorAll('#sheet path.edge.lit').length,
}));
console.log('the panel opened on:', card.title.trim());
console.log('  it lives in:', card.where.join(' '));
console.log('  it says:', card.facts.join(', '));
console.log('  the game words:', card.said.join(' / '));
if (!card.where.some(w => w === 'src/core/actions/forest.js'))
  throw new Error('the panel does not say which file felling a tree lives in');
if (!card.facts.some(f => /safe to apply twice/.test(f)))
  throw new Error('the panel does not carry the law 12 reason');
if (card.missing) throw new Error('a word the panel shows has no translation');
if (!card.said.some(t => /Baum|gefällt|Holz/i.test(t)))
  throw new Error('the panel is not showing the German side');
if (!card.lit) throw new Error('opening a box lit none of its arrows');

// a link in the panel goes to the thing it names, even into another view
await page.locator('#panel .go').first().click();
await page.waitForFunction(() => {
  const h = document.querySelector('#panel h2');
  return h && !/tree\.fell/.test(h.textContent);
});
console.log('following a link landed on:', (await page.textContent('#panel h2')).trim());

// finding something highlights it rather than hiding everything else
await page.fill('#find', 'house');
await page.waitForFunction(() => document.querySelectorAll('#sheet .node.hit').length > 0);
const hits = await page.$$eval('#sheet .node.hit', n => n.map(e => e.dataset.id));
console.log('searching for "house" found:', hits.join(', '));
if (hits.length < 2) throw new Error('the search found almost nothing');
await page.fill('#find', '');

await page.screenshot({ path: SHOTS + '92-map-open.png' }).catch(() => {});

// escape puts the panel away, the way it does everywhere else in this game
await page.keyboard.press('Escape');
await page.waitForSelector('#panel[hidden]', { state: 'attached', timeout: 3000 });
console.log('escape put the panel away');

// and on a phone: nothing hanging off the side, and the panel as a bottom sheet
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
phone.on('pageerror', e => errors.push('phone page error: ' + e.message));
await phone.goto(BASE + '/map', { waitUntil: 'load' });
await phone.waitForSelector('#sheet .node', { timeout: 15000 });
await phone.locator('#sheet .node').first().click();
await phone.waitForSelector('#panel:not([hidden])', { timeout: 5000 });
const small = await phone.evaluate(() => ({
  sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
  panelTop: document.getElementById('panel').getBoundingClientRect().top,
  sheetTop: document.getElementById('sheet').getBoundingClientRect().top,
  tapTargets: [...document.querySelectorAll('header button')].every(
    b => b.getBoundingClientRect().height >= 30,
  ),
  panelBottom: document.getElementById('panel').getBoundingClientRect().bottom,
  footerTop: document.querySelector('footer').getBoundingClientRect().top,
  boxWidth: document.querySelector('#sheet .node rect').getBoundingClientRect().width,
}));
console.log('on a phone:', JSON.stringify(small));
if (small.sideways) throw new Error('the map scrolls sideways on a phone');
if (small.panelTop <= small.sheetTop)
  throw new Error('on a phone the panel should sit under the picture, not beside it');
if (!small.tapTargets) throw new Error('a button in the bar is too small to tap');
if (small.panelBottom > small.footerTop + 1)
  throw new Error('the footer is sitting on top of the panel on a phone');
if (small.boxWidth < 80)
  throw new Error('the boxes are ' + small.boxWidth + 'px wide on a phone — nobody can read that');
console.log('a box on a phone is', Math.round(small.boxWidth) + 'px wide');
await phone.screenshot({ path: SHOTS + '91-map-phone.png', fullPage: false }).catch(() => {});

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  throw new Error('the page complained');
}
console.log('map page: all good');
