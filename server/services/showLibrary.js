// Saved shows: one JSON file each, named by the show's id, in a `shows` folder beside project.json, with folders inside
// it that the person makes ("Clubs/Montreal"). The show being worked on lives in project.json (see ProjectService) and
// saves itself; File > Save puts a copy in the list, in a folder, and opening another show saves the one being worked
// on back to its place in the list first. Files are written atomically and read through the migrations; a file that
// cannot be read is listed as such and never overwritten. Folder names are checked so a path can never leave `shows`.
import { mkdir, readdir, readFile, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { logger } from '../logger.js';
import { projectSchema } from '../schemas/projectSchema.js';
import { httpError } from '../utils/httpError.js';
import { migrateProject } from './projectMigrations.js';

const log = logger.child({ module: 'shows' });

/** Show ids become file names, so only these characters are allowed. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A folder name: letters (any language), digits, spaces and a few marks; never starting with a dot. */
const SAFE_FOLDER = /^[\p{L}\p{N}][\p{L}\p{N} _'&().,-]{0,59}$/u;
const MAX_FOLDER_DEPTH = 5;

/** @typedef {import('../../shared/types.js').Project} Project */

/**
 * What the show list shows about a show, without its contents.
 * @typedef {{ id: string, name: string, folder: string, savedAt: string | null, venue: string, venues: number,
 *   lights: number, looks: number, sequences: number, unreadable?: boolean }} ShowSummary
 */

/**
 * @param {Project} project
 * @param {{ folder?: string, savedAt?: string | null }} [where]
 * @returns {ShowSummary}
 */
export function summariseShow(project, { folder = '', savedAt = null } = {}) {
  return {
    id: project.id,
    name: project.name,
    folder,
    savedAt,
    venue: project.venue?.name ?? 'My venue',
    venues: 1 + (project.venues?.length ?? 0),
    lights: project.fixtures.length,
    looks: project.scenes.length,
    sequences: project.chases.length,
  };
}

/** @param {Project} project @returns {boolean} true for a blank show never given a name: nothing worth keeping */
export const isEmptyShow = (project) =>
  project.name === 'Untitled show' &&
  project.fixtures.length === 0 &&
  project.scenes.length === 0 &&
  project.chases.length === 0 &&
  (project.venues?.length ?? 0) === 0;

/**
 * Checks a folder path from a page ("Clubs/Montreal", or "" for the top) and returns it tidied.
 * @param {unknown} folder
 * @returns {string}
 * @throws {Error & { status: number }} 400 for anything that is not a plain folder path
 */
export function checkFolder(folder) {
  if (folder === undefined || folder === null || folder === '') {
    return '';
  }
  if (typeof folder !== 'string') {
    throw httpError(400, 'That is not a folder.');
  }
  const parts = folder
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > MAX_FOLDER_DEPTH || parts.some((part) => !SAFE_FOLDER.test(part))) {
    throw httpError(
      400,
      `Folder names can use letters, digits, spaces and - _ ' & ( ) . , (up to 60 characters), up to ${MAX_FOLDER_DEPTH} folders deep.`,
    );
  }
  return parts.join('/');
}

export class ShowLibrary {
  /** @param {{ dataDir: string }} options */
  constructor({ dataDir }) {
    this.dir = path.join(dataDir, 'shows');
  }

  /** @param {string} folder already checked */
  dirOf(folder) {
    return folder ? path.join(this.dir, ...folder.split('/')) : this.dir;
  }

  /** @param {string} id */
  static checkId(id) {
    if (!SAFE_ID.test(id)) {
      throw httpError(400, 'That is not a show id.');
    }
  }

  /**
   * Every folder and show file, walking the folders.
   * @returns {Promise<{ folders: string[], files: { id: string, folder: string, file: string }[] }>}
   */
  async scan() {
    /** @type {string[]} */
    const folders = [];
    /** @type {{ id: string, folder: string, file: string }[]} */
    const files = [];
    /** @param {string} folder @param {number} depth */
    const walk = async (folder, depth) => {
      let entries;
      try {
        entries = await readdir(this.dirOf(folder), { withFileTypes: true });
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
          return;
        }
        throw error;
      }
      for (const entry of entries) {
        if (entry.isDirectory() && depth < MAX_FOLDER_DEPTH && SAFE_FOLDER.test(entry.name)) {
          const child = folder ? `${folder}/${entry.name}` : entry.name;
          folders.push(child);
          await walk(child, depth + 1);
        } else if (entry.isFile() && entry.name.endsWith('.json') && SAFE_ID.test(entry.name.slice(0, -5))) {
          files.push({ id: entry.name.slice(0, -5), folder, file: path.join(this.dirOf(folder), entry.name) });
        }
      }
    };
    await walk('', 0);
    return { folders: folders.sort((a, b) => a.localeCompare(b)), files };
  }

  /** @returns {Promise<{ folders: string[], shows: ShowSummary[] }>} shows newest first */
  async list() {
    const { folders, files } = await this.scan();
    const shows = await Promise.all(
      files.map(async ({ id, folder, file }) => {
        const savedAt = (await stat(file)).mtime.toISOString();
        try {
          return summariseShow(await this.readFile(file, id), { folder, savedAt });
        } catch (error) {
          log.warn({ err: error, file }, 'A saved show could not be read');
          return {
            id,
            name: id,
            folder,
            savedAt,
            venue: '',
            venues: 0,
            lights: 0,
            looks: 0,
            sequences: 0,
            unreadable: true,
          };
        }
      }),
    );
    return { folders, shows: shows.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))) };
  }

  /** @param {string} id @returns {Promise<{ folder: string, file: string } | null>} where a show is saved */
  async find(id) {
    ShowLibrary.checkId(id);
    const { files } = await this.scan();
    return files.find((entry) => entry.id === id) ?? null;
  }

  /**
   * @param {string} file
   * @param {string} id the file's name, trusted over the contents so a hand-copied file cannot clash with another
   * @returns {Promise<Project>}
   */
  async readFile(file, id) {
    let parsed;
    try {
      parsed = projectSchema.safeParse(migrateProject(JSON.parse(await readFile(file, 'utf8'))));
    } catch {
      parsed = { success: false };
    }
    if (!parsed.success || !('data' in parsed)) {
      throw httpError(400, 'That show file cannot be read.');
    }
    return /** @type {Project} */ ({ ...parsed.data, id });
  }

  /**
   * @param {string} id
   * @returns {Promise<Project>} at the current format
   * @throws {Error & { status: number }} 404 when there is no such show, 400 when it cannot be read
   */
  async read(id) {
    const found = await this.find(id);
    if (!found) {
      throw httpError(404, 'That show is no longer in the list.');
    }
    return this.readFile(found.file, id);
  }

  /**
   * Saves a show in a folder, moving it there if it was saved elsewhere.
   * @param {Project} project
   * @param {string} [folder] checked; when left out, where it is already saved, or the top
   * @returns {Promise<string>} the folder it is saved in
   */
  async write(project, folder) {
    ShowLibrary.checkId(project.id);
    const existing = await this.find(project.id);
    const target = folder ?? existing?.folder ?? '';
    const dir = this.dirOf(target);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${project.id}.json`);
    const temp = `${file}.tmp`;
    await writeFile(temp, JSON.stringify(project, null, 2), 'utf8');
    await rename(temp, file);
    if (existing && existing.file !== file) {
      await rm(existing.file, { force: true });
    }
    return target;
  }

  /** @param {string} id */
  async remove(id) {
    const found = await this.find(id);
    if (found) {
      await rm(found.file, { force: true });
    }
  }

  /** @param {string} folder checked */
  async createFolder(folder) {
    if (!folder) {
      throw httpError(400, 'Give the folder a name.');
    }
    await mkdir(this.dirOf(folder), { recursive: true });
  }

  /**
   * Removes an empty folder; one with shows or folders in it is refused.
   * @param {string} folder checked
   */
  async removeFolder(folder) {
    if (!folder) {
      throw httpError(400, 'The top of the list cannot be removed.');
    }
    try {
      await rmdir(this.dirOf(folder));
    } catch (error) {
      const code = /** @type {NodeJS.ErrnoException} */ (error).code;
      if (code === 'ENOTEMPTY' || code === 'EEXIST') {
        throw httpError(409, 'Only an empty folder can be removed. Move or delete its shows first.');
      }
      if (code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }
}
