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
import { tick, catchUp } from '../core/sim.js';
import { maybeEvent, resetEventBudget } from '../core/events.js';
import { createWorld, deserialize, serialize, TICK_MS } from '../core/world.js';
import { save, load } from '../core/persist.js';

const SNAP_EVERY = 12; // ticks between snapshots to the other player (1.2 s)
const SAVE_EVERY = 50; // ticks between saves to this device (5 s)
const UPLOAD_EVERY = 300; // ticks between saves to the server (30 s)
const HOST_WAIT = 900; // ms to listen before claiming the host role
const PENDING_MS = 5000; // how long we carry an unacknowledged action of our own

export class Session {
  constructor(opts) {
    this.room = opts.room;
    this.role = opts.role; // 'A' | 'B' | 'BOTH'
    this.transport = opts.transport;
    this.solo = opts.solo === true;
    this.remote = opts.remote || null; // { load(), save(tick, text, beacon, reset) }
    this.peer = 'p' + Math.random().toString(36).slice(2, 9);
    this.isHost = this.solo;
    this.world = null;
    this.kept = null; // what the relay says the room was doing
    this.listeners = [];
    this.acc = 0;
    this.lastSnap = 0;
    this.lastSave = 0;
    this.lastUpload = 0;
    this.status = this.solo ? 'solo' : 'waiting';
    this.seq = 1; // numbers our own actions, for acks to name
    this.pending = []; // our own actions the host has not confirmed yet
    this.seenPeers = null; // who has said hello, so we only echo once each
    this.lowestPeer = null; // the smallest peer id we have heard say hello
    this.everOnline = false; // tells a first connect from a reconnect
  }

  on(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(f => f !== fn);
    };
  }
  emit(what, data) {
    for (const fn of this.listeners) fn(what, data);
  }

  async start() {
    // ask the server for the world while we listen for the other player
    const fromServer = this.remote ? this.remote.load() : Promise.resolve(null);
    const connecting = this.transport.connect(m => this.receive(m));
    // A drop and reconnect otherwise never says hello again, so nothing tells
    // the other player we are worth a fresh snapshot after we come back.
    this.transport.onStatus = s => this.onTransportStatus(s);
    await connecting;

    if (this.solo) {
      this.world = await this.bestWorld(fromServer);
      this.becomeHost();
      return;
    }

    this.seenPeers = new Set();
    this.transport.send({ t: 'hello', peer: this.peer });
    await new Promise(r => setTimeout(r, HOST_WAIT));
    // Somebody with a lower id said hello back before we decided anything —
    // they are about to claim the clock (the same rule the tie-break below
    // uses), so give their snapshot a little longer to arrive instead of
    // grabbing the clock out from under them and losing whatever they did
    // while both of us thought we were in charge.
    if (!this.world && this.lowestPeer !== null && this.lowestPeer < this.peer) {
      await new Promise(r => setTimeout(r, HOST_WAIT));
    }
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
      if (got?.world) candidates.push(deserialize(got.world));
    } catch {
      /* the directory having nothing is not a problem */
    }
    let best = null;
    for (const w of candidates) if (w && (!best || w.tick >= best.tick)) best = w;
    return best || createWorld(hashSeed(this.room));
  }

  becomeHost() {
    this.isHost = true;
    // Nobody has been here for a while and the kind things went on without
    // them — law 9. Done here and nowhere else: whoever runs the clock works
    // it out once, before the first tick, and the other player is handed the
    // result in the snapshot below rather than working out a second answer
    // from a second device's clock.
    catchUp(this.world, Date.now());
    this.status = this.solo ? 'solo' : 'hosting';
    this.emit('status', this.status);
    this.emit('world', this.world);
    if (!this.solo) this.snapshot();
    // put it on the server straight away, so somebody joining in the next
    // minute gets this world rather than starting a second empty one
    if (this.remote) this.upload();
  }

  /** The transport telling us how the connection itself is doing. */
  onTransportStatus(status) {
    if (status === 'online' && this.everOnline && !this.solo)
      this.transport.send({ t: 'hello', peer: this.peer });
    if (status === 'online') this.everOnline = true;
  }

  /* ---------------- messages ---------------- */

  receive(m) {
    if (!m || m.peer === this.peer) return;
    switch (m.t) {
      case 'hello': {
        const firstTime = this.seenPeers && !this.seenPeers.has(m.peer);
        if (this.seenPeers) this.seenPeers.add(m.peer);
        if (this.lowestPeer === null || m.peer < this.lowestPeer) this.lowestPeer = m.peer;
        if (this.isHost) this.snapshot();
        // Say it back the first time: two peers connecting in the same
        // instant can each miss the other's very first hello — a relay has
        // nobody yet to hand it to — and without an echo both go on to
        // claim the clock deaf to each other.
        else if (!this.world && firstTime) this.transport.send({ t: 'hello', peer: this.peer });
        break;
      }
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
          if (m.peer < this.peer) {
            this.isHost = false;
            this.status = 'joined';
            this.emit('status', this.status);
          } else return;
        }
        this.reconcile(incoming);
        this.status = 'joined';
        this.emit('status', this.status);
        this.emit('world', this.world);
        break;
      }
      case 'act':
        if (!this.world) return;
        if (applyAction(this.world, m.action)) {
          this.emit('acted', m.action);
          // tell whoever sent it that it landed, so they can stop carrying
          // it against the chance a snapshot undoes it
          if (this.isHost && m.action.id)
            this.transport.send({ t: 'ack', peer: this.peer, id: m.action.id });
        }
        break;
      case 'ack':
        this.pending = this.pending.filter(p => p.id !== m.id);
        break;
      default:
        break;
    }
  }

  /** Take the host's world but keep our own smooth movement. */
  reconcile(incoming) {
    if (this.world) {
      const keep = {};
      for (const v of this.world.villagers) keep[v.id] = v;
      for (const s of this.world.sheep) keep[s.id] = s;
      const blend = e => {
        const old = keep[e.id];
        if (!old) return;
        const d = Math.abs(old.x - e.x) + Math.abs(old.y - e.y);
        if (d < 2.5) {
          e.x = old.x + (e.x - old.x) * 0.35;
          e.y = old.y + (e.y - old.y) * 0.35;
        }
      };
      incoming.villagers.forEach(blend);
      incoming.sheep.forEach(blend);
      incoming.fx = this.world.fx || []; // our own little sparkles stay ours
    }
    // Whatever we did that the host has not acknowledged yet might not be in
    // this snapshot — it could have been taken before our action reached the
    // host, or be a moment behind. Play it again on top, so "I just did that"
    // never quietly vanishes. Anything old enough to have been settled one
    // way or the other, we let go of, so a genuinely rejected action does not
    // haunt every snapshot for ever.
    const now = Date.now();
    this.pending = this.pending.filter(p => now - p.at < PENDING_MS);
    for (const p of this.pending) applyAction(incoming, p.action);
    this.world = incoming;
  }

  snapshot() {
    if (this.solo) return;
    const fx = this.world.fx;
    this.world.fx = []; // effects are re-created from actions
    this.transport.send({ t: 'snap', peer: this.peer, world: serialize(this.world) });
    this.world.fx = fx;
    this.lastSnap = this.world.tick;
  }

  /* ---------------- the one way to change the world ---------------- */

  dispatch(action) {
    if (!this.world) return false;
    // A name for this one action, so an ack can say which of ours landed.
    if (!this.solo && action.id == null) action.id = this.peer + ':' + this.seq++;
    const ok = applyAction(this.world, action);
    if (!ok) return false;
    if (!this.solo) {
      // We are not the authority, so hold onto this until the host says it
      // landed — a snapshot crossing it in flight must not be able to undo
      // it. Recorded before it is sent: an ack could in principle come back
      // before this line otherwise, and then never find anything to clear.
      if (!this.isHost) this.pending.push({ id: action.id, action, at: Date.now() });
      this.transport.send({ t: 'act', peer: this.peer, action });
    }
    this.emit('acted', action);
    return true;
  }

  /* ---------------- the clock ---------------- */

  update(dtMs) {
    if (!this.world) return;
    // Somebody is watching, this moment. It goes with the world into every
    // save, upload and snapshot, so the next person in can tell how long the
    // village was on its own — see catchUp(). Out here rather than inside
    // tick(), which stays a pure function of the ticks it is given.
    if (this.world.ext) this.world.ext.awayAt = Date.now();
    this.acc += Math.min(dtMs, 500); // a backgrounded tab does not fast-forward
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
    if (this.isHost && this.remote && this.world.tick - this.lastUpload >= UPLOAD_EVERY)
      this.upload();
  }

  /** Hand the world to the server, so the next person to arrive gets it. */
  upload(beacon, reset) {
    if (!this.remote || !this.world) return null;
    this.lastUpload = this.world.tick;
    const fx = this.world.fx;
    this.world.fx = [];
    const text = serialize(this.world);
    this.world.fx = fx;
    return this.remote.save(this.world.tick, text, !!beacon, !!reset);
  }

  /**
   * Everything built here goes away and the first morning begins again.
   *
   * Three things remember a world now, and forgetting it on this device is no
   * longer enough: the relay is holding the last snapshot it saw, and the
   * directory is holding one on disk. Both would hand the old village straight
   * back. So starting over is not a forgetting at all — it is a fresh world,
   * pushed everywhere the old one reached.
   */
  startOver() {
    this.world = createWorld(hashSeed(this.room));
    this.kept = null;
    this.isHost = true;
    this.pending = []; // nothing from the old world is owed a reply
    this.lastSnap = 0;
    this.lastSave = 0;
    this.lastUpload = 0;
    save(this.room, this.world);
    if (!this.solo) this.snapshot(); // the relay's memory, and the other player
    this.emit('world', this.world);
    return Promise.resolve(this.upload(false, true));
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
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
