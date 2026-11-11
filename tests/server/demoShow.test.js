// Tests for the demo light show: the show file must be valid and safe for the two pars, and every message the routine
// sends must be one the live link accepts, referring only to looks, sequences and groups that exist.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { buildRoutine, routineSeconds } from '../../scripts/demo-show.js';
import { liveMessageSchema, projectSchema } from '../../server/schemas/projectSchema.js';
import { BUILTIN_FIXTURE_TYPES } from '../../server/services/fixtureLibrary.js';
import { migrateProject } from '../../server/services/projectMigrations.js';
import { buildPatch } from '../../shared/patch.js';

const raw = JSON.parse(await readFile(new URL('../../docs/examples/pars-demo-show.json', import.meta.url), 'utf8'));
const project = projectSchema.parse(migrateProject(raw));
const patch = buildPatch(project, BUILTIN_FIXTURE_TYPES);
const PROGRAM_AND_SPEED_CHANNELS = [6, 7, 13, 14]; // the pars' program and speed channels, never used by the demo
const STROBE_CHANNELS = [5, 12];

const allMessages = (acts) => acts.flatMap((act) => act.steps.flatMap((step) => step.messages));

describe('docs/examples/pars-demo-show.json', () => {
  it('is a valid show with two pars that do not overlap', () => {
    assert.equal(project.fixtures.length, 2, 'two pars');
    for (const range of patch.fixtures) {
      assert.equal(range.missingType, undefined, 'a known fixture type');
      assert.deepEqual(range.overlaps, [], 'no overlap');
      assert.equal(range.outOfRange, false, 'fits in the universe');
    }
  });

  it('has the looks, sequences and groups the routine plays', () => {
    assert.ok(project.scenes.length >= 10, 'plenty of looks');
    assert.deepEqual(
      project.chases.map((chase) => chase.timing).sort(),
      ['beats', 'beats', 'beats', 'seconds'],
      'sequences in both seconds and beats',
    );
    assert.equal(project.groups.length, 3, 'a group for each par and one for both');
  });

  it("only sets patched channels, and never the pars' program or speed channels", () => {
    for (const scene of project.scenes) {
      for (const [channel, value] of Object.entries(scene.values)) {
        assert.ok(patch.channels.has(Number(channel)), `${scene.name}: channel ${channel} is patched`);
        if (PROGRAM_AND_SPEED_CHANNELS.includes(Number(channel))) {
          assert.equal(value, 0, `${scene.name} leaves program and speed channel ${channel} at 0`);
        }
      }
    }
  });

  it('turns the dimmer on in every look except Dark, which sets it to 0 on purpose', () => {
    for (const scene of project.scenes) {
      const expected = scene.id === 'look-dark' ? 0 : 255;
      assert.equal(scene.values[1], expected, `${scene.name}: Par 1 dimmer`);
      assert.equal(scene.values[8], expected, `${scene.name}: Par 2 dimmer`);
    }
  });

  it('strobes only in the strobe looks, and never faster than the value tested on real lights', () => {
    for (const scene of project.scenes) {
      const strobes = STROBE_CHANNELS.map((channel) => scene.values[channel] ?? 0);
      if (/strobe/i.test(scene.name)) {
        assert.ok(
          strobes.every((rate) => rate > 0 && rate <= 220),
          `${scene.name} strobes at a rate that was tested`,
        );
      } else {
        assert.deepEqual(strobes, [0, 0], `${scene.name} does not strobe`);
      }
    }
  });

  it('has sequences that only use looks that exist', () => {
    const looks = new Set(project.scenes.map((scene) => scene.id));
    for (const chase of project.chases) {
      assert.ok(chase.steps.length >= 2, `${chase.name} has steps`);
      for (const step of chase.steps) {
        assert.ok(looks.has(step.sceneId), `${chase.name} uses a look that exists`);
      }
    }
  });
});

describe('the demo routine', () => {
  const looks = new Set(project.scenes.map((scene) => scene.id));
  const sequences = new Set(project.chases.map((chase) => chase.id));
  const groups = new Set(project.groups.map((group) => group.id));

  it('sends only messages the live link accepts', () => {
    for (const message of allMessages(buildRoutine())) {
      const result = liveMessageSchema.safeParse(message);
      assert.ok(result.success, `valid message: ${JSON.stringify(message)}`);
    }
  });

  it('refers only to looks, sequences and groups in the demo show', () => {
    for (const message of allMessages(buildRoutine())) {
      if (message.type === 'recall') {
        assert.ok(looks.has(message.sceneId), `look ${message.sceneId} exists`);
      }
      if (message.type === 'chaseStart') {
        assert.ok(sequences.has(message.chaseId), `sequence ${message.chaseId} exists`);
      }
      if (message.type === 'effectStart' && message.groupId !== null) {
        assert.ok(groups.has(message.groupId), `group ${message.groupId} exists`);
      }
    }
  });

  it('uses every kind of control: looks, sequences, tempo, all three effects, groups, master, blackout and manual faders', () => {
    const types = new Set(allMessages(buildRoutine()).map((message) => message.type));
    for (const type of [
      'recall',
      'chaseStart',
      'chaseStop',
      'tempo',
      'effectStart',
      'effectStop',
      'master',
      'blackout',
      'set',
      'clearProgrammer',
    ]) {
      assert.ok(types.has(type), `the routine uses ${type}`);
    }
    const effects = new Set(
      allMessages(buildRoutine())
        .filter((m) => m.type === 'effectStart')
        .map((m) => m.effect),
    );
    assert.deepEqual([...effects].sort(), ['pulse', 'rainbow', 'sweep'], 'all three effects');
  });

  it("never sets the pars' program or speed channels by hand", () => {
    for (const message of allMessages(buildRoutine())) {
      if (message.type === 'set') {
        for (const channel of PROGRAM_AND_SPEED_CHANNELS) {
          assert.equal(message.values[channel] ?? 0, 0, `channel ${channel} stays at 0`);
        }
      }
    }
  });

  it('keeps the flashing short, and leaves it all out with includeStrobe false', () => {
    const withStrobe = buildRoutine();
    const strobeSeconds = withStrobe.filter((act) => act.isStrobe).reduce((sum, act) => sum + routineSeconds([act]), 0);
    assert.ok(strobeSeconds > 0 && strobeSeconds <= 15, `flashing lasts ${strobeSeconds} s, at most 15`);
    const quiet = buildRoutine({ includeStrobe: false });
    assert.equal(
      quiet.some((act) => act.isStrobe),
      false,
      'no strobe acts',
    );
    for (const message of allMessages(quiet)) {
      assert.notEqual(message.chaseId, 'seq-strobe', 'the strobe sequence is not started');
      assert.notEqual(message.sceneId?.startsWith('look-strobe'), true, 'no strobe look is recalled');
      if (message.type === 'set') {
        for (const channel of STROBE_CHANNELS) {
          assert.equal(message.values[channel] ?? 0, 0, 'no manual strobe');
        }
      }
    }
  });

  it('lasts about two minutes and ends with the lights fading back to a calm look', () => {
    const acts = buildRoutine();
    const seconds = routineSeconds(acts);
    assert.ok(seconds > 90 && seconds < 180, `about two minutes (${seconds} s)`);
    const last = acts.at(-1).steps.at(-1).messages;
    assert.ok(
      last.some((message) => message.type === 'recall' && message.sceneId === 'look-warm'),
      'it ends on Warm glow',
    );
    assert.ok(
      allMessages(acts).some((message) => message.type === 'blackout' && message.enabled === false),
      'blackout is turned off again',
    );
  });
});
