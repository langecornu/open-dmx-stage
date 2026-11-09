// Persists the single project document as JSON with atomic writes (temp file then rename).
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createEmptyProject, projectSchema } from '../schemas/projectSchema.js';

export class ProjectService {
  constructor({ dataDir }) {
    this.filePath = path.join(dataDir, 'project.json');
    this.project = createEmptyProject();
    this.writeQueue = Promise.resolve();
  }

  async load() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.project = projectSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('[project] Could not read saved project, starting empty:', error.message);
      }
      this.project = createEmptyProject();
    }
    return this.project;
  }

  get() {
    return this.project;
  }

  async save(project) {
    this.project = project;
    const write = async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.tmp`;
      await writeFile(tempPath, JSON.stringify(project, null, 2), 'utf8');
      await rename(tempPath, this.filePath);
    };
    this.writeQueue = this.writeQueue.then(write, write);
    await this.writeQueue;
    return project;
  }
}
