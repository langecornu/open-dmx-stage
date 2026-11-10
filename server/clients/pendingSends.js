// Keeps track of UDP sends that have been handed to the operating system but not finished yet, so a driver can wait for
// them before it closes its socket. Closing a datagram socket right after send() drops the packet, and the last packet a
// driver sends is the one that blanks the lights.

const DEFAULT_WAIT_MS = 500;

export class PendingSends {
  constructor() {
    /** @type {Set<Promise<void>>} */
    this.inFlight = new Set();
  }

  /**
   * Starts one send and remembers it until it finishes.
   * @param {(done: () => void) => void} start call `done` when the send has finished, whether it worked or not
   */
  track(start) {
    /** @type {Promise<void>} */
    const pending = new Promise((resolve) => start(resolve));
    this.inFlight.add(pending);
    pending.then(() => this.inFlight.delete(pending));
  }

  /**
   * Resolves when every send started so far has finished, or after `timeoutMs` so a stuck network cannot keep a driver
   * from closing.
   * @param {number} [timeoutMs]
   * @returns {Promise<void>}
   */
  async settled(timeoutMs = DEFAULT_WAIT_MS) {
    if (this.inFlight.size === 0) {
      return;
    }
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    await Promise.race([Promise.all([...this.inFlight]), timeout]);
    clearTimeout(timer);
  }
}
