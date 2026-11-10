// Tests for the Open Fixture Library client: searching, fetching a fixture, and refusing anything unsafe. No network.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createOflClient } from '../../server/clients/oflClient.js';

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
}

function createClient(handler, options = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { calls, client: createOflClient({ baseUrl: 'https://ofl.test', fetchImpl, ...options }) };
}

describe('oflClient.search', () => {
  it('asks the search endpoint with only the search words, and returns key and name', async () => {
    const { client, calls } = createClient(() =>
      jsonResponse([{ key: 'uking/mini-gobo', name: 'U`King Mini Gobo', color: '#fff' }]),
    );
    const found = await client.search('uking');
    assert.deepEqual(found, { results: [{ key: 'uking/mini-gobo', name: 'U`King Mini Gobo' }], total: 1 });
    assert.equal(calls[0].url, 'https://ofl.test/api/v1/get-search-results', 'the fixed search endpoint');
    assert.equal(calls[0].init.method, 'POST', 'a POST');
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      searchQuery: 'uking',
      manufacturersQuery: [],
      categoriesQuery: [],
    });
    assert.equal(calls[0].init.redirect, 'error', 'redirects are refused');
  });

  it('searches for the longest word and keeps results containing the others, ignoring punctuation', async () => {
    const { client, calls } = createClient(() =>
      jsonResponse([
        { key: 'uking/mini-gobo', name: 'U`King Mini Gobo Moving Head Light' },
        { key: 'uking/par-can', name: 'U`King Par Can' },
        { key: 'lixada/mini-gobo', name: 'Lixada Mini Gobo Moving Head Light' },
      ]),
    );
    const found = await client.search("U'King gobo");
    assert.equal(
      JSON.parse(calls[0].init.body).searchQuery,
      'uking',
      'only the longest word goes, without punctuation',
    );
    assert.deepEqual(
      found.results.map((result) => result.key),
      ['uking/mini-gobo'],
      'the other word narrows the list',
    );
    assert.equal(found.total, 1, 'the count is of the narrowed list');
  });

  it('returns nothing, without asking, for a search made only of punctuation', async () => {
    const { client, calls } = createClient(() => jsonResponse([]));
    assert.deepEqual(await client.search("'' ``"), { results: [], total: 0 });
    assert.equal(calls.length, 0, 'the library was not asked');
  });

  it('returns at most 30 results and says how many there were', async () => {
    const many = Array.from({ length: 108 }, (_, index) => ({ key: `m/f-${index}`, name: `Par ${index}` }));
    const { client } = createClient(() => jsonResponse(many));
    const found = await client.search('par');
    assert.equal(found.results.length, 30, 'capped');
    assert.equal(found.total, 108, 'the full count is reported');
  });

  it('rejects an answer with a key that is not a plain manufacturer/fixture key', async () => {
    const { client } = createClient(() => jsonResponse([{ key: '../../etc/passwd', name: 'x' }]));
    await assert.rejects(client.search('x'), (error) => error.status === 502, 'an unexpected shape is refused');
  });

  it('turns a network failure, a timeout and an upstream error into safe messages', async () => {
    const down = createClient(() => {
      throw new TypeError('fetch failed: ECONNREFUSED 10.0.0.1');
    });
    await assert.rejects(
      down.client.search('x'),
      (error) => error.status === 502 && /Could not reach/.test(error.message) && !/ECONNREFUSED/.test(error.message),
      'no raw network text leaks',
    );
    const broken = createClient(() => new Response('oops', { status: 500 }));
    await assert.rejects(
      broken.client.search('x'),
      (error) => error.status === 502 && /Try again later/.test(error.message),
    );
    const notJson = createClient(() => new Response('<html>', { status: 200 }));
    await assert.rejects(
      notJson.client.search('x'),
      (error) => error.status === 502 && /could not be read/.test(error.message),
    );
  });

  it('refuses an oversized answer, declared or streamed', async () => {
    const declared = createClient(
      () => new Response('[]', { status: 200, headers: { 'content-length': String(10 * 1024 * 1024) } }),
    );
    await assert.rejects(declared.client.search('x'), (error) => error.status === 502, 'a declared huge body');
    const streamed = createClient(() => new Response('x'.repeat(600 * 1024), { status: 200 }));
    await assert.rejects(streamed.client.search('x'), (error) => error.status === 502, 'a streamed huge body');
  });
});

describe('oflClient.getFixture', () => {
  it('fetches the fixture document by its key', async () => {
    const { client, calls } = createClient(() => jsonResponse({ name: 'Mini', availableChannels: {}, modes: [] }));
    const document = await client.getFixture('lixada/mini-gobo-moving-head-light');
    assert.equal(document.document.name, 'Mini', 'the document is returned');
    assert.equal(document.resolvedKey, 'lixada/mini-gobo-moving-head-light', 'with the key it was read from');
    assert.equal(
      calls[0].url,
      'https://ofl.test/lixada/mini-gobo-moving-head-light.json',
      'the key maps to the JSON file',
    );
  });

  it('follows a redirect entry to the real fixture, at most twice, and only to valid keys', async () => {
    const { client, calls } = createClient((url) => {
      if (url.endsWith('/uking/mini.json')) {
        return jsonResponse({ redirectTo: 'lixada/mini', reason: 'SameAsDifferentBrand' });
      }
      return jsonResponse({ name: 'Real', availableChannels: {}, modes: [] });
    });
    const found = await client.getFixture('uking/mini');
    assert.equal(found.document.name, 'Real', 'the real document is returned');
    assert.equal(found.resolvedKey, 'lixada/mini', 'and its key');
    assert.equal(calls.length, 2, 'one hop');

    const loop = createClient(() => jsonResponse({ redirectTo: 'a/b' }));
    await assert.rejects(loop.client.getFixture('a/b'), (error) => error.status === 502, 'a redirect loop stops');
    const evil = createClient(() => jsonResponse({ redirectTo: 'https://evil.test/x', name: 'N' }));
    const stayed = await evil.client.getFixture('a/b');
    assert.equal(stayed.resolvedKey, 'a/b', 'a redirect to anything that is not a key is not followed');
    assert.equal(evil.calls.length, 1, 'no request went anywhere else');
  });

  it('refuses keys that could point anywhere else, before making any request', async () => {
    const { client, calls } = createClient(() => jsonResponse({}));
    for (const key of ['../x', 'a/b/c', 'https://evil.test/x', 'A/B', 'a/', '/a', 'a b/c', 'a/b?x=1', 'a/b#h']) {
      await assert.rejects(client.getFixture(key), (error) => error.status === 400, `"${key}" is refused`);
    }
    assert.equal(calls.length, 0, 'nothing was requested');
  });

  it('reports a missing fixture as not found, and a non-object answer as unreadable', async () => {
    const missing = createClient(() => new Response('', { status: 404 }));
    await assert.rejects(missing.client.getFixture('a/b'), (error) => error.status === 404);
    const list = createClient(() => jsonResponse([1, 2]));
    await assert.rejects(list.client.getFixture('a/b'), (error) => error.status === 502);
  });
});

describe('oflClient.manufacturerName', () => {
  it('looks a manufacturer up by slug, caches the list for an hour, and falls back to the slug', async () => {
    let clock = 0;
    const { client, calls } = createClient(() => jsonResponse({ uking: { name: 'U`King' } }), { now: () => clock });
    assert.equal(await client.manufacturerName('uking'), 'U`King', 'a known manufacturer');
    assert.equal(await client.manufacturerName('unknown'), 'unknown', 'an unknown one falls back to the slug');
    assert.equal(calls.length, 1, 'the list was fetched once');
    clock = 61 * 60 * 1000;
    await client.manufacturerName('uking');
    assert.equal(calls.length, 2, 'it is fetched again after an hour');
  });
});
