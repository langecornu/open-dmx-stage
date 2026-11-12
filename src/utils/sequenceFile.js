// One sequence as a file of its own, to keep, share, or take to another show or venue. The file holds the sequence, the
// looks its steps use, and the lights it refers to. Importing matches those lights to the rig at hand (by name, else by
// the same fixture type and mode in rig order) and moves every look value and block onto the matched lights' addresses,
// so a sequence made for one venue plays at another where the lights sit on other channels. Pure, so the rules are
// easy to test.
import { matchLights } from '../../shared/lightMatch.js';

export const SEQUENCE_FILE_FORMAT = 'open-dmx-stage.sequence';

/** Bump when the file changes shape, and keep reading older files. */
export const CURRENT_SEQUENCE_FILE_VERSION = 1;

/**
 * @param {{ fixtures: object[], scenes: object[] }} project
 * @param {{ steps: { sceneId: string }[], blocks?: { fixtureId: string }[] }} sequence
 * @param {import('../../shared/types.js').Patch} patch
 * @returns {object} the file's contents
 */
export function exportSequence(project, sequence, patch) {
  const lookIds = new Set(sequence.steps.map((step) => step.sceneId));
  const looks = project.scenes.filter((scene) => lookIds.has(scene.id));
  // The lights the file needs: those with blocks, and those whose channels the looks set.
  const used = new Set((sequence.blocks ?? []).map((block) => block.fixtureId));
  for (const look of looks) {
    for (const key of Object.keys(look.values)) {
      const channel = patch.channels.get(Number(key));
      if (channel) {
        used.add(channel.fixtureId);
      }
    }
  }
  return {
    format: SEQUENCE_FILE_FORMAT,
    version: CURRENT_SEQUENCE_FILE_VERSION,
    sequence,
    looks,
    // Each light with how many channels it uses, so its look values can be moved to another address on import.
    lights: project.fixtures
      .filter((fixture) => used.has(fixture.id))
      .map(({ id, name, typeId, mode, address, category }) => {
        const range = patch.fixtures.find((entry) => entry.id === id);
        const channels = range && !range.missingType ? range.end - range.start + 1 : 1;
        return { id, name, typeId, mode, address, channels, ...(category ? { category } : {}) };
      }),
  };
}

/**
 * @param {unknown} file parsed JSON
 * @returns {string | null} why it cannot be imported, or null when it looks like a sequence file
 */
export function checkSequenceFile(file) {
  if (!file || typeof file !== 'object' || /** @type {any} */ (file).format !== SEQUENCE_FILE_FORMAT) {
    return 'This is not an Open DMX Stage sequence file.';
  }
  const { version, sequence, looks, lights } = /** @type {any} */ (file);
  if (typeof version !== 'number' || version > CURRENT_SEQUENCE_FILE_VERSION) {
    return 'This sequence was saved by a newer version of Open DMX Stage. Please update the app.';
  }
  if (!sequence || !Array.isArray(sequence.steps) || !Array.isArray(looks) || !Array.isArray(lights)) {
    return 'The sequence file is incomplete.';
  }
  return null;
}

/**
 * Adds a sequence file to a show. Returns the new show and what could not be brought over.
 * @param {{ fixtures: any[], scenes: any[], chases: any[] }} project
 * @param {any} file a checked sequence file
 * @param {() => string} makeId
 * @returns {{ project: any, sequenceId: string, report: { unmatched: string[], droppedBlocks: number, newLooks: number, reusedLooks: number } }}
 */
export function importSequence(project, file, makeId) {
  const matches = matchLights(file.lights, project.fixtures);
  const fileLights = new Map(file.lights.map((light) => [light.id, light]));
  // A look value at a channel of a file light moves by the difference between the two lights' addresses.
  const moveChannel = (channel) => {
    for (const [lightId, target] of matches) {
      const light = fileLights.get(lightId);
      const offset = channel - light.address;
      if (offset >= 0 && offset < Math.max(1, Number(light.channels) || 1)) {
        return target.address + offset;
      }
    }
    return null;
  };

  let newLooks = 0;
  let reusedLooks = 0;
  /** @type {Map<string, string>} the file's look id to the show's */
  const lookIds = new Map();
  const scenes = [...project.scenes];
  for (const look of file.looks) {
    const values = {};
    for (const [key, value] of Object.entries(look.values ?? {})) {
      const channel = moveChannel(Number(key));
      if (channel !== null && channel >= 1 && channel <= 512) {
        values[channel] = value;
      }
    }
    const same = scenes.find((scene) => sameValues(scene.values, values));
    if (same) {
      lookIds.set(look.id, same.id);
      reusedLooks += 1;
      continue;
    }
    const taken = new Set(scenes.map((scene) => scene.name));
    const name = taken.has(look.name) ? `${look.name} (imported)` : look.name;
    const id = makeId();
    scenes.push({ id, name: String(name).slice(0, 80), values });
    lookIds.set(look.id, id);
    newLooks += 1;
  }

  const blocks = [];
  let droppedBlocks = 0;
  for (const block of file.sequence.blocks ?? []) {
    const target = matches.get(block.fixtureId);
    if (target) {
      blocks.push({ ...block, id: makeId(), fixtureId: target.id });
    } else {
      droppedBlocks += 1;
    }
  }
  const takenNames = new Set(project.chases.map((chase) => chase.name));
  const sequenceId = makeId();
  const sequence = {
    ...file.sequence,
    id: sequenceId,
    name: takenNames.has(file.sequence.name) ? `${file.sequence.name} (imported)` : file.sequence.name,
    steps: file.sequence.steps
      .filter((step) => lookIds.has(step.sceneId))
      .map((step) => ({ ...step, id: makeId(), sceneId: lookIds.get(step.sceneId) })),
    blocks,
  };
  return {
    project: { ...project, scenes, chases: [...project.chases, sequence] },
    sequenceId,
    report: {
      unmatched: file.lights.filter((light) => !matches.has(light.id)).map((light) => light.name),
      droppedBlocks,
      newLooks,
      reusedLooks,
    },
  };
}

function sameValues(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every((key) => a[key] === b[key]);
}

/**
 * @param {{ fixtures: object[], scenes: object[] }} project
 * @param {{ name: string, steps: { sceneId: string }[], blocks?: { fixtureId: string }[] }} sequence
 * @param {import('../../shared/types.js').Patch} patch
 * @returns {{ name: string, text: string }} a file name and its contents
 */
export function sequenceDownload(project, sequence, patch) {
  const slug =
    sequence.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'sequence';
  return {
    name: `${slug}.sequence.json`,
    text: `${JSON.stringify(exportSequence(project, sequence, patch), null, 2)}\n`,
  };
}
