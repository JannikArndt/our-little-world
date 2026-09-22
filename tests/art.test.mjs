import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  drawVillager,
  drawVillagerSay,
  drawSheep,
  drawSheepSay,
  drawWorkshop,
  C,
  mix,
  lite,
  dusk,
} from '../src/render/art.js';
import * as art from '../src/render/art.js';

/**
 * A canvas that remembers what it was asked to draw and draws nothing. Enough
 * to answer one question: did anything land on the glass this time?
 */
function recorder() {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get(t, k) {
        if (k in t) return t[k];
        if (k === 'measureText') return text => ({ width: String(text).length * 5 });
        // a gradient is asked for and then used, so it has to be a thing
        // rather than undefined — a lamp in a window is a radial one
        if (k === 'createLinearGradient' || k === 'createRadialGradient')
          return (...args) => {
            calls.push({ fn: String(k), args });
            return { addColorStop: () => {} };
          };
        return (...args) => calls.push({ fn: String(k), args });
      },
      set(t, k, v) {
        t[k] = v;
        return true;
      },
    },
  );
  return { ctx, calls, words: () => calls.filter(c => c.fn === 'fillText').length };
}

/** The recorder the next drawing should go to. A tiny bit of plumbing so the
 *  list below can stay a list of one-liners. */
function ctxOf() {
  return ctxOf.next;
}

const ted = {
  id: 'v1',
  name: 'Ted',
  colour: 0,
  kid: false,
  x: 6,
  y: 5,
  facing: 1,
  moving: -999,
  hearts: -999,
  mood: 'ok',
  poorly: 0,
  said: 'say.mmm',
  carrying: null,
  act: null,
};

const cloud = { id: 's1', name: 'Cloud', x: 9, y: 7, facing: 1, fluff: 60, mood: 'hungry' };

// The village paints what stands up back to front, so a house in front of
// somebody hides them — which is right for a person and wrong for the words
// over their head. Words go on in a pass of their own, after the roofs.
test('a villager drawn with the village leaves their words for the pass after', () => {
  const quiet = recorder();
  drawVillager(quiet.ctx, ted, 0, 100, true);
  assert.equal(quiet.words(), 0, 'the words were painted with the body and a roof can hide them');

  const said = recorder();
  drawVillagerSay(said.ctx, ted);
  assert.ok(said.words() > 0, 'nothing says what Ted is saying');
});

test('a sheep says her piece in that same pass', () => {
  const quiet = recorder();
  drawSheep(quiet.ctx, cloud, 0, 100, true);
  assert.ok(quiet.calls.length > 0, 'the sheep was not drawn at all');
  assert.equal(quiet.words(), 0, 'what she needs was painted with her, where a roof can hide it');

  const said = recorder();
  drawSheepSay(said.ctx, cloud, 100);
  assert.ok(said.words() > 0, 'nothing shows what Cloud is short of');
});

// The work has to be visible without laying anything over the world: a tool in
// the hand, drawn with the body, and the job over the head in the pass after —
// the same split as everything else somebody has to say.
test('a villager at work carries the tool for it, and says which job after', () => {
  const idle = recorder();
  drawVillager(idle.ctx, ted, 0, 100, true);

  const busy = recorder();
  const working = Object.assign({}, ted, { said: null, act: { kind: 'work', job: 'fell' } });
  drawVillager(busy.ctx, working, 0, 100, true);
  assert.ok(busy.calls.length > idle.calls.length, 'nothing extra was drawn for the axe');
  assert.equal(busy.words(), 0, 'and the job was not painted where a roof could hide it');

  const said = recorder();
  drawVillagerSay(said.ctx, working);
  assert.ok(said.words() > 0, 'nothing over their head says what they are up to');
});

test('the pile by the workshop door is only there when there is something on it', () => {
  const shop = { x: 9, y: 16, w: 4, h: 3 };
  const bare = recorder();
  drawWorkshop(bare.ctx, shop, 0, 100, { wood: 0, wheat: 0 });
  const full = recorder();
  drawWorkshop(full.ctx, shop, 0, 100, { wood: 8, wheat: 3 });
  assert.ok(full.calls.length > bare.calls.length, 'the logs and the sack are not drawn');

  // and a world from before there was a pile still draws its workshop
  const old = recorder();
  drawWorkshop(old.ctx, shop, 0, 100);
  assert.ok(old.calls.length > 0, 'a workshop with no pile at all should still be a workshop');
});

// The whole village is shaded by one rule — lit on the upper left, shaded on
// the lower right — and `lite`/`dusk` are how every shape works out its own
// two tones from the colour it already has. They are one line apart in the
// file, so swapping them is a three-character mistake that would shade the
// entire world backwards and break nothing anybody could point at.
//
// The rule is *toward*, not *brighter*: the sun here is a warm white, so
// lighting wool — which is already paler than that — makes it warmer rather
// than brighter, and that is right. So this asks what the two functions
// actually promise, which holds for every colour with no exceptions.
test('the light always goes the same way', () => {
  const SUN = [255, 246, 224], // the '#fff6e0' lite() mixes toward
    SHADE = [74, 58, 40]; // and the '#4a3a28' dusk() mixes toward
  const bits = c => c.match(/\d+/g).map(Number);
  const away = (c, to) => {
    const n = bits(c);
    return Math.abs(n[0] - to[0]) + Math.abs(n[1] - to[1]) + Math.abs(n[2] - to[2]);
  };
  let checked = 0;
  for (const [name, colour] of Object.entries(C)) {
    if (!/^#/.test(colour)) continue; // shadow is an rgba(), not a tone
    const self = mix(colour, colour, 0);
    assert.ok(
      away(lite(colour, 0.3), SUN) < away(self, SUN) || away(self, SUN) === 0,
      name + ': lite() does not move it toward the sun',
    );
    assert.ok(
      away(dusk(colour, 0.3), SHADE) < away(self, SHADE) || away(self, SHADE) === 0,
      name + ': dusk() does not move it toward the shade',
    );
    checked++;
  }
  assert.ok(checked > 20, 'this stopped looking at the palette at some point');
});

// Every drawing is a few dozen bare `ctx` calls with no types and no compiler
// behind them, and most of them are only ever seen by somebody looking at the
// village. A helper renamed or an import dropped makes one of these throw at
// the moment a player taps the thing — and the browser pass, which would
// catch it, costs five minutes. This costs none.
test('everything in the village can actually be drawn', () => {
  const b = { id: 'b1', x: 4, y: 12, w: 3, h: 2, beds: 2, state: 'built', builtTick: 0 };
  const things = [
    ['a tree', f => f.drawTree(ctxOf(), { x: 3, y: 4, kind: 2, sway: 7 }, 100)],
    [
      'a tree coming down',
      f => f.drawFallingTree(ctxOf(), { x: 3, y: 4, kind: 1, fellDir: 'W' }, 0.5),
    ],
    ['a stump', f => f.drawStump(ctxOf(), { x: 3, y: 4, kind: 3 })],
    ['a sapling', f => f.drawSapling(ctxOf(), { x: 3, y: 4, sway: 2 }, 100)],
    ['a log', f => f.drawLog(ctxOf(), { x: 5, y: 6 })],
    ['a deer', f => f.drawDeer(ctxOf(), { x: 5, y: 6 }, 100)],
    ['a marked-out plot', f => f.drawSite(ctxOf(), { ...b, state: 'site' }, 100)],
    ['a house', f => f.drawHouse(ctxOf(), b, 100, 40)],
    ['a cold, dark house', f => f.drawHouse(ctxOf(), { ...b, cold: true, dark: true }, 100, 40)],
    ['a lamp-lit house', f => f.drawHouse(ctxOf(), { ...b, lamp: true, smoke: true }, 100, 40)],
    ['a plan for something', f => f.drawPlan(ctxOf(), b, 100, '🪣')],
    ['the landing', f => f.drawLanding(ctxOf(), { ...b, type: 'boat' }, 100, 40)],
    ['the landing before the boat', f => f.drawLanding(ctxOf(), { ...b, state: 'plan' }, 100, 40)],
    ['the playground', f => f.drawPlayground(ctxOf(), b, 100, 40)],
    ['the well', f => f.drawWell(ctxOf(), b, 100, 40)],
    ['the privy', f => f.drawPrivy(ctxOf(), b, 100, 40)],
    ['the fence', f => f.drawFence(ctxOf(), { x: 25, y: 15, w: 10, h: 7 }, 100)],
    ['the workshop', f => f.drawWorkshop(ctxOf(), b, 100, 40, { wood: 9, wheat: 4 })],
    ['the larder', f => f.drawLarder(ctxOf(), { x: 7, y: 9, bread: 2, fish: 1 }, 100)],
    ['the stones on the bank', f => f.drawStoneBank(ctxOf(), { x: 15, y: 20, count: 4 })],
    ['a bare plot', f => f.drawPlot(ctxOf(), { x: 26, y: 16, state: 'empty', water: 12 }, 100)],
    [
      'a growing plot',
      f => f.drawPlot(ctxOf(), { x: 26, y: 16, state: 'growing', growth: 40, water: 4 }, 100),
    ],
    [
      'a ripe plot',
      f => f.drawPlot(ctxOf(), { x: 26, y: 16, state: 'ripe', growth: 100, water: 20 }, 100),
    ],
    [
      'the bridge',
      f => f.drawBridge(ctxOf(), { built: true, site: { x0: 14, x1: 18, row: 12, rows: 1 } }, 100),
    ],
    [
      'the bridge with a hole in it',
      f =>
        f.drawBridge(
          ctxOf(),
          { built: true, damaged: true, site: { x0: 14, x1: 18, row: 12, rows: 1 } },
          100,
        ),
    ],
    ['somebody on a card', f => f.drawPortrait(ctxOf(), 'villager', ted, 0, 0, 2, 100, 40)],
    ['a sheep on a card', f => f.drawPortrait(ctxOf(), 'sheep', cloud, 0, 0, 2, 100, 40)],
    ['a house on a panel', f => f.houseFace(ctxOf(), 0, 0, 72, 48, { beds: 2, smoke: true }, 100)],
  ];
  for (const kind of ['float', 'thump', 'sparkle', 'hearts', 'splash', 'crack'])
    things.push([kind, f => f.drawFx(ctxOf(), { kind, x: 3, y: 4, text: '+1' }, 10)]);

  for (const [what, run] of things) {
    const rec = recorder();
    ctxOf.next = rec.ctx;
    run(art);
    assert.ok(rec.calls.length > 0, what + ' drew nothing at all');
  }
});
