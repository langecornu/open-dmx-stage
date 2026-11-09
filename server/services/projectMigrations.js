// Upgrades saved shows to the current format, one version at a time, so a format change never breaks a user's work
// (ADR 0006). Every change to the show format bumps CURRENT_SCHEMA_VERSION and adds a migration here, plus a test that
// loads an old file.
import { randomUUID } from 'node:crypto';

import { CURRENT_SCHEMA_VERSION } from '../schemas/projectSchema.js';
import { httpError } from '../utils/httpError.js';

/**
 * Version 1 (no `schemaVersion` field) had chase steps without ids. Version 2 gives each step a stable id, which the
 * editor uses to keep rows steady when steps are reordered.
 * @param {Record<string, any>} project
 * @returns {Record<string, any>}
 */
function addChaseStepIds(project) {
  const chases = Array.isArray(project.chases) ? project.chases : [];
  return {
    ...project,
    chases: chases.map((/** @type {Record<string, any>} */ chase) => ({
      ...chase,
      steps: (Array.isArray(chase.steps) ? chase.steps : []).map((/** @type {Record<string, any>} */ step) => ({
        ...step,
        id: typeof step.id === 'string' && step.id !== '' ? step.id : randomUUID(),
      })),
    })),
  };
}

/** Ordered migrations: each takes a project at version `from` and returns one at version `to`. */
const MIGRATIONS = [{ from: 1, to: 2, up: addChaseStepIds }];

/**
 * @param {unknown} raw a parsed show file of any supported version
 * @returns {Record<string, unknown>} the same show at CURRENT_SCHEMA_VERSION; the input is not modified
 * @throws {Error & { status: number }} 400 when the file is not a show, or was saved by a newer version of the app
 */
export function migrateProject(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw httpError(400, 'That file is not an Open DMX Stage show.');
  }
  let project = /** @type {Record<string, any>} */ (structuredClone(raw));
  let version = Number.isInteger(project.schemaVersion) ? Number(project.schemaVersion) : 1;
  if (version > CURRENT_SCHEMA_VERSION) {
    throw httpError(400, 'That show was saved by a newer version of Open DMX Stage. Please update the app.');
  }
  for (const migration of MIGRATIONS) {
    if (migration.from === version) {
      project = migration.up(project);
      version = migration.to;
    }
  }
  return { ...project, schemaVersion: version };
}
