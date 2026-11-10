// Tests for resting values: the value a channel sits at when nothing sets it (a centred pan and tilt, an open dimmer).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MockDriver } from '../../server/clients/mockDriver.js';
import { DmxEngine } from '../../server/services/dmxEngine.js';
import { BUILTIN_FIXTURE_TYPES } from '../../server/services/fixtureLibrary.js';
import { buildPatch, restingValuesOf } from '../../shared/patch.js';

// A moving head at address 10: pan 10 (rests at 128), tilt 12 (128), dimmer 15 (255), red 17.
const HEAD = [{ id: 'h', name: 'Head', typeId: 'uking-40w-beam-moving-head', mode: 0, address: 10 }];
const patch = buildPatch({ fixtureTypes: [], fixtures: HEAD }, BUILTIN_FIXTURE_TYPES);

function createEngine() {
  const engine = new DmxEngine({ driver: new MockDriver(), now: () => 0 });
  engine.setRestingValues(restingValuesOf(patch));
  return engine;
}

describe('restingValuesOf', () => {
  it('lists only the channels that rest above 0, by channel number', () => {
    const resting = restingValuesOf(patch);
    assert.equal(resting.get(10), 128, 'pan rests at the centre');
    assert.equal(resting.get(12), 128, 'tilt rests at the centre');
    assert.equal(resting.get(15), 255, 'the dimmer rests open');
    assert.equal(resting.has(11), false, 'the fine pan channel rests at 0 and is left out');
    assert.equal(resting.has(17), false, 'red rests at 0 and is left out');
    assert.equal(resting.has(22), false, 'the reset channel rests at 0 and is left out');
  });
});

describe('the engine and resting values', () => {
  it('sits at the resting values before any look plays, so a moving head is centred and not in a corner', () => {
    const frame = createEngine().tick(0);
    assert.equal(frame[9], 128, 'pan');
    assert.equal(frame[11], 128, 'tilt');
    assert.equal(frame[14], 255, 'dimmer');
    assert.equal(frame[16], 0, 'red stays at 0');
  });

  it('keeps a channel a look does not mention at its resting value, instead of sending it to 0', () => {
    const engine = createEngine();
    engine.recallScene({ id: 'red', values: { 17: 255 } }, 0);
    const frame = engine.tick(0);
    assert.equal(frame[16], 255, 'the look is applied');
    assert.equal(frame[9], 128, 'pan stays centred');
    assert.equal(frame[11], 128, 'tilt stays centred');
    assert.equal(frame[14], 255, 'the dimmer stays open');
  });

  it('lets a look set a channel to 0 on purpose', () => {
    const engine = createEngine();
    engine.recallScene({ id: 'dark', values: { 15: 0, 10: 0 } }, 0);
    const frame = engine.tick(0);
    assert.equal(frame[14], 0, 'an explicit 0 is respected');
    assert.equal(frame[9], 0, 'so is a pan at 0');
    assert.equal(frame[11], 128, 'while tilt, not mentioned, rests');
  });

  it('fades towards the resting value for channels the next look does not mention', () => {
    const engine = createEngine();
    engine.recallScene({ id: 'left', values: { 10: 0 } }, 0);
    engine.recallScene({ id: 'next', values: { 17: 100 } }, 1000);
    assert.equal(engine.tick(500)[9], 64, 'halfway from 0 back to the centre');
    assert.equal(engine.tick(1000)[9], 128, 'it ends at rest');
  });

  it('uses the resting values in every step of a sequence', () => {
    const engine = createEngine();
    const scenes = new Map([['a', { id: 'a', values: { 17: 255 } }]]);
    engine.startChase(
      { id: 'c', loop: true, timing: 'seconds', steps: [{ sceneId: 'a', fadeMs: 0, holdMs: 100 }] },
      scenes,
    );
    const frame = engine.tick(0);
    assert.equal(frame[9], 128, 'pan is centred during the sequence');
    assert.equal(frame[16], 255, 'the step is applied');
  });

  it('does not disturb a look that is already playing when the resting values are set again', () => {
    const engine = createEngine();
    engine.recallScene({ id: 'a', values: { 10: 30 } }, 0);
    engine.setRestingValues(restingValuesOf(patch)); // for example the show was saved
    assert.equal(engine.tick(0)[9], 30, 'the look keeps its pan');
  });

  it('does not let blackout move a pan or tilt, only the brightness channels', () => {
    const engine = createEngine();
    engine.setLevelChannels(new Set([15, 17]));
    engine.setBlackout(true);
    const frame = engine.tick(0);
    assert.equal(frame[14], 0, 'the dimmer is blacked out');
    assert.equal(frame[9], 128, 'pan stays where it was');
    assert.equal(frame[11], 128, 'tilt stays where it was');
  });

  it('follows changed resting values when nothing is playing', () => {
    const engine = createEngine();
    engine.setRestingValues(new Map([[10, 200]]));
    assert.equal(engine.tick(0)[9], 200, 'the new value applies');
    assert.equal(engine.tick(0)[11], 0, 'a channel that no longer rests above 0 goes back to 0');
  });
});
