// Tests for the live WebSocket: initial state, status pushes after an output switch, and the Origin check.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { WebSocket } from 'ws';

import { MockDriver } from '../../server/clients/mockDriver.js';
import { DmxEngine } from '../../server/services/dmxEngine.js';
import { OutputManager } from '../../server/services/outputManager.js';
import { ProjectService } from '../../server/services/projectService.js';
import { attachLiveSocket } from '../../server/ws/liveSocket.js';

const ALLOWED_ORIGIN = 'http://localhost:5173';
let server;
let socketApi;
let outputManager;
let projectService;
let dataDir;
let url;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'odmx-ws-'));
  const engine = new DmxEngine({ driver: new MockDriver() });
  projectService = new ProjectService({ dataDir });
  await projectService.load();
  outputManager = new OutputManager({ engine, dataDir, defaults: { driver: 'mock' } });
  server = createServer();
  socketApi = attachLiveSocket({ server, engine, projectService, outputManager, allowedOrigins: [ALLOWED_ORIGIN] });
  await new Promise((resolve) => server.listen(0, resolve));
  url = `ws://localhost:${server.address().port}/live`;
});

after(async () => {
  socketApi.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
});

function connect(origin) {
  const messages = [];
  const socket = new WebSocket(url, { headers: { Origin: origin } });
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
  return { socket, messages };
}

const waitFor = async (condition, label) => {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) {
      assert.fail(`Timed out waiting for: ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe('live socket', () => {
  it('sends engine state and output status when a client connects', async () => {
    const { socket, messages } = connect(ALLOWED_ORIGIN);
    await waitFor(
      () => messages.some((m) => m.type === 'state') && messages.some((m) => m.type === 'output'),
      'state and output',
    );
    socket.close();
    assert.equal(messages.find((m) => m.type === 'output').status.driver, 'mock', 'the output status names the driver');
  });

  it('pushes an output status message after the output is switched', async () => {
    const { socket, messages } = connect(ALLOWED_ORIGIN);
    await waitFor(() => messages.some((m) => m.type === 'output'), 'the initial output status');
    messages.length = 0;
    await outputManager.apply({ driver: 'artnet', host: '127.0.0.1', universe: 0 });
    await waitFor(
      () => messages.some((m) => m.type === 'output' && m.status.driver === 'artnet'),
      'the switched status',
    );
    await outputManager.apply({ driver: 'mock' });
    socket.close();
  });

  it('sets the tempo and starts and stops an effect from control messages, and ignores bad ones', async () => {
    const { socket, messages } = connect(ALLOWED_ORIGIN);
    await waitFor(() => messages.some((m) => m.type === 'state'), 'the initial state');
    const lastState = () => messages.filter((m) => m.type === 'state').at(-1).state;
    socket.send(JSON.stringify({ type: 'tempo', bpm: 140, sync: true }));
    await waitFor(() => lastState().bpm === 140, 'the new tempo');
    socket.send(JSON.stringify({ type: 'effectStart', effect: 'pulse', beats: 2, groupId: null }));
    await waitFor(() => lastState().effect?.type === 'pulse', 'the effect to start');
    socket.send(JSON.stringify({ type: 'effectStart', effect: 'sweep', beats: 3, groupId: null }));
    socket.send(JSON.stringify({ type: 'tempo', bpm: 9000 }));
    socket.send(JSON.stringify({ type: 'effectStart', effect: 'sweep', beats: 1, groupId: 'no-such-group' }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(lastState().bpm, 140, 'an out-of-range tempo is refused');
    assert.equal(
      lastState().effect.type,
      'pulse',
      'an unsupported length, or a group that does not exist, changes nothing',
    );
    socket.send(JSON.stringify({ type: 'effectStop' }));
    await waitFor(() => lastState().effect === null, 'the effect to stop');
    socket.close();
  });

  it('starts and stops the auto show, and refuses a length it does not offer', async () => {
    await projectService.save({
      ...projectService.get(),
      scenes: [{ id: 'look-red', name: 'Red', values: { 1: 255 } }],
    });
    const { socket, messages } = connect(ALLOWED_ORIGIN);
    try {
      await waitFor(() => messages.some((m) => m.type === 'state'), 'the initial state');
      const lastState = () => messages.filter((m) => m.type === 'state').at(-1).state;
      socket.send(JSON.stringify({ type: 'autoStart', source: 'looks', beats: 5, order: 'order' }));
      socket.send(JSON.stringify({ type: 'autoStart', source: 'looks', beats: 8, order: 'order' }));
      await waitFor(() => lastState().auto !== null, 'the auto show to start');
      assert.deepEqual(lastState().auto, { source: 'looks', beats: 8, order: 'order', itemId: 'look-red' });
      socket.send(JSON.stringify({ type: 'autoStop' }));
      await waitFor(() => lastState().auto === null, 'the auto show to stop');
    } finally {
      socket.close();
    }
  });

  it('mutes, solos and clears lights from control messages', async () => {
    const { socket, messages } = connect(ALLOWED_ORIGIN);
    try {
      await waitFor(() => messages.some((m) => m.type === 'state'), 'the initial state');
      const lastState = () => messages.filter((m) => m.type === 'state').at(-1).state;
      socket.send(JSON.stringify({ type: 'mute', fixtureId: 'par-1', muted: true }));
      socket.send(JSON.stringify({ type: 'solo', fixtureId: 'par-2', soloed: true }));
      await waitFor(() => lastState().soloed.length === 1, 'the solo');
      assert.deepEqual(lastState().muted, ['par-1']);
      socket.send(JSON.stringify({ type: 'clearMuteSolo' }));
      await waitFor(() => lastState().muted.length === 0 && lastState().soloed.length === 0, 'everything cleared');
    } finally {
      socket.close();
    }
  });

  it('takes a recalled look off stage with a release message', async () => {
    const sceneId = 'look-red';
    await projectService.save({
      ...projectService.get(),
      scenes: [{ id: sceneId, name: 'Red', values: { 1: 255 } }],
    });
    const { socket, messages } = connect(ALLOWED_ORIGIN);
    try {
      await waitFor(() => messages.some((m) => m.type === 'state'), 'the initial state');
      const lastState = () => messages.filter((m) => m.type === 'state').at(-1).state;
      socket.send(JSON.stringify({ type: 'recall', sceneId }));
      await waitFor(() => lastState().activeSceneId === sceneId, 'the look to be on stage');
      socket.send(JSON.stringify({ type: 'release' }));
      await waitFor(() => lastState().activeSceneId === null, 'the look to be taken off stage');
    } finally {
      socket.close();
    }
  });

  it('rejects a browser origin that is not allowed', async () => {
    const { socket } = connect('http://evil.example');
    const outcome = await new Promise((resolve) => {
      socket.on('open', () => resolve('opened'));
      socket.on('unexpected-response', (_req, res) => resolve(res.statusCode));
      socket.on('error', () => resolve('error'));
    });
    assert.notEqual(outcome, 'opened', 'a foreign origin must not be able to open the control socket');
  });

  it('drops a client that stops answering pings', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'odmx-ws-hb-'));
    const engine = new DmxEngine({ driver: new MockDriver() });
    const projectService = new ProjectService({ dataDir: dir });
    await projectService.load();
    const manager = new OutputManager({ engine, dataDir: dir, defaults: { driver: 'mock' } });
    const heartbeatServer = createServer();
    const api = attachLiveSocket({
      server: heartbeatServer,
      engine,
      projectService,
      outputManager: manager,
      allowedOrigins: [ALLOWED_ORIGIN],
      heartbeatMs: 40,
    });
    await new Promise((resolve) => heartbeatServer.listen(0, resolve));
    const silent = new WebSocket(`ws://localhost:${heartbeatServer.address().port}/live`, {
      headers: { Origin: ALLOWED_ORIGIN },
      autoPong: false, // a client that never answers, like a laptop with its lid closed
    });
    const closed = new Promise((resolve) => silent.on('close', resolve));
    await new Promise((resolve) => silent.on('open', resolve));
    await Promise.race([
      closed,
      new Promise((_, reject) => setTimeout(() => reject(new Error('the silent client was not dropped')), 2000)),
    ]);
    api.close();
    await new Promise((resolve) => heartbeatServer.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
});
