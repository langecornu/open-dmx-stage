// Tests for the online fixture search routes, with a stub in place of the Open Fixture Library.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { MockDriver } from '../../server/clients/mockDriver.js';
import { createApp } from '../../server/app.js';
import { DmxEngine } from '../../server/services/dmxEngine.js';
import { OutputManager } from '../../server/services/outputManager.js';
import { ProjectService } from '../../server/services/projectService.js';

const FIXTURE = {
  name: 'Mini Gobo Moving Head Light',
  categories: ['Moving Head'],
  meta: { authors: ['Freasy', 'edohard'] },
  availableChannels: {
    Pan: { capability: { type: 'Pan' } },
    Dimmer: { capability: { type: 'Intensity' } },
  },
  modes: [{ name: '2-channel', channels: ['Pan', 'Dimmer'] }],
};

function createStub() {
  const calls = [];
  return {
    calls,
    search: async (query) => {
      calls.push(['search', query]);
      return { results: [{ key: 'lixada/mini-gobo', name: 'Lixada Mini Gobo' }], total: 1 };
    },
    getFixture: async (key) => {
      calls.push(['getFixture', key]);
      return { document: FIXTURE, resolvedKey: key === 'uking/mini-gobo' ? 'lixada/mini-gobo' : key };
    },
    manufacturerName: async () => 'Lixada',
  };
}

async function startApp(ofl) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'odmx-ofl-'));
  const projectService = new ProjectService({ dataDir });
  await projectService.load();
  const engine = new DmxEngine({ driver: new MockDriver() });
  const outputManager = new OutputManager({ engine, dataDir, defaults: { driver: 'mock' } });
  const config = { allowedOrigins: ['http://localhost:5173'], distDir: path.join(dataDir, 'none') };
  const server = createServer(createApp({ config, engine, projectService, outputManager, ofl }));
  await new Promise((resolve) => server.listen(0, resolve));
  return {
    baseUrl: `http://localhost:${server.address().port}/api/v1`,
    stop: async () => {
      await new Promise((resolve) => server.close(resolve));
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

describe('online fixture search', () => {
  let app;
  let stub;
  before(async () => {
    stub = createStub();
    app = await startApp(stub);
  });
  after(() => app.stop());

  it('searches, and refuses queries that are too short or too long', async () => {
    const ok = await fetch(`${app.baseUrl}/fixtures/ofl/search?q=${encodeURIComponent(' gobo ')}`);
    assert.equal(ok.status, 200, 'a normal search works');
    assert.deepEqual((await ok.json()).results[0], {
      key: 'lixada/mini-gobo',
      name: 'Lixada Mini Gobo',
      fixtureId: 'ofl-lixada-mini-gobo',
    });
    assert.deepEqual(stub.calls[0], ['search', 'gobo'], 'the query is trimmed');
    assert.equal((await fetch(`${app.baseUrl}/fixtures/ofl/search?q=a`)).status, 400, 'one letter is too short');
    assert.equal((await fetch(`${app.baseUrl}/fixtures/ofl/search`)).status, 400, 'a missing query is refused');
    assert.equal((await fetch(`${app.baseUrl}/fixtures/ofl/search?q=${'x'.repeat(81)}`)).status, 400, 'too long');
    assert.equal((await fetch(`${app.baseUrl}/fixtures/ofl/search?q=ab&extra=1`)).status, 400, 'unknown parameters');
  });

  it('imports a fixture as a converted fixture type that credits the library, without saving it', async () => {
    const response = await fetch(`${app.baseUrl}/fixtures/ofl/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'lixada/mini-gobo' }),
    });
    assert.equal(response.status, 200, 'the import works');
    const type = await response.json();
    assert.equal(type.id, 'ofl-lixada-mini-gobo', 'a stable id made from the key');
    assert.equal(type.manufacturer, 'Lixada', 'the manufacturer name comes from the library');
    assert.equal(type.name, 'Mini Gobo Moving Head Light', 'the model');
    assert.deepEqual(
      type.modes[0].channels.map((channel) => channel.type),
      ['pan', 'intensity'],
      'channels converted',
    );
    assert.match(
      type.description,
      /Open Fixture Library \(open-fixture-library\.org\/lixada\/mini-gobo\)/,
      'credits the source',
    );
    assert.match(type.description, /Authors: Freasy, edohard/, 'credits the authors');
    const project = await (await fetch(`${app.baseUrl}/project`)).json();
    assert.deepEqual(project.fixtureTypes, [], 'the server did not change the show');
  });

  it('credits the entry the channels really came from when the chosen one only points to it', async () => {
    const response = await fetch(`${app.baseUrl}/fixtures/ofl/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'uking/mini-gobo' }),
    });
    const type = await response.json();
    assert.equal(type.id, 'ofl-uking-mini-gobo', 'the id follows what was chosen');
    assert.match(type.description, /open-fixture-library\.org\/lixada\/mini-gobo/, 'the credit names the real source');
  });

  it('returns the details of a fixture for the details window, without saving anything', async () => {
    const response = await fetch(`${app.baseUrl}/fixtures/ofl/details?key=lixada/mini-gobo`);
    assert.equal(response.status, 200, 'details load');
    const details = await response.json();
    assert.equal(details.manufacturer, 'Lixada', 'the manufacturer name');
    assert.equal(details.fixtureId, 'ofl-lixada-mini-gobo', 'the id it would get when added');
    assert.equal(details.url, 'https://open-fixture-library.org/lixada/mini-gobo', 'a link to the library page');
    assert.deepEqual(details.authors, ['Freasy', 'edohard'], 'the authors');
    assert.deepEqual(
      details.modes[0].channels.map((channel) => channel.name),
      ['Pan', 'Dimmer'],
      'the mode channels',
    );
    assert.equal((await fetch(`${app.baseUrl}/fixtures/ofl/details?key=../x`)).status, 400, 'a bad key is refused');
    assert.equal((await fetch(`${app.baseUrl}/fixtures/ofl/details`)).status, 400, 'a missing key is refused');
    assert.equal((await fetch(`${app.baseUrl}/fixtures/ofl/details?key=a/b&x=1`)).status, 400, 'unknown parameters');
  });

  it('refuses bad keys and unknown fields on import', async () => {
    const post = (body) =>
      fetch(`${app.baseUrl}/fixtures/ofl/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    assert.equal((await post({ key: '../../etc/passwd' })).status, 400, 'a path is not a key');
    assert.equal((await post({ key: 'https://evil.test/a' })).status, 400, 'a URL is not a key');
    assert.equal((await post({})).status, 400, 'a missing key');
    assert.equal((await post({ key: 'a/b', extra: 1 })).status, 400, 'unknown fields');
  });
});

describe('online fixture search turned off', () => {
  it('answers 503 with a clear message and never reaches out', async () => {
    const app = await startApp(null);
    try {
      const response = await fetch(`${app.baseUrl}/fixtures/ofl/search?q=gobo`);
      assert.equal(response.status, 503, 'service unavailable');
      assert.match((await response.json()).error, /turned off/, 'the message says why');
      assert.equal((await fetch(`${app.baseUrl}/fixtures/ofl/details?key=a/b`)).status, 503, 'details are off too');
      const imported = await fetch(`${app.baseUrl}/fixtures/ofl/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'a/b' }),
      });
      assert.equal(imported.status, 503, 'import is off too');
    } finally {
      await app.stop();
    }
  });
});
