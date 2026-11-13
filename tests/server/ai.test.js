// Integration tests for AI show generation and its API key, with a stand-in for Anthropic's client: the key is
// write-only, the request carries the rig and the choices, and the answer is checked and turned into looks and sequences.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

import { AuthenticationError } from '@anthropic-ai/sdk';

import { createApp } from '../../server/app.js';
import { MockDriver } from '../../server/clients/mockDriver.js';
import { CURRENT_SCHEMA_VERSION } from '../../server/schemas/projectSchema.js';
import { AiKeyStore } from '../../server/services/aiKeyStore.js';
import { DmxEngine } from '../../server/services/dmxEngine.js';
import { OutputManager } from '../../server/services/outputManager.js';
import { ProjectService } from '../../server/services/projectService.js';
import { buildRequest } from '../../server/services/showGenerator.js';
import { BUILTIN_FIXTURE_TYPES } from '../../server/services/fixtureLibrary.js';

const KEY = 'sk-ant-api03-test-key-0123456789abcdef';

let server;
let baseUrl;
let dataDir;
/** What the stand-in client saw and will answer. */
const mock = { keys: [], requests: [], answer: null, error: null, stopReason: 'end_turn', gate: null };

function mockClient(apiKey) {
  mock.keys.push(apiKey);
  return {
    models: {
      retrieve: async (model) => {
        if (mock.error) {
          throw mock.error;
        }
        return { id: model };
      },
    },
    beta: {
      messages: {
        stream: (body) => {
          mock.requests.push(body);
          return {
            finalMessage: async () => {
              await mock.gate;
              if (mock.error) {
                throw mock.error;
              }
              return {
                stop_reason: mock.stopReason,
                content: [{ type: 'text', text: JSON.stringify(mock.answer) }],
                usage: { input_tokens: 1200, output_tokens: 3400 },
              };
            },
          };
        },
      },
    },
  };
}

const show = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  name: 'Test',
  fixtureTypes: [],
  fixtures: [
    { id: 'p1', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1 },
    { id: 'p2', name: 'Par 2', typeId: 'generic-rgb-par', mode: 0, address: 4 },
  ],
  scenes: [],
  chases: [],
  groups: [],
};

const answer = {
  summary: 'Blue to red.',
  looks: [
    { name: 'Blue', lights: [{ lightId: 'p1', color: '#0000ff', intensity: 100, settings: [] }] },
    { name: 'Red', lights: [{ lightId: 'p2', color: '#ff0000', intensity: 100, settings: [] }] },
  ],
  sequences: [
    {
      name: 'Swap',
      loop: true,
      lengthBeats: 16,
      steps: [
        { look: 'Blue', fadeBeats: 1, holdBeats: 3 },
        { look: 'Red', fadeBeats: 1, holdBeats: 3 },
      ],
      blocks: [],
    },
  ],
};

/** Starts the app on a free port, with its own rate limits, the stand-in client and a key store in `dir`. */
async function startApp(dir) {
  const config = { allowedOrigins: ['http://localhost:5173'], distDir: path.join(dir, 'none') };
  const projectService = new ProjectService({ dataDir: dir });
  await projectService.load();
  const engine = new DmxEngine({ driver: new MockDriver() });
  const outputManager = new OutputManager({
    engine,
    dataDir: dir,
    defaults: { driver: 'mock' },
    listPorts: async () => [],
    probe: async () => ({ kind: 'no-response', suggestedInterface: 'open-dmx', message: 'stub' }),
  });
  const aiKeys = new AiKeyStore({ dataDir: dir, env: {} });
  const started = createServer(
    createApp({ config, engine, projectService, outputManager, aiKeys, aiClient: /** @type {any} */ (mockClient) }),
  );
  await new Promise((resolve) => started.listen(0, resolve));
  return { server: started, url: `http://localhost:${started.address().port}/api/v1`, aiKeys };
}

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'odmx-ai-'));
  ({ server, url: baseUrl } = await startApp(dataDir));
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  Object.assign(mock, { keys: [], requests: [], answer, error: null, stopReason: 'end_turn', gate: null });
});

const call = async (method, route, body) => {
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
};
const json = (response) => JSON.parse(response.text);

describe('AI API key', () => {
  it('starts without a key, and refuses one that is not an Anthropic key', async () => {
    assert.deepEqual(json(await call('GET', '/settings/ai')), { hasKey: false, source: null });
    assert.equal((await call('PUT', '/settings/ai', { apiKey: 'hello there, not a key' })).status, 400);
    assert.equal((await call('POST', '/ai/generate', { auto: true })).status, 400, 'no key, no generation');
  });

  it('checks a key with Anthropic, saves it for this user only, and never sends it back', async () => {
    mock.error = new AuthenticationError(401, {}, 'invalid x-api-key', new Headers());
    const refused = await call('PUT', '/settings/ai', { apiKey: KEY });
    assert.equal(refused.status, 400);
    assert.match(json(refused).error, /refused the API key/);
    mock.error = null;
    const saved = await call('PUT', '/settings/ai', { apiKey: KEY });
    assert.equal(saved.status, 200);
    assert.deepEqual(json(saved), { hasKey: true, source: 'saved' });
    assert.equal(saved.text.includes(KEY), false);
    assert.equal((await call('GET', '/settings/ai')).text.includes(KEY), false);
    const file = path.join(dataDir, 'secrets.json');
    assert.equal(JSON.parse(await readFile(file, 'utf8')).anthropicApiKey, KEY);
    assert.equal((await stat(file)).mode & 0o077, 0, 'only this user can read the key file');
  });

  it('prefers a key set on the server', async () => {
    const store = new AiKeyStore({ dataDir, env: { ANTHROPIC_API_KEY: 'sk-ant-from-env' } });
    assert.deepEqual(await store.status(), { hasKey: true, source: 'environment' });
    assert.equal(await store.read(), 'sk-ant-from-env');
  });
});

describe('AI show generation', () => {
  it('sends the rig and the choices, and returns looks and sequences for this rig', async () => {
    await call('PUT', '/project', show);
    const generated = await call('POST', '/ai/generate', {
      auto: false,
      mood: 'cool to warm',
      colours: [{ hex: '#00ff00', amount: 'avoid' }],
      features: { strobe: 'off' },
      looks: 2,
      sequences: 1,
      bars: 4,
    });
    assert.equal(generated.status, 200, generated.text);
    const body = json(generated);
    assert.deepEqual(
      body.looks.map((look) => [look.name, look.values, look.origin]),
      [
        ['Blue', { 1: 0, 2: 0, 3: 255 }, 'ai'],
        ['Red', { 4: 255, 5: 0, 6: 0 }, 'ai'],
      ],
    );
    assert.equal(body.sequences[0].steps.length, 2);
    assert.deepEqual(body.usage, { inputTokens: 1200, outputTokens: 3400 });
    assert.deepEqual(mock.keys, [KEY]);

    const [request] = mock.requests;
    assert.equal(request.model, 'claude-opus-5-5');
    assert.equal(request.fallbacks, 'default');
    assert.equal(request.output_config.format.type, 'json_schema');
    const text = request.messages[0].content;
    assert.match(text, /"lightId": "p1"/);
    assert.match(text, /cool to warm/);
    assert.match(text, /#00ff00: avoid/);
    assert.match(text, /Strobe: off/);
  });

  it('explains a refusal, an answer too long to finish, and a key Anthropic refuses', async () => {
    mock.stopReason = 'refusal';
    assert.equal((await call('POST', '/ai/generate', { auto: true })).status, 422);
    mock.stopReason = 'max_tokens';
    assert.match(json(await call('POST', '/ai/generate', { auto: true })).error, /too big/);
    mock.stopReason = 'end_turn';
    mock.error = new AuthenticationError(401, {}, 'invalid x-api-key', new Headers());
    assert.match(json(await call('POST', '/ai/generate', { auto: true })).error, /refused the API key/);
  });

  it('makes one show at a time, so two devices do not pay twice', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'odmx-ai-one-'));
    const app = await startApp(dir);
    await app.aiKeys.save(KEY);
    await fetch(`${app.url}/project`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(show),
    });
    const post = async () => {
      const res = await fetch(`${app.url}/ai/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ auto: true }),
      });
      return { status: res.status, text: await res.text() };
    };
    let release;
    mock.gate = new Promise((resolve) => {
      release = resolve;
    });
    const first = post();
    const deadline = Date.now() + 2000;
    while (mock.requests.length === 0) {
      assert.ok(Date.now() < deadline, 'the first generation reaches Anthropic');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const second = await post();
    assert.equal(second.status, 409);
    assert.match(json(second).error, /already being made/);
    release();
    assert.equal((await first).status, 200, 'the first one finishes');
    assert.equal((await post()).status, 200, 'and the next one can start');
    await new Promise((resolve) => app.server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });

  it('forgets the key when it is removed', async () => {
    assert.deepEqual(json(await call('DELETE', '/settings/ai')), { hasKey: false, source: null });
    assert.equal((await call('POST', '/ai/generate', { auto: true })).status, 400);
  });
});

describe('buildRequest', () => {
  it('asks for one sequence that follows the whole song, from its energy map', () => {
    const { text, songBeats } = buildRequest({ ...show, venue: { id: 'main', name: 'Club' } }, BUILTIN_FIXTURE_TYPES, {
      auto: true,
      looks: 6,
      sequences: 2,
      bars: 16,
      song: {
        bpm: 120,
        durationSeconds: 64.5,
        firstBeatSeconds: 0.5,
        sections: [
          { startBar: 0, bars: 8, energy: 0.1 },
          { startBar: 8, bars: 24, energy: 0.9 },
        ],
      },
    });
    assert.equal(songBeats, 128);
    assert.match(text, /The rig at Club/);
    assert.match(text, /120 beats a minute, 128 beats \(32 bars\)/);
    assert.match(text, /bars 1 to 8: quiet energy \(10%\)/);
    assert.match(text, /bars 9 to 32: high energy \(90%\)/);
    assert.match(text, /lengthBeats 128/);
    assert.match(text, /leaves everything to you/);
  });
});
