// Driver for the ENTTEC DMX USB Pro (and compatible) using the documented "Send DMX Packet" label.
// Wire format: 0x7E, label 6, length LSB, length MSB, start code 0, 512 data bytes, 0xE7.
// Serial access uses the MIT-licensed `serialport` package (https://serialport.io).

const START_OF_MESSAGE = 0x7e;
const END_OF_MESSAGE = 0xe7;
const SEND_DMX_LABEL = 6;
const DMX_START_CODE = 0;

export function buildEnttecProPacket(frame) {
  const payloadLength = frame.length + 1;
  const packet = new Uint8Array(payloadLength + 5);
  packet[0] = START_OF_MESSAGE;
  packet[1] = SEND_DMX_LABEL;
  packet[2] = payloadLength & 0xff;
  packet[3] = (payloadLength >> 8) & 0xff;
  packet[4] = DMX_START_CODE;
  packet.set(frame, 5);
  packet[packet.length - 1] = END_OF_MESSAGE;
  return packet;
}

export async function listSerialPorts() {
  try {
    const { SerialPort } = await import('serialport');
    const ports = await SerialPort.list();
    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer ?? '',
      serialNumber: port.serialNumber ?? '',
    }));
  } catch (error) {
    console.error('[dmx] Could not list serial ports:', error.message);
    return [];
  }
}

export class EnttecProDriver {
  constructor({ path }) {
    this.name = 'enttec-pro';
    this.path = path;
    this.port = null;
    this.error = null;
  }

  async open() {
    const { SerialPort } = await import('serialport');
    await new Promise((resolve, reject) => {
      this.port = new SerialPort({ path: this.path, baudRate: 57600 }, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    this.port.on('error', (error) => {
      this.error = error.message;
      console.error('[dmx] Serial error:', error.message);
    });
    this.port.on('close', () => {
      this.error = this.error ?? 'Serial port closed';
    });
  }

  send(frame) {
    if (!this.port?.isOpen || this.port.writableNeedDrain) {
      return;
    }
    this.port.write(buildEnttecProPacket(frame));
  }

  async close() {
    if (!this.port?.isOpen) {
      return;
    }
    await new Promise((resolve) => this.port.close(() => resolve()));
  }

  getStatus() {
    return { driver: this.name, connected: Boolean(this.port?.isOpen), error: this.error, path: this.path };
  }
}
