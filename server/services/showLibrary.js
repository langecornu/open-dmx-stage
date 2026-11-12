// The user's other shows: one JSON file each in a `shows` folder beside project.json, named by the show's id. The show
// being worked on stays in project.json (see ProjectService); opening another swaps the two, so every show exists in
// exactly one place. Files are written atomically, read through the migrations, and a file that cannot be read is
// listed as such and never overwritten.
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { logger } from '../logger.js';
import { projectSchema } from '../schemas/projectSchema.js';
import { httpError } from '../utils/httpError.js';
import { migrateProject } from './projectMigrations.js';

const log = logger.child({ module: 'shows' });

/** Show ids become file names, so only these characters are allowed. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** @typedef {import('../../shared/types.js').Project} Project */

/**
 * What the show list shows about a show, without its contents.
 * @typedef {{ id: string, name: string, savedAt: string | null, lights: number, looks: number, sequences: number,
 *   venues: number, unreadable?: boolean }} ShowSummary
 */

/**
 * @param {Project} project
 * @param {string | null} savedAt
 * @returns {ShowSummary}
 */
export function summariseShow(project, savedAt) {
  return {
    id: project.id,
    name: project.name,
    savedAt,
    lights: project.fixtures.length,
    looks: project.scenes.length,
    sequences: project.chases.length,
    venues: 1 + (project.venues?.length ?? 0),
  };
}

/** @param {Project} project @returns {boolean} true for a blank show never given a name: nothing worth keeping */
export const isEmptyShow = (project) =>
  project.name === 'Untitled show' &&
  project.fixtures.length === 0 &&
  project.scenes.length === 0 &&
  project.chases.length === 0 &&
  (project.venues?.length ?? 0) === 0;

export class ShowLibrary {
  /** @param {{ dataDir: string }} options */
  constructor({ dataDir }) {
    this.dir = path.join(dataDir, 'shows');
  }

  /** @param {string} id */
  fileOf(id) {
    if (!SAFE_ID.test(id)) {
      throw httpError(400, 'That is not a show id.');
    }
    return path.join(this.dir, `${id}.json`);
  }

  /** @returns {Promise<ShowSummary[]>} newest first */
  async list() {
    let names;
    try {
      names = await readdir(this.dir);
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const shows = await Promise.all(
      names
        .filter((name) => name.endsWith('.json') && SAFE_ID.test(name.slice(0, -5)))
        .map(async (name) => {
          const id = name.slice(0, -5);
          const file = path.join(this.dir, name);
          const savedAt = (await stat(file)).mtime.toISOString();
          try {
            return summariseShow(await this.read(id), savedAt);
          } catch (error) {
            log.warn({ err: error, file }, 'A saved show could not be read');
            return { id, name, savedAt, lights: 0, looks: 0, sequences: 0, venues: 0, unreadable: true };
          }
        }),
    );
    return shows.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  }

  /**
   * @param {string} id
   * @returns {Promise<Project>} at the current format
   * @throws {Error & { status: number }} 404 when there is no such show, 400 when it cannot be read
   */
  async read(id) {
    let raw;
    try {
      raw = await readFile(this.fileOf(id), 'utf8');
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
        throw httpError(404, 'That show is no longer in the list.');
      }
      throw error;
    }
    let parsed;
    try {
      parsed = projectSchema.safeParse(migrateProject(JSON.parse(raw)));
    } catch {
      parsed = { success: false };
    }
    if (!parsed.success) {
      throw httpError(400, 'That show file cannot be read.');
    }
    // The file name is the id; trust it over the contents, so a hand-copied file cannot clash with another.
    return /** @type {Project} */ ({ ...parsed.data, id });
  }

  /** @param {Project} project */
  async write(project) {
    await mkdir(this.dir, { recursive: true });
    const file = this.fileOf(project.id);
    const temp = `${file}.tmp`;
    await writeFile(temp, JSON.stringify(project, null, 2), 'utf8');
    await rename(temp, file);
  }

  /** @param {string} id */
  async remove(id) {
    await rm(this.fileOf(id), { force: true });
  }
}
