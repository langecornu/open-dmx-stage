// Tests for the starter show in docs/examples: it must load, and it must be safe to play on the real lights.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { projectSchema } from '../../server/schemas/projectSchema.js';
import { BUILTIN_FIXTURE_TYPES } from '../../server/services/fixtureLibrary.js';
import { migrateProject } from '../../server/services/projectMigrations.js';
import { buildPatch, restingValuesOf } from '../../shared/patch.js';

const raw = JSON.parse(await readFile(new URL('../../docs/examples/my-rig.json', import.meta.url), 'utf8'));
const project = projectSchema.parse(migrateProject(raw));
const patch = buildPatch(project, BUILTIN_FIXTURE_TYPES);

describe('docs/examples/my-rig.json', () => {
  it('is a valid show at the current version', () => {
    assert.equal(project.schemaVersion, 3, 'current schema version');
    assert.equal(project.fixtures.length, 3, 'two pars and a moving head');
  });

  it('patches every light with no overlap, no overrun and a known fixture type', () => {
    for (const range of patch.fixtures) {
      assert.equal(range.missingType, undefined, `${range.id} has a known type`);
      assert.equal(range.outOfRange, false, `${range.id} fits in the universe`);
      assert.deepEqual(range.overlaps, [], `${range.id} overlaps nothing`);
    }
  });

  it('only sets channels that belong to a patched light', () => {
    for (const scene of project.scenes) {
      for (const channel of Object.keys(scene.values)) {
        assert.ok(patch.channels.has(Number(channel)), `${scene.name}: channel ${channel} is patched`);
      }
    }
  });

  it('never moves a reset, program or automatic-mode channel, so no light can reset or leave manual mode', () => {
    for (const scene of project.scenes) {
      for (const [channel, value] of Object.entries(scene.values)) {
        const name = patch.channels.get(Number(channel))?.channelName ?? '';
        if (/reset|keep at 0|automatic mode|programs/i.test(name)) {
          assert.equal(value, 0, `${scene.name} leaves "${name}" at 0`);
        }
      }
    }
  });

  it('keeps the moving head centred in every look, because a look not mentioning pan and tilt sends them to 0 (a corner)', () => {
    const head = patch.fixtures.find((range) => range.id === 'head');
    for (const scene of project.scenes) {
      assert.equal(scene.values[head.start], 128, `${scene.name}: pan is centred`);
      assert.equal(scene.values[head.start + 2], 128, `${scene.name}: tilt is centred`);
    }
  });

  it('refers only to looks, lights and groups that exist', () => {
    const lookIds = new Set(project.scenes.map((scene) => scene.id));
    const fixtureIds = new Set(project.fixtures.map((fixture) => fixture.id));
    for (const chase of project.chases) {
      assert.ok(chase.steps.length > 0, `${chase.name} has steps`);
      for (const step of chase.steps) {
        assert.ok(lookIds.has(step.sceneId), `${chase.name} uses a look that exists`);
      }
    }
    for (const group of project.groups) {
      assert.ok(
        group.fixtureIds.every((id) => fixtureIds.has(id)),
        `${group.name} has only lights that exist`,
      );
    }
  });

  it('rests the moving head at the centre with the dimmer open, so connecting does not send it into a corner', () => {
    const resting = restingValuesOf(patch);
    const head = patch.fixtures.find((range) => range.id === 'head');
    assert.equal(resting.get(head.start), 128, 'pan');
    assert.equal(resting.get(head.start + 2), 128, 'tilt');
    assert.equal(resting.get(head.start + 5), 255, 'dimmer');
  });
});
