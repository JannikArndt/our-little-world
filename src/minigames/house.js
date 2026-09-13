// A house you keep.
//
// Raising it is one tap and cheap: four walls, a door, a window and a bed, so
// somebody can move in this afternoon. Everything after that is furnishing,
// and furnishing never finishes — one thing at a time, each at its own small
// price, and either player can bring something. The Builder has the planks;
// the Keeper has the wool, the wheat and the loaf for the shelf.
//
// The room is drawn like a doll's house with the front wall taken off, and the
// people who live there are in it, using what you have given them. What they
// are doing comes from the furniture and the clock and nothing else, so both
// screens show the same room doing the same thing without saying a word.

import { el, openPanel, makeCanvas, onPointer, loop, message } from '../ui/overlay.js';
import { rr, glyph, drawVillager } from '../render/art.js';
import { tr, trn } from '../core/i18n.js';
import {
  HOUSE_SHELL,
  HOUSE_STUFF,
  HOUSE_SHELF,
  HOUSE_FEEL,
  HOUSE_WALL,
  HOUSE_ALL,
  HOUSE_SLOTS,
} from '../core/content.js';
import { canPay } from '../core/actions.js';
import { tracer, wordStrokes, shapeStrokes, traceHeader } from './trace.js';

const CW = 514,
  CH = 300;

// the room, in the order you meet it: a wall behind, a floor in front of it
const WALL_TOP = 30,
  FLOOR_Y = 158,
  FLOOR_END = 282;
const DOOR_X = 462; // the way in, at the far end of the wall

// where the tracing goes, when something is being made rather than placed
const WORD_BOX = { x: 26, y: 92, w: 462, h: 150 };
const SHAPE_BOX = { x: 132, y: 68, w: 250, h: 210 };
const HOW_KEY = 'olw.trace'; // letters or picture, remembered per device

const itemName = k => tr('house.' + k);

/** Letters or picture: whichever was chosen last, on this device. */
function howLast() {
  try {
    return localStorage.getItem(HOW_KEY) === 'shape' ? 'shape' : 'word';
  } catch {
    return 'word';
  }
}
function howKeep(how) {
  try {
    localStorage.setItem(HOW_KEY, how);
  } catch {
    /* a preference is a nicety */
  }
}

/**
 * Where a slot is on the glass. Five along the wall, then two rows across the
 * floor — the back row a little smaller and a little higher, which is the
 * whole trick that makes a flat picture look like a room.
 */
function slotAt(i) {
  if (i < HOUSE_WALL) return { zone: 'wall', x: 60 + i * 80, y: 88, s: 1 };
  const k = i - HOUSE_WALL;
  const row = Math.floor(k / HOUSE_SLOTS.cols),
    col = k % HOUSE_SLOTS.cols;
  return { zone: 'floor', x: 52 + col * 82, y: row ? 246 : 192, s: row ? 1 : 0.84 };
}

/* ------------------------------------------------------------------ */
/* raising the shell                                                  */
/* ------------------------------------------------------------------ */

/**
 * One panel, one price, one button. There is nothing to design: a house is
 * four walls and a bed, and the interesting part starts once somebody lives
 * in it.
 */
export function openRaise(game, site) {
  const w = game.world,
    r = game.role;
  const p = openPanel({ title: tr('house.raiseTitle'), lead: tr('house.raiseLead') });

  const cv = makeCanvas(CW, 190);
  p.body.appendChild(cv.canvas);

  p.cost([
    { icon: '🪚', need: HOUSE_SHELL.plank, have: w.players[r].res.plank },
    { icon: '🪨', need: HOUSE_SHELL.stone, have: w.players[r].res.stone },
  ]);

  const row = p.row();
  const go = p.button(tr('house.raise'), 'go', () => {
    if (!canPay(w, r, HOUSE_SHELL)) {
      p.readout(tr('house.notEnough'));
      return;
    }
    if (!game.dispatch({ type: 'house.build', role: r, siteId: site.id })) return;
    stop();
    p.close();
    message(tr('msg.houseUp'));
    game.look(site.x + site.w / 2, site.y + site.h / 2);
    const built = game.world.buildings.filter(b => b.id === site.id)[0];
    if (built) openHouse(game, built); // straight inside, to furnish it
  });
  go.disabled = !canPay(w, r, HOUSE_SHELL);
  if (go.disabled) p.readout(tr('house.notEnough'));
  row.appendChild(go);
  const back = p.button(tr('ui.later'), 'soft', () => {
    stop();
    p.close();
  });
  back.style.flex = '0 0 auto';
  row.appendChild(back);

  // a little picture of what you are buying, so it is not a wall of numbers
  const stop = loop(t => {
    cv.fit();
    const ctx = cv.ctx;
    ctx.clearRect(0, 0, CW, 190);
    ctx.fillStyle = '#cfe3d4';
    rr(ctx, 6, 8, CW - 12, 174, 18);
    ctx.fill();
    const x = CW / 2,
      y = 150;
    ctx.fillStyle = 'rgba(60,50,35,.16)';
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 92, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d3a877';
    rr(ctx, x - 76, y - 62, 152, 62, 6);
    ctx.fill();
    ctx.fillStyle = '#a8543c';
    ctx.beginPath();
    ctx.moveTo(x - 88, y - 60);
    ctx.lineTo(x, y - 104);
    ctx.lineTo(x + 88, y - 60);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7d5730';
    rr(ctx, x - 14, y - 34, 28, 34, 3);
    ctx.fill();
    const flick = 0.8 + Math.sin(t * 0.004) * 0.1;
    ctx.fillStyle = 'rgba(255,216,115,' + flick + ')';
    rr(ctx, x + 30, y - 50, 22, 22, 3);
    ctx.fill();
    ctx.strokeStyle = '#8a6540';
    ctx.lineWidth = 2;
    rr(ctx, x + 30, y - 50, 22, 22, 3);
    ctx.stroke();
    glyph(ctx, '🛏️', x - 42, y - 39, 22);
  });
  return p;
}

/* ------------------------------------------------------------------ */
/* living in it                                                       */
/* ------------------------------------------------------------------ */

export function openHouse(game, house) {
  const p = openPanel({ title: '🏠 ' + (house.name || tr('w.house')) });

  const cv = makeCanvas(CW, CH);
  p.body.appendChild(cv.canvas);

  // what is in your hand: something from the shelf to buy, or something
  // already in the room that you have picked up to put somewhere else
  let held = null; // { kind } or { kind, from }
  // and what is being made: nothing is bought with a tap any more, it is
  // written or drawn first, which is the price of it
  let making = null; // { kind, how, pen }
  let how = howLast();

  function startMaking(kind) {
    const box = how === 'word' ? WORD_BOX : SHAPE_BOX;
    const strokes =
      how === 'word'
        ? wordStrokes(itemName(kind), box.x, box.y, box.w, box.h)
        : shapeStrokes(kind, box.x, box.y, box.w, box.h);
    // a word with no letters we know how to write is not a reason to stop
    if (!strokes.length) {
      held = { kind: kind };
      making = null;
      showTrace();
      return;
    }
    making = { kind: kind, how: how, pen: tracer(strokes, how === 'word' ? box.h : box.w) };
    showTrace();
  }

  // What is being traced, where a console — or the play-through — can see it.
  // Nothing in the game reads this; it is the only way a test can follow a
  // line it has no other way of knowing the shape of.
  function showTrace() {
    game.tracing = making ? making.pen : null;
  }

  const here = () => game.world.buildings.filter(b => b.id === house.id)[0] || house;
  const stuff = () => here().stuff || [];
  const at = slot => stuff().filter(s => s.slot === slot)[0] || null;
  const mine = () => game.world.players[game.role].res;

  /* ---------------- the shelf of things ---------------- */

  const tools = el('div', 'tools');
  p.panel.appendChild(tools);
  const toolBtns = {};
  for (const k of HOUSE_SHELF) {
    const it = HOUSE_STUFF[k];
    const b = el('button', 'tool');
    const bits = [];
    for (const res in it.cost) bits.push(it.cost[res] + resIcon(res));
    b.innerHTML =
      '<span class="ico">' +
      it.icon +
      '</span><span class="lab">' +
      itemName(k) +
      '</span>' +
      '<span class="cost">' +
      bits.join(' ') +
      '</span>';
    b.addEventListener('click', () => {
      if (making?.kind === k) {
        making = null;
        showTrace();
        paint();
        return;
      }
      if (held && !held.from && held.kind === k) {
        held = null;
        paint();
        return;
      }
      // being asked to write out something you cannot pay for is a mean trick
      if (!canPay(game.world, game.role, it.cost)) {
        held = null;
        making = null;
        showTrace();
        p.readout(tr('house.notEnough'));
        p.cost(costOf(k));
        return;
      }
      held = null;
      startMaking(k);
      paint();
    });
    toolBtns[k] = b;
    tools.appendChild(b);
  }

  /* ---------------- putting something down ---------------- */

  onPointer(cv.canvas, CW, CH, {
    move(pt) {
      if (making) making.pen.move(pt);
    },
    up() {
      if (making) making.pen.up();
    },
    down(pt) {
      if (making) {
        making.pen.down(pt);
        return;
      }
      let best = -1,
        bd = 1e9;
      for (let i = 0; i < HOUSE_ALL; i++) {
        const s = slotAt(i);
        const d = Math.hypot(pt.x - s.x, pt.y - s.y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (bd > 40) {
        held = null;
        paint();
        return;
      }
      const standing = at(best);

      if (held) {
        const def = HOUSE_STUFF[held.kind];
        if (slotAt(best).zone !== def.where) {
          p.readout(
            tr(def.where === 'wall' ? 'house.onTheWall' : 'house.onTheFloor', {
              what: itemName(held.kind),
            }),
          );
          return;
        }
        if (standing) {
          p.readout(tr('house.taken'));
          return;
        }
        if (held.from != null) {
          game.dispatch({
            type: 'house.move',
            role: game.role,
            houseId: here().id,
            from: held.from,
            to: best,
          });
        } else if (!canPay(game.world, game.role, def.cost)) {
          p.readout(tr('house.notEnough'));
          return;
        } else {
          game.dispatch({
            type: 'house.put',
            role: game.role,
            houseId: here().id,
            kind: held.kind,
            slot: best,
          });
        }
        held = null;
        paint();
        return;
      }

      // nothing in your hand: pick up whatever is standing there
      if (standing) {
        held = { kind: standing.kind, from: best };
        paint();
      } else paint();
    },
  });

  /* ---------------- what the panel says ---------------- */

  function paint() {
    const b = here();
    for (const k in toolBtns) {
      const it = HOUSE_STUFF[k];
      const on = held && !held.from && held.kind === k;
      const poor = !canPay(game.world, game.role, it.cost);
      toolBtns[k].className = 'tool' + (on ? ' on' : '') + (poor ? ' poor' : '');
    }
    if (making) {
      p.readout(
        tr(making.how === 'word' ? 'trace.write' : 'trace.draw', { what: itemName(making.kind) }),
      );
      p.cost(costOf(making.kind));
    } else if (held) {
      p.readout(
        tr(held.from != null ? 'house.moveWhere' : 'house.putWhere', { what: itemName(held.kind) }),
      );
      p.cost(held.from != null ? [] : costOf(held.kind));
    } else {
      p.readout(feelLine(b));
      p.cost([]);
    }
    swap.textContent = tr(how === 'word' ? 'trace.asShape' : 'trace.asWord');
    swap.style.display = making ? '' : 'none';
    never.style.display = held || making ? '' : 'none';
  }

  /** What a thing costs, as the counted pictures the panels use. */
  function costOf(kind) {
    const out = [];
    for (const res in HOUSE_STUFF[kind].cost)
      out.push({ icon: resIcon(res), need: HOUSE_STUFF[kind].cost[res], have: mine()[res] || 0 });
    return out;
  }

  /** Who lives here and what the room is like, in one line each. */
  function feelLine(b) {
    const who = (b.residents || [])
      .map(id => (game.world.villagers.filter(v => v.id === id)[0] || {}).name)
      .filter(Boolean);
    const spare = (b.beds || 0) - (b.residents || []).length;
    const lines = [tr('house.feels', { feel: tr('house.feel' + feelLevel(b)) })];
    if (who.length) lines.push(trn('w.livesHere', who.length, { names: who.join(tr('w.and')) }));
    else lines.push(tr('house.nobody'));
    if (spare > 0) lines.push(trn('w.spareBed', spare, { n: spare }));
    return lines.join(' ');
  }

  const row = p.row();
  // letters or picture — the same thing either way, and entirely his choice
  const swap = p.button('', 'soft', () => {
    how = how === 'word' ? 'shape' : 'word';
    howKeep(how);
    if (making) startMaking(making.kind);
    paint();
  });
  swap.style.flex = '0 0 auto';
  row.appendChild(swap);
  const never = p.button(tr('ui.neverMind'), 'soft', () => {
    held = null;
    making = null;
    showTrace();
    paint();
  });
  never.style.flex = '0 0 auto';
  row.appendChild(never);
  row.appendChild(
    p.button(tr('ui.close'), 'soft', () => {
      stop();
      making = null;
      showTrace();
      p.close();
    }),
  );
  paint();

  /* ---------------- drawing the room ---------------- */

  const stop = loop(t => {
    cv.fit();
    draw(t);
  });

  function draw(t) {
    const ctx = cv.ctx;
    const b = here();
    const tick = game.world.tick;
    const lit = b.light !== false;

    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = '#efe4cd';
    ctx.fillRect(0, 0, CW, CH);

    // making something takes the whole card: the room can wait a minute
    if (making) {
      ctx.fillStyle = '#fdf7ea';
      rr(ctx, 10, 10, CW - 20, CH - 20, 16);
      ctx.fill();
      traceHeader(ctx, HOUSE_STUFF[making.kind].icon, itemName(making.kind), 22, 22, CW - 44);
      making.pen.draw(ctx, t);
      if (making.pen.done()) {
        // made. It goes into your hand, and the room comes back with the
        // places it can stand already lit up.
        held = { kind: making.kind };
        making = null;
        showTrace();
        paint();
      }
      return;
    }

    // the wall behind, lit or not depending on whether there is a window in it
    ctx.fillStyle = lit ? '#efe0c4' : '#b9b0a0';
    rr(ctx, 14, WALL_TOP - 8, CW - 28, FLOOR_Y - WALL_TOP + 8, 12);
    ctx.fill();
    ctx.fillStyle = 'rgba(90,70,45,.10)';
    ctx.fillRect(14, WALL_TOP - 8, CW - 28, 9);

    // the floor, in boards running away from you
    ctx.fillStyle = '#c9a877';
    ctx.fillRect(14, FLOOR_Y, CW - 28, FLOOR_END - FLOOR_Y);
    ctx.strokeStyle = 'rgba(120,88,52,.22)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const y = FLOOR_Y + i * ((FLOOR_END - FLOOR_Y) / 8);
      ctx.beginPath();
      ctx.moveTo(14, y);
      ctx.lineTo(CW - 14, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#8a6540'; // the skirting board
    ctx.fillRect(14, FLOOR_Y - 6, CW - 28, 7);

    // the way in
    ctx.fillStyle = '#7d5730';
    rr(ctx, DOOR_X - 20, WALL_TOP + 22, 40, FLOOR_Y - WALL_TOP - 22, 4);
    ctx.fill();
    ctx.strokeStyle = '#5f3f22';
    ctx.lineWidth = 2;
    rr(ctx, DOOR_X - 20, WALL_TOP + 22, 40, FLOOR_Y - WALL_TOP - 22, 4);
    ctx.stroke();
    ctx.fillStyle = '#e0b26a';
    ctx.beginPath();
    ctx.arc(DOOR_X - 11, FLOOR_Y - 46, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // the empty places, and which of them will take what is in your hand
    const want = held ? HOUSE_STUFF[held.kind].where : null;
    for (let i = 0; i < HOUSE_ALL; i++) {
      const s = slotAt(i);
      if (at(i)) continue;
      if (want && s.zone === want) {
        const beat = 0.22 + 0.14 * Math.sin(t * 0.005 + i);
        ctx.fillStyle = 'rgba(127,194,90,' + beat + ')';
        ctx.strokeStyle = 'rgba(93,145,80,.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        rr(ctx, s.x - 26, s.y - 26, 52, 52, 10);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (!want) {
        ctx.strokeStyle = 'rgba(120,95,60,.13)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 6]);
        rr(ctx, s.x - 22, s.y - 22, 44, 44, 9);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // a stove throws light of its own, which is worth seeing before anything
    // is drawn on top of it
    for (const s of stuff()) {
      if (s.kind !== 'stove') continue;
      const at1 = slotAt(s.slot);
      const g = ctx.createRadialGradient(at1.x, at1.y, 2, at1.x, at1.y, 76);
      g.addColorStop(0, 'rgba(242,163,74,' + (0.24 + 0.06 * Math.sin(t * 0.004)) + ')');
      g.addColorStop(1, 'rgba(242,163,74,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(at1.x, at1.y, 76, 0, Math.PI * 2);
      ctx.fill();
    }

    // everything in the room, back to front, with the people among it
    const things = [];
    for (const s of stuff()) {
      const a = slotAt(s.slot);
      things.push({ y: a.zone === 'wall' ? 0 : a.y, draw: () => piece(ctx, s, a, t) });
    }
    for (const who of residents(b)) {
      things.push({ y: who.y + 1, draw: () => person(ctx, who, t, tick) });
    }
    things.sort((a, b2) => a.y - b2.y);
    for (const th of things) th.draw();

    // and a shadow over the lot when there is nothing to see by
    if (!lit) {
      ctx.fillStyle = 'rgba(40,44,70,.30)';
      ctx.fillRect(0, 0, CW, CH);
    }
  }

  function piece(ctx, s, a, t) {
    const it = HOUSE_STUFF[s.kind];
    const picked = held?.from === s.slot;
    ctx.save();
    if (picked) {
      ctx.globalAlpha = 0.5;
      ctx.translate(0, -4 + Math.sin(t * 0.008) * 2);
    }
    if (a.zone === 'floor') {
      ctx.fillStyle = 'rgba(60,50,35,.18)';
      ctx.beginPath();
      ctx.ellipse(a.x, a.y + 15 * a.s, 18 * a.s, 6 * a.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    glyph(ctx, it.icon, a.x, a.y, 34 * a.s);
    ctx.restore();
  }

  /**
   * Who is in and what they are up to. A chair is sat on, a table is eaten at,
   * a stove is stood by — and which of them each person picks comes from their
   * name and the clock, so it changes through the day and both screens agree.
   */
  function residents(b) {
    const out = [];
    const folk = (b.residents || [])
      .map(id => game.world.villagers.filter(v => v.id === id)[0])
      .filter(Boolean);
    if (!folk.length) return out;

    const spots = [];
    for (const s of stuff()) {
      const def = HOUSE_STUFF[s.kind];
      if (!def.gives) continue;
      const a = slotAt(s.slot);
      if (a.zone !== 'floor') continue;
      if (def.gives === 'sit') spots.push({ x: a.x, y: a.y + 2, act: 'sit', s: a.s });
      if (def.gives === 'table') spots.push({ x: a.x - 30 * a.s, y: a.y + 6, act: 'eat', s: a.s });
      if (def.gives === 'warm') spots.push({ x: a.x + 34 * a.s, y: a.y + 4, act: null, s: a.s });
      if (def.gives === 'bed') spots.push({ x: a.x + 2, y: a.y + 20 * a.s, act: 'sit', s: a.s });
    }
    // somewhere to stand even in a room with nothing in it
    spots.push({ x: 150, y: 262, act: null, s: 1 });
    spots.push({ x: 300, y: 258, act: null, s: 1 });
    spots.push({ x: 390, y: 266, act: null, s: 1 });

    const beat = Math.floor(game.world.tick / 150);
    const taken = {};
    for (let i = 0; i < folk.length; i++) {
      const v = folk[i];
      let k = (nameHash(v.id) + beat + i) % spots.length;
      for (let tryN = 0; tryN < spots.length && taken[k]; tryN++) k = (k + 1) % spots.length;
      taken[k] = 1;
      const sp = spots[k];
      out.push({ v: v, x: sp.x, y: sp.y, act: sp.act, s: sp.s });
    }
    return out;
  }

  function person(ctx, who, t, tick) {
    ctx.save();
    ctx.translate(who.x, who.y);
    ctx.scale(2.6 * who.s, 2.6 * who.s);
    drawVillager(
      ctx,
      {
        id: who.v.id,
        name: who.v.name,
        colour: who.v.colour,
        kid: who.v.kid,
        x: 0,
        y: 0,
        facing: 1,
        moving: -999,
        hearts: -999,
        said: null,
        carrying: null,
        mood: 'ok',
        poorly: 0,
        act: who.act ? { kind: who.act, until: 1e9, with: null } : null,
      },
      t,
      tick,
    );
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* odds and ends                                                      */
/* ------------------------------------------------------------------ */

const RES_ICON = { wood: '🪵', plank: '🪚', stone: '🪨', wheat: '🌾', food: '🍞', wool: '🧶' };
function resIcon(k) {
  return RES_ICON[k] || '·';
}

/** Which of the five words this room has earned. */
export function feelLevel(b) {
  const c = b.comfort || 0;
  let lvl = 0;
  for (let i = 0; i < HOUSE_FEEL.length; i++) if (c >= HOUSE_FEEL[i]) lvl = i;
  return lvl;
}

/** A small stable number from a name, so the same person picks the same chair. */
function nameHash(id) {
  let h = 0;
  for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) & 0xffff;
  return h;
}
