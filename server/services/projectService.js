// Persists the single show as JSON. Loading upgrades old files through the migrations; saving writes atomically (temp
// file then rename) and keeps a rolling backup of the previous save. A saved file that cannot be read is moved aside,
// never overwritten, so the user's work is not lost.
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { logger } from '../logger.js';
import { createEmptyProject, projectSchema } from '../schemas/projectSchema.js';
import { httpError } from '../utils/httpError.js';
import { migrateProject, SHOW_FROM_NEWER_VERSION } from './projectMigrations.js';

const log = logger.child({ module: 'project' });

/** @typedef {import('../../shared/types.js').Project} Project */

export class ProjectService {
  /** @param {{ dataDir: string }} options */
  constructor({ dataDir }) {
    this.filePath = path.join(dataDir, 'project.json');
    this.backupPath = `${this.filePath}.bak`;
    /** @type {Project} */
    this.project = createEmptyProject();
    this.writeQueue = Promise.resolve();
    /** @type {string | null} set when the saved show was written by a newer app, so we never overwrite it */
    this.lockedReason = null;
  }

  /** @returns {Promise<Project>} */
  async load() {
    let raw;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') {
        log.error({ err: error }, 'Could not read the saved show, starting empty');
      }
      this.project = createEmptyProject();
      return this.project;
    }
    try {
      this.project = projectSchema.parse(migrateProject(JSON.parse(raw)));
    } catch (error) {
      if (/** @type {{ code?: string }} */ (error).code === SHOW_FROM_NEWER_VERSION) {
        // Not corrupt, just newer: leave the file exactly where it is, start empty, and refuse to save over it.
        this.lockedReason = error instanceof Error ? error.message : String(error);
        log.error(
          { err: error },
          'The saved show is from a newer version; it is left untouched and saving is disabled',
        );
        this.project = createEmptyProject();
        return this.project;
      }
      // Keep the unreadable file next to the new one instead of letting the next save overwrite it.
      const asideName = `${this.filePath}.unreadable-${Date.now()}`;
      await rename(this.filePath, asideName).catch((renameError) => {
        log.error({ err: renameError }, 'Could not move the unreadable show aside');
      });
      log.error({ err: error, movedTo: asideName }, 'The saved show is not valid, starting empty');
      this.project = createEmptyProject();
    }
    return this.project;
  }

  /** @returns {Project} */
  get() {
    return this.project;
  }

  /**
   * @param {Project} project already validated by the caller
   * @param {{ replaceNewerShow?: boolean }} [options] an explicit import may replace a show from a newer version
   * @returns {Promise<Project>}
   * @throws {Error & { status: number }} 409 while the saved show is from a newer version and this is not an import
   */
  async save(project, { replaceNewerShow = false } = {}) {
    if (this.lockedReason && !replaceNewerShow) {
      throw httpError(409, this.lockedReason);
    }
    this.lockedReason = null;
    this.project = project;
    const write = async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      // Rolling backup: the previous save is kept as project.json.bak (best effort; there is none on the first save).
      await copyFile(this.filePath, this.backupPath).catch((error) => {
        if (error.code !== 'ENOENT') {
          log.warn({ err: error }, 'Could not update the show backup');
        }
      });
      const tempPath = `${this.filePath}.tmp`;
      await writeFile(tempPath, JSON.stringify(project, null, 2), 'utf8');
      await rename(tempPath, this.filePath);
    };
    this.writeQueue = this.writeQueue.then(write, write);
    await this.writeQueue;
    return project;
  }
}
