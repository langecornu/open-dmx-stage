// HTTP API: project load/save, fixture library, fixture import and output status. Parsing only.
import { randomUUID } from 'node:crypto';

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { controlsByFixture } from '../../shared/capabilities.js';
import {
  buildPatch,
  channelsByFixture,
  indexFixtureTypes,
  levelChannelsOf,
  restingValuesOf,
} from '../../shared/patch.js';
import { validateBody } from '../middleware/validate.js';
import { listSerialPorts } from '../clients/serial.js';
import {
  detectAdapterSchema,
  importFixtureSchema,
  importQlcSchema,
  oflDetailsSchema,
  oflImportSchema,
  oflSearchSchema,
  aiGenerateSchema,
  aiKeySchema,
  createEmptyProject,
  projectSchema,
  showNameSchema,
} from '../schemas/projectSchema.js';
import { BUILTIN_FIXTURE_TYPES, convertOpenFixtureLibrary, oflFixtureId } from '../services/fixtureLibrary.js';
import { summariseOflFixture } from '../services/oflDetails.js';
import { convertQlcPlus } from '../services/qlcImporter.js';
import { migrateProject } from '../services/projectMigrations.js';
import { AiKeyStore } from '../services/aiKeyStore.js';
import { ShowLibrary, isEmptyShow, summariseShow } from '../services/showLibrary.js';
import { checkApiKey, generateShow } from '../services/showGenerator.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';

/**
 * @param {{
 *   engine: import('../services/dmxEngine.js').DmxEngine,
 *   projectService: import('../services/projectService.js').ProjectService,
 *   outputManager: import('../services/outputManager.js').OutputManager,
 *   ofl?: ReturnType<typeof import('../clients/oflClient.js').createOflClient> | null,
 *   aiKeys?: AiKeyStore,
 *   aiClient?: (apiKey: string) => import('@anthropic-ai/sdk').default,
 * }} options `ofl` is null when online fixture search is turned off
 * @returns {import('express').Router}
 */
export function createApiRouter({
  engine,
  projectService,
  outputManager,
  ofl = null,
  aiKeys = new AiKeyStore({ dataDir: projectService.dataDir }),
  aiClient = undefined,
}) {
  const router = Router();

  /** @param {import('../../shared/types.js').Project} project */
  const syncEngineWithProject = (project) => {
    const patch = buildPatch(project, BUILTIN_FIXTURE_TYPES);
    engine.setLevelChannels(levelChannelsOf(patch));
    engine.setFixtureChannels(channelsByFixture(patch));
    engine.setFixtureControls(controlsByFixture(project, indexFixtureTypes(project, BUILTIN_FIXTURE_TYPES)));
    engine.setRestingValues(restingValuesOf(patch));
  };
  syncEngineWithProject(projectService.get());

  const shows = new ShowLibrary({ dataDir: projectService.dataDir });

  // Another show takes the stage: nothing of the old one keeps playing.
  const clearStage = () => {
    engine.stopAuto();
    engine.stopChase();
    engine.releaseScene(0);
    engine.clearProgrammer();
    engine.stopEffect();
    engine.clearMuteSolo();
  };

  /**
   * Makes `next` the show being worked on. The current one goes to the show list first (unless it is empty), so
   * nothing is lost; while the saved show is from a newer version of the app, it is left alone and this refuses.
   * @param {import('../../shared/types.js').Project} next
   * @param {{ replaceNewerShow?: boolean }} [options]
   */
  const takeTheStage = async (next, { replaceNewerShow = false } = {}) => {
    if (projectService.lockedReason && !replaceNewerShow) {
      throw httpError(409, projectService.lockedReason);
    }
    const current = projectService.get();
    if (!projectService.lockedReason && !isEmptyShow(current)) {
      await shows.write(current);
    }
    const saved = await projectService.save(next, { replaceNewerShow });
    clearStage();
    syncEngineWithProject(saved);
    return saved;
  };

  // AI show generation. The key is write-only: no route ever returns it.
  router.get(
    '/settings/ai',
    asyncHandler(async (_req, res) => {
      res.json(await aiKeys.status());
    }),
  );

  router.put(
    '/settings/ai',
    validateBody(aiKeySchema),
    asyncHandler(async (req, res) => {
      await checkApiKey(req.body.apiKey, aiClient);
      await aiKeys.save(req.body.apiKey);
      res.json(await aiKeys.status());
    }),
  );

  router.delete(
    '/settings/ai',
    asyncHandler(async (_req, res) => {
      await aiKeys.remove();
      res.json(await aiKeys.status());
    }),
  );

  // Each generation spends money on the person's key, so a few a minute is plenty.
  const aiLimiter = rateLimit({ windowMs: 60_000, limit: 6, standardHeaders: true, legacyHeaders: false });
  router.post(
    '/ai/generate',
    aiLimiter,
    validateBody(aiGenerateSchema),
    asyncHandler(async (req, res) => {
      const apiKey = await aiKeys.read();
      if (!apiKey) {
        throw httpError(400, 'Add your Anthropic API key in Settings first.');
      }
      res.json(
        await generateShow({
          apiKey,
          project: projectService.get(),
          builtinTypes: BUILTIN_FIXTURE_TYPES,
          preferences: req.body,
          makeId: () => randomUUID(),
          ...(aiClient ? { createClient: aiClient } : {}),
        }),
      );
    }),
  );

  // The show list: the show being worked on, then the others, newest first.
  router.get(
    '/shows',
    asyncHandler(async (_req, res) => {
      const current = projectService.get();
      res.json({
        current: summariseShow(current, null),
        shows: (await shows.list()).filter((show) => show.id !== current.id),
      });
    }),
  );

  router.post(
    '/shows/:id/open',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      if (id === projectService.get().id) {
        res.json(projectService.get());
        return;
      }
      const opened = await takeTheStage(await shows.read(id));
      await shows.remove(id);
      res.json(opened);
    }),
  );

  router.post(
    '/shows/new',
    validateBody(showNameSchema),
    asyncHandler(async (req, res) => {
      res.json(await takeTheStage({ ...createEmptyProject(), name: req.body.name }));
    }),
  );

  // Keeps the show as it is now in the list, and carries on in a copy under the new name.
  router.post(
    '/shows/save-as',
    validateBody(showNameSchema),
    asyncHandler(async (req, res) => {
      res.json(await takeTheStage({ ...projectService.get(), id: randomUUID(), name: req.body.name }));
    }),
  );

  router.delete(
    '/shows/:id',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      if (id === projectService.get().id) {
        throw httpError(409, 'Open another show before deleting this one.');
      }
      await shows.remove(id);
      res.json({ ok: true });
    }),
  );

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

  // Opens an uploaded show file of any supported version (older files are migrated). The show being worked on moves to
  // the show list, and the imported one gets an id of its own, so importing the same file twice keeps both.
  router.post(
    '/project/import',
    asyncHandler(async (req, res) => {
      const parsed = projectSchema.safeParse(migrateProject(req.body));
      if (!parsed.success) {
        throw httpError(400, 'That file is not a valid Open DMX Stage show.');
      }
      res.json(await takeTheStage({ ...parsed.data, id: randomUUID() }, { replaceNewerShow: true }));
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
