// sACN (ANSI E1.31, streaming ACN) sender: DMX over UDP, multicast by default or unicast to a host.
import crypto from 'node:crypto';
import dgram from 'node:dgram';

const SACN_PORT = 5568;
const SOURCE_NAME = 'Open DMX Stage';
const PRIORITY = 100;

// Builds a full E1.31 data packet for one universe (1-63999). 638 bytes for 512 slots.
export function buildSacnPacket(frame, universe, sequence, cid) {
  const total = 126 + frame.length;
  const packet = Buffer.alloc(total);
  // Root layer
  packet.writeUInt16BE(0x0010, 0);
  packet.writeUInt16BE(0x0000, 2);
  packet.write('ASC-E1.17\0\0\0', 4, 'latin1');
  packet.writeUInt16BE(0x7000 | (total - 16), 16);
  packet.writeUInt32BE(0x00000004, 18);
  cid.copy(packet, 22);
  // Framing layer
  packet.writeUInt16BE(0x7000 | (total - 38), 38);
  packet.writeUInt32BE(0x00000002, 40);
  packet.write(SOURCE_NAME, 44, 'utf8');
  packet[108] = PRIORITY;
  packet.writeUInt16BE(0, 109);
  packet[111] = sequence;
  packet[112] = 0;
  packet.writeUInt16BE(universe, 113);
  // DMP layer
  packet.writeUInt16BE(0x7000 | (total - 115), 115);
  packet[117] = 0x02;
  packet[118] = 0xa1;
  packet.writeUInt16BE(0x0000, 119);
  packet.writeUInt16BE(0x0001, 121);
  packet.writeUInt16BE(frame.length + 1, 123);
  packet[125] = 0;
  packet.set(frame, 126);
  return packet;
}

export function multicastAddress(universe) {
  return `239.255.${universe >> 8}.${universe & 0xff}`;
}

export class SacnDriver {
  constructor({
    host = '',
    universe = 1,
    port = SACN_PORT,
    createSocket = () => dgram.createSocket({ type: 'udp4', reuseAddr: true }),
  }) {
    this.name = 'sacn';
    this.host = host;
    this.universe = universe;
    this.port = port;
    this.createSocket = createSocket;
    this.cid = crypto.randomBytes(16);
    this.socket = null;
    this.sequence = 0;
    this.error = null;
  }

  async open() {
    this.socket = this.createSocket();
    this.socket.on('error', (error) => {
      this.error = error.message;
    });
    await new Promise((resolve, reject) => {
      this.socket.once('error', reject);
      this.socket.bind(0, () => {
        this.socket.off('error', reject);
        this.socket.setMulticastTTL(8);
        resolve();
      });
    });
  }

  send(frame) {
    if (!this.socket) {
      return;
    }
    this.sequence = (this.sequence + 1) % 256;
    const destination = this.host || multicastAddress(this.universe);
    this.socket.send(
      buildSacnPacket(frame, this.universe, this.sequence, this.cid),
      this.port,
      destination,
      (error) => {
        // Report send failures in the status, and clear them once sending works again.
        this.error = error ? error.message : null;
      },
    );
  }

  async close() {
    if (this.socket) {
      await new Promise((resolve) => this.socket.close(resolve));
      this.socket = null;
    }
  }

  getStatus() {
    return {
      driver: this.name,
      connected: Boolean(this.socket) && !this.error,
      error: this.error,
      host: this.host || multicastAddress(this.universe),
      universe: this.universe,
    };
  }
}
