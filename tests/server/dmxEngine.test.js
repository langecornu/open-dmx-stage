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

  it('takes a look off stage and fades back to the resting values, keeping manual changes', () => {
    const { engine } = createEngine();
    engine.setRestingValues(new Map([[2, 255]]));
    engine.recallScene({ id: 's1', values: { 1: 200, 2: 0 } }, 0);
    engine.setProgrammer({ 3: 40 });
    engine.releaseScene(1000);
    assert.equal(engine.getState().activeSceneId, null, 'no look is on stage');
    assert.equal(engine.tick(500)[0], 100, 'halfway through, the colour is halfway down');
    const frame = engine.tick(1000);
    assert.deepEqual([frame[0], frame[1], frame[2]], [0, 255, 40], 'back at rest, with the manual value kept');
  });

  it('stops a playing sequence when the look is taken off stage', () => {
    const { engine } = createEngine();
    const scenes = new Map([['a', { id: 'a', values: { 1: 255 } }]]);
    engine.startChase({ id: 'c', loop: true, steps: [{ sceneId: 'a', fadeMs: 0, holdMs: 100 }] }, scenes);
    engine.releaseScene();
    assert.equal(engine.getState().activeChaseId, null, 'the sequence stopped');
    assert.equal(engine.tick(0)[0], 0, 'the light is back at rest');
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
    engine.setBlackout(false);

    engine.releaseScene();
    assert.equal(engine.getState().auto, null, 'taking the look off stage ends it');
    engine.tick(10000);
    assert.equal(engine.getState().activeSceneId, null, 'and no look comes back at the next change');
  });
});

describe('DmxEngine mute and solo', () => {
  // Two fixtures: "a" has red on 1 and a pan on 2; "b" has red on 3.
  function rig() {
    const { engine } = createEngine();
    engine.setFixtureChannels(
      new Map([
        ['a', { red: 1, levels: [1] }],
        ['b', { red: 3, levels: [3] }],
      ]),
    );
    engine.recallScene({ id: 'look', values: { 1: 200, 2: 128, 3: 150 } }, 0);
    return engine;
  }
  const lit = (frame) => [frame[0], frame[1], frame[2]];

  it('keeps a muted fixture dark, even against a manual change, and leaves its position alone', () => {
    const engine = rig();
    engine.setMute('a', true);
    engine.setProgrammer({ 1: 255 });
    assert.deepEqual(lit(engine.tick(0)), [0, 128, 150], 'a is dark, its pan holds, b is lit');
    assert.deepEqual(engine.getState().muted, ['a']);
    engine.setMute('a', false);
    assert.equal(engine.tick(0)[0], 255, 'unmuted, the manual value shows again');
  });

  it('lights only the soloed fixtures while any is soloed', () => {
    const engine = rig();
    engine.setSolo('b', true);
    assert.deepEqual(lit(engine.tick(0)), [0, 128, 150], 'only b is lit');
    engine.setSolo('a', true);
    assert.deepEqual(lit(engine.tick(0)), [200, 128, 150], 'both soloed, both lit');
    engine.setMute('b', true);
    assert.equal(engine.tick(0)[2], 0, 'mute wins over solo');
  });

  it('ignores a solo on a fixture that has left the rig, instead of darkening everything', () => {
    const engine = rig();
    engine.setSolo('gone', true);
    assert.deepEqual(lit(engine.tick(0)), [200, 128, 150]);
  });

  it('clears every mute and solo at once', () => {
    const engine = rig();
    engine.setMute('a', true);
    engine.setSolo('b', true);
    engine.clearMuteSolo();
    assert.deepEqual(engine.getState().muted, []);
    assert.deepEqual(engine.getState().soloed, []);
    assert.deepEqual(lit(engine.tick(0)), [200, 128, 150]);
  });
});

describe('DmxEngine timelines', () => {
  // One RGB light with a dimmer (red 1, green 2, blue 3, dimmer 4) and one without (red 5, green 6, blue 7).
  // At 120 BPM a beat is 500 ms.
  const block = (fields) => ({
    id: fields.id ?? 'b',
    fixtureId: 'withDimmer',
    start: 0,
    length: 4,
    color: '#ff0000',
    intensity: 100,
    transition: 'none',
    endColor: '#ff0000',
    endIntensity: 100,
    effect: 'none',
    strobeSpeed: 50,
    ...fields,
  });
  function rig(blocks, beats = 8) {
    const { engine } = createEngine();
    engine.setFixtureChannels(
      new Map([
        ['withDimmer', { red: 1, green: 2, blue: 3, levels: [1, 2, 3, 4], dimmers: [4] }],
        ['plain', { red: 5, green: 6, blue: 7, levels: [5, 6, 7], dimmers: [] }],
      ]),
    );
    engine.startTimeline({ id: 't', name: 'T', beats, blocks });
    return engine;
  }
  const at = (engine, ms) => [...engine.tick(ms).slice(0, 7)];

  it('shows each lane’s block: colour on the colour channels, intensity on the dimmer or scaling the colour', () => {
    const engine = rig([
      block({ intensity: 50 }),
      block({ id: 'p', fixtureId: 'plain', color: '#0000ff', intensity: 50 }),
    ]);
    assert.deepEqual(at(engine, 0), [255, 0, 0, 128, 0, 0, 128]);
    assert.equal(engine.getState().activeTimelineId, 't');
  });

  it('leaves a lane dark where it has no block, and loops at its length', () => {
    const engine = rig([block({ start: 0, length: 2 })], 4);
    assert.equal(at(engine, 0)[0], 255, 'beat 0: the block');
    assert.deepEqual(at(engine, 1500).slice(0, 4), [0, 0, 0, 0], 'beat 3: nothing drawn, so dark');
    assert.equal(at(engine, 2250)[0], 255, 'beat 4.5 is beat 0.5 of the next loop');
  });

  it('fades colour and intensity across a block', () => {
    const engine = rig([
      block({ transition: 'fade', color: '#ff0000', endColor: '#0000ff', intensity: 100, endIntensity: 0 }),
    ]);
    assert.deepEqual(
      at(engine, 1000).slice(0, 4),
      [128, 0, 128, 128],
      'halfway (beat 2 of 4): half red, half blue, half on',
    );
  });

  it('strobes by switching the light off for most of each flash', () => {
    const engine = rig([block({ effect: 'strobe', strobeSpeed: 1 })]); // 2 flashes a second: on for the first third
    assert.equal(at(engine, 0)[3], 255, 'the start of a flash is lit');
    assert.equal(at(engine, 250)[3], 0, 'half a flash later it is dark');
  });

  it('follows a tempo change without jumping', () => {
    const engine = rig([block({ start: 0, length: 1 }), block({ id: 'b2', start: 1, length: 1, color: '#00ff00' })], 4);
    engine.tick(0);
    engine.setTempo(60, false, 250); // after half a beat, beats become 1000 ms long
    assert.equal(at(engine, 500)[0], 255, '250 ms later at 60 BPM is beat 0.75: still the first block');
    assert.equal(at(engine, 800)[1], 255, 'beat 1.05: the second block');
  });

  it('stops with Stop, and gives way to a look or a sequence', () => {
    const engine = rig([block({})]);
    engine.stopChase();
    assert.equal(engine.getState().activeTimelineId, null, 'stop ends it');
    engine.startTimeline({ id: 't', name: 'T', beats: 8, blocks: [block({})] });
    engine.recallScene({ id: 'look', values: { 2: 200 } }, 0);
    assert.equal(engine.getState().activeTimelineId, null, 'a look takes over');
    assert.deepEqual(at(engine, 0).slice(0, 3), [0, 200, 0]);
  });
});
