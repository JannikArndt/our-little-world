// Session owns the world and decides who simulates it.
//
// One peer is the host: it runs the clock and is the authority. Guests apply
// their own actions straight away so the game feels instant, send them on, and
// get corrected by the host's snapshots. That is exactly the shape a real
// server needs, so moving the host into Node later changes nothing above here.
//
// Two things now remember the world besides the two browsers: the relay hands
// whoever joins the last world it saw in that room, and the host posts the
// world to the directory every half minute. The relay's memory is instant and
// the directory's copy survives a restart; both say the same thing, which is
// that the newest world wins instead of whoever happened to open the page
// first — that used to be the one way to lose a village.

import { applyAction } from '../core/actions.js';
import { tick } from '../core/sim.js';
import { maybeEvent, resetEventBudget } from '../core/events.js';
import { createWorld, deserialize, serialize, TICK_MS } from '../core/world.js';
import { save, load } from '../core/persist.js';

const SNAP_EVERY = 12;          // ticks between snapshots to the other player (1.2 s)
const SAVE_EVERY = 50;          // ticks between saves to this device (5 s)
const UPLOAD_EVERY = 300;       // ticks between saves to the server (30 s)
const HOST_WAIT  = 900;         // ms to listen before claiming the host role

export class Session {
  constructor(opts) {
    this.room = opts.room;
    this.role = opts.role;               // 'A' | 'B' | 'BOTH'
    this.transport = opts.transport;
    this.solo = opts.solo === true;
    this.remote = opts.remote || null;      // { load(), save(tick, text, beacon) }
    this.peer = 'p' + Math.random().toString(36).slice(2, 9);
    this.isHost = this.solo;
    this.world = null;
    this.kept = null;                    // what the relay says the room was doing
    this.listeners = [];
    this.acc = 0;
    this.lastSnap = 0;
    this.lastSave = 0;
    this.lastUpload = 0;
    this.status = this.solo ? 'solo' : 'waiting';
  }

  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(f => f !== fn); }; }
  emit(what, data) { for (const fn of this.listeners) fn(what, data); }

  async start() {
    // ask the server for the world while we listen for the other player
    const fromServer = this.remote ? this.remote.load() : Promise.resolve(null);
    await this.transport.connect((m) => this.receive(m));

    if (this.solo) {
      this.world = await this.bestWorld(fromServer);
      this.becomeHost();
      return;
    }

    this.transport.send({ t: 'hello', peer: this.peer });
    await new Promise(r => setTimeout(r, HOST_WAIT));
    if (!this.world) {
      this.world = await this.bestWorld(fromServer);
      this.becomeHost();
    }
  }

  /**
   * Nobody else is running the clock, so we will. Take whichever world has got
   * furthest: what the relay was holding, what the directory kept, what this
   * browser saved, or a new one. Two worlds for one room are always the same
   * world at different times, so the later tick is simply the truer one.
   */
  async bestWorld(fromServer) {
    const candidates = [load(this.room), this.kept];
    try {
      const got = fromServer ? await fromServer : null;
      if (got && got.world) candidates.push(deserialize(got.world));
    } catch (e) { /* the directory having nothing is not a problem */ }
    let best = null;
    for (const w of candidates) if (w && (!best || w.tick >= best.tick)) best = w;
    return best || createWorld(hashSeed(this.room));
  }

  becomeHost() {
    this.isHost = true;
    this.status = this.solo ? 'solo' : 'hosting';
    this.emit('status', this.status);
    this.emit('world', this.world);
    if (!this.solo) this.snapshot();
    // put it on the server straight away, so somebody joining in the next
    // minute gets this world rather than starting a second empty one
    if (this.remote) this.upload();
  }

  /* ---------------- messages ---------------- */

  receive(m) {
    if (!m || m.peer === this.peer) return;
    switch (m.t) {
      case 'hello':
        if (this.isHost) this.snapshot();
        break;
      case 'kept': {
        // the relay's memory of this room. Not a live host: just a world.
        const w = deserialize(m.world);
        if (w && (!this.kept || w.tick > this.kept.tick)) this.kept = w;
        break;
      }
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
    if (this.isHost && this.remote && this.world.tick - this.lastUpload >= UPLOAD_EVERY) this.upload();
  }

  /** Hand the world to the server, so the next person to arrive gets it. */
  upload(beacon) {
    if (!this.remote || !this.world) return;
    this.lastUpload = this.world.tick;
    const fx = this.world.fx;
    this.world.fx = [];
    const text = serialize(this.world);
    this.world.fx = fx;
    this.remote.save(this.world.tick, text, !!beacon);
  }

  /** A good place to leave it: this device, and the server too. */
  checkpoint(beacon) {
    if (!this.world) return;
    save(this.room, this.world);
    if (this.isHost) this.upload(beacon);
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
