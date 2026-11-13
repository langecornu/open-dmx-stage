// HTTP API for the decks' music: a folder on this computer, listed and streamed to whichever device plays it, and each
// track's beat analysis. Parsing only; the library does the work (see ADR 0010).
import { Router } from 'express';

import { validateBody } from '../middleware/validate.js';
import { musicFolderSchema, trackAnalysisSchema } from '../schemas/projectSchema.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * @param {{ music: import('../services/musicLibrary.js').MusicLibrary }} options
 * @returns {import('express').Router}
 */
export function createMusicRouter({ music }) {
  const router = Router();

  router.get(
    '/music',
    asyncHandler(async (req, res) => {
      res.json(await music.list({ rescan: req.query.rescan === '1' }));
    }),
  );

  router.put(
    '/settings/music',
    validateBody(musicFolderSchema),
    asyncHandler(async (req, res) => {
      await music.setFolder(req.body.folder);
      res.json(await music.list({ rescan: true }));
    }),
  );

  // A track's audio, with ranges, so a deck can start playing at once and jump anywhere in it.
  router.get(
    '/music/tracks/:id/audio',
    asyncHandler(async (req, res) => {
      const { root, file, type } = await music.audio(String(req.params.id));
      res.type(type);
      res.sendFile(file, { root, dotfiles: 'deny', acceptRanges: true, maxAge: '1h' });
    }),
  );

  router.get(
    '/music/tracks/:id/analysis',
    asyncHandler(async (req, res) => {
      res.json({ analysis: await music.analysis(String(req.params.id)) });
    }),
  );

  router.put(
    '/music/tracks/:id/analysis',
    validateBody(trackAnalysisSchema),
    asyncHandler(async (req, res) => {
      await music.saveAnalysis(String(req.params.id), req.body);
      res.json({ ok: true });
    }),
  );

  return router;
}
