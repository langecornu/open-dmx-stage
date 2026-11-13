// HTTP API for the DMX output: its status, switching it (the output manager validates the settings and keeps the old
// driver if the new one fails), asking an adapter what it is, and the serial ports this computer has.
import { Router } from 'express';

import { listSerialPorts } from '../clients/serial.js';
import { validateBody } from '../middleware/validate.js';
import { detectAdapterSchema } from '../schemas/projectSchema.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';

/**
 * @param {{ outputManager: import('../services/outputManager.js').OutputManager }} options
 * @returns {import('express').Router}
 */
export function createOutputRouter({ outputManager }) {
  const router = Router();

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
        // The native serial module is optional; without it, say what to use instead.
        throw httpError(
          503,
          'Serial support is not available on this computer. Use Art-Net or sACN, or the simulator.',
        );
      }
    }),
  );

  return router;
}
