// Builds the Express app (no listening) so tests can start it on an ephemeral port.
import { existsSync } from 'node:fs';
import path from 'node:path';

import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { errorHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { createApiRouter } from './routes/apiRoutes.js';

const SHOW_BODY_LIMIT = '8mb';

/**
 * @param {{
 *   config: { allowedOrigins: string[], distDir: string },
 *   engine: import('./services/dmxEngine.js').DmxEngine,
 *   projectService: import('./services/projectService.js').ProjectService,
 *   outputManager: import('./services/outputManager.js').OutputManager,
 *   ofl?: ReturnType<typeof import('./clients/oflClient.js').createOflClient> | null,
 *   aiKeys?: import('./services/aiKeyStore.js').AiKeyStore,
 *   aiClient?: (apiKey: string) => import('@anthropic-ai/sdk').default,
 *   network?: { httpsPort: number, fingerprint: string | null, validTo: string | null, addresses: string[] } | null,
 *   music?: import('./services/musicLibrary.js').MusicLibrary,
 * }} options `network`: the https address for phones (ADR 0009); live, so a port that failed to open shows as off `aiKeys` and `aiClient` replace the API key store and the Anthropic client, for tests
 * @returns {import('express').Express}
 */
export function createApp({
  config,
  engine,
  projectService,
  outputManager,
  ofl = null,
  aiKeys,
  aiClient,
  network = null,
  music,
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
          imgSrc: ["'self'", 'data:'],
          // The app is served over plain http on your own network (ADR 0008). Asking browsers to upgrade requests to
          // https would make a phone at this computer's address fetch the scripts over https, which nothing serves,
          // and show a blank page. Browsers only skip the upgrade for localhost.
          upgradeInsecureRequests: null,
        },
      },
      // Likewise, no Strict-Transport-Security: it would tell a browser to use only https for this address.
      strictTransportSecurity: false,
    }),
  );
  app.use(cors({ origin: config.allowedOrigins }));
  // A show can legitimately be a few megabytes (500 looks with 512 values each is about 2.4 MB), so the show routes get a
  // larger limit. It is mounted first: body-parser skips a body that is already parsed, so everything else keeps 1 MB.
  app.use('/api/v1/project', express.json({ limit: SHOW_BODY_LIMIT }));
  app.use(express.json({ limit: '1mb' }));

  // Liveness and readiness: unauthenticated and free of detail beyond the output driver name and state.
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', (_req, res) => {
    const output = outputManager.getStatus();
    res.json({ status: 'ready', output: { driver: output.driver, connected: output.connected } });
  });

  app.use('/api/v1', rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/v1', createApiRouter({ engine, projectService, outputManager, ofl, aiKeys, aiClient, network, music }));

  if (existsSync(config.distDir)) {
    app.use(express.static(config.distDir));
    app.get('*', (_req, res) => res.sendFile(path.join(config.distDir, 'index.html')));
  }

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
