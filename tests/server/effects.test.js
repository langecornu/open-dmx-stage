// Tests for the effect maths, and for tempo, effects and beat-timed sequences in the engine (deterministic clock).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MockDriver } from '../../server/clients/mockDriver.js';
import { DmxEngine } from '../../server/services/dmxEngine.js';
import { pulseGain, rainbowRgb, sweepGain } from '../../shared/effects.js';
import { buildPatch, channelsByFixture } from '../../shared/patch.js';

const RGB_TYPE = {
  id: 'rgb',
  manufacturer: '',
  name: 'RGB',
  modes: [
    {
      name: '3',
      channels: [
        { name: 'R', type: 'red', defaultValue: 0 },
        { name: 'G', type: 'green', defaultValue: 0 },
        { name: 'B', type: 'blue', defaultValue: 0 },
      ],
    },
  ],
};
const FIXTURES = [
  { id: 'a', name: 'A', typeId: 'rgb', mode: 0, address: 1 },
  { id: 'b', name: 'B', typeId: 'rgb', mode: 0, address: 4 },
  { id: 'c', name: 'C', typeId: 'rgb', mode: 0, address: 7 },
];

function createEngine() {
  const engine = new DmxEngine({ driver: new MockDriver(), now: () => 0 });
  const patch = buildPatch({ fixtureTypes: [RGB_TYPE], fixtures: FIXTURES }, []);
  engine.setFixtureChannels(channelsByFixture(patch));
  engine.recallScene({
    id: 'white',
    values: { 1: 200, 2: 200, 3: 200, 4: 200, 5: 200, 6: 200, 7: 200, 8: 200, 9: 200 },
  });
  return engine;
}

describe('effect maths', () => {
  it('pulse is brightest on the beat, dimmest half a cycle later, and never fully dark', () => {
    assert.equal(pulseGain(0), 1, 'full on the beat');
    assert.ok(Math.abs(pulseGain(0.5) - 0.1) < 1e-9, 'dim halfway through');
    assert.ok(pulseGain(0.25) > 0.1 && pulseGain(0.25) < 1, 'between the two in the middle');
  });

  it('sweep lights one fixture at a time in order and fades behind it', () => {
    assert.equal(sweepGain(0, 0, 4), 1, 'the first light is lit at the start');
    assert.ok(Math.abs(sweepGain(0, 1, 4) - 0.1) < 1e-9, 'the next light waits');
    assert.equal(sweepGain(0.25, 1, 4), 1, 'a quarter cycle later the spot reaches the second light');
    assert.ok(sweepGain(0.2, 0, 4) < 1 && sweepGain(0.2, 0, 4) > 0.1, 'the first light is fading behind the spot');
  });

  it('rainbow covers the hues and spreads them along the lights', () => {
    assert.deepEqual(rainbowRgb(0, 0, 3), [255, 0, 0], 'starts on red');
    const [red, green, blue] = rainbowRgb(0, 1, 3);
    assert.ok(green === 255 && blue === 0 && red === 0, 'a third of the way round is green');
    for (const phase of [0, 0.1, 0.33, 0.5, 0.77, 0.999]) {
      assert.ok(
        rainbowRgb(phase, 0, 1).every((value) => value >= 0 && value <= 255),
        'every value is a valid DMX level',
      );
    }
  });
});

describe('tempo', () => {
  it('clamps the tempo and reports it in the engine state', () => {
    const engine = createEngine();
    engine.setTempo(500);
    assert.equal(engine.getState().bpm, 300, 'too fast is limited');
    engine.setTempo(5);
    assert.equal(engine.getState().bpm, 30, 'too slow is limited');
    engine.setTempo(128);
    assert.equal(engine.getState().bpm, 128, 'a normal tempo is kept');
  });

  it('keeps the beat position when the tempo changes, and restarts it when told this is a beat', () => {
    const engine = createEngine();
    engine.setTempo(120, true, 0); // beat 0 at time 0; one beat is 500 ms
    engine.setTempo(60, false, 1000); // two beats in; one beat is now 1000 ms
    assert.equal((1000 - engine.tempoOrigin) / engine.beatMs(), 2, 'still two beats in');
    engine.setTempo(60, true, 1234);
    assert.equal(engine.tempoOrigin, 1234, 'a synced tempo makes now beat 0');
  });
});

describe('effects in the engine', () => {
  it('pulse scales the brightness of every light with the beat, and stops cleanly', () => {
    const engine = createEngine();
    engine.setTempo(120, true, 0);
    engine.startEffect({ type: 'pulse', beats: 1, groupId: null, fixtureIds: null });
    assert.equal(engine.tick(0)[0], 200, 'full brightness on the beat');
    assert.equal(engine.tick(125)[0], 110, 'dimmer a quarter of the way through the beat');
    assert.equal(engine.tick(125)[3], 110, 'every light is affected');
    assert.equal(engine.getState().effect.type, 'pulse', 'the state reports the running effect');
    engine.stopEffect();
    assert.equal(engine.tick(250)[0], 200, 'the look is back when the effect stops');
    assert.equal(engine.getState().effect, null, 'no effect is reported');
  });

  it('only touches the lights in its group', () => {
    const engine = createEngine();
    engine.setTempo(120, true, 0);
    engine.startEffect({ type: 'pulse', beats: 1, groupId: 'g', fixtureIds: ['b', 'gone'] });
    const frame = engine.tick(125);
    assert.equal(frame[0], 200, 'a light outside the group is untouched');
    assert.equal(frame[3], 110, 'a light in the group is pulsed');
    assert.equal(frame[6], 200, 'the other light outside the group is untouched');
  });

  it('rainbow sets the colours of the targeted lights, and manual changes still win', () => {
    const engine = createEngine();
    engine.setTempo(120, true, 0);
    engine.startEffect({ type: 'rainbow', beats: 4, groupId: null, fixtureIds: null });
    const frame = [...engine.tick(0)];
    assert.deepEqual(frame.slice(0, 3), [255, 0, 0], 'the first light starts on red');
    assert.notDeepEqual(frame.slice(3, 6), frame.slice(0, 3), 'the next light has a different colour');
    engine.setProgrammer({ 1: 7 });
    assert.equal(engine.tick(0)[0], 7, 'a manual fader beats the effect');
  });

  it('master and blackout still apply on top of an effect', () => {
    const engine = createEngine();
    engine.setLevelChannels(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    engine.startEffect({ type: 'rainbow', beats: 4, groupId: null, fixtureIds: null });
    engine.setBlackout(true);
    assert.equal(engine.tick(0)[0], 0, 'blackout wins over the rainbow');
  });
});

describe('beat-timed sequences', () => {
  const scenes = new Map([
    ['a', { id: 'a', values: { 1: 255 } }],
    ['b', { id: 'b', values: { 1: 0 } }],
  ]);
  const chase = {
    id: 'c',
    loop: true,
    timing: 'beats',
    steps: [
      { sceneId: 'a', fadeMs: 9999, holdMs: 9999, fadeBeats: 0, holdBeats: 2 },
      { sceneId: 'b', fadeMs: 9999, holdMs: 9999, fadeBeats: 0, holdBeats: 2 },
    ],
  };

  it('holds each step for its beats at the current tempo, ignoring the seconds', () => {
    const engine = createEngine();
    engine.setTempo(120); // a beat is 500 ms, so two beats are 1000 ms
    engine.startChase(chase, scenes);
    engine.tick(0);
    engine.tick(900);
    assert.equal(engine.getState().chaseStep, 0, 'still on step 1 before two beats have passed');
    engine.tick(1000);
    assert.equal(engine.getState().chaseStep, 1, 'moves on after two beats');
  });

  it('moves faster when the tempo is faster', () => {
    const engine = createEngine();
    engine.setTempo(240); // a beat is 250 ms, so two beats are 500 ms
    engine.startChase(chase, scenes);
    engine.tick(0);
    engine.tick(500);
    assert.equal(engine.getState().chaseStep, 1, 'twice the tempo means half the time');
  });

  it('a sequence without a timing setting still runs in seconds', () => {
    const engine = createEngine();
    engine.startChase({ id: 'old', loop: true, steps: [{ sceneId: 'a', fadeMs: 0, holdMs: 300 }] }, scenes);
    engine.tick(0);
    engine.tick(299);
    assert.equal(engine.getState().chaseStep, 0, 'the seconds are honoured');
  });
});
