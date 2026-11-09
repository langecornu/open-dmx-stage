// Persists the single show as JSON. Loading upgrades old files through the migrations; saving writes atomically (temp
// file then rename) and keeps a rolling backup of the previous save. A saved file that cannot be read is moved aside,
// never overwritten, so the user's work is not lost.
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { logger } from '../logger.js';
import { createEmptyProject, projectSchema } from '../schemas/projectSchema.js';
import { migrateProject } from './projectMigrations.js';

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
   * @returns {Promise<Project>}
   */
  async save(project) {
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
