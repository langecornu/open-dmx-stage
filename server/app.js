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

/**
 * @param {{
 *   config: { allowedOrigins: string[], distDir: string },
 *   engine: import('./services/dmxEngine.js').DmxEngine,
 *   projectService: import('./services/projectService.js').ProjectService,
 *   outputManager: import('./services/outputManager.js').OutputManager,
 * }} options
 * @returns {import('express').Express}
 */
export function createApp({ config, engine, projectService, outputManager }) {
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
        },
      },
    }),
  );
  app.use(cors({ origin: config.allowedOrigins }));
  app.use(express.json({ limit: '1mb' }));

  // Liveness and readiness: unauthenticated and free of detail beyond the output driver name and state.
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', (_req, res) => {
    const output = outputManager.getStatus();
    res.json({ status: 'ready', output: { driver: output.driver, connected: output.connected } });
  });

  app.use('/api/v1', rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/v1', createApiRouter({ engine, projectService, outputManager }));

  if (existsSync(config.distDir)) {
    app.use(express.static(config.distDir));
    app.get('*', (_req, res) => res.sendFile(path.join(config.distDir, 'index.html')));
  }

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
