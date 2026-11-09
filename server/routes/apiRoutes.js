// HTTP API: project load/save, fixture library, fixture import and output status. Parsing only.
import { Router } from 'express';

import { buildPatch, levelChannelsOf } from '../../shared/patch.js';
import { validateBody } from '../middleware/validate.js';
import { listSerialPorts } from '../clients/serial.js';
import { importFixtureSchema, importQlcSchema, projectSchema } from '../schemas/projectSchema.js';
import { BUILTIN_FIXTURE_TYPES, convertOpenFixtureLibrary } from '../services/fixtureLibrary.js';
import { convertQlcPlus } from '../services/qlcImporter.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';

export function createApiRouter({ engine, projectService, outputManager }) {
  const router = Router();

  const syncEngineWithProject = (project) => {
    engine.setLevelChannels(levelChannelsOf(buildPatch(project, BUILTIN_FIXTURE_TYPES)));
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
