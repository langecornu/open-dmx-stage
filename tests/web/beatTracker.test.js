// Tests for the beat tracker, fed with made-up music of the kinds real songs and real microphones produce.
import { describe, expect, it } from 'vitest';

import { createBeatTracker, estimateTempo, foldTempo, smoothTempo } from '../../src/utils/beatTracker.js';
import { musicWindows, silence, steadyNoise } from './audioMocks.js';

/** Runs windows through a fresh tracker and returns what it said at the end, with all beats found. */
function follow(windowsList, tracker = createBeatTracker()) {
  let last = null;
  const beats = [];
  for (const window of windowsList) {
    last = tracker.feed({ low: window.low, full: window.full }, window.time);
    if (last.isBeat) {
      beats.push(window.time);
    }
  }
  return { last, beats, tracker };
}

describe('foldTempo', () => {
  it.each([
    [60, 120],
    [240, 120],
    [90, 90],
    [35, 70],
    [360, 180],
  ])('puts %s beats per minute into the usual range as %s', (bpm, expected) => {
    expect(foldTempo(bpm)).toBe(expected);
  });
});

describe('smoothTempo', () => {
  it('takes the first estimate as it is', () => {
    expect(smoothTempo(null, 128)).toBe(128);
  });

  it('moves part of the way towards a close estimate, so it does not jitter', () => {
    expect(smoothTempo(120, 122)).toBeCloseTo(120.7, 1);
  });

  it('jumps straight to a very different estimate, which is a new song', () => {
    expect(smoothTempo(120, 150)).toBe(150);
  });
});

describe('estimateTempo', () => {
  it('needs a few seconds of sound before it says anything', () => {
    expect(estimateTempo(new Array(100).fill(0.2))).toBeNull();
  });

  it('finds nothing in a perfectly flat signal', () => {
    expect(estimateTempo(new Array(300).fill(0.2))).toBeNull();
  });

  it('finds the tempo of a repeating pattern, with how sure it is', () => {
    const strengths = Array.from({ length: 300 }, (_, index) => (index % 25 === 0 ? 1 : 0.05));
    const result = estimateTempo(strengths);
    expect(result.bpm).toBeCloseTo(120, 0);
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});

describe('createBeatTracker on realistic music', () => {
  it.each([
    ['120 beats per minute', 500, 120],
    ['100 beats per minute', 600, 100],
    ['128 beats per minute', 468.75, 128],
    ['150 beats per minute', 400, 150],
  ])('locks on a bass line, snares and hi-hats at %s', (_name, intervalMs, expected) => {
    const { last } = follow(musicWindows({ seconds: 14, intervalMs }));
    expect(last.bpm).not.toBeNull();
    expect(Math.abs(last.bpm - expected)).toBeLessThan(2);
  });

  it('locks when the bass is weak and the beat is mostly a click in the full sound (a laptop microphone)', () => {
    const { last } = follow(musicWindows({ seconds: 14, intervalMs: 500, kick: 0.02, bass: 0.02, click: 0.25 }));
    expect(last.bpm).not.toBeNull();
    expect(Math.abs(last.bpm - 120)).toBeLessThan(2);
  });

  it('locks when there is no bass at all, only the full sound', () => {
    const { last } = follow(musicWindows({ seconds: 14, intervalMs: 500, kick: 0, bass: 0, click: 0.3, snare: 0.1 }));
    expect(last.bpm).not.toBeNull();
    expect(Math.abs(last.bpm - 120)).toBeLessThan(2);
  });

  it('locks on a quiet track as well as a loud one, since only the pattern matters', () => {
    const loud = follow(musicWindows({ seconds: 14, intervalMs: 500, kick: 0.6, bass: 0.24, snare: 0.5, floor: 0.04 }));
    const quiet = follow(
      musicWindows({ seconds: 14, intervalMs: 500, kick: 0.03, bass: 0.012, snare: 0.025, hat: 0.006, floor: 0.002 }),
    );
    expect(Math.abs(loud.last.bpm - 120)).toBeLessThan(2);
    expect(Math.abs(quiet.last.bpm - 120)).toBeLessThan(2);
  });

  it('reports the strongest rhythm it hears even before it believes it, for the screen to show', () => {
    const { last } = follow(musicWindows({ seconds: 4, intervalMs: 500 }));
    expect(last.candidateBpm === null || Math.abs(last.candidateBpm - 120) < 3).toBe(true);
  });

  it('finds the beat on the beat, once locked: about two a second at 120', () => {
    const { beats } = follow(musicWindows({ seconds: 20, intervalMs: 500 }));
    const late = beats.filter((time) => time > 8000);
    expect(late.length).toBeGreaterThanOrEqual(20);
    expect(late.length).toBeLessThanOrEqual(25);
    for (let index = 1; index < late.length; index += 1) {
      expect(late[index] - late[index - 1]).toBeGreaterThan(400);
    }
  });

  it('does not report a beat for the hi-hats between the kicks', () => {
    const { beats } = follow(musicWindows({ seconds: 20, intervalMs: 500, hat: 0.1 }));
    const late = beats.filter((time) => time > 8000);
    for (const time of late) {
      const offBeat = Math.abs((time % 500) - 250);
      expect(offBeat).toBeGreaterThan(80);
    }
  });

  it('follows a change to a faster song', () => {
    const first = follow(musicWindows({ seconds: 12, intervalMs: 500 }));
    const second = follow(musicWindows({ seconds: 14, intervalMs: 400, startTime: 12000, seed: 9 }), first.tracker);
    expect(Math.abs(second.last.bpm - 150)).toBeLessThan(3);
  });

  it('does not lock on a steady hum or noise', () => {
    const { last } = follow(steadyNoise({ seconds: 14 }));
    expect(last.bpm).toBeNull();
  });

  it('forgets the tempo after a few seconds of silence, and locks again when music returns', () => {
    const playing = follow(musicWindows({ seconds: 14, intervalMs: 500 }));
    expect(playing.last.bpm).not.toBeNull();
    const quiet = follow(silence({ seconds: 8, startTime: 14000 }), playing.tracker);
    expect(quiet.last.bpm).toBeNull();
    const back = follow(musicWindows({ seconds: 14, intervalMs: 500, startTime: 22000, seed: 3 }), quiet.tracker);
    expect(Math.abs(back.last.bpm - 120)).toBeLessThan(2);
  });

  it('counts the beats it has heard', () => {
    const { last } = follow(musicWindows({ seconds: 14, intervalMs: 500 }));
    expect(last.beatsHeard).toBeGreaterThan(15);
  });

  it('starts again from nothing after reset', () => {
    const { tracker } = follow(musicWindows({ seconds: 14, intervalMs: 500 }));
    tracker.reset();
    const result = tracker.feed({ low: 0.1, full: 0.2 }, 0);
    expect(result).toMatchObject({ bpm: null, candidateBpm: null, beatsHeard: 0, isBeat: false });
  });
});
