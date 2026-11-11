// Tests for the Perform pads: a look and a sequence each get a description, and a sequence lists its step colours.
import { describe, expect, it } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { buildPerformItems } from '../../src/utils/performItems.js';
import { BUILTIN_TYPES } from './fixtures.js';

const step = (id, sceneId) => ({ id, sceneId, fadeMs: 0, holdMs: 1000, fadeBeats: 0, holdBeats: 1 });
const project = {
  schemaVersion: 3,
  name: 'Test',
  fixtureTypes: [],
  fixtures: [{ id: 'a', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1 }],
  scenes: [
    { id: 'red', name: 'Red', values: { 1: 255 } },
    { id: 'dark', name: 'Dark', values: {} },
  ],
  chases: [
    { id: 'loop', name: 'Loop', loop: true, timing: 'seconds', steps: [step('s1', 'red'), step('s2', 'dark')] },
    { id: 'once', name: 'Once', loop: false, timing: 'seconds', steps: [step('s3', 'red'), step('s4', 'gone')] },
  ],
  groups: [],
};
const items = buildPerformItems(project, buildPatch(project, BUILTIN_TYPES));
const item = (name) => items.find((entry) => entry.name === name);

describe('buildPerformItems', () => {
  it('describes a look plainly, with no step strip', () => {
    expect(item('Red')).toMatchObject({ kind: 'Look', detail: 'Look', steps: [] });
  });

  it('describes a sequence by its steps and whether it loops, with one colour per step', () => {
    const loop = item('Loop');
    expect(loop.detail).toBe('2 steps · loops');
    expect(loop.steps.map((entry) => entry.id)).toEqual(['s1', 's2']);
    expect(loop.steps[0].colour).toBe('rgb(255, 0, 0)');
    expect(loop.steps[1].colour).toBe('var(--surface-3)'); // a dark step shows as an empty segment
  });

  it('makes a pad for each timeline, as a sequence', () => {
    const withTimeline = {
      ...project,
      timelines: [{ id: 't1', name: 'Groove', beats: 4, blocks: [{ id: 'b', start: 0, color: '#ff0000' }] }],
    };
    const pad = buildPerformItems(withTimeline, buildPatch(withTimeline, BUILTIN_TYPES)).at(-1);
    expect(pad).toMatchObject({
      action: { type: 'timeline', id: 't1' },
      name: 'Groove',
      kind: 'Sequence',
      detail: 'Timeline · 1 bar · loops',
      gradient: '#ff0000',
    });
  });

  it('leaves out steps whose look was deleted, as the engine does, so the lit segment matches the stage', () => {
    const once = item('Once');
    expect(once.detail).toBe('1 step · plays once');
    expect(once.steps.map((entry) => entry.id)).toEqual(['s3']);
  });
});
