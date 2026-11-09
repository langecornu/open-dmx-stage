// Tests for the lighting engine: layering, master/blackout, fades and chases (deterministic clock).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MockDriver } from '../server/clients/mockDriver.js';
import { DmxEngine } from '../server/services/dmxEngine.js';

function createEngine() {
  const driver = new MockDriver();
  const engine = new DmxEngine({ driver, now: () => 0 });
  return { driver, engine };
}

describe('DmxEngine', () => {
  it('outputs a recalled scene instantly when the fade is zero', () => {
    const { engine } = createEngine();
    engine.recallScene({ id: 's1', values: { 1: 200, 2: 100 } }, 0);
    const frame = engine.tick(0);
    assert.equal(frame[0], 200, 'channel 1 should hold the scene value');
    assert.equal(frame[1], 100, 'channel 2 should hold the scene value');
  });

  it('crossfades linearly between the old and new scene', () => {
    const { engine } = createEngine();
    engine.recallScene({ id: 'a', values: { 1: 0 } }, 0);
    engine.startFade({ 1: 200 }, 1000, 0);
    assert.equal(engine.tick(500)[0], 100, 'halfway through the fade the value is halfway');
    assert.equal(engine.tick(1000)[0], 200, 'at the end of the fade the value is the target');
  });

  it('lets the programmer override the scene layer', () => {
    const { engine } = createEngine();
    engine.recallScene({ id: 's1', values: { 1: 200 } }, 0);
    engine.setProgrammer({ 1: 50 });
    assert.equal(engine.tick(0)[0], 50, 'programmer value should win');
    engine.clearProgrammer();
    assert.equal(engine.tick(0)[0], 200, 'clearing the programmer restores the scene');
  });

  it('scales only level channels with the master and zeroes them on blackout', () => {
    const { engine } = createEngine();
    engine.setLevelChannels(new Set([1]));
    engine.recallScene({ id: 's1', values: { 1: 200, 2: 200 } }, 0);
    engine.setMaster(0.5);
    let frame = engine.tick(0);
    assert.equal(frame[0], 100, 'level channel is scaled by the master');
    assert.equal(frame[1], 200, 'non-level channel (e.g. pan) is untouched by the master');
    engine.setBlackout(true);
    frame = engine.tick(0);
    assert.equal(frame[0], 0, 'blackout zeroes level channels');
    assert.equal(frame[1], 200, 'blackout leaves position channels alone');
  });

  it('sends every composed frame to the driver', () => {
    const { driver, engine } = createEngine();
    engine.tick(0);
    engine.tick(10);
    assert.equal(driver.frameCount, 2, 'driver should receive one frame per tick');
    assert.equal(driver.lastFrame.length, 512, 'a DMX universe has 512 slots');
  });

  it('steps through a chase, loops, and stops when not looping', () => {
    const { engine } = createEngine();
    const scenes = new Map([
      ['a', { id: 'a', values: { 1: 255 } }],
      ['b', { id: 'b', values: { 1: 0 } }],
    ]);
    const chase = {
      id: 'c1',
      loop: false,
      steps: [
        { sceneId: 'a', fadeMs: 0, holdMs: 100 },
        { sceneId: 'b', fadeMs: 0, holdMs: 100 },
      ],
    };
    assert.equal(engine.startChase(chase, scenes), true, 'a chase with known scenes should start');
    assert.equal(engine.tick(0)[0], 255, 'first step is scene a');
    engine.tick(50);
    assert.equal(engine.getState().chaseStep, 0, 'still holding step 0 before the hold elapses');
    engine.tick(150);
    assert.equal(engine.getState().chaseStep, 1, 'moves to step 1 after the hold');
    engine.tick(300);
    assert.equal(engine.getState().activeChaseId, null, 'a non-looping chase ends after its last step');
  });

  it('refuses to start a chase whose scenes are all missing', () => {
    const { engine } = createEngine();
    const chase = { id: 'c', loop: true, steps: [{ sceneId: 'gone', fadeMs: 0, holdMs: 0 }] };
    assert.equal(engine.startChase(chase, new Map()), false, 'missing scenes should not start a chase');
  });
});
