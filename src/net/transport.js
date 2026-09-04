// Transport is the only place that knows how messages reach the other player.
// Everything above it just calls send() and gets onMessage(). Swapping the
// LocalTransport for the WsTransport is the whole of "adding multiplayer".

/*  message shapes
    { t:'hello',  peer }                     – I just arrived
    { t:'snap',   peer, world }              – here is the whole world
    { t:'act',    peer, action, seq }        – somebody did something
    { t:'bye',    peer }
*/

export class Transport {
  constructor() { this.onMessage = null; this.onStatus = null; }
  connect() { throw new Error('not implemented'); }
  send() { throw new Error('not implemented'); }
  close() {}
}

/** Two tabs, two windows, or two apps on the same device and browser. */
export class LocalTransport extends Transport {
  constructor(room) { super(); this.room = room; this.key = 'olw.msg.' + room; this.bc = null; }

  connect(onMessage) {
    this.onMessage = onMessage;
    if (typeof BroadcastChannel !== 'undefined') {
      this.bc = new BroadcastChannel('olw.' + this.room);
      this.bc.onmessage = (e) => this.onMessage(e.data);
    }
    // Safari 12 has no BroadcastChannel, but storage events work everywhere.
    this._onStorage = (e) => {
      if (e.key !== this.key || !e.newValue) return;
      try { this.onMessage(JSON.parse(e.newValue).m); } catch (err) { /* ignore */ }
    };
    window.addEventListener('storage', this._onStorage);
    if (this.onStatus) this.onStatus('local');
    return Promise.resolve();
  }

  send(msg) {
    if (this.bc) { try { this.bc.postMessage(msg); return; } catch (e) { /* fall through */ } }
    try { localStorage.setItem(this.key, JSON.stringify({ n: Math.random(), m: msg })); }
    catch (e) { /* a full or private-mode store just means no second window */ }
  }

  close() {
    if (this.bc) this.bc.close();
    window.removeEventListener('storage', this._onStorage);
  }
}

/** Two devices, through the little relay in server/relay.mjs. */
export class WsTransport extends Transport {
  constructor(url, room) { super(); this.url = url; this.room = room; this.queue = []; }

  connect(onMessage) {
    this.onMessage = onMessage;
    return new Promise((resolve) => {
      const open = () => {
        const sep = this.url.indexOf('?') === -1 ? '?' : '&';
        this.ws = new WebSocket(this.url + sep + 'room=' + encodeURIComponent(this.room));
        this.ws.onopen = () => {
          if (this.onStatus) this.onStatus('online');
          while (this.queue.length) this.ws.send(this.queue.shift());
          resolve();
        };
        this.ws.onmessage = (e) => {
          try { this.onMessage(JSON.parse(e.data)); } catch (err) { /* ignore */ }
        };
        this.ws.onclose = () => {
          if (this.onStatus) this.onStatus('reconnecting');
          this.retry = setTimeout(open, 2000);
        };
        this.ws.onerror = () => { try { this.ws.close(); } catch (e) { /* ignore */ } };
      };
      open();
      setTimeout(resolve, 2500);            // never block the game on the network
    });
  }

  send(msg) {
    const text = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === 1) this.ws.send(text);
    else if (this.queue.length < 40) this.queue.push(text);
  }

  close() { clearTimeout(this.retry); if (this.ws) { this.ws.onclose = null; this.ws.close(); } }
}

/** Playing alone, or two people on one iPad. */
export class SoloTransport extends Transport {
  connect(onMessage) { this.onMessage = onMessage; if (this.onStatus) this.onStatus('solo'); return Promise.resolve(); }
  send() {}
}
