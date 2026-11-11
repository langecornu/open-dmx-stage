// Tests for the lighting engine: layering, master/blackout, fades and chases (deterministic clock).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MockDriver } from '../../server/clients/mockDriver.js';
import { DmxEngine } from '../../server/services/dmxEngine.js';

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

  it('clears manual changes when a look is recalled so the look is actually visible', () => {
    const { engine } = createEngine();
    engine.setProgrammer({ 1: 10 });
    engine.recallScene({ id: 's1', values: { 1: 200 } }, 0);
    assert.equal(engine.tick(0)[0], 200, 'the recalled look replaces the manual value');
    assert.deepEqual(engine.getState().programmerChannels, [], 'no manual overrides remain');
  });

  it('clears manual changes when a chase starts', () => {
    const { engine } = createEngine();
    engine.setProgrammer({ 1: 10 });
    const scenes = new Map([['a', { id: 'a', values: { 1: 255 } }]]);
    engine.startChase({ id: 'c', loop: true, steps: [{ sceneId: 'a', fadeMs: 0, holdMs: 100 }] }, scenes);
    assert.equal(engine.tick(0)[0], 255, 'the chase look is visible');
    assert.deepEqual(engine.getState().programmerChannels, [], 'no manual overrides remain');
  });
});

describe('DmxEngine auto show', () => {
  // At 120 BPM one beat is 500 ms, so an auto show changing every 4 beats changes every 2000 ms.
  const look = (id, value) => ({ id, name: id, values: { 1: value } });
  const show = {
    scenes: [look('red', 200), look('dark', 0), look('blue', 100), look('green', 50)],
    chases: [
      {
        id: 'c1',
        name: 'One',
        loop: true,
        timing: 'seconds',
        steps: [{ id: 's1', sceneId: 'red', fadeMs: 0, holdMs: 100 }],
      },
      {
        id: 'c2',
        name: 'Two',
        loop: true,
        timing: 'seconds',
        steps: [{ id: 's2', sceneId: 'blue', fadeMs: 0, holdMs: 100 }],
      },
      {
        id: 'c3',
        name: 'Gone',
        loop: true,
        timing: 'seconds',
        steps: [{ id: 's3', sceneId: 'deleted', fadeMs: 0, holdMs: 100 }],
      },
    ],
  };
  const autoItem = (engine) => engine.getState().auto?.itemId ?? null;

  it('plays the looks in order at the tempo, cross-fading over one beat, and skips looks that are all off', () => {
    const { engine } = createEngine();
    assert.equal(engine.startAuto({ source: 'looks', beats: 4, order: 'order' }, show), true);
    assert.deepEqual(engine.getState().auto, { source: 'looks', beats: 4, order: 'order', itemId: 'red' });
    assert.equal(engine.tick(250)[0], 100, 'halfway through the one-beat fade');
    assert.equal(engine.tick(1999)[0], 200, 'the first look holds until its four beats are up');
    engine.tick(2000);
    assert.equal(autoItem(engine), 'blue', 'the dark look is skipped');
    engine.tick(4000);
    assert.equal(autoItem(engine), 'green');
    engine.tick(6000);
    assert.equal(autoItem(engine), 'red', 'it starts again from the first look');
    assert.equal(engine.getState().activeSceneId, 'red', 'the look on stage is the auto show item');
  });

  it('follows a tempo change straight away', () => {
    const { engine } = createEngine();
    engine.startAuto({ source: 'looks', beats: 4, order: 'order' }, show);
    engine.setTempo(60, false, 0); // one beat is now 1000 ms, so the change comes at 4000 ms
    engine.tick(3999);
    assert.equal(autoItem(engine), 'red');
    engine.tick(4000);
    assert.equal(autoItem(engine), 'blue');
  });

  it('never plays the same look twice in a row when shuffled', () => {
    const engine = new DmxEngine({ driver: new MockDriver(), now: () => 0, random: () => 0 });
    engine.startAuto({ source: 'looks', beats: 4, order: 'shuffle' }, show);
    const played = [autoItem(engine)];
    for (let at = 2000; at <= 10000; at += 2000) {
      engine.tick(at);
      played.push(autoItem(engine));
    }
    played.slice(1).forEach((id, index) => assert.notEqual(id, played[index], 'two different looks in a row'));
  });

  it('plays sequences in turn, leaving out those with no look left', () => {
    const { engine } = createEngine();
    engine.startAuto({ source: 'sequences', beats: 8, order: 'order' }, show);
    assert.equal(engine.getState().activeChaseId, 'c1');
    engine.tick(4000);
    assert.equal(engine.getState().activeChaseId, 'c2');
    engine.tick(8000);
    assert.equal(engine.getState().activeChaseId, 'c1', 'the sequence whose look was deleted is skipped');
  });

  it('starts nothing when there is nothing to play', () => {
    const { engine } = createEngine();
    assert.equal(
      engine.startAuto({ source: 'looks', beats: 4, order: 'order' }, { scenes: [look('dark', 0)], chases: [] }),
      false,
    );
    assert.equal(engine.getState().auto, null);
  });

  it('stops when a person plays a look or a sequence, or presses stop, and keeps the look on stage', () => {
    const { engine } = createEngine();
    engine.startAuto({ source: 'looks', beats: 4, order: 'order' }, show);
    engine.recallScene(look('green', 50), 0);
    assert.equal(engine.getState().auto, null, 'playing a look takes over');

    engine.startAuto({ source: 'looks', beats: 4, order: 'order' }, show);
    engine.startChase(show.chases[1], new Map(show.scenes.map((scene) => [scene.id, scene])));
    assert.equal(engine.getState().auto, null, 'starting a sequence takes over');

    engine.startAuto({ source: 'sequences', beats: 4, order: 'order' }, show);
    engine.stopChase();
    assert.equal(engine.getState().auto, null, 'stop ends the auto show');
    assert.equal(engine.getState().activeChaseId, null, 'and its sequence');
    assert.equal(engine.getState().activeSceneId, 'red', 'the look on stage stays');

    engine.startAuto({ source: 'looks', beats: 4, order: 'order' }, show);
    engine.setBlackout(true);
    assert.notEqual(engine.getState().auto, null, 'a blackout does not stop it');
  });
});
