// Client for the Open Fixture Library (https://open-fixture-library.org), a community database of lighting fixtures.
// Used to search for a light and copy its channel layout into the show. One host only, fixed here: the browser never
// chooses a URL, fixture keys are checked against a strict pattern, redirects are refused, and every call has a timeout
// and a size limit. Nothing about the show is sent; only the search words.
import { z } from 'zod';

import { logger } from '../logger.js';
import { FIXTURE_KEY_PATTERN } from '../schemas/projectSchema.js';
import { httpError } from '../utils/httpError.js';

const log = logger.child({ module: 'ofl-client' });
const EXPOSE = { expose: true }; // our own messages about the library being unreachable are safe to show

export const DEFAULT_OFL_URL = 'https://open-fixture-library.org';
const TIMEOUT_MS = 8000;
const MAX_BYTES = 512 * 1024;
const MAX_RESULTS = 30;
const MANUFACTURERS_TTL_MS = 60 * 60 * 1000;

/** @param {string} text @returns {string} lower case letters and digits only, so punctuation does not matter */
const squash = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

const searchResultsSchema = z.array(
  z.object({ key: z.string().regex(FIXTURE_KEY_PATTERN), name: z.string().max(200) }),
);
const manufacturersSchema = z.record(z.string(), z.object({ name: z.string().max(200) }));

/**
 * @param {Response} response
 * @returns {Promise<string>} the body text, refusing anything over the size limit
 */
async function readLimited(response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw httpError(502, 'The Open Fixture Library sent more data than expected.', EXPOSE);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    return '';
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw httpError(502, 'The Open Fixture Library sent more data than expected.', EXPOSE);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * @param {{ baseUrl?: string, fetchImpl?: typeof fetch, now?: () => number }} [options] `fetchImpl` and `now` are
 *   injectable so tests need no network
 */
export function createOflClient({ baseUrl = DEFAULT_OFL_URL, fetchImpl = fetch, now = () => Date.now() } = {}) {
  /** @type {{ at: number, names: Map<string, string> } | null} */
  let manufacturersCache = null;

  /**
   * @param {string} path
   * @param {RequestInit} [init]
   * @returns {Promise<unknown>} parsed JSON
   */
  async function getJson(path, init = {}) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'application/json', ...init.headers },
      });
    } catch (error) {
      log.warn({ err: error, path }, 'Could not reach the Open Fixture Library');
      throw httpError(
        502,
        'Could not reach the Open Fixture Library. Check your internet connection and try again.',
        EXPOSE,
      );
    }
    if (response.status === 404) {
      throw httpError(404, 'That fixture was not found in the Open Fixture Library.');
    }
    if (!response.ok) {
      log.warn({ path, status: response.status }, 'The Open Fixture Library answered with an error');
      throw httpError(502, 'The Open Fixture Library could not answer right now. Try again later.', EXPOSE);
    }
    const text = await readLimited(response);
    try {
      return JSON.parse(text);
    } catch {
      throw httpError(502, 'The Open Fixture Library sent an answer that could not be read.', EXPOSE);
    }
  }

  return {
    /**
     * The library matches one phrase at a time, so a search of several words asks for the longest word and then keeps
     * only results whose names contain all the words. Punctuation is ignored (the library finds "uking" but not
     * "U'King"), so "U'King" finds "U`King".
     * @param {string} query words to search for
     * @returns {Promise<{ results: { key: string, name: string }[], total: number }>} at most 30 results
     */
    async search(query) {
      const words = query.split(/\s+/).map(squash).filter(Boolean);
      if (words.length === 0) {
        return { results: [], total: 0 };
      }
      const main = words.reduce((longest, word) => (word.length > longest.length ? word : longest), '');
      const raw = await getJson('/api/v1/get-search-results', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ searchQuery: main, manufacturersQuery: [], categoriesQuery: [] }),
      });
      const parsed = searchResultsSchema.safeParse(raw);
      if (!parsed.success) {
        throw httpError(502, 'The Open Fixture Library sent an answer that could not be read.', EXPOSE);
      }
      const matching = parsed.data.filter((result) => words.every((word) => squash(result.name).includes(word)));
      return { results: matching.slice(0, MAX_RESULTS), total: matching.length };
    },

    /**
     * Fetches a fixture document. Some entries only point to another one (the same light sold under a different
     * brand); those are followed, at most twice, and the key of the document that was finally read is returned.
     * @param {string} key `manufacturer/fixture`
     * @returns {Promise<{ document: Record<string, any>, resolvedKey: string }>}
     */
    async getFixture(key) {
      if (!FIXTURE_KEY_PATTERN.test(key)) {
        throw httpError(400, 'That is not a valid fixture key.');
      }
      let current = key;
      for (let hop = 0; hop < 3; hop += 1) {
        const raw = await getJson(`/${current}.json`);
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
          throw httpError(502, 'The Open Fixture Library sent an answer that could not be read.', EXPOSE);
        }
        const target = /** @type {Record<string, any>} */ (raw).redirectTo;
        if (typeof target === 'string' && FIXTURE_KEY_PATTERN.test(target)) {
          current = target;
          continue;
        }
        return { document: /** @type {Record<string, any>} */ (raw), resolvedKey: current };
      }
      throw httpError(502, 'The Open Fixture Library sent an answer that could not be read.', EXPOSE);
    },

    /**
     * @param {string} slug manufacturer key, for example "lixada"
     * @returns {Promise<string>} the manufacturer's name, or the slug when it is not in the list
     */
    async manufacturerName(slug) {
      if (!manufacturersCache || now() - manufacturersCache.at > MANUFACTURERS_TTL_MS) {
        const parsed = manufacturersSchema.safeParse(await getJson('/api/v1/manufacturers'));
        if (!parsed.success) {
          throw httpError(502, 'The Open Fixture Library sent an answer that could not be read.', EXPOSE);
        }
        manufacturersCache = {
          at: now(),
          names: new Map(Object.entries(parsed.data).map(([key, value]) => [key, value.name])),
        };
      }
      return manufacturersCache.names.get(slug) ?? slug;
    },
  };
}
