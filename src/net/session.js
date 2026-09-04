// Session owns the world and decides who simulates it.
//
// One peer is the host: it runs the clock and is the authority. Guests apply
// their own actions straight away so the game feels instant, send them on, and
// get corrected by the host's snapshots. That is exactly the shape a real
// server needs, so moving the host into Node later changes nothing above here.

import { applyAction } from '../core/actions.js';
import { tick } from '../core/sim.js';
import { maybeEvent, resetEventBudget } from '../core/events.js';
import { createWorld, deserialize, serialize, TICK_MS } from '../core/world.js';
import { save, load } from '../core/persist.js';

const SNAP_EVERY = 12;          // ticks between snapshots (1.2 s)
const SAVE_EVERY = 50;          // ticks between saves (5 s)
const HOST_WAIT  = 900;         // ms to listen before claiming the host role

export class Session {
  constructor(opts) {
    this.room = opts.room;
    this.role = opts.role;               // 'A' | 'B' | 'BOTH'
    this.transport = opts.transport;
    this.solo = opts.solo === true;
    this.peer = 'p' + Math.random().toString(36).slice(2, 9);
    this.isHost = this.solo;
    this.world = null;
    this.listeners = [];
    this.acc = 0;
    this.lastSnap = 0;
    this.lastSave = 0;
    this.status = this.solo ? 'solo' : 'waiting';
  }

  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(f => f !== fn); }; }
  emit(what, data) { for (const fn of this.listeners) fn(what, data); }

  async start() {
    await this.transport.connect((m) => this.receive(m));

    if (this.solo) {
      this.world = load(this.room) || createWorld(hashSeed(this.room));
      this.becomeHost();
      return;
    }

    this.transport.send({ t: 'hello', peer: this.peer });
    await new Promise(r => setTimeout(r, HOST_WAIT));
    if (!this.world) {
      this.world = load(this.room) || createWorld(hashSeed(this.room));
      this.becomeHost();
    }
  }

  becomeHost() {
    this.isHost = true;
    this.status = this.solo ? 'solo' : 'hosting';
    this.emit('status', this.status);
    this.emit('world', this.world);
    if (!this.solo) this.snapshot();
  }

  /* ---------------- messages ---------------- */

  receive(m) {
    if (!m || m.peer === this.peer) return;
    switch (m.t) {
      case 'hello':
        if (this.isHost) this.snapshot();
        break;
      case 'snap': {
        const incoming = deserialize(m.world);
        if (!incoming) return;
        if (this.isHost) {
          // two hosts met: the one with the lower peer id keeps the clock
          if (m.peer < this.peer) { this.isHost = false; this.status = 'joined'; this.emit('status', this.status); }
          else return;
        }
        this.reconcile(incoming);
        this.status = 'joined';
        this.emit('status', this.status);
        this.emit('world', this.world);
        break;
      }
      case 'act':
        if (!this.world) return;
        if (applyAction(this.world, m.action)) this.emit('acted', m.action);
        break;
      default: break;
    }
  }

  /** Take the host's world but keep our own smooth movement. */
  reconcile(incoming) {
    if (this.world) {
      const keep = {};
      for (const v of this.world.villagers) keep[v.id] = v;
      for (const s of this.world.sheep) keep[s.id] = s;
      const blend = (e) => {
        const old = keep[e.id];
        if (!old) return;
        const d = Math.abs(old.x - e.x) + Math.abs(old.y - e.y);
        if (d < 2.5) { e.x = old.x + (e.x - old.x) * 0.35; e.y = old.y + (e.y - old.y) * 0.35; }
      };
      incoming.villagers.forEach(blend);
      incoming.sheep.forEach(blend);
      incoming.fx = this.world.fx || [];       // our own little sparkles stay ours
    }
    this.world = incoming;
  }

  snapshot() {
    if (this.solo) return;
    const fx = this.world.fx;
    this.world.fx = [];                        // effects are re-created from actions
    this.transport.send({ t: 'snap', peer: this.peer, world: serialize(this.world) });
    this.world.fx = fx;
    this.lastSnap = this.world.tick;
  }

  /* ---------------- the one way to change the world ---------------- */

  dispatch(action) {
    if (!this.world) return false;
    const ok = applyAction(this.world, action);
    if (!ok) return false;
    if (!this.solo) this.transport.send({ t: 'act', peer: this.peer, action });
    this.emit('acted', action);
    return true;
  }

  /* ---------------- the clock ---------------- */

  update(dtMs) {
    if (!this.world) return;
    this.acc += Math.min(dtMs, 500);           // a backgrounded tab does not fast-forward
    let steps = 0;
    while (this.acc >= TICK_MS && steps < 8) {
      this.acc -= TICK_MS;
      steps++;
      const r = tick(this.world);
      if (r === 'block-ended') this.emit('block-ended');
      if (this.isHost && this.world.block.active) {
        const ev = maybeEvent(this.world);
        if (ev) this.dispatch(ev);
      }
    }
    if (!steps) return;
    if (this.isHost && !this.solo && this.world.tick - this.lastSnap >= SNAP_EVERY) this.snapshot();
    if (this.isHost && this.world.tick - this.lastSave >= SAVE_EVERY) {
      save(this.room, this.world);
      this.lastSave = this.world.tick;
    }
  }

  checkpoint() {
    if (this.world) save(this.room, this.world);
  }

  startBlock(newDay) {
    resetEventBudget(this.world);
    this.dispatch({ type: 'block.start', newDay: !!newDay });
  }
}

export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
