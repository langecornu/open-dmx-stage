// Tests for song analysis on made-up songs whose tempo, first downbeat and loud parts are known.
import { describe, expect, it } from 'vitest';

import { analyseSong, groupSections } from '../../src/utils/songAnalysis.js';

/**
 * A click track: a short burst on every beat, louder on the first beat of each bar, with quiet noise underneath.
 * @param {{ bpm: number, seconds: number, firstBeat?: number, rate?: number, loudness?: (bar: number) => number }} song
 */
function clickTrack({ bpm, seconds, firstBeat = 0, rate = 22050, loudness = () => 1 }) {
  const samples = new Float32Array(Math.round(seconds * rate));
  let seed = 7;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647 - 0.5) * 0.02;
  };
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = noise();
  }
  const beatSeconds = 60 / bpm;
  for (let beat = 0; firstBeat + beat * beatSeconds < seconds; beat += 1) {
    const bar = Math.floor(beat / 4);
    const gain = loudness(bar) * (beat % 4 === 0 ? 0.9 : 0.45);
    const start = Math.round((firstBeat + beat * beatSeconds) * rate);
    for (let index = 0; index < rate * 0.03 && start + index < samples.length; index += 1) {
      samples[start + index] += gain * Math.sin(index * 0.6) * Math.exp(-index / (rate * 0.008));
    }
  }
  return { samples, rate };
}

describe('analyseSong', () => {
  it.each([
    [120, 0],
    [128, 0.37],
    [95, 1.1],
    [174, 0.2],
  ])('finds %s beats a minute and the first downbeat at %s s', (bpm, firstBeat) => {
    const { samples, rate } = clickTrack({ bpm, seconds: 40, firstBeat });
    const song = analyseSong(samples, rate);
    expect(Math.abs(song.bpm - bpm)).toBeLessThan(1.5);
    const bar = (60 / bpm) * 4;
    // The downbeat may be found a bar later, never between beats.
    const off = (((song.firstBeatSeconds - firstBeat) % bar) + bar) % bar;
    expect(Math.min(off, bar - off)).toBeLessThan(0.05);
    expect(song.durationSeconds).toBe(40);
  });

  it('maps a quiet start, a loud middle and a quiet end into sections', () => {
    const { samples, rate } = clickTrack({
      bpm: 120,
      seconds: 96, // 48 bars of 2 seconds
      loudness: (bar) => (bar >= 16 && bar < 32 ? 1 : 0.15),
    });
    const song = analyseSong(samples, rate);
    const levels = song.sections.map((section) =>
      section.energy < 0.33 ? 'quiet' : section.energy < 0.66 ? 'medium' : 'high',
    );
    expect(levels).toEqual(['quiet', 'high', 'quiet']);
    expect(song.sections[1].startBar).toBe(16);
    expect(song.sections[1].bars).toBe(16);
  });

  it('refuses a clip too short to have a tempo', () => {
    const { samples, rate } = clickTrack({ bpm: 120, seconds: 2 });
    expect(() => analyseSong(samples, rate)).toThrow(/too short/);
  });
});

describe('groupSections', () => {
  it('groups bars four at a time into sections of like energy', () => {
    expect(groupSections([0.1, 0.1, 0.2, 0.1, 0.9, 0.8, 1, 0.9, 0.85, 0.9, 0.95, 1])).toEqual([
      { startBar: 0, bars: 4, energy: 0.13 },
      { startBar: 4, bars: 8, energy: 0.91 },
    ]);
  });
});
