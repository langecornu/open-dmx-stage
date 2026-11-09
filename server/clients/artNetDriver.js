// Art-Net (DMX over UDP) sender. Art-Net is a trademark of Artistic Licence Holdings Ltd; this implements the
// public ArtDmx packet. Default destination is the broadcast address; set a host to unicast to one node.
import dgram from 'node:dgram';

const ART_NET_PORT = 6454;
const OP_DMX = 0x5000;
const PROTOCOL_VERSION = 14;

// universe is the 15-bit Art-Net port-address (0-32767).
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

export class ArtNetDriver {
  constructor({ host = '', universe = 0, port = ART_NET_PORT, createSocket = () => dgram.createSocket('udp4') }) {
    this.name = 'artnet';
    this.host = host || '255.255.255.255';
    this.universe = universe;
    this.port = port;
    this.createSocket = createSocket;
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
        this.socket.setBroadcast(true);
        resolve();
      });
    });
  }

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
      host: this.host,
      universe: this.universe,
    };
  }
}
