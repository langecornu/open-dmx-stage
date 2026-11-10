// Tests for the HTTP client: every call goes to the right place, and every failure becomes a readable error.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../src/api.js';

let fetchMock;

function respond(body, init = { status: 200 }) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), init));
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api requests', () => {
  it.each([
    ['getProject', [], '/api/v1/project', undefined, undefined],
    ['getFixtureLibrary', [], '/api/v1/fixtures/library', undefined, undefined],
    ['listOutputPorts', [], '/api/v1/output/ports', undefined, undefined],
    ['getOutput', [], '/api/v1/output', undefined, undefined],
    [
      'searchOpenFixtureLibrary',
      ['u king/gobo'],
      '/api/v1/fixtures/ofl/search?q=u%20king%2Fgobo',
      undefined,
      undefined,
    ],
    ['getOpenFixtureDetails', ['a/b'], '/api/v1/fixtures/ofl/details?key=a%2Fb', undefined, undefined],
    ['saveProject', [{ name: 'x' }], '/api/v1/project', 'PUT', { name: 'x' }],
    ['importProject', [{ name: 'x' }], '/api/v1/project/import', 'POST', { name: 'x' }],
    [
      'importOpenFixture',
      [{ name: 'F' }, 'Acme'],
      '/api/v1/fixtures/import-ofl',
      'POST',
      { fixture: { name: 'F' }, manufacturer: 'Acme' },
    ],
    ['importFromOpenFixtureLibrary', ['a/b'], '/api/v1/fixtures/ofl/import', 'POST', { key: 'a/b' }],
    ['importQlcFixture', ['<xml/>'], '/api/v1/fixtures/import-qlc', 'POST', { xml: '<xml/>' }],
    ['detectAdapter', ['/dev/tty'], '/api/v1/output/detect', 'POST', { serialPath: '/dev/tty' }],
    ['saveOutputSettings', [{ driver: 'mock' }], '/api/v1/output/settings', 'PUT', { driver: 'mock' }],
  ])('%s calls %s with the right method and body', async (name, args, url, method, body) => {
    respond({ ok: true });
    expect(await api[name](...args)).toEqual({ ok: true });
    const [calledUrl, options] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(url);
    expect(options?.method).toBe(method);
    if (body === undefined) {
      expect(options?.body).toBeUndefined();
    } else {
      expect(options.headers).toEqual({ 'content-type': 'application/json' });
      expect(JSON.parse(options.body)).toEqual(body);
    }
  });
});

describe('api errors', () => {
  it('throws the message the server sent', async () => {
    respond({ error: 'That serial port was not found.' }, { status: 400 });
    await expect(api.getOutput()).rejects.toThrow('That serial port was not found.');
  });

  it('falls back to the status when the error body has no message', async () => {
    respond({ other: 1 }, { status: 418 });
    await expect(api.getOutput()).rejects.toThrow('Request failed (418)');
  });

  it('falls back to the status when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(api.getProject()).rejects.toThrow('Request failed (502)');
  });

  it('lets a network failure through as an error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.getProject()).rejects.toThrow('Failed to fetch');
  });
});
