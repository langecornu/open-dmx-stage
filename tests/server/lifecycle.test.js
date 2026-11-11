// Tests for process shutdown: it must finish while a browser is connected, and always end even if the output hangs.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { WebSocket } from 'ws';

import { MockDriver } from '../../server/clients/mockDriver.js';
import { createShutdown } from '../../server/lifecycle.js';
import { DmxEngine } from '../../server/services/dmxEngine.js';
import { OutputManager } from '../../server/services/outputManager.js';
import { ProjectService } from '../../server/services/projectService.js';
import { attachLiveSocket } from '../../server/ws/liveSocket.js';

const ORIGIN = 'http://localhost:5173';
const quietLog = { info() {}, warn() {}, error() {} };
const cleanups = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()();
  }
});

/** A running server with a browser connected to the live socket, as it is whenever the app is open. */
async function startWithBrowser({ engine = new DmxEngine({ driver: new MockDriver() }) } = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'odmx-life-'));
  cleanups.push(() => rm(dataDir, { recursive: true, force: true }));
  const projectService = new ProjectService({ dataDir });
  await projectService.load();
  const outputManager = new OutputManager({ engine, dataDir, defaults: { driver: 'mock' } });
  const server = createServer();
  const liveSocket = attachLiveSocket({ server, engine, projectService, outputManager, allowedOrigins: [ORIGIN] });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise((resolve) => (server.listening ? server.close(resolve) : resolve())));
  const browser = new WebSocket(`ws://127.0.0.1:${server.address().port}/live`, { headers: { Origin: ORIGIN } });
  await new Promise((resolve) => browser.on('open', resolve));
  return { server, liveSocket, engine, outputManager, browser };
}

/** Resolves with the exit code the shutdown asked for, or rejects if it never asks. */
function exitCode(shutdownFactory, waitMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('shutdown never exited')), waitMs);
    shutdownFactory((code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

describe('createShutdown', () => {
  it('exits cleanly while a browser is still connected, and disconnects it', async () => {
    const running = await startWithBrowser();
    const disconnected = new Promise((resolve) => running.browser.on('close', resolve));
    const code = await exitCode((exit) => createShutdown({ ...running, log: quietLog, exit })('SIGTERM'));
    assert.equal(code, 0, 'a clean shutdown exits with 0');
    await disconnected;
    assert.equal(running.server.listening, false, 'the port is released');
  });

  it('quits anyway when the output never finishes closing', async () => {
    const running = await startWithBrowser();
    running.engine.stop = () => new Promise(() => {}); // a USB driver that hangs on close
    const code = await exitCode((exit) =>
      createShutdown({ ...running, log: quietLog, exit, timeoutMs: 50 })('SIGTERM'),
    );
    assert.equal(code, 1, 'the deadline exits with 1');
  });

  it('quits at once on a second stop signal', async () => {
    const running = await startWithBrowser();
    running.engine.stop = () => new Promise(() => {});
    const code = await exitCode((exit) => {
      const shutdown = createShutdown({ ...running, log: quietLog, exit, timeoutMs: 10_000 });
      shutdown('SIGINT');
      shutdown('SIGINT');
    });
    assert.equal(code, 1, 'the second Ctrl+C does not wait for the deadline');
  });
});
