// Unit tests for the decks' maths: the crossfader curve, which deck is heard, the beat and bar, the next downbeat,
// tempo matching, the waveform outline and the time readout.
import { describe, expect, it } from 'vitest';

import {
  beatAt,
  crossfadeGains,
  heardDeck,
  nextDownbeat,
  peaksOf,
  pitchToMatch,
  playingBpm,
  PITCH_RANGE,
} from '../../src/utils/deckMaths.js';

const analysis = { bpm: 120, firstBeatSeconds: 1, durationSeconds: 200, peaks: [] };

describe('crossfadeGains', () => {
  it('gives all of A at the left, all of B at the right, and equal power in the middle', () => {
    expect(crossfadeGains(-1)[0]).toBeCloseTo(1);
    expect(crossfadeGains(-1)[1]).toBeCloseTo(0);
    expect(crossfadeGains(1)[1]).toBeCloseTo(1);
    const [a, b] = crossfadeGains(0);
    expect(a * a + b * b).toBeCloseTo(1);
    expect(crossfadeGains(5)).toEqual(crossfadeGains(1));
  });
});

describe('heardDeck', () => {
  const deck = (playing, volume = 1) => ({ playing, volume });

  it('picks the louder playing deck through the crossfader', () => {
    expect(heardDeck([deck(true), deck(true)], -0.5)).toBe(0);
    expect(heardDeck([deck(true), deck(true)], 0.5)).toBe(1);
    expect(heardDeck([deck(true, 0.2), deck(true)], 0)).toBe(1);
  });

  it('ignores stopped and silent decks', () => {
    expect(heardDeck([deck(false), deck(false)], 0)).toBe(-1);
    expect(heardDeck([deck(true), deck(false)], 1)).toBe(-1);
    expect(heardDeck([deck(true, 0), deck(false)], -1)).toBe(-1);
  });
});

describe('beatAt', () => {
  it('counts beats from the first downbeat, with the place in the beat and the bar', () => {
    expect(beatAt(analysis, 1)).toEqual({ beats: 0, beat: 0, phase: 0, bar: 0 });
    const later = beatAt(analysis, 2.25);
    expect(later.beat).toBe(2);
    expect(later.phase).toBeCloseTo(0.5);
    expect(later.bar).toBeCloseTo(0.625);
  });

  it('wraps the bar before the first downbeat, and needs an analysis', () => {
    expect(beatAt(analysis, 0.5).bar).toBeCloseTo(0.75);
    expect(beatAt(null, 3)).toBeNull();
    expect(beatAt({ ...analysis, bpm: 0 }, 3)).toBeNull();
  });
});

describe('nextDownbeat', () => {
  it('says how long until the next bar starts, in real time at the deck speed', () => {
    const next = nextDownbeat(analysis, 2.5, 1);
    expect(next.wait).toBeCloseTo(0.5);
    expect(next.bar).toBe(1);
    expect(nextDownbeat(analysis, 2.5, 2).wait).toBeCloseTo(0.25);
  });

  it('gives nothing without an analysis or a speed', () => {
    expect(nextDownbeat(null, 1)).toBeNull();
    expect(nextDownbeat(analysis, 1, 0)).toBeNull();
  });
});

describe('tempo', () => {
  it('reads the tempo with the fader', () => {
    expect(playingBpm(analysis, 5)).toBe(126);
    expect(playingBpm(null, 5)).toBeNull();
  });

  it('matches a tempo within the fader, beat for two when one is about double the other', () => {
    expect(pitchToMatch(120, 126)).toBe(5);
    expect(pitchToMatch(120, 252)).toBe(5);
    expect(pitchToMatch(120, 60)).toBe(0);
    expect(pitchToMatch(120, 170)).toBe(PITCH_RANGE);
  });
});

describe('peaksOf', () => {
  it('outlines the loudness in slices, scaled to the loudest', () => {
    const samples = new Float32Array(1600);
    samples.fill(0.25, 0, 800);
    samples.fill(-0.5, 800);
    expect(peaksOf(samples, 2)).toEqual([0.5, 1]);
    expect(peaksOf(new Float32Array(16), 2)).toEqual([0, 0]);
  });
});
