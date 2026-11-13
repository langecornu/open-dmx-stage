// HTTP API for fixtures: the built-in library, imports from Open Fixture Library and QLC+ files, and online search of
// the Open Fixture Library (turned off with OFL_ENABLED=false). Parsing only.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { validateBody } from '../middleware/validate.js';
import {
  importFixtureSchema,
  importQlcSchema,
  oflDetailsSchema,
  oflImportSchema,
  oflSearchSchema,
} from '../schemas/projectSchema.js';
import { BUILTIN_FIXTURE_TYPES, convertOpenFixtureLibrary, oflFixtureId } from '../services/fixtureLibrary.js';
import { summariseOflFixture } from '../services/oflDetails.js';
import { convertQlcPlus } from '../services/qlcImporter.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';

/**
 * @param {{ ofl: ReturnType<typeof import('../clients/oflClient.js').createOflClient> | null }} options `ofl` is null
 *   when online fixture search is turned off
 * @returns {import('express').Router}
 */
export function createFixtureRouter({ ofl }) {
  const router = Router();

  router.get('/fixtures/library', (_req, res) => {
    res.json(BUILTIN_FIXTURE_TYPES);
  });

  router.post('/fixtures/import-ofl', validateBody(importFixtureSchema), (req, res) => {
    res.json(convertOpenFixtureLibrary(req.body.fixture, req.body.manufacturer ?? ''));
  });

  router.post('/fixtures/import-qlc', validateBody(importQlcSchema), (req, res) => {
    res.json(convertQlcPlus(req.body.xml));
  });

  // Online fixture search. Stricter than the general limit, so this app cannot be used to hammer the library.
  const oflLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
  const requireOfl = () => {
    if (!ofl) {
      throw httpError(503, 'Online fixture search is turned off on this computer (OFL_ENABLED=false).', {
        expose: true,
      });
    }
    return ofl;
  };

  /** @param {string} key a checked Open Fixture Library key, manufacturer/fixture */
  const fetchFixture = (key) => {
    const client = requireOfl();
    return Promise.all([client.getFixture(key), client.manufacturerName(key.split('/')[0])]);
  };

  router.get(
    '/fixtures/ofl/search',
    oflLimiter,
    asyncHandler(async (req, res) => {
      const client = requireOfl();
      const parsed = oflSearchSchema.safeParse(req.query);
      if (!parsed.success) {
        throw httpError(400, 'Type at least 2 letters to search (80 at most).');
      }
      const found = await client.search(parsed.data.q);
      // The id the fixture will have once added, so the screen can tell which results are already in the show.
      res.json({
        total: found.total,
        results: found.results.map((result) => ({ ...result, fixtureId: oflFixtureId(result.key) })),
      });
    }),
  );

  router.get(
    '/fixtures/ofl/details',
    oflLimiter,
    asyncHandler(async (req, res) => {
      requireOfl();
      const parsed = oflDetailsSchema.safeParse(req.query);
      if (!parsed.success) {
        throw httpError(400, 'That is not a valid fixture key.');
      }
      const { key } = parsed.data;
      const [{ document, resolvedKey }, manufacturer] = await fetchFixture(key);
      res.json({
        key,
        resolvedKey,
        fixtureId: oflFixtureId(key),
        manufacturer,
        url: `https://open-fixture-library.org/${resolvedKey}`,
        ...summariseOflFixture(document),
      });
    }),
  );

  router.post(
    '/fixtures/ofl/import',
    oflLimiter,
    validateBody(oflImportSchema),
    asyncHandler(async (req, res) => {
      const { key } = req.body;
      const [{ document, resolvedKey }, manufacturer] = await fetchFixture(key);
      res.json(convertOpenFixtureLibrary(document, manufacturer, { key, creditKey: resolvedKey }));
    }),
  );

  return router;
}
