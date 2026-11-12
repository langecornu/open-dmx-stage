// Tests for a sequence as a file of its own: what goes in it, and how importing it matches its lights to another rig and
// moves its looks and blocks onto that rig's addresses.
import { describe, expect, it } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import {
  CURRENT_SEQUENCE_FILE_VERSION,
  SEQUENCE_FILE_FORMAT,
  checkSequenceFile,
  exportSequence,
  importSequence,
  matchLights,
  sequenceDownload,
} from '../../src/utils/sequenceFile.js';
import { BUILTIN_TYPES } from './fixtures.js';

const par = (id, name, address) => ({ id, name, typeId: 'generic-rgb-par', mode: 0, address });

const show = {
  fixtures: [par('p1', 'Par 1', 1), par('p2', 'Par 2', 4), par('p3', 'Par 3', 7)],
  scenes: [
    { id: 'red', name: 'Red', values: { 1: 255 } },
    { id: 'blue', name: 'Blue', values: { 6: 255 } },
    { id: 'unused', name: 'Unused', values: { 7: 255 } },
  ],
  chases: [],
  fixtureTypes: [],
};
const groove = {
  id: 'c1',
  name: 'Big Groove!',
  loop: true,
  timing: 'beats',
  steps: [
    { id: 'st1', sceneId: 'red', fadeMs: 0, holdMs: 1000 },
    { id: 'st2', sceneId: 'blue', fadeMs: 0, holdMs: 1000 },
  ],
  blocks: [{ id: 'b1', fixtureId: 'p3', start: 0, length: 4 }],
};
const patch = buildPatch(show, BUILTIN_TYPES);

describe('exportSequence', () => {
  it('holds the sequence, the looks its steps use, and only the lights it touches, with their channel counts', () => {
    const file = exportSequence(show, groove, patch);
    expect(file).toMatchObject({ format: SEQUENCE_FILE_FORMAT, version: CURRENT_SEQUENCE_FILE_VERSION });
    expect(file.sequence).toBe(groove);
    expect(file.looks.map((look) => look.id)).toEqual(['red', 'blue']);
    expect(file.lights).toEqual([
      { id: 'p1', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1, channels: 3 },
      { id: 'p2', name: 'Par 2', typeId: 'generic-rgb-par', mode: 0, address: 4, channels: 3 },
      { id: 'p3', name: 'Par 3', typeId: 'generic-rgb-par', mode: 0, address: 7, channels: 3 },
    ]);
  });

  it('names the download after the sequence', () => {
    const { name, text } = sequenceDownload(show, groove, patch);
    expect(name).toBe('big-groove.sequence.json');
    expect(JSON.parse(text).sequence.name).toBe('Big Groove!');
  });
});

describe('matchLights', () => {
  it('matches the same name and kind first, then the next light of the same kind in rig order', () => {
    const from = [par('a', 'Left', 1), par('b', 'Par 2', 4), { ...par('c', 'Head', 7), typeId: 'moving-head' }];
    const matches = matchLights(from, show.fixtures);
    expect(matches.get('b').id).toBe('p2');
    expect(matches.get('a').id).toBe('p1');
    expect(matches.has('c')).toBe(false);
  });
});

describe('checkSequenceFile', () => {
  const file = exportSequence(show, groove, patch);

  it('accepts a sequence file', () => {
    expect(checkSequenceFile(file)).toBeNull();
  });

  it('says why another file cannot be imported', () => {
    expect(checkSequenceFile({ format: 'open-dmx-stage.show' })).toMatch(/not an Open DMX Stage sequence/);
    expect(checkSequenceFile(null)).toMatch(/not an Open DMX Stage sequence/);
    expect(checkSequenceFile({ ...file, version: CURRENT_SEQUENCE_FILE_VERSION + 1 })).toMatch(/newer version/);
    expect(checkSequenceFile({ ...file, looks: undefined })).toMatch(/incomplete/);
  });
});

describe('importSequence', () => {
  let counter = 0;
  const makeId = () => `new-${(counter += 1)}`;

  it('moves looks and blocks onto the matching lights at this venue’s addresses', () => {
    // The same three pars, patched at 101, 104 and 107, and named differently.
    const venue = {
      fixtures: [par('v1', 'Stage L', 101), par('v2', 'Stage C', 104), par('v3', 'Stage R', 107)],
      scenes: [],
      chases: [],
    };
    const { project, sequenceId, report } = importSequence(venue, exportSequence(show, groove, patch), makeId);
    expect(project.scenes.map((scene) => [scene.name, scene.values])).toEqual([
      ['Red', { 101: 255 }],
      ['Blue', { 106: 255 }],
    ]);
    const imported = project.chases.find((chase) => chase.id === sequenceId);
    expect(imported.steps.map((step) => step.sceneId)).toEqual(project.scenes.map((scene) => scene.id));
    expect(imported.blocks).toEqual([expect.objectContaining({ fixtureId: 'v3', start: 0, length: 4 })]);
    expect(report).toEqual({ unmatched: [], droppedBlocks: 0, newLooks: 2, reusedLooks: 0 });
  });

  it('reuses a look the show already has, and renames a sequence whose name is taken', () => {
    const file = exportSequence(show, groove, patch);
    const { project, sequenceId, report } = importSequence({ ...show, chases: [groove] }, file, makeId);
    expect(report).toMatchObject({ newLooks: 0, reusedLooks: 2 });
    expect(project.scenes).toHaveLength(3);
    expect(project.chases.find((chase) => chase.id === sequenceId).name).toBe('Big Groove! (imported)');
  });

  it('leaves out what has no light to go to, and says so', () => {
    const small = { fixtures: [par('only', 'Par 1', 1)], scenes: [], chases: [] };
    const { project, sequenceId, report } = importSequence(small, exportSequence(show, groove, patch), makeId);
    expect(report).toMatchObject({ unmatched: ['Par 2', 'Par 3'], droppedBlocks: 1 });
    expect(project.chases.find((chase) => chase.id === sequenceId).blocks).toEqual([]);
    // Blue only set Par 2, so it arrives empty; Red still lights Par 1.
    expect(project.scenes.map((scene) => scene.values)).toEqual([{ 1: 255 }, {}]);
  });
});
