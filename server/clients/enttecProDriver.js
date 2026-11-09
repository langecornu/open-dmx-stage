// Driver for the ENTTEC DMX USB Pro (and compatible) using the documented "Send DMX Packet" label.
// Wire format: 0x7E, label 6, length LSB, length MSB, start code 0, 512 data bytes, 0xE7.
// Serial access uses the MIT-licensed `serialport` package (https://serialport.io).
import { openSerialPort } from './serial.js';

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

const asPromise = (call) =>
  new Promise((resolve, reject) => {
    call((error) => (error ? reject(error) : resolve()));
  });

export class EnttecProDriver {
  constructor({ path, createPort = openSerialPort }) {
    this.name = 'enttec-pro';
    this.path = path;
    this.createPort = createPort;
    this.port = null;
    this.error = null;
    this.lastFrame = new Uint8Array(512);
  }

  async open() {
    this.port = await this.createPort({ path: this.path, baudRate: 57600 });
    this.port.on('error', (error) => {
      this.error = error.message;
      console.error('[dmx] Serial error:', error.message);
    });
    this.port.on('close', () => {
      this.error = this.error ?? 'Serial port closed';
    });
  }

  send(frame) {
    // Remember the newest frame even when the write is skipped, so close() can still flush the final state.
    this.lastFrame.set(frame.subarray(0, 512));
    if (!this.port?.isOpen || this.port.writableNeedDrain) {
      return;
    }
    this.port.write(buildEnttecProPacket(frame));
  }

  async close() {
    if (!this.port?.isOpen) {
      return;
    }
    try {
      await asPromise((done) => this.port.write(Buffer.from(buildEnttecProPacket(this.lastFrame)), done));
      await asPromise((done) => this.port.drain(done));
    } catch (error) {
      console.error('[dmx] Could not send the final frame:', error.message);
    }
    try {
      await asPromise((done) => this.port.close(done));
    } catch (error) {
      console.error('[dmx] Could not close the serial port cleanly:', error.message);
    }
  }

  getStatus() {
    return { driver: this.name, connected: Boolean(this.port?.isOpen), error: this.error, path: this.path };
  }
}
