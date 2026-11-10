// Owns the active DMX output driver: builds one from settings, switches at runtime, persists the choice and
// reports status. Serial paths must be one of the ports the OS reports, so clients cannot open arbitrary files.
// Switches are serialised, and a failed switch leaves the app on a working output. A watchdog retries a failed
// output with backoff, so unplugging and re-plugging a cable recovers without restarting the app.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ArtNetDriver } from '../clients/artNetDriver.js';
import { EnttecProDriver } from '../clients/enttecProDriver.js';
import { MockDriver } from '../clients/mockDriver.js';
import { OpenDmxDriver } from '../clients/openDmxDriver.js';
import { SacnDriver } from '../clients/sacnDriver.js';
import { listSerialPorts } from '../clients/serial.js';
import { logger } from '../logger.js';
import { probeAdapter } from './adapterProbe.js';
import { outputSettingsSchema } from '../schemas/projectSchema.js';
import { httpError } from '../utils/httpError.js';

const log = logger.child({ module: 'output' });

/** @typedef {import('../../shared/types.js').Driver} Driver */
/** @typedef {import('../../shared/types.js').OutputSettings} OutputSettings */
/** @typedef {import('../../shared/types.js').ResolvedOutputSettings} ResolvedOutputSettings */
/** @typedef {import('../../shared/types.js').DriverStatus & { settings: ResolvedOutputSettings }} OutputStatus */

/** @type {Record<string, number>} */
const DEFAULT_UNIVERSE = { artnet: 0, sacn: 1 };
const SERIAL_DRIVERS = new Set(['enttec-pro', 'open-dmx']);
const SERIAL_UNAVAILABLE = 'Serial support is not available on this computer. Use Art-Net or sACN, or the simulator.';
const RETRY_START_MS = 2000;
const RETRY_MAX_MS = 30000;

/**
 * @param {ResolvedOutputSettings} settings
 * @returns {Driver}
 */
export function createDriver(settings) {
  switch (settings.driver) {
    case 'enttec-pro':
      return new EnttecProDriver({ path: settings.serialPath });
    case 'open-dmx':
      return new OpenDmxDriver({ path: settings.serialPath });
    case 'artnet':
      return new ArtNetDriver({ host: settings.host, universe: settings.universe });
    case 'sacn':
      return new SacnDriver({ host: settings.host, universe: settings.universe });
    default:
      return new MockDriver();
  }
}

/**
 * Turns a low-level open error into a message a person can act on. The original error is logged by the caller.
 * @param {unknown} error
 * @returns {string}
 */
export function describeOpenError(error) {
  const code = /** @type {{ code?: unknown }} */ (error)?.code ?? '';
  const text = `${code} ${error instanceof Error ? error.message : ''}`;
  if (/EBUSY|EAGAIN|busy|unavailable|lock/i.test(text)) {
    return 'Another program is using this cable. Close it, then press Connect again.';
  }
  if (/EACCES|EPERM|permission|denied/i.test(text)) {
    return 'This computer did not allow access to the port. See the connection guide for your system.';
  }
  if (/ENOENT|no such|not found/i.test(text)) {
    return 'That port was not found. Plug the cable in and refresh the list.';
  }
  if (/EADDRNOTAVAIL|ENETUNREACH|EHOSTUNREACH|ENETDOWN/i.test(text)) {
    return 'The network address could not be reached. Check the address and your network connection.';
  }
  return 'The output could not be opened. Check the connection and try again.';
}

export class OutputManager {
  /**
   * @param {{
   *   engine: import('./dmxEngine.js').DmxEngine,
   *   dataDir: string,
   *   defaults: OutputSettings,
   *   listPorts?: () => Promise<{ path: string }[]>,
   *   buildDriver?: (settings: ResolvedOutputSettings) => Driver,
   *   probe?: typeof probeAdapter,
   * }} options `listPorts`, `buildDriver` and `probe` are injectable so tests need no hardware.
   */
  constructor({
    engine,
    dataDir,
    defaults,
    listPorts = listSerialPorts,
    buildDriver = createDriver,
    probe = probeAdapter,
  }) {
    this.engine = engine;
    this.filePath = path.join(dataDir, 'output.json');
    this.listPorts = listPorts;
    this.buildDriver = buildDriver;
    this.probe = probe;
    this.defaults = this.withDefaults(outputSettingsSchema.parse(defaults));
    this.settings = this.defaults;
    /** @type {string | null} */
    this.lastError = null;
    /** @type {Set<(status: OutputStatus) => void>} */
    this.listeners = new Set();
    this.queue = Promise.resolve();
    this.isSwitching = false;
    this.retryDelayMs = RETRY_START_MS;
    this.nextRetryAt = 0;
    /** @type {ReturnType<typeof setInterval> | null} */
    this.watchdogTimer = null;
  }

  /**
   * @param {OutputSettings} settings
   * @returns {ResolvedOutputSettings}
   */
  withDefaults(settings) {
    return { ...settings, universe: settings.universe ?? DEFAULT_UNIVERSE[settings.driver] ?? 0 };
  }

  async init() {
    let wanted = this.defaults;
    try {
      wanted = this.withDefaults(outputSettingsSchema.parse(JSON.parse(await readFile(this.filePath, 'utf8'))));
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') {
        log.error({ err: error }, 'Could not read saved output settings, using defaults');
      }
    }
    try {
      await this.activate(wanted);
    } catch (error) {
      // The app must still start when the dongle is unplugged: fall back to the simulator and surface the error.
      log.error({ err: error, driver: wanted.driver }, 'Could not open the saved output, using the simulator');
      this.settings = wanted;
      this.lastError = error instanceof Error ? error.message : String(error);
      this.engine.setDriver(new MockDriver());
    }
  }

  /** @param {ResolvedOutputSettings} settings */
  async assertPortListed(settings) {
    if (!SERIAL_DRIVERS.has(settings.driver)) {
      return;
    }
    let ports;
    try {
      ports = await this.listPorts();
    } catch (error) {
      log.error({ err: error }, 'Could not list serial ports');
      throw httpError(503, SERIAL_UNAVAILABLE);
    }
    if (!ports.some((port) => port.path === settings.serialPath)) {
      throw httpError(400, 'That serial port was not found. Plug the cable in and refresh the list.');
    }
  }

  /**
   * Asks the adapter on a serial port what kind it is (see adapterProbe.js). The port must be one the system lists, and
   * must not be in use by the current output, because a port can only be opened once.
   * @param {string} serialPath
   * @returns {Promise<import('./adapterProbe.js').ProbeResult>}
   */
  async detect(serialPath) {
    await this.assertPortListed({ driver: 'open-dmx', serialPath, host: '', universe: 0 });
    if (this.engine.driver.path === serialPath) {
      throw httpError(409, 'This cable is in use. Choose Simulator and press Use simulator first, then detect again.');
    }
    try {
      return await this.probe(serialPath);
    } catch (error) {
      log.error({ err: error, serialPath }, 'Could not probe the adapter');
      throw httpError(400, describeOpenError(error));
    }
  }

  /**
   * Blanks an output, then closes it, so lights do not hold stale values after a switch.
   * @param {Driver} driver
   */
  async retire(driver) {
    driver.send(new Uint8Array(512));
    await driver.close();
  }

  /**
   * Re-opens the previous output after a failed switch. If that fails too, the app stays on the simulator.
   * @param {ResolvedOutputSettings} settings
   */
  async restore(settings) {
    try {
      const driver = this.buildDriver(settings);
      await driver.open();
      this.engine.setDriver(driver);
    } catch (error) {
      log.error({ err: error }, 'Could not restore the previous output');
      this.lastError = describeOpenError(error);
    }
  }

  /** @param {ResolvedOutputSettings} settings */
  async activate(settings) {
    await this.assertPortListed(settings);
    const previous = this.engine.driver;
    const previousSettings = this.settings;
    // A serial port can only be opened once, so a switch that reuses the same port must release it first.
    const mustReleaseFirst =
      SERIAL_DRIVERS.has(settings.driver) && previous.path !== undefined && previous.path === settings.serialPath;
    if (mustReleaseFirst) {
      this.engine.setDriver(new MockDriver());
      await this.retire(previous);
    }
    const driver = this.buildDriver(settings);
    try {
      await driver.open();
    } catch (error) {
      log.error({ err: error, driver: settings.driver }, 'Could not open the output');
      if (mustReleaseFirst) {
        await this.restore(previousSettings);
      }
      throw httpError(400, describeOpenError(error));
    }
    this.engine.setDriver(driver);
    if (!mustReleaseFirst && previous && previous !== driver) {
      await this.retire(previous);
    }
    this.settings = settings;
    this.lastError = null;
  }

  /**
   * Runs a task after every task queued before it, one at a time. A failure does not stop the queue; the caller still
   * receives it through the returned promise.
   * @template T
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  enqueue(task) {
    const result = this.queue.then(task, task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * Switches are queued one at a time so persisted settings, this.settings and the active driver always agree.
   * @param {unknown} input the requested settings, validated here
   * @returns {Promise<OutputStatus>}
   */
  apply(input) {
    return this.enqueue(() => this.applyNow(input));
  }

  /**
   * @param {unknown} input
   * @returns {Promise<OutputStatus>}
   */
  async applyNow(input) {
    const parsed = outputSettingsSchema.safeParse(input);
    if (!parsed.success) {
      throw httpError(400, `Invalid output settings: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
    }
    const settings = this.withDefaults(parsed.data);
    this.isSwitching = true;
    try {
      await this.activate(settings);
    } finally {
      this.isSwitching = false;
    }
    this.retryDelayMs = RETRY_START_MS;
    this.nextRetryAt = 0;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(settings, null, 2), 'utf8');
    await rename(tempPath, this.filePath);
    this.emit();
    return this.getStatus();
  }

  /**
   * Retries a failed output with exponential backoff (2 s, 4 s ... up to 30 s). Called by the watchdog timer; exposed so
   * tests can drive it with a fake clock.
   * @param {number} [now] milliseconds on the same clock as the retry schedule
   * @returns {Promise<boolean>} true when an attempt was made
   */
  async checkHealth(now = Date.now()) {
    const status = this.engine.driver.getStatus();
    const hasFailed = this.settings.driver !== 'mock' && (this.lastError !== null || !status.connected || status.error);
    if (!hasFailed || this.isSwitching || now < this.nextRetryAt) {
      return false;
    }
    this.nextRetryAt = now + this.retryDelayMs;
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, RETRY_MAX_MS);
    const settings = this.settings;
    try {
      await this.enqueue(() => this.activate(settings));
      log.info({ driver: settings.driver }, 'The output recovered');
      this.retryDelayMs = RETRY_START_MS;
      this.emit();
    } catch (error) {
      log.debug({ err: error, nextRetryInMs: this.nextRetryAt - now }, 'The output is still unavailable');
    }
    return true;
  }

  startWatchdog() {
    if (!this.watchdogTimer) {
      this.watchdogTimer = setInterval(() => void this.checkHealth(), 1000);
      this.watchdogTimer.unref();
    }
  }

  stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /** @returns {OutputStatus} */
  getStatus() {
    const status = this.engine.driver.getStatus();
    return {
      ...status,
      error: status.error ?? this.lastError,
      connected: status.connected && !this.lastError,
      settings: this.settings,
    };
  }

  /**
   * @param {(status: OutputStatus) => void} listener
   * @returns {() => void} call to stop listening
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    const status = this.getStatus();
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}
