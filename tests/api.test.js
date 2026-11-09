// Integration tests for the HTTP API using a mock driver and a temporary data directory.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/app.js';
import { MockDriver } from '../server/clients/mockDriver.js';
import { DmxEngine } from '../server/services/dmxEngine.js';
import { ProjectService } from '../server/services/projectService.js';

let server;
let baseUrl;
let dataDir;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'odmx-'));
  const config = { allowedOrigins: ['http://localhost:5173'], distDir: path.join(dataDir, 'none') };
  const projectService = new ProjectService({ dataDir });
  await projectService.load();
  const engine = new DmxEngine({ driver: new MockDriver() });
  server = createServer(createApp({ config, engine, projectService }));
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
});

const validProject = {
  name: 'Test',
  fixtureTypes: [],
  fixtures: [{ id: 'f1', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1 }],
  scenes: [{ id: 's1', name: 'Red', values: { 1: 255 } }],
  chases: [],
};

const putProject = (body) =>
  fetch(`${baseUrl}/project`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('API', () => {
  it('saves and returns a valid project', async () => {
    const saved = await putProject(validProject);
    assert.equal(saved.status, 200, 'a valid project should be accepted');
    const loaded = await (await fetch(`${baseUrl}/project`)).json();
    assert.equal(loaded.fixtures[0].name, 'Par 1', 'the saved project should be returned');
  });

  it('rejects unknown fields and out-of-range DMX values', async () => {
    const extra = await putProject({ ...validProject, surprise: true });
    assert.equal(extra.status, 400, 'unknown keys must be rejected');
    const range = await putProject({ ...validProject, scenes: [{ id: 's', name: 'Bad', values: { 1: 999 } }] });
    assert.equal(range.status, 400, 'DMX values above 255 must be rejected');
    const channel = await putProject({ ...validProject, scenes: [{ id: 's', name: 'Bad', values: { 513: 1 } }] });
    assert.equal(channel.status, 400, 'channel 513 does not exist');
  });

  it('does not leak internals on server errors and reports output status', async () => {
    const status = await (await fetch(`${baseUrl}/output`)).json();
    assert.equal(status.driver, 'mock', 'output status names the driver');
    const missing = await fetch(`${baseUrl}/nope`);
    assert.equal(missing.status, 404, 'unknown routes return 404');
  });

  it('imports an Open Fixture Library fixture', async () => {
    const response = await fetch(`${baseUrl}/fixtures/import-ofl`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        manufacturer: 'Acme',
        fixture: {
          name: 'Spot',
          availableChannels: { Dimmer: { capability: { type: 'Intensity' } } },
          modes: [{ name: '1ch', channels: ['Dimmer'] }],
        },
      }),
    });
    assert.equal(response.status, 200, 'a valid OFL fixture is converted');
    const type = await response.json();
    assert.equal(type.modes[0].channels[0].type, 'intensity', 'the dimmer maps to intensity');
  });
});
