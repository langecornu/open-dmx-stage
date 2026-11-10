// sACN (ANSI E1.31, streaming ACN) sender: DMX over UDP, multicast by default or unicast to a host.
import crypto from 'node:crypto';
import dgram from 'node:dgram';

import { PendingSends } from './pendingSends.js';

const SACN_PORT = 5568;
const SOURCE_NAME = 'Open DMX Stage';
const PRIORITY = 100;

/**
 * Builds a full E1.31 data packet for one universe: 638 bytes for 512 slots.
 * @param {Uint8Array} frame the DMX slots, normally 512
 * @param {number} universe 1 to 63999
 * @param {number} sequence 0 to 255
 * @param {Buffer} cid 16-byte sender id
 * @returns {Buffer}
 */
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

/**
 * @param {number} universe 1 to 63999
 * @returns {string} the standard multicast group for the universe
 */
export function multicastAddress(universe) {
  return `239.255.${universe >> 8}.${universe & 0xff}`;
}

/** @typedef {import('../../shared/types.js').Driver} Driver */

/** @implements {Driver} */
export class SacnDriver {
  /**
   * @param {{ host?: string, universe?: number, port?: number, createSocket?: () => import('node:dgram').Socket }} options
   *   `createSocket` is injectable so tests can use a fake socket.
   */
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
    /** @type {import('node:dgram').Socket | null} */
    this.socket = null;
    this.sequence = 0;
    /** @type {string | null} */
    this.error = null;
    this.pendingSends = new PendingSends();
  }

  async open() {
    const socket = this.createSocket();
    this.socket = socket;
    socket.on('error', (error) => {
      this.error = error.message;
    });
    await new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.bind(0, () => {
        socket.off('error', reject);
        socket.setMulticastTTL(8);
        resolve(undefined);
      });
    });
  }

  /** @param {Uint8Array} frame 512 slots */
  send(frame) {
    if (!this.socket) {
      return;
    }
    this.sequence = (this.sequence + 1) % 256;
    const destination = this.host || multicastAddress(this.universe);
    const socket = this.socket;
    const packet = buildSacnPacket(frame, this.universe, this.sequence, this.cid);
    this.pendingSends.track((done) =>
      socket.send(packet, this.port, destination, (error) => {
        // Report send failures in the status, and clear them once sending works again.
        this.error = error ? error.message : null;
        done();
      }),
    );
  }

  async close() {
    const socket = this.socket;
    if (socket) {
      this.socket = null;
      // Let the last frames (the blanking frame, above all) leave before the socket goes away.
      await this.pendingSends.settled();
      await new Promise((resolve) => socket.close(() => resolve(undefined)));
    }
  }

  /** @returns {import('../../shared/types.js').DriverStatus} */
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
