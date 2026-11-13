// HTTP API under /api/v1: one router per area (show, fixtures, output, AI, music), plus the secure addresses for
// phones. Routes parse and validate; services do the work.
import { Router } from 'express';

import { AiKeyStore } from '../services/aiKeyStore.js';
import { MusicLibrary } from '../services/musicLibrary.js';
import { ShowLibrary } from '../services/showLibrary.js';
import { createStage } from '../services/stage.js';
import { createAiRouter } from './aiRoutes.js';
import { createFixtureRouter } from './fixtureRoutes.js';
import { createMusicRouter } from './musicRoutes.js';
import { createOutputRouter } from './outputRoutes.js';
import { createShowRouter } from './showRoutes.js';

/**
 * @param {{
 *   engine: import('../services/dmxEngine.js').DmxEngine,
 *   projectService: import('../services/projectService.js').ProjectService,
 *   outputManager: import('../services/outputManager.js').OutputManager,
 *   ofl?: ReturnType<typeof import('../clients/oflClient.js').createOflClient> | null,
 *   aiKeys?: AiKeyStore,
 *   aiClient?: (apiKey: string) => import('@anthropic-ai/sdk').default,
 *   network?: { httpsPort: number, fingerprint: string | null, validTo: string | null, addresses: string[] } | null,
 *   music?: MusicLibrary,
 * }} options `ofl` is null when online fixture search is turned off; `aiKeys`, `aiClient` and `music` replace the
 *   key store, the Anthropic client and the music library, for tests
 * @returns {import('express').Router}
 */
export function createApiRouter({
  engine,
  projectService,
  outputManager,
  ofl = null,
  aiKeys = new AiKeyStore({ dataDir: projectService.dataDir }),
  aiClient = undefined,
  network = null,
  music = new MusicLibrary({ dataDir: projectService.dataDir }),
}) {
  const router = Router();
  const shows = new ShowLibrary({ dataDir: projectService.dataDir });
  const stage = createStage({ engine, projectService, shows });

  // The secure (https) addresses for phones and tablets, and the certificate's fingerprint to check the warning by.
  router.get('/settings/network', (_req, res) => {
    res.json(
      network && network.httpsPort ? network : { httpsPort: 0, fingerprint: null, validTo: null, addresses: [] },
    );
  });

  router.use(createShowRouter({ projectService, shows, stage }));
  router.use(createFixtureRouter({ ofl }));
  router.use(createOutputRouter({ outputManager }));
  router.use(createAiRouter({ projectService, aiKeys, aiClient }));
  router.use(createMusicRouter({ music }));
  return router;
}
