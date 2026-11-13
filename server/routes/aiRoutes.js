// HTTP API for AI shows: the Anthropic API key (write-only: no route ever returns it) and generating looks and
// sequences for the show being worked on. Each generation spends money on the person's key, so they are rate limited
// and run one at a time.
import { randomUUID } from 'node:crypto';

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { validateBody } from '../middleware/validate.js';
import { aiGenerateSchema, aiKeySchema } from '../schemas/projectSchema.js';
import { BUILTIN_FIXTURE_TYPES } from '../services/fixtureLibrary.js';
import { checkApiKey, generateShow } from '../services/showGenerator.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';

/**
 * @param {{
 *   projectService: import('../services/projectService.js').ProjectService,
 *   aiKeys: import('../services/aiKeyStore.js').AiKeyStore,
 *   aiClient?: (apiKey: string) => import('@anthropic-ai/sdk').default,
 * }} options `aiClient` replaces the Anthropic client, for tests
 * @returns {import('express').Router}
 */
export function createAiRouter({ projectService, aiKeys, aiClient }) {
  const router = Router();

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

  const aiLimiter = rateLimit({ windowMs: 60_000, limit: 6, standardHeaders: true, legacyHeaders: false });
  // Two devices pressing Generate together would pay twice for one show.
  let isGenerating = false;
  /** @type {import('express').RequestHandler} */
  const oneAtATime = (_req, _res, next) => {
    next(
      isGenerating ? httpError(409, 'A show is already being made. Wait for it to finish, then try again.') : undefined,
    );
  };
  router.post(
    '/ai/generate',
    oneAtATime,
    aiLimiter,
    validateBody(aiGenerateSchema),
    asyncHandler(async (req, res) => {
      const apiKey = await aiKeys.read();
      if (!apiKey) {
        throw httpError(400, 'Add your Anthropic API key in Settings first.');
      }
      isGenerating = true;
      try {
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
      } finally {
        isGenerating = false;
      }
    }),
  );

  return router;
}
