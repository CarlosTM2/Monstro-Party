// Mini serveur WebSocket sans dépendance (RFC 6455) : suffisant pour un jeu entre amis.
const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class Client extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frag = null;
    this.alive = true;
    this.open = true;
    socket.setNoDelay(true);
    socket.on('data', (d) => this._data(d));
    socket.on('close', () => this._closed());
    socket.on('error', () => this._closed());
  }
  _closed() {
    if (!this.open) return;
    this.open = false;
    this.emit('close');
  }
  _data(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20) { this.close(); return; } // 1 Mo max : protège le serveur
      const need = off + (masked ? 4 : 0) + len;
      if (this.buf.length < need) return;
      let payload = this.buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) {
        const mask = this.buf.subarray(off, off + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      this.buf = this.buf.subarray(need);
      if (op === 0x8) { this.close(); return; }
      if (op === 0x9) { this._send(0xA, payload); continue; }
      if (op === 0xA) { this.alive = true; continue; }
      if (op === 0x1 || op === 0x2) { if (fin) this._msg(payload); else this.frag = [payload]; continue; }
      if (op === 0x0 && this.frag) { this.frag.push(payload); if (fin) { this._msg(Buffer.concat(this.frag)); this.frag = null; } }
    }
  }
  _msg(buf) {
    this.alive = true;
    let m; try { m = JSON.parse(buf.toString('utf8')); } catch (e) { return; }
    if (m && typeof m === 'object') this.emit('message', m);
  }
  _send(op, payload) {
    if (!this.open) return;
    const len = payload.length;
    let head;
    if (len < 126) { head = Buffer.from([0x80 | op, len]); }
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    try { this.socket.write(Buffer.concat([head, payload])); } catch (e) { this._closed(); }
  }
  send(obj) { this._send(0x1, Buffer.from(JSON.stringify(obj), 'utf8')); }
  ping() { this._send(0x9, Buffer.alloc(0)); }
  close() {
    if (this.open) { try { this._send(0x8, Buffer.alloc(0)); this.socket.end(); } catch (e) {} }
    this._closed();
  }
}

function attach(server, onClient) {
  const clients = new Set();
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    const c = new Client(socket);
    clients.add(c);
    c.on('close', () => clients.delete(c));
    onClient(c, req);
  });
  // Battement de cœur : coupe les connexions mortes, garde les autres ouvertes derrière les proxys.
  setInterval(() => {
    for (const c of clients) {
      if (!c.alive) { c.close(); continue; }
      c.alive = false;
      c.ping();
    }
  }, 20000).unref();
}

module.exports = { attach };
