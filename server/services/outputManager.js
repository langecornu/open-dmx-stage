// Owns the active DMX output driver: builds one from settings, switches at runtime, persists the choice and
// reports status. Serial paths must be one of the ports the OS reports, so clients cannot open arbitrary files.
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

export class OutputManager {
  constructor({ engine, dataDir, defaults, listPorts = listSerialPorts, buildDriver = createDriver }) {
    this.engine = engine;
    this.filePath = path.join(dataDir, 'output.json');
    this.defaults = outputSettingsSchema.parse(defaults);
    this.listPorts = listPorts;
    this.buildDriver = buildDriver;
    this.settings = this.defaults;
    this.lastError = null;
    this.listeners = new Set();
  }

  async init() {
    let wanted = this.defaults;
    try {
      wanted = outputSettingsSchema.parse(JSON.parse(await readFile(this.filePath, 'utf8')));
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

  async activate(settings) {
    if (SERIAL_DRIVERS.has(settings.driver)) {
      const ports = await this.listPorts();
      if (!ports.some((port) => port.path === settings.serialPath)) {
        throw httpError(400, 'That serial port was not found. Plug the cable in and refresh the list.');
      }
    }
    const driver = this.buildDriver(settings);
    try {
      await driver.open();
    } catch (error) {
      throw httpError(400, `Could not open ${settings.driver}: ${error.message}`);
    }
    const previous = this.engine.driver;
    this.engine.setDriver(driver);
    if (previous && previous !== driver) {
      previous.send(new Uint8Array(512));
      await previous.close();
    }
    this.settings = settings;
    this.lastError = null;
  }

  async apply(input) {
    const parsed = outputSettingsSchema.safeParse(input);
    if (!parsed.success) {
      throw httpError(400, `Invalid output settings: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
    }
    const settings = {
      ...parsed.data,
      universe: input.universe ?? DEFAULT_UNIVERSE[parsed.data.driver] ?? 0,
    };
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
