// Tests for tap tempo maths and beat-to-time conversion.
import { describe, expect, it } from 'vitest';

import { addTap, bpmFromTaps, clampBpm, MAX_TAPS, stepDurations } from '../../src/utils/tempo.js';

describe('tap tempo', () => {
  it('needs two taps, then averages the gaps', () => {
    expect(bpmFromTaps([])).toBeNull();
    expect(bpmFromTaps([1000])).toBeNull();
    expect(bpmFromTaps([0, 500])).toBe(120);
    expect(bpmFromTaps([0, 500, 1000, 1500])).toBe(120);
    expect(bpmFromTaps([0, 400, 800])).toBe(150);
  });

  it('starts a new count after a long pause, and keeps only the latest taps', () => {
    expect(addTap([0, 500], 5000)).toEqual([5000]);
    expect(addTap([0, 500], 900)).toEqual([0, 500, 900]);
    let taps = [];
    for (let index = 0; index < 20; index += 1) {
      taps = addTap(taps, index * 500);
    }
    expect(taps).toHaveLength(MAX_TAPS);
  });

  it('limits the tempo to what the engine accepts', () => {
    expect(clampBpm(1000)).toBe(300);
    expect(clampBpm(1)).toBe(30);
    expect(bpmFromTaps([0, 10])).toBe(300);
  });
});

describe('stepDurations', () => {
  const step = { fadeMs: 1000, holdMs: 2000, fadeBeats: 1, holdBeats: 2 };
  it('uses the seconds in seconds mode and the beats at the current tempo in beats mode', () => {
    expect(stepDurations(step, 'seconds', 90)).toEqual({ fadeMs: 1000, holdMs: 2000 });
    expect(stepDurations(step, 'beats', 120)).toEqual({ fadeMs: 500, holdMs: 1000 });
    expect(stepDurations(step, 'beats', 60)).toEqual({ fadeMs: 1000, holdMs: 2000 });
  });
});
