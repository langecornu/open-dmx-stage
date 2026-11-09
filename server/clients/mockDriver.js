// A DMX driver that sends nothing; used for development without hardware and for tests.
export class MockDriver {
  constructor() {
    this.name = 'mock';
    this.lastFrame = new Uint8Array(512);
    this.frameCount = 0;
  }

  async open() {}

  /** @param {Uint8Array} frame */
  send(frame) {
    this.lastFrame = Uint8Array.from(frame);
    this.frameCount += 1;
  }

  async close() {}

  getStatus() {
    return { driver: this.name, connected: true, error: null };
  }
}
