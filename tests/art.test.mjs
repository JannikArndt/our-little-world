import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawVillager, drawVillagerSay, drawSheep, drawSheepSay } from '../src/render/art.js';

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
