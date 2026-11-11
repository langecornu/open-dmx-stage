// Tests for the beat detector and the tempo functions, using made-up low-band strengths shaped like music.
import { describe, expect, it } from 'vitest';

import {
  createBeatDetector,
  foldTempo,
  MIN_BEAT_GAP_MS,
  smoothTempo,
  tempoFromBeats,
} from '../../src/utils/beatDetector.js';

const WINDOW_MS = 20;

// A small, repeatable pseudo-random number generator, so the "noise" is the same on every run.
function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

/**
 * Low-band strength of a kick drum every `intervalMs` over a noise floor, one value per 20 ms window.
 * @returns {{ strength: number, time: number }[]}
 */
function music({ seconds, intervalMs, floor = 0.02, hit = 0.3, startMs = 0, seed = 7 }) {
  const random = seededRandom(seed);
  const windows = [];
  for (let time = 0; time < seconds * 1000; time += WINDOW_MS) {
    const sinceHit = (time - startMs) % intervalMs;
    const kick = time >= startMs ? hit * Math.exp(-sinceHit / 60) : 0;
    windows.push({ strength: floor + kick + random() * floor * 0.4, time });
  }
  return windows;
}

function runDetector(windows) {
  const detector = createBeatDetector();
  return windows.filter((window) => detector.feed(window.strength, window.time)).map((window) => window.time);
}

describe('createBeatDetector', () => {
  it('finds a beat for almost every kick of a steady 120 beats per minute, close to when it happened', () => {
    const beats = runDetector(music({ seconds: 20, intervalMs: 500 }));
    expect(beats.length).toBeGreaterThanOrEqual(36); // about 40 kicks in 20 s, the first second teaches it what is quiet
    expect(beats.length).toBeLessThanOrEqual(41);
    for (const beat of beats) {
      const late = beat % 500;
      expect(Math.min(late, 500 - late)).toBeLessThanOrEqual(40); // within 40 ms of a kick
    }
  });

  it('reports no beats for silence, for steady noise, and for a constant bass note', () => {
    expect(runDetector(music({ seconds: 10, intervalMs: 500, hit: 0, floor: 0.0005 }))).toEqual([]);
    expect(runDetector(music({ seconds: 10, intervalMs: 500, hit: 0 }))).toEqual([]);
    const bass = Array.from({ length: 500 }, (_, index) => ({ strength: 0.4, time: index * WINDOW_MS }));
    expect(runDetector(bass)).toEqual([]);
  });

  it('does not count one kick twice, and never reports two beats closer than the minimum gap', () => {
    const beats = runDetector(music({ seconds: 20, intervalMs: 300, hit: 0.4 }));
    for (let index = 1; index < beats.length; index += 1) {
      expect(beats[index] - beats[index - 1]).toBeGreaterThanOrEqual(MIN_BEAT_GAP_MS);
    }
  });

  it('counts a quick double hit (a flam or a double kick, 150 ms apart) as one beat', () => {
    const random = seededRandom(5);
    const windows = [];
    for (let time = 0; time < 20000; time += WINDOW_MS) {
      const sinceCycle = time % 600; // a double hit every 600 ms
      const hit = 0.3 * Math.exp(-sinceCycle / 40) + (sinceCycle >= 150 ? 0.3 * Math.exp(-(sinceCycle - 150) / 40) : 0);
      windows.push({ strength: 0.02 + hit + random() * 0.008, time });
    }
    const beats = runDetector(windows);
    for (let index = 1; index < beats.length; index += 1) {
      expect(beats[index] - beats[index - 1]).toBeGreaterThanOrEqual(MIN_BEAT_GAP_MS);
    }
    expect(beats.length).toBeLessThanOrEqual(34); // 33 cycles in 20 s, one beat each
    expect(beats.length).toBeGreaterThanOrEqual(28);
  });

  it('adapts to a loud track and to a quiet one', () => {
    expect(runDetector(music({ seconds: 15, intervalMs: 500, floor: 0.2, hit: 2.5 })).length).toBeGreaterThan(25);
    expect(runDetector(music({ seconds: 15, intervalMs: 500, floor: 0.008, hit: 0.06 })).length).toBeGreaterThan(25);
  });

  it('follows a change of tempo', () => {
    const slow = music({ seconds: 10, intervalMs: 600 });
    const fast = music({ seconds: 10, intervalMs: 400 }).map((window) => ({ ...window, time: window.time + 10000 }));
    const beats = runDetector([...slow, ...fast]);
    const early = beats.filter((time) => time < 10000);
    const late = beats.filter((time) => time >= 10000);
    expect(early.length).toBeGreaterThan(12);
    expect(late.length).toBeGreaterThan(20);
  });

  it('can be reset', () => {
    const detector = createBeatDetector();
    for (const window of music({ seconds: 5, intervalMs: 500 })) {
      detector.feed(window.strength, window.time);
    }
    detector.reset();
    expect(detector.feed(0.9, 100000)).toBe(false); // it has to learn what is quiet again
  });
});

describe('tempoFromBeats', () => {
  const evenBeats = (intervalMs, count, start = 0) =>
    Array.from({ length: count }, (_, index) => start + index * intervalMs);

  it('gives the tempo of steady beats, and says how sure it is', () => {
    expect(tempoFromBeats(evenBeats(500, 12))).toEqual({ bpm: 120, confidence: 1 });
    expect(tempoFromBeats(evenBeats(468.75, 12))?.bpm).toBe(128);
  });

  it('waits for enough beats before answering', () => {
    expect(tempoFromBeats(evenBeats(500, 3))).toBeNull();
    expect(tempoFromBeats(evenBeats(500, 6))).toBeNull();
    expect(tempoFromBeats(evenBeats(500, 8))).not.toBeNull();
  });

  it('tolerates timing jitter, a missed beat and an extra beat', () => {
    const jittered = evenBeats(500, 14).map((time, index) => time + (index % 2 === 0 ? 12 : -12));
    expect(tempoFromBeats(jittered)?.bpm).toBeGreaterThan(117);
    expect(tempoFromBeats(jittered)?.bpm).toBeLessThan(123);
    const missed = evenBeats(500, 14).filter((_, index) => index !== 6);
    expect(tempoFromBeats(missed)?.bpm).toBe(120);
    const extra = [...evenBeats(500, 14), 250 + 500 * 3].sort((a, b) => a - b);
    expect(tempoFromBeats(extra)?.bpm).toBe(120);
  });

  it('refuses a beat that is not steady', () => {
    const random = seededRandom(3);
    const messy = [];
    let time = 0;
    for (let index = 0; index < 16; index += 1) {
      time += 300 + random() * 700;
      messy.push(time);
    }
    expect(tempoFromBeats(messy)).toBeNull();
  });

  it('starts counting again after a long silence', () => {
    const before = evenBeats(500, 10);
    const after = evenBeats(400, 10, 60000);
    expect(tempoFromBeats([...before, ...after])?.bpm).toBe(150);
  });

  it('folds a half-speed or double-speed beat into the usual range', () => {
    expect(tempoFromBeats(evenBeats(1000, 10))?.bpm).toBe(120); // one beat every second is 60, doubled
    expect(tempoFromBeats(evenBeats(250, 16))?.bpm).toBe(120); // four a second is 240, halved
    expect(foldTempo(60)).toBe(120);
    expect(foldTempo(240)).toBe(120);
    expect(foldTempo(128)).toBe(128);
  });
});

describe('smoothTempo', () => {
  it('moves part of the way to a new estimate, and takes the first estimate and a big jump as they are', () => {
    expect(smoothTempo(null, 124)).toBe(124);
    expect(smoothTempo(120, 124)).toBe(121.4);
    expect(smoothTempo(120, 150)).toBe(150);
    expect(smoothTempo(120, 120)).toBe(120);
  });
});
