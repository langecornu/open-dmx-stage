// Owns the active DMX output driver: builds one from settings, switches at runtime, persists the choice and
// reports status. Serial paths must be one of the ports the OS reports, so clients cannot open arbitrary files.
// Switches are serialised, and a failed switch leaves the app on a working output.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ArtNetDriver } from '../clients/artNetDriver.js';
import { EnttecProDriver } from '../clients/enttecProDriver.js';
import { MockDriver } from '../clients/mockDriver.js';
import { OpenDmxDriver } from '../clients/openDmxDriver.js';
import { SacnDriver } from '../clients/sacnDriver.js';
import { listSerialPorts } from '../clients/serial.js';
import { outputSettingsSchema } from '../schemas/projectSchema.js';
import { httpError } from '../utils/httpError.js';

const DEFAULT_UNIVERSE = { artnet: 0, sacn: 1 };
const SERIAL_DRIVERS = new Set(['enttec-pro', 'open-dmx']);
const SERIAL_UNAVAILABLE = 'Serial support is not available on this computer. Use Art-Net or sACN, or the simulator.';

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

// Turns a low-level open error into a message a person can act on. The original error is logged by the caller.
export function describeOpenError(error) {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`;
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
  constructor({ engine, dataDir, defaults, listPorts = listSerialPorts, buildDriver = createDriver }) {
    this.engine = engine;
    this.filePath = path.join(dataDir, 'output.json');
    this.listPorts = listPorts;
    this.buildDriver = buildDriver;
    this.defaults = this.withDefaults(outputSettingsSchema.parse(defaults));
    this.settings = this.defaults;
    this.lastError = null;
    this.listeners = new Set();
    this.queue = Promise.resolve();
  }

  withDefaults(settings) {
    return { ...settings, universe: settings.universe ?? DEFAULT_UNIVERSE[settings.driver] ?? 0 };
  }

  async init() {
    let wanted = this.defaults;
    try {
      wanted = this.withDefaults(outputSettingsSchema.parse(JSON.parse(await readFile(this.filePath, 'utf8'))));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('[output] Could not read saved output settings, using defaults:', error.message);
      }
    }
    try {
      await this.activate(wanted);
    } catch (error) {
      // The app must still start when the dongle is unplugged: fall back to the simulator and surface the error.
      console.error(`[output] Could not open ${wanted.driver}: ${error.message}`);
      this.settings = wanted;
      this.lastError = error.message;
      this.engine.setDriver(new MockDriver());
    }
  }

  async assertPortListed(settings) {
    if (!SERIAL_DRIVERS.has(settings.driver)) {
      return;
    }
    let ports;
    try {
      ports = await this.listPorts();
    } catch (error) {
      console.error('[output] Could not list serial ports:', error.message);
      throw httpError(503, SERIAL_UNAVAILABLE);
    }
    if (!ports.some((port) => port.path === settings.serialPath)) {
      throw httpError(400, 'That serial port was not found. Plug the cable in and refresh the list.');
    }
  }

  // Blanks an output, then closes it, so lights do not hold stale values after a switch.
  async retire(driver) {
    driver.send(new Uint8Array(512));
    await driver.close();
  }

  // Re-opens the previous output after a failed switch. If that fails too, the app stays on the simulator.
  async restore(settings) {
    try {
      const driver = this.buildDriver(settings);
      await driver.open();
      this.engine.setDriver(driver);
    } catch (error) {
      console.error('[output] Could not restore the previous output:', error.message);
      this.lastError = describeOpenError(error);
    }
  }

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
      console.error(`[output] Could not open ${settings.driver}:`, error.message);
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

  // Switches are queued one at a time so persisted settings, this.settings and the active driver always agree.
  apply(input) {
    const run = () => this.applyNow(input);
    const result = this.queue.then(run, run);
    // Keep the queue alive after a failure; the caller still receives the error through `result`.
    this.queue = result.catch(() => undefined);
    return result;
  }

  async applyNow(input) {
    const parsed = outputSettingsSchema.safeParse(input);
    if (!parsed.success) {
      throw httpError(400, `Invalid output settings: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
    }
    const settings = this.withDefaults(parsed.data);
    await this.activate(settings);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(settings, null, 2), 'utf8');
    await rename(tempPath, this.filePath);
    this.emit();
    return this.getStatus();
  }

  getStatus() {
    const status = this.engine.driver.getStatus();
    return {
      ...status,
      error: status.error ?? this.lastError,
      connected: status.connected && !this.lastError,
      settings: this.settings,
    };
  }

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
