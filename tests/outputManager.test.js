// Tests for the output manager: switching drivers, persistence, and refusing unknown serial ports.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { MockDriver } from '../server/clients/mockDriver.js';
import { DmxEngine } from '../server/services/dmxEngine.js';
import { OutputManager } from '../server/services/outputManager.js';

let dataDir;
before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'odmx-out-'));
});
after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

function createManager({ buildDriver, ports = [{ path: '/dev/cable' }] } = {}) {
  const engine = new DmxEngine({ driver: new MockDriver() });
  const manager = new OutputManager({
    engine,
    dataDir,
    defaults: { driver: 'mock' },
    listPorts: async () => ports,
    buildDriver,
  });
  return { engine, manager };
}

describe('OutputManager', () => {
  it('switches drivers, blanks and closes the old one, and saves the choice', async () => {
    const opened = [];
    const buildDriver = (settings) => {
      const driver = new MockDriver();
      driver.name = settings.driver;
      opened.push(driver);
      return driver;
    };
    const { engine, manager } = createManager({ buildDriver });
    const status = await manager.apply({ driver: 'open-dmx', serialPath: '/dev/cable' });
    assert.equal(status.settings.driver, 'open-dmx', 'the new driver is reported');
    assert.equal(engine.driver, opened[0], 'the engine now sends to the new driver');
    const saved = JSON.parse(await readFile(path.join(dataDir, 'output.json'), 'utf8'));
    assert.equal(saved.serialPath, '/dev/cable', 'the choice is persisted');
  });

  it('refuses serial ports the system did not report and keeps the old driver', async () => {
    const { engine, manager } = createManager();
    const before = engine.driver;
    await assert.rejects(manager.apply({ driver: 'open-dmx', serialPath: '/etc/passwd' }), /serial port was not found/);
    assert.equal(engine.driver, before, 'a rejected switch must not change the driver');
  });

  it('keeps the old driver when the new one fails to open, with a plain-language error', async () => {
    const buildDriver = () => ({
      name: 'broken',
      open: async () => {
        throw new Error('Resource busy');
      },
      send() {},
      close: async () => {},
      getStatus: () => ({ driver: 'broken', connected: false, error: null }),
    });
    const { engine, manager } = createManager({ buildDriver });
    const before = engine.driver;
    await assert.rejects(
      manager.apply({ driver: 'enttec-pro', serialPath: '/dev/cable' }),
      /Another program is using this cable/,
      'a busy port is explained in plain words, not with raw OS text',
    );
    assert.equal(engine.driver, before, 'the working driver stays active');
  });

  it('rejects invalid settings (bad host, unknown driver)', async () => {
    const { manager } = createManager();
    await assert.rejects(manager.apply({ driver: 'artnet', host: 'bad host!' }), /Invalid output settings/);
    await assert.rejects(manager.apply({ driver: 'nope' }), /Invalid output settings/);
  });

  it('falls back to the simulator at start-up when the saved device is missing', async () => {
    const { engine, manager } = createManager({ ports: [] });
    manager.defaults = { driver: 'open-dmx', serialPath: '/dev/cable', host: '', universe: 0 };
    await manager.init();
    const status = manager.getStatus();
    assert.equal(engine.driver.name, 'mock', 'the app still starts on the simulator');
    assert.equal(status.connected, false, 'status says not connected');
    assert.match(status.error, /not found/, 'status explains why');
  });

  it('releases a serial port before reopening it, so switching adapter type on the same cable works', async () => {
    const locked = new Set();
    const buildDriver = (settings) => {
      const driver = new MockDriver();
      driver.name = settings.driver;
      driver.path = settings.serialPath || undefined;
      const open = async () => {
        if (driver.path && locked.has(driver.path)) {
          throw Object.assign(new Error('Resource busy'), { code: 'EBUSY' });
        }
        if (driver.path) {
          locked.add(driver.path);
        }
      };
      const close = async () => {
        locked.delete(driver.path);
      };
      return Object.assign(driver, { open, close });
    };
    const { engine, manager } = createManager({ buildDriver });
    await manager.apply({ driver: 'open-dmx', serialPath: '/dev/cable' });
    const status = await manager.apply({ driver: 'enttec-pro', serialPath: '/dev/cable' });
    assert.equal(status.settings.driver, 'enttec-pro', 'the second adapter type took over the same port');
    assert.equal(engine.driver.name, 'enttec-pro', 'the engine uses the new driver');
    assert.deepEqual([...locked], ['/dev/cable'], 'the port is held by exactly one driver');
  });

  it('goes back to the previous output when a same-port switch cannot open', async () => {
    let failNext = false;
    const buildDriver = (settings) => {
      const driver = new MockDriver();
      driver.name = settings.driver;
      driver.path = settings.serialPath;
      driver.open = async () => {
        if (failNext && settings.driver === 'enttec-pro') {
          throw new Error('Permission denied');
        }
      };
      return driver;
    };
    const { engine, manager } = createManager({ buildDriver });
    await manager.apply({ driver: 'open-dmx', serialPath: '/dev/cable' });
    failNext = true;
    await assert.rejects(manager.apply({ driver: 'enttec-pro', serialPath: '/dev/cable' }), /did not allow access/);
    assert.equal(engine.driver.name, 'open-dmx', 'the previous driver is restored');
    assert.equal(manager.getStatus().settings.driver, 'open-dmx', 'settings still describe the working output');
  });

  it('serialises concurrent switches so the last request wins consistently', async () => {
    const { engine, manager } = createManager();
    await Promise.all([
      manager.apply({ driver: 'artnet', host: '192.168.1.50', universe: 1 }),
      manager.apply({ driver: 'sacn', host: '192.168.1.60', universe: 2 }),
      manager.apply({ driver: 'mock' }),
    ]);
    assert.equal(manager.getStatus().settings.driver, 'mock', 'the last request is the one that is active');
    assert.equal(engine.driver.name, 'mock', 'the engine agrees with the saved settings');
    const saved = JSON.parse(await readFile(path.join(dataDir, 'output.json'), 'utf8'));
    assert.equal(saved.driver, 'mock', 'the file agrees too');
  });

  it('reports a clear 503 when serial support is missing', async () => {
    const engine = new DmxEngine({ driver: new MockDriver() });
    const manager = new OutputManager({
      engine,
      dataDir,
      defaults: { driver: 'mock' },
      listPorts: async () => {
        throw new Error('Serial support is not available');
      },
    });
    await assert.rejects(
      manager.apply({ driver: 'open-dmx', serialPath: '/dev/cable' }),
      /Serial support is not available on this computer/,
      'the user is told serial is unavailable, not that the port is missing',
    );
  });
});
