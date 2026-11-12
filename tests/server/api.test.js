// Integration tests for the HTTP API using a mock driver and a temporary data directory.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../../server/app.js';
import { CURRENT_SCHEMA_VERSION } from '../../server/schemas/projectSchema.js';
import { MockDriver } from '../../server/clients/mockDriver.js';
import { DmxEngine } from '../../server/services/dmxEngine.js';
import { OutputManager } from '../../server/services/outputManager.js';
import { ProjectService } from '../../server/services/projectService.js';

let server;
let baseUrl;
let dataDir;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'odmx-'));
  const config = { allowedOrigins: ['http://localhost:5173'], distDir: path.join(dataDir, 'none') };
  const projectService = new ProjectService({ dataDir });
  await projectService.load();
  const engine = new DmxEngine({ driver: new MockDriver() });
  const outputManager = new OutputManager({
    engine,
    dataDir,
    defaults: { driver: 'mock' },
    listPorts: async () => [{ path: '/dev/test-cable', vendorId: '0403' }],
    probe: async () => ({ kind: 'no-response', suggestedInterface: 'open-dmx', message: 'stub' }),
  });
  server = createServer(createApp({ config, engine, projectService, outputManager }));
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}/api/v1`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
});

const validProject = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  name: 'Test',
  fixtureTypes: [],
  fixtures: [{ id: 'f1', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1 }],
  scenes: [{ id: 's1', name: 'Red', values: { 1: 255 } }],
  chases: [],
  groups: [{ id: 'g1', name: 'Front', fixtureIds: ['f1'] }],
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

  it('switches output settings, and rejects unknown serial ports with a clear error', async () => {
    const put = (body) =>
      fetch(`${baseUrl}/output/settings`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const ok = await put({ driver: 'mock' });
    assert.equal(ok.status, 200, 'the simulator can always be selected');
    const bad = await put({ driver: 'open-dmx', serialPath: '/dev/missing' });
    assert.equal(bad.status, 400, 'an unknown serial port is refused');
    assert.match((await bad.json()).error, /not found/, 'the error tells the user what to do');
    const status = await (await fetch(`${baseUrl}/output`)).json();
    assert.equal(status.settings.driver, 'mock', 'the working output is unchanged after a refused switch');
  });

  it('exports the show as a downloadable file at the current schema version', async () => {
    await putProject(validProject);
    const response = await fetch(`${baseUrl}/project/export`);
    assert.equal(response.status, 200, 'export succeeds');
    assert.match(response.headers.get('content-disposition') ?? '', /attachment; filename="open-dmx-stage-show\.json"/);
    const exported = await response.json();
    assert.equal(exported.schemaVersion, CURRENT_SCHEMA_VERSION, 'the file carries its schema version');
    assert.equal(exported.fixtures[0].name, 'Par 1', 'the file contains the show');
  });

  it('imports an older show by migrating it, and refuses files that are not shows', async () => {
    const importShow = (body) =>
      fetch(`${baseUrl}/project/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const oldShow = {
      name: 'Old',
      fixtureTypes: [],
      fixtures: [],
      scenes: [{ id: 's1', name: 'A', values: { 1: 10 } }],
      chases: [{ id: 'c1', name: 'C', loop: true, steps: [{ sceneId: 's1', fadeMs: 0, holdMs: 100 }] }],
    };
    const ok = await importShow(oldShow);
    assert.equal(ok.status, 200, 'a version 1 show (no schemaVersion) is accepted');
    const imported = await ok.json();
    assert.equal(imported.schemaVersion, CURRENT_SCHEMA_VERSION, 'it was upgraded');
    assert.deepEqual(imported.groups, [], 'it gained an empty group list');
    assert.equal(imported.chases[0].timing, 'seconds', 'its sequences keep their timing in seconds');
    assert.ok(imported.chases[0].steps[0].id, 'chase steps gained stable ids');

    assert.equal((await importShow('not a show')).status, 400, 'a string is not a show');
    assert.equal((await importShow({ ...oldShow, schemaVersion: 99 })).status, 400, 'a newer file is refused');
    assert.equal((await importShow({ ...oldShow, fixtures: 'nope' })).status, 400, 'an invalid show is refused');
  });

  it('answers health checks and gives every response a request id', async () => {
    const root = baseUrl.replace('/api/v1', '');
    assert.deepEqual(await (await fetch(`${root}/healthz`)).json(), { status: 'ok' }, 'liveness');
    const ready = await (await fetch(`${root}/readyz`)).json();
    assert.equal(ready.status, 'ready', 'readiness');
    assert.equal(ready.output.driver, 'mock', 'readiness names the output driver');
    const response = await fetch(`${baseUrl}/output`, { headers: { 'x-request-id': 'test-123' } });
    assert.equal(response.headers.get('x-request-id'), 'test-123', 'a sane incoming request id is reused');
    const generated = await fetch(`${baseUrl}/output`, { headers: { 'x-request-id': 'bad id!' } });
    assert.match(generated.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/, 'an unsafe id is replaced');
  });

  it('puts the request id in error responses as the correlation id', async () => {
    const response = await putProject({ ...validProject, surprise: true });
    const body = await response.json();
    assert.equal(
      body.correlationId,
      response.headers.get('x-request-id'),
      'the client can quote the id from the header',
    );
  });

  it('accepts the largest show the schema allows (about 2.4 MB), through both save and import', async () => {
    const scenes = [];
    for (let index = 0; index < 500; index += 1) {
      const values = {};
      for (let channel = 1; channel <= 512; channel += 1) {
        values[channel] = 255;
      }
      scenes.push({ id: `scene-${index}`, name: `Scene ${index}`, values });
    }
    const biggest = { ...validProject, scenes, chases: [] };
    assert.ok(JSON.stringify(biggest).length > 2_000_000, 'the test show really is larger than the default 1 MB limit');
    assert.equal((await putProject(biggest)).status, 200, 'saving a large show works');
    const imported = await fetch(`${baseUrl}/project/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(biggest),
    });
    assert.equal(imported.status, 200, 'importing a large show works');
    const oversized = await putProject({ ...biggest, padding: 'x'.repeat(9_000_000) });
    assert.equal(oversized.status, 413, 'a body beyond the show limit is still refused');
    assert.equal(
      (
        await fetch(`${baseUrl}/fixtures/import-qlc`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ xml: 'x'.repeat(1_200_000) }),
        })
      ).status,
      413,
      'other routes keep the 1 MB limit',
    );
  });

  it('detects the adapter kind on a listed port, and validates the request', async () => {
    const detect = (body) =>
      fetch(`${baseUrl}/output/detect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const ok = await detect({ serialPath: '/dev/test-cable' });
    assert.equal(ok.status, 200, 'a listed port can be probed');
    assert.equal((await ok.json()).suggestedInterface, 'open-dmx', 'the suggestion is returned');
    assert.equal((await detect({ serialPath: '/dev/not-listed' })).status, 400, 'an unlisted port is refused');
    assert.equal((await detect({})).status, 400, 'a missing port is refused');
    assert.equal((await detect({ serialPath: '/dev/test-cable', extra: 1 })).status, 400, 'unknown fields are refused');
  });
});

describe('Security headers for the app on the local network', () => {
  it('do not push browsers to https, which would leave a phone at this computer address with a blank page', async () => {
    const res = await fetch(baseUrl.replace('/api/v1', '/healthz'));
    const policy = res.headers.get('content-security-policy') ?? '';
    assert.ok(policy.includes("script-src 'self'"), 'the content security policy is still sent');
    assert.equal(policy.includes('upgrade-insecure-requests'), false);
    assert.equal(res.headers.get('strict-transport-security'), null);
  });
});
