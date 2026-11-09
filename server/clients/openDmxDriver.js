// Driver for passive FTDI "Open DMX" style USB-DMX cables (no microcontroller), such as the DSD TECH SH-RS09B and the
// ENTTEC Open DMX USB. The computer generates the DMX timing itself: a serial break, then a start code and 512 slots at
// 250000 baud, 8 data bits, 2 stop bits. A long break (about 1 ms) is within the DMX spec and is robust against
// Node timer jitter; frames repeat continuously because receivers expect a steady refresh.
import { logger } from '../logger.js';
import { asPromise } from '../utils/asPromise.js';
import { openSerialPort } from './serial.js';

const log = logger.child({ module: 'open-dmx' });

const BAUD_RATE = 250000;
const BREAK_MS = 1;
const FRAME_INTERVAL_MS = 25;
const DMX_START_CODE = 0;

/** @param {number} ms */
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @typedef {import('../../shared/types.js').Driver} Driver */

/** @implements {Driver} */
export class OpenDmxDriver {
  /**
   * @param {{
   *   path: string,
   *   createPort?: typeof openSerialPort,
   *   sleep?: (ms: number) => Promise<unknown>,
   * }} options `createPort` and `sleep` are injectable so tests need no hardware and no real waiting.
   */
  constructor({ path, createPort = openSerialPort, sleep = defaultSleep }) {
    this.name = 'open-dmx';
    this.path = path;
    this.createPort = createPort;
    this.sleep = sleep;
    /** @type {import('../../shared/types.js').SerialPortLike | null} */
    this.port = null;
    /** @type {string | null} */
    this.error = null;
    this.isRunning = false;
    /** @type {Promise<void> | null} */
    this.loop = null;
    this.packet = new Uint8Array(513);
    this.packet[0] = DMX_START_CODE;
  }

  async open() {
    const port = await this.createPort({
      path: this.path,
      baudRate: BAUD_RATE,
      dataBits: 8,
      stopBits: 2,
      parity: 'none',
    });
    this.port = port;
    port.on('error', (/** @type {Error} */ error) => this.fail(error));
    this.isRunning = true;
    this.loop = this.run();
  }

  /** @param {Uint8Array} frame 512 slots; copied behind the start code and sent on the next refresh */
  send(frame) {
    this.packet.set(frame.subarray(0, 512), 1);
  }

  /** @param {Error} error */
  fail(error) {
    this.error = error.message;
    this.isRunning = false;
    log.error({ err: error }, 'Open DMX error');
  }

  async run() {
    while (this.isRunning) {
      const startedAt = Date.now();
      try {
        await this.sendFrame();
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      const wait = FRAME_INTERVAL_MS - (Date.now() - startedAt);
      if (wait > 0) {
        await this.sleep(wait);
      }
    }
  }

  async sendFrame() {
    const port = this.port;
    if (!port) {
      throw new Error('The serial port is not open');
    }
    await asPromise((done) => port.set({ brk: true }, done));
    await this.sleep(BREAK_MS);
    await asPromise((done) => port.set({ brk: false }, done));
    await asPromise((done) => port.write(Buffer.from(this.packet), done));
    await asPromise((done) => port.drain(done));
  }

  async close() {
    this.isRunning = false;
    await this.loop;
    const port = this.port;
    if (!port?.isOpen) {
      return;
    }
    try {
      // One last frame, so a blanking caller's zeros actually reach the lights instead of them holding stale values.
      await this.sendFrame();
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
    return {
      driver: this.name,
      connected: Boolean(this.port?.isOpen) && this.isRunning,
      error: this.error,
      path: this.path,
    };
  }
}
