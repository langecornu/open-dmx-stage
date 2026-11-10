// HTTP API: project load/save, fixture library, fixture import and output status. Parsing only.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { buildPatch, channelsByFixture, levelChannelsOf, restingValuesOf } from '../../shared/patch.js';
import { validateBody } from '../middleware/validate.js';
import { listSerialPorts } from '../clients/serial.js';
import {
  detectAdapterSchema,
  importFixtureSchema,
  importQlcSchema,
  oflDetailsSchema,
  oflImportSchema,
  oflSearchSchema,
  projectSchema,
} from '../schemas/projectSchema.js';
import { BUILTIN_FIXTURE_TYPES, convertOpenFixtureLibrary, oflFixtureId } from '../services/fixtureLibrary.js';
import { summariseOflFixture } from '../services/oflDetails.js';
import { convertQlcPlus } from '../services/qlcImporter.js';
import { migrateProject } from '../services/projectMigrations.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';

/**
 * @param {{
 *   engine: import('../services/dmxEngine.js').DmxEngine,
 *   projectService: import('../services/projectService.js').ProjectService,
 *   outputManager: import('../services/outputManager.js').OutputManager,
 *   ofl?: ReturnType<typeof import('../clients/oflClient.js').createOflClient> | null,
 * }} options `ofl` is null when online fixture search is turned off
 * @returns {import('express').Router}
 */
export function createApiRouter({ engine, projectService, outputManager, ofl = null }) {
  const router = Router();

  /** @param {import('../../shared/types.js').Project} project */
  const syncEngineWithProject = (project) => {
    const patch = buildPatch(project, BUILTIN_FIXTURE_TYPES);
    engine.setLevelChannels(levelChannelsOf(patch));
    engine.setFixtureChannels(channelsByFixture(patch));
    engine.setRestingValues(restingValuesOf(patch));
  };
  syncEngineWithProject(projectService.get());

  router.get('/project', (_req, res) => {
    res.json(projectService.get());
  });

  router.put(
    '/project',
    validateBody(projectSchema),
    asyncHandler(async (req, res) => {
      const saved = await projectService.save(req.body);
      syncEngineWithProject(saved);
      res.json(saved);
    }),
  );

  // The show as a downloadable file. It is always at the current schema version, ready to import again.
  router.get('/project/export', (_req, res) => {
    res.attachment('open-dmx-stage-show.json');
    res.type('application/json').send(JSON.stringify(projectService.get(), null, 2));
  });

  // Replaces the show with an uploaded file of any supported version (older files are migrated).
  router.post(
    '/project/import',
    asyncHandler(async (req, res) => {
      const parsed = projectSchema.safeParse(migrateProject(req.body));
      if (!parsed.success) {
        throw httpError(400, 'That file is not a valid Open DMX Stage show.');
      }
      const saved = await projectService.save(parsed.data, { replaceNewerShow: true });
      syncEngineWithProject(saved);
      res.json(saved);
    }),
  );

  router.get('/fixtures/library', (_req, res) => {
    res.json(BUILTIN_FIXTURE_TYPES);
  });

  router.post('/fixtures/import-ofl', validateBody(importFixtureSchema), (req, res) => {
    res.json(convertOpenFixtureLibrary(req.body.fixture, req.body.manufacturer ?? ''));
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
      const client = requireOfl();
      const parsed = oflDetailsSchema.safeParse(req.query);
      if (!parsed.success) {
        throw httpError(400, 'That is not a valid fixture key.');
      }
      const { key } = parsed.data;
      const [{ document, resolvedKey }, manufacturer] = await Promise.all([
        client.getFixture(key),
        client.manufacturerName(key.split('/')[0]),
      ]);
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
      const client = requireOfl();
      const { key } = req.body;
      const [{ document, resolvedKey }, manufacturer] = await Promise.all([
        client.getFixture(key),
        client.manufacturerName(key.split('/')[0]),
      ]);
      res.json(convertOpenFixtureLibrary(document, manufacturer, { key, creditKey: resolvedKey }));
    }),
  );

  router.post('/fixtures/import-qlc', validateBody(importQlcSchema), (req, res) => {
    res.json(convertQlcPlus(req.body.xml));
  });

  router.get('/output', (_req, res) => {
    res.json(outputManager.getStatus());
  });

  router.put(
    '/output/settings',
    asyncHandler(async (req, res) => {
      res.json(await outputManager.apply(req.body));
    }),
  );

  // Asks the adapter on a port what kind it is (passive cable or ENTTEC Pro style), so the right interface can be chosen.
  router.post(
    '/output/detect',
    validateBody(detectAdapterSchema),
    asyncHandler(async (req, res) => {
      res.json(await outputManager.detect(req.body.serialPath));
    }),
  );

  router.get(
    '/output/ports',
    asyncHandler(async (_req, res) => {
      try {
        res.json(await listSerialPorts());
      } catch {
        throw httpError(
          503,
          'Serial support is not available on this computer. Use Art-Net or sACN, or the simulator.',
        );
      }
    }),
  );

  return router;
}
