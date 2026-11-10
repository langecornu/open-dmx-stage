// Art-Net (DMX over UDP) sender. Art-Net is a trademark of Artistic Licence Holdings Ltd; this implements the
// public ArtDmx packet. Default destination is the broadcast address; set a host to unicast to one node.
import dgram from 'node:dgram';

const ART_NET_PORT = 6454;
const OP_DMX = 0x5000;
const PROTOCOL_VERSION = 14;

/**
 * Builds an ArtDmx packet.
 * @param {Uint8Array} frame the DMX slots, normally 512
 * @param {number} universe the 15-bit Art-Net port-address, 0 to 32767
 * @param {number} sequence 1 to 255, so receivers can spot reordered packets
 * @returns {Buffer}
 */
export function buildArtNetPacket(frame, universe, sequence) {
  const packet = Buffer.alloc(18 + frame.length);
  packet.write('Art-Net\0', 0, 'latin1');
  packet.writeUInt16LE(OP_DMX, 8);
  packet.writeUInt16BE(PROTOCOL_VERSION, 10);
  packet[12] = sequence;
  packet[13] = 0;
  packet.writeUInt16LE(universe, 14);
  packet.writeUInt16BE(frame.length, 16);
  packet.set(frame, 18);
  return packet;
}

/** @typedef {import('../../shared/types.js').Driver} Driver */

/** @implements {Driver} */
export class ArtNetDriver {
  /**
   * @param {{ host?: string, universe?: number, port?: number, createSocket?: () => import('node:dgram').Socket }} options
   *   `createSocket` is injectable so tests can use a fake socket.
   */
  constructor({ host = '', universe = 0, port = ART_NET_PORT, createSocket = () => dgram.createSocket('udp4') }) {
    this.name = 'artnet';
    this.host = host || '255.255.255.255';
    this.universe = universe;
    this.port = port;
    this.createSocket = createSocket;
    /** @type {import('node:dgram').Socket | null} */
    this.socket = null;
    this.sequence = 0;
    /** @type {string | null} */
    this.error = null;
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
        socket.setBroadcast(true);
        resolve(undefined);
      });
    });
  }

  /** @param {Uint8Array} frame 512 slots */
  send(frame) {
    if (!this.socket) {
      return;
    }
    this.sequence = (this.sequence % 255) + 1;
    this.socket.send(buildArtNetPacket(frame, this.universe, this.sequence), this.port, this.host, (error) => {
      // Report send failures (no route, network down) in the status, and clear them once sending works again.
      this.error = error ? error.message : null;
    });
  }

  async close() {
    const socket = this.socket;
    if (socket) {
      this.socket = null;
      await new Promise((resolve) => socket.close(() => resolve(undefined)));
    }
  }

  /** @returns {import('../../shared/types.js').DriverStatus} */
  getStatus() {
    return {
      driver: this.name,
      connected: Boolean(this.socket) && !this.error,
      error: this.error,
      host: this.host,
      universe: this.universe,
    };
  }
}
