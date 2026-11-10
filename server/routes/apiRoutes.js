// HTTP API: project load/save, fixture library, fixture import and output status. Parsing only.
import { Router } from 'express';

import { buildPatch, channelsByFixture, levelChannelsOf } from '../../shared/patch.js';
import { validateBody } from '../middleware/validate.js';
import { listSerialPorts } from '../clients/serial.js';
import { detectAdapterSchema, importFixtureSchema, importQlcSchema, projectSchema } from '../schemas/projectSchema.js';
import { BUILTIN_FIXTURE_TYPES, convertOpenFixtureLibrary } from '../services/fixtureLibrary.js';
import { convertQlcPlus } from '../services/qlcImporter.js';
import { migrateProject } from '../services/projectMigrations.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';

/**
 * @param {{
 *   engine: import('../services/dmxEngine.js').DmxEngine,
 *   projectService: import('../services/projectService.js').ProjectService,
 *   outputManager: import('../services/outputManager.js').OutputManager,
 * }} options
 * @returns {import('express').Router}
 */
export function createApiRouter({ engine, projectService, outputManager }) {
  const router = Router();

  /** @param {import('../../shared/types.js').Project} project */
  const syncEngineWithProject = (project) => {
    const patch = buildPatch(project, BUILTIN_FIXTURE_TYPES);
    engine.setLevelChannels(levelChannelsOf(patch));
    engine.setFixtureChannels(channelsByFixture(patch));
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
