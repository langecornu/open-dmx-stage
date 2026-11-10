// Tests for adapter detection: parsing the ENTTEC Pro reply, classifying silence, and the manager's safety checks.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { MockDriver } from '../../server/clients/mockDriver.js';
import { DmxEngine } from '../../server/services/dmxEngine.js';
import { OutputManager } from '../../server/services/outputManager.js';
import { parseWidgetParameters, probeAdapter, WIDGET_PARAMETERS_REQUEST } from '../../server/services/adapterProbe.js';

// A genuine-looking reply: label 3, 5 data bytes (firmware 1.44, break 9, mark-after-break 1, refresh 40), end byte.
const REPLY = Uint8Array.from([0x7e, 0x03, 0x05, 0x00, 0x2c, 0x01, 0x09, 0x01, 0x28, 0xe7]);

describe('parseWidgetParameters', () => {
  it('reads the firmware version and timings from a valid reply', () => {
    assert.deepEqual(
      parseWidgetParameters(REPLY),
      { firmware: '1.44', breakTime: 9, markAfterBreakTime: 1, refreshRate: 40 },
      'the five parameters are decoded',
    );
  });

  it('finds the reply after noise bytes', () => {
    const noisy = Uint8Array.from([0x00, 0xff, 0x7e, 0x01, ...REPLY]);
    assert.equal(parseWidgetParameters(noisy)?.firmware, '1.44', 'leading noise is skipped');
  });

  it('does not mistake our own request echoed back for a reply', () => {
    assert.equal(parseWidgetParameters(WIDGET_PARAMETERS_REQUEST), null, 'an echo has length 2, not 5');
  });

  it('rejects truncated, mislabelled and wrongly terminated replies', () => {
    assert.equal(parseWidgetParameters(REPLY.subarray(0, 8)), null, 'truncated');
    assert.equal(
      parseWidgetParameters(Uint8Array.from([0x7e, 0x06, 0x05, 0x00, 1, 2, 3, 4, 5, 0xe7])),
      null,
      'wrong label',
    );
    assert.equal(
      parseWidgetParameters(Uint8Array.from([0x7e, 0x03, 0x05, 0x00, 1, 2, 3, 4, 5, 0x00])),
      null,
      'no end byte',
    );
    assert.equal(parseWidgetParameters(new Uint8Array()), null, 'empty');
  });
});

function createMockPort({ reply }) {
  const state = { written: [], closed: false, listener: null };
  const port = {
    state,
    isOpen: true,
    on(event, listener) {
      if (event === 'data') {
        state.listener = listener;
      }
    },
    write(data) {
      state.written.push(Array.from(data));
      if (reply) {
        setImmediate(() => state.listener?.(reply));
      }
    },
    close(done) {
      state.closed = true;
      done();
    },
  };
  return port;
}

const fastWait = () => new Promise((resolve) => setImmediate(resolve));

describe('probeAdapter', () => {
  it('recognises an active adapter that answers, asks the right question, and closes the port', async () => {
    const port = createMockPort({ reply: REPLY });
    const result = await probeAdapter('/dev/pro', { createPort: async () => port, wait: fastWait, timeoutMs: 500 });
    assert.equal(result.kind, 'active', 'an answer means an active adapter');
    assert.equal(result.suggestedInterface, 'enttec-pro', 'it suggests the Pro interface');
    assert.equal(result.firmware, '1.44', 'it reports the firmware');
    assert.deepEqual(
      port.state.written[0],
      Array.from(WIDGET_PARAMETERS_REQUEST),
      'it sent the widget parameters request',
    );
    assert.equal(port.state.closed, true, 'the port is released afterwards');
  });

  it('treats silence as a passive cable and says how sure it is', async () => {
    const port = createMockPort({ reply: null });
    const result = await probeAdapter('/dev/cable', { createPort: async () => port, wait: fastWait, timeoutMs: 40 });
    assert.equal(result.kind, 'no-response', 'no answer');
    assert.equal(result.suggestedInterface, 'open-dmx', 'it suggests the USB-DMX cable interface');
    assert.match(result.message, /passive USB-DMX cable/, 'the explanation names the likely cause');
    assert.equal(port.state.closed, true, 'the port is released even when nothing answered');
  });

  it('ignores an echo of its own request', async () => {
    const port = createMockPort({ reply: WIDGET_PARAMETERS_REQUEST });
    const result = await probeAdapter('/dev/cable', { createPort: async () => port, wait: fastWait, timeoutMs: 40 });
    assert.equal(result.kind, 'no-response', 'an echoing cable is still treated as silent');
  });

  it('passes through a failure to open the port', async () => {
    await assert.rejects(
      probeAdapter('/dev/x', {
        createPort: async () => {
          throw Object.assign(new Error('busy'), { code: 'EBUSY' });
        },
      }),
      /busy/,
      'the open error reaches the caller to be explained',
    );
  });
});

describe('OutputManager.detect', () => {
  async function createManager({ probe, ports = [{ path: '/dev/cable' }] } = {}) {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'odmx-detect-'));
    const engine = new DmxEngine({ driver: new MockDriver() });
    const manager = new OutputManager({
      engine,
      dataDir,
      defaults: { driver: 'mock' },
      listPorts: async () => ports,
      probe,
    });
    return { engine, manager, cleanup: () => rm(dataDir, { recursive: true, force: true }) };
  }

  it('returns the probe result for a listed port', async () => {
    const expected = { kind: 'active', suggestedInterface: 'enttec-pro', message: 'ok' };
    const { manager, cleanup } = await createManager({ probe: async () => expected });
    assert.deepEqual(await manager.detect('/dev/cable'), expected, 'the result is passed through');
    await cleanup();
  });

  it('refuses ports the system did not list', async () => {
    const { manager, cleanup } = await createManager({ probe: async () => assert.fail('must not probe') });
    await assert.rejects(manager.detect('/etc/passwd'), /serial port was not found/);
    await cleanup();
  });

  it('refuses a port the current output is using, because a port can only be opened once', async () => {
    const { engine, manager, cleanup } = await createManager({ probe: async () => assert.fail('must not probe') });
    const busy = new MockDriver();
    busy.path = '/dev/cable';
    engine.setDriver(busy);
    await assert.rejects(manager.detect('/dev/cable'), (error) => error.status === 409 && /in use/.test(error.message));
    await cleanup();
  });

  it('explains a failure to open the port in plain words', async () => {
    const { manager, cleanup } = await createManager({
      probe: async () => {
        throw Object.assign(new Error('Resource busy'), { code: 'EBUSY' });
      },
    });
    await assert.rejects(manager.detect('/dev/cable'), /Another program is using this cable/);
    await cleanup();
  });
});
