// Driver for the ENTTEC DMX USB Pro (and compatible) using the documented "Send DMX Packet" label.
// Wire format: 0x7E, label 6, length LSB, length MSB, start code 0, 512 data bytes, 0xE7.
// Serial access uses the MIT-licensed `serialport` package (https://serialport.io).
import { logger } from '../logger.js';
import { asPromise } from '../utils/asPromise.js';
import { openSerialPort } from './serial.js';

const log = logger.child({ module: 'enttec-pro' });

const START_OF_MESSAGE = 0x7e;
const END_OF_MESSAGE = 0xe7;
const SEND_DMX_LABEL = 6;
const DMX_START_CODE = 0;

/**
 * @param {Uint8Array} frame the DMX slots to send, normally 512
 * @returns {Uint8Array} a complete "Send DMX Packet" message
 */
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

/** @typedef {import('../../shared/types.js').Driver} Driver */

/** @implements {Driver} */
export class EnttecProDriver {
  /**
   * @param {{ path: string, createPort?: typeof openSerialPort }} options `createPort` is injectable for tests.
   */
  constructor({ path, createPort = openSerialPort }) {
    this.name = 'enttec-pro';
    this.path = path;
    this.createPort = createPort;
    /** @type {import('../../shared/types.js').SerialPortLike | null} */
    this.port = null;
    /** @type {string | null} */
    this.error = null;
    this.lastFrame = new Uint8Array(512);
  }

  async open() {
    const port = await this.createPort({ path: this.path, baudRate: 57600 });
    this.port = port;
    port.on('error', (/** @type {Error} */ error) => {
      this.error = error.message;
      log.error({ err: error }, 'Serial error');
    });
    port.on('close', () => {
      this.error = this.error ?? 'Serial port closed';
    });
  }

  /** @param {Uint8Array} frame 512 slots */
  send(frame) {
    // Remember the newest frame even when the write is skipped, so close() can still flush the final state.
    this.lastFrame.set(frame.subarray(0, 512));
    if (!this.port?.isOpen || this.port.writableNeedDrain) {
      return;
    }
    this.port.write(buildEnttecProPacket(frame));
  }

  async close() {
    const port = this.port;
    if (!port?.isOpen) {
      return;
    }
    try {
      await asPromise((done) => port.write(Buffer.from(buildEnttecProPacket(this.lastFrame)), done));
      await asPromise((done) => port.drain(done));
    } catch (error) {
      log.error({ err: error }, 'Could not send the final frame');
    }
    try {
      await asPromise((done) => port.close(done));
    } catch (error) {
      log.error({ err: error }, 'Could not close the serial port cleanly');
    }
  }

  /** @returns {import('../../shared/types.js').DriverStatus} */
  getStatus() {
    return { driver: this.name, connected: Boolean(this.port?.isOpen), error: this.error, path: this.path };
  }
}
