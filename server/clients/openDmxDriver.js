// Driver for passive FTDI "Open DMX" style USB-DMX cables (no microcontroller), such as the DSD TECH SH-RS09B and the
// ENTTEC Open DMX USB. The computer generates the DMX timing itself: a serial break, then a start code and 512 slots at
// 250000 baud, 8 data bits, 2 stop bits. A long break (about 1 ms) is within the DMX spec and is robust against
// Node timer jitter; frames repeat continuously because receivers expect a steady refresh.
import { openSerialPort } from './serial.js';

const BAUD_RATE = 250000;
const BREAK_MS = 1;
const FRAME_INTERVAL_MS = 25;
const DMX_START_CODE = 0;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const asPromise = (call) =>
  new Promise((resolve, reject) => {
    call((error) => (error ? reject(error) : resolve()));
  });

export class OpenDmxDriver {
  constructor({ path, createPort = openSerialPort, sleep = defaultSleep }) {
    this.name = 'open-dmx';
    this.path = path;
    this.createPort = createPort;
    this.sleep = sleep;
    this.port = null;
    this.error = null;
    this.isRunning = false;
    this.loop = null;
    this.packet = new Uint8Array(513);
    this.packet[0] = DMX_START_CODE;
  }

  async open() {
    this.port = await this.createPort({
      path: this.path,
      baudRate: BAUD_RATE,
      dataBits: 8,
      stopBits: 2,
      parity: 'none',
    });
    this.port.on('error', (error) => this.fail(error));
    this.isRunning = true;
    this.loop = this.run();
  }

  send(frame) {
    this.packet.set(frame.subarray(0, 512), 1);
  }

  fail(error) {
    this.error = error.message;
    this.isRunning = false;
    console.error('[dmx] Open DMX error:', error.message);
  }

  async run() {
    while (this.isRunning) {
      const startedAt = Date.now();
      try {
        await this.sendFrame();
      } catch (error) {
        this.fail(error);
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
    await asPromise((done) => port.set({ brk: true }, done));
    await this.sleep(BREAK_MS);
    await asPromise((done) => port.set({ brk: false }, done));
    await asPromise((done) => port.write(Buffer.from(this.packet), done));
    await asPromise((done) => port.drain(done));
  }

  async close() {
    this.isRunning = false;
    await this.loop;
    if (!this.port?.isOpen) {
      return;
    }
    try {
      // One last frame, so a blanking caller's zeros actually reach the lights instead of them holding stale values.
      await this.sendFrame();
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
    return {
      driver: this.name,
      connected: Boolean(this.port?.isOpen) && this.isRunning,
      error: this.error,
      path: this.path,
    };
  }
}
