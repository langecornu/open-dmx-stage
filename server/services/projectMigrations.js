// Upgrades saved shows to the current format, one version at a time, so a format change never breaks a user's work
// (ADR 0006). Every change to the show format bumps CURRENT_SCHEMA_VERSION and adds a migration here, plus a test that
// loads an old file.
import { randomUUID } from 'node:crypto';

import { CURRENT_SCHEMA_VERSION } from '../schemas/projectSchema.js';
import { httpError } from '../utils/httpError.js';

/** Error code for a show file written by a newer version of the app than this one. */
export const SHOW_FROM_NEWER_VERSION = 'SHOW_FROM_NEWER_VERSION';

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

/**
 * Version 3 adds fixture groups, and lets a sequence keep its timing in beats. Existing sequences stay in seconds; their
 * beat values are the same durations at 120 beats per minute, so switching to beats starts from familiar numbers.
 * @param {Record<string, any>} project
 * @returns {Record<string, any>}
 */
function addGroupsAndBeatTiming(project) {
  const toBeats = (/** @type {unknown} */ ms) => Math.min(64, Math.round((Number(ms) / 500) * 4) / 4) || 0;
  const chases = Array.isArray(project.chases) ? project.chases : [];
  return {
    ...project,
    groups: Array.isArray(project.groups) ? project.groups : [],
    chases: chases.map((/** @type {Record<string, any>} */ chase) => ({
      ...chase,
      timing: 'seconds',
      steps: (Array.isArray(chase.steps) ? chase.steps : []).map((/** @type {Record<string, any>} */ step) => ({
        ...step,
        fadeBeats: toBeats(step.fadeMs),
        holdBeats: toBeats(step.holdMs),
      })),
    })),
  };
}

/**
 * Version 4 adds timelines (one lane per light, blocks drawn on a grid of beats). Existing shows start with none.
 * @param {Record<string, any>} project
 * @returns {Record<string, any>}
 */
function addTimelines(project) {
  return { ...project, timelines: Array.isArray(project.timelines) ? project.timelines : [] };
}

/**
 * Version 5 makes a sequence one thing that can be edited as steps or on a timeline: a chain of looks (its steps) and
 * free blocks per light drawn over them. Each version 4 timeline becomes a sequence with no steps, its blocks, its
 * length, following the tempo and looping, as it played before. It also adds channel types for everything DMX fixtures
 * do (pan fine, zoom, gobo rotation, fog and more), value ranges on channels (capabilities), settings on blocks, and a
 * device category on fixtures and lights.
 * @param {Record<string, any>} project
 * @returns {Record<string, any>}
 */
export function mergeTimelinesIntoSequences(project) {
  const timelines = Array.isArray(project.timelines) ? project.timelines : [];
  const chases = Array.isArray(project.chases) ? project.chases : [];
  const fromTimelines = timelines.map((/** @type {Record<string, any>} */ timeline) => ({
    id: timeline.id,
    name: timeline.name,
    loop: true,
    timing: 'beats',
    steps: [],
    blocks: Array.isArray(timeline.blocks) ? timeline.blocks : [],
    length: timeline.beats,
  }));
  const rest = { ...project };
  delete rest.timelines;
  return {
    ...rest,
    chases: [
      ...chases.map((/** @type {Record<string, any>} */ chase) => ({
        ...chase,
        blocks: Array.isArray(chase.blocks) ? chase.blocks : [],
      })),
      ...fromTimelines,
    ],
  };
}

/** Ordered migrations: each takes a project at version `from` and returns one at version `to`. */
const MIGRATIONS = [
  { from: 1, to: 2, up: addChaseStepIds },
  { from: 2, to: 3, up: addGroupsAndBeatTiming },
  { from: 3, to: 4, up: addTimelines },
  { from: 4, to: 5, up: mergeTimelinesIntoSequences },
];

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
    throw Object.assign(
      httpError(400, 'That show was saved by a newer version of Open DMX Stage. Please update the app.'),
      { code: SHOW_FROM_NEWER_VERSION },
    );
  }
  for (const migration of MIGRATIONS) {
    if (migration.from === version) {
      project = migration.up(project);
      version = migration.to;
    }
  }
  return { ...project, schemaVersion: version };
}
