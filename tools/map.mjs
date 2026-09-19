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

// with nothing picked, the panel says what a real world made on this page would
// ask for first — which is the proof it is reading the live code rather than
// something written out earlier
const live = await page.textContent('#live');
console.log('the panel says, before anything is picked:', live.replace(/\s+/g, ' ').trim());
if (!/homeless|no_bridge|calm/.test(live)) throw new Error('the live lines name no first mission');
if (!/MAX_ACTIVE 1/.test(live)) throw new Error('the live lines lost the ceilings');

// the views are named for what is in them, not for a sentence about them
const NAMES = ['Actions', 'Missions', 'Houses', 'Village'];
for (const want of NAMES)
  if (!drawn.views.includes(want))
    throw new Error('no "' + want + '" view: ' + drawn.views.join(' | '));

// every view draws something, and every column says what kind of thing it holds
for (const title of drawn.views) {
  await page.getByRole('button', { name: title, exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('#sheet .node').length > 3);
  const seen = await page.evaluate(() => ({
    boxes: document.querySelectorAll('#sheet .node').length,
    heads: [...document.querySelectorAll('#sheet .colhead')].map(t => t.textContent),
  }));
  if (!seen.heads.length) throw new Error(title + ': the columns have no names');
  if (title === 'Actions' && !seen.heads.some(h => /again and again/.test(h)))
    throw new Error('the actions are not split into what stays and what comes round again');
  console.log('  ' + title + ': ' + seen.boxes + ' boxes, columns: ' + seen.heads.join(' | '));
  // one picture per view, so a wall or an empty sheet is visible to a human
  await page.screenshot({ path: SHOTS + '93-map-' + title.toLowerCase() + '.png' }).catch(() => {});
}

// back to the first view, and open one box we can predict everything about
await page.getByRole('button', { name: drawn.views[0], exact: true }).click();
await page.waitForFunction(() => document.querySelectorAll('#sheet .node').length > 3);
// and the picture must not move under the finger when a box is tapped
const before = await page.getAttribute('#sheet > g', 'transform');
await page.locator('#sheet .node[data-id="action:tree.fell"]').click();
await page.waitForSelector('#panel:not(.empty)', { timeout: 5000 });
const after = await page.getAttribute('#sheet > g', 'transform');
if (before !== after)
  throw new Error('tapping a box moved the camera: ' + before + ' became ' + after);
console.log('tapping a box left the picture where it was');
const card = await page.evaluate(() => ({
  title: document.querySelector('#panel h2').textContent,
  where: [...document.querySelectorAll('#panel code.where')].map(c => c.textContent),
  facts: [...document.querySelectorAll('#panel dt')].map(d => d.textContent),
  said: [...document.querySelectorAll('#panel .said')].map(t => t.textContent),
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

// how far the light spreads is the reader's to choose, and more hops is more
const lit = async n => {
  await page.selectOption('#hops', String(n));
  return page.$$eval('#sheet path.edge.lit', p => p.length);
};
const near = await lit(1);
const wide = await lit(4);
console.log('lighting up tree.fell reaches', near, 'arrows at 1 hop and', wide, 'at 4');
if (wide <= near) throw new Error('four hops lit no more than one did');
if (!near) throw new Error('one hop lit nothing at all');
await page.selectOption('#hops', '4');

// a link in the panel goes to the thing it names, even into another view
await page.locator('#panel .go').first().click();
await page.waitForFunction(() => {
  const h = document.querySelector('#panel h2');
  return h && !/tree\.fell/.test(h.textContent);
});
console.log('following a link landed on:', (await page.textContent('#panel h2')).trim());

// a concern has to say how it turns up and what ends it, in the game's own
// words — the panel is useless if every concern reads the same
await page.getByRole('button', { name: 'Missions', exact: true }).click();
await page.waitForFunction(() => document.querySelectorAll('#sheet .node').length > 3);
await page.locator('#sheet .node[data-id="concern:poorly"]').click();
await page.waitForSelector('#panel:not(.empty)', { timeout: 5000 });
const concern = await page.evaluate(() => ({
  says: document.querySelector('#panel p.says')?.textContent || '',
  why: document.querySelector('#panel p.what')?.textContent || '',
  when: document.querySelector('#panel pre.when')?.textContent || '',
  steps: [...document.querySelectorAll('#panel ol.steps li')].map(li => li.textContent),
}));
console.log('the concern panel says:', concern.says.trim());
console.log('  it applies when:', concern.when.trim());
console.log('  and is over when:', concern.steps.join(' | '));
if (!/water|clean/i.test(concern.says)) throw new Error('a concern does not say what it asks for');
if (!/river/i.test(concern.why)) throw new Error('a concern does not say how it turns up');
if (!/poorly\(w\)/.test(concern.when)) throw new Error('a concern does not show its own test');
if (concern.steps.length < 3) throw new Error('a concern does not say what would end it');
if (!concern.steps.some(t => /project\.build/.test(t)))
  throw new Error('the steps do not name the actions they ask for');
await page.screenshot({ path: SHOTS + '94-map-concern.png' }).catch(() => {});
await page.keyboard.press('Escape');
await page.getByRole('button', { name: drawn.views[0], exact: true }).click();
await page.waitForFunction(() => document.querySelectorAll('#sheet .node').length > 3);

// finding something highlights it rather than hiding everything else
await page.fill('#find', 'house');
await page.waitForFunction(() => document.querySelectorAll('#sheet .node.hit').length > 0);
const hits = await page.$$eval('#sheet .node.hit', n => n.map(e => e.dataset.id));
console.log('searching for "house" found:', hits.join(', '));
if (hits.length < 2) throw new Error('the search found almost nothing');
await page.fill('#find', '');

await page.screenshot({ path: SHOTS + '92-map-open.png' }).catch(() => {});

// escape puts the panel back to what it says with nothing picked — and that must
// not move the picture either
const held = await page.getAttribute('#sheet > g', 'transform');
await page.keyboard.press('Escape');
await page.waitForSelector('#panel.empty', { timeout: 3000 });
if ((await page.getAttribute('#sheet > g', 'transform')) !== held)
  throw new Error('escape moved the camera');
console.log('escape cleared the panel and left the picture alone');

// a box with no arrows of its own still lights up and still explains itself
await page.locator('#sheet .node[data-id="action:block.start"]').click();
await page.waitForSelector('#panel:not(.empty)', { timeout: 5000 });
const lonely = await page.evaluate(() => ({
  on: document.querySelectorAll('#sheet .node.on').length,
  faint: document.querySelector('#sheet .node.on').classList.contains('dim'),
  says: document.getElementById('panel').textContent,
}));
if (lonely.on !== 1) throw new Error('a box with no arrows did not light up');
if (lonely.faint) throw new Error('the box that was tapped went faint — it must never dim itself');
if (!/stands on its own/.test(lonely.says))
  throw new Error('the panel does not say that this box joins to nothing');
console.log('a box with no arrows lights up and says so');
await page.keyboard.press('Escape');

// and on a phone: nothing hanging off the side, and the panel as a bottom sheet
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
phone.on('pageerror', e => errors.push('phone page error: ' + e.message));
await phone.goto(BASE + '/map', { waitUntil: 'load' });
await phone.waitForSelector('#sheet .node', { timeout: 15000 });
// on a phone the panel lies over the picture instead of taking room from it,
// so that opening one does not resize the sheet and shift the whole map
const tall = await phone.$eval('#sheet', s => s.getBoundingClientRect().height);
await phone.locator('#sheet .node').first().click();
await phone.waitForSelector('#panel:not(.empty)', { timeout: 5000 });
const still = await phone.$eval('#sheet', s => s.getBoundingClientRect().height);
if (Math.abs(tall - still) > 1)
  throw new Error('opening the panel resized the picture on a phone: ' + tall + ' -> ' + still);
const small = await phone.evaluate(() => ({
  sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
  panelTop: document.getElementById('panel').getBoundingClientRect().top,
  sheetTop: document.getElementById('sheet').getBoundingClientRect().top,
  tapTargets: [...document.querySelectorAll('header button')].every(
    b => b.getBoundingClientRect().height >= 30,
  ),
  panelBottom: document.getElementById('panel').getBoundingClientRect().bottom,
  screen: window.innerHeight,
  boxWidth: document.querySelector('#sheet .node rect').getBoundingClientRect().width,
}));
console.log('on a phone:', JSON.stringify(small));
if (small.sideways) throw new Error('the map scrolls sideways on a phone');
if (small.panelTop <= small.sheetTop)
  throw new Error('on a phone the panel should sit under the picture, not beside it');
if (!small.tapTargets) throw new Error('a button in the bar is too small to tap');
if (small.panelBottom > small.screen + 1)
  throw new Error('the panel runs off the bottom of the phone');
if (small.boxWidth < 120)
  throw new Error('the boxes are ' + small.boxWidth + 'px wide on a phone — nobody can read that');
console.log('a box on a phone is', Math.round(small.boxWidth) + 'px wide');
await phone.screenshot({ path: SHOTS + '91-map-phone.png', fullPage: false }).catch(() => {});

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  throw new Error('the page complained');
}
console.log('map page: all good');
