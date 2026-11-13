// HTTP API for the show: the one being worked on (load, save, export, import) and the show list under File (save into
// a folder, open, new, folders, delete). Parsing only; the stage and the show library do the work.
import { randomUUID } from 'node:crypto';

import { Router } from 'express';

import { validateBody } from '../middleware/validate.js';
import {
  createEmptyProject,
  projectSchema,
  showFolderSchema,
  showNameSchema,
  showSaveSchema,
} from '../schemas/projectSchema.js';
import { migrateProject } from '../services/projectMigrations.js';
import { ShowLibrary, checkFolder, summariseShow } from '../services/showLibrary.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';

/**
 * @param {{
 *   projectService: import('../services/projectService.js').ProjectService,
 *   shows: ShowLibrary,
 *   stage: ReturnType<typeof import('../services/stage.js').createStage>,
 * }} options
 * @returns {import('express').Router}
 */
export function createShowRouter({ projectService, shows, stage }) {
  const router = Router();

  // The saved shows in their folders, and the show being worked on (with where it is saved, if it is).
  router.get(
    '/shows',
    asyncHandler(async (_req, res) => {
      const current = projectService.get();
      const { folders, shows: saved } = await shows.list();
      const savedCopy = saved.find((show) => show.id === current.id);
      res.json({
        current: {
          ...summariseShow(current),
          folder: savedCopy ? savedCopy.folder : null,
          savedAt: savedCopy?.savedAt ?? null,
        },
        shows: saved,
        folders,
      });
    }),
  );

  // Save: names the show being worked on and puts it in the list, in a folder (moving it there if it was saved
  // elsewhere). It carries on saving itself as before.
  router.post(
    '/shows/save',
    validateBody(showSaveSchema),
    asyncHandler(async (req, res) => {
      const folder = checkFolder(req.body.folder);
      const renamed = await projectService.save({ ...projectService.get(), name: req.body.name });
      await shows.write(renamed, folder);
      res.json({ project: renamed, folder });
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
      res.json(await stage.takeTheStage(await shows.read(id)));
    }),
  );

  router.post(
    '/shows/new',
    validateBody(showNameSchema),
    asyncHandler(async (req, res) => {
      res.json(await stage.takeTheStage({ ...createEmptyProject(), name: req.body.name }));
    }),
  );

  router.post(
    '/shows/folders',
    validateBody(showFolderSchema),
    asyncHandler(async (req, res) => {
      await shows.createFolder(checkFolder(req.body.folder));
      res.json({ folders: (await shows.list()).folders });
    }),
  );

  router.delete(
    '/shows/folders',
    validateBody(showFolderSchema),
    asyncHandler(async (req, res) => {
      await shows.removeFolder(checkFolder(req.body.folder));
      res.json({ folders: (await shows.list()).folders });
    }),
  );

  router.delete(
    '/shows/:id',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      ShowLibrary.checkId(id);
      if (id === projectService.get().id) {
        throw httpError(409, 'This show is open. Open another show before deleting it from the list.');
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
      stage.sync(saved);
      res.json(saved);
    }),
  );

  // The show as a downloadable file. It is always at the current schema version, ready to import again.
  router.get('/project/export', (_req, res) => {
    res.attachment('open-dmx-stage-show.json');
    res.type('application/json').send(JSON.stringify(projectService.get(), null, 2));
  });

  // Opens an uploaded show file of any supported version (older files are migrated). The show being worked on is saved
  // to the list first, and the imported one gets an id of its own, so importing the same file twice keeps both.
  router.post(
    '/project/import',
    asyncHandler(async (req, res) => {
      const parsed = projectSchema.safeParse(migrateProject(req.body));
      if (!parsed.success) {
        throw httpError(400, 'That file is not a valid Open DMX Stage show.');
      }
      const opened = await stage.takeTheStage({ ...parsed.data, id: randomUUID() }, { replaceNewerShow: true });
      await shows.write(opened); // listed under File > Open, at the top
      res.json(opened);
    }),
  );

  return router;
}
