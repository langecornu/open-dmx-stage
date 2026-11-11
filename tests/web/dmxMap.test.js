// Tests for how the patch is laid out on the 512 channels of the universe.
import { describe, expect, it } from 'vitest';

import { dmxMapSegments } from '../../src/utils/dmxMap.js';

const project = {
  fixtures: [
    { id: 'a', name: 'Par 1' },
    { id: 'b', name: 'Par 2' },
    { id: 'c', name: 'Mystery' },
  ],
};
const range = (id, start, end, extra = {}) => ({ id, start, end, ...extra });

describe('dmxMapSegments', () => {
  it('lays each light out on its addresses, with its own colour, and counts the channels used', () => {
    const { segments, used, nextFree } = dmxMapSegments(project, {
      fixtures: [range('a', 1, 7), range('b', 8, 14)],
    });
    expect(segments.map((segment) => [segment.name, segment.start, segment.end])).toEqual([
      ['Par 1', 1, 7],
      ['Par 2', 8, 14],
    ]);
    expect(segments[0].hue).not.toBe(segments[1].hue);
    expect(used).toBe(14);
    expect(nextFree).toBe(15);
  });

  it('marks lights that overlap, and counts shared channels once', () => {
    const { segments, used } = dmxMapSegments(project, {
      fixtures: [range('a', 1, 7, { overlaps: ['b'] }), range('b', 5, 11, { overlaps: ['a'] })],
    });
    expect(segments.every((segment) => segment.isOverlap)).toBe(true);
    expect(used).toBe(11);
  });

  it('skips lights whose type is missing and clips a light that runs past 512', () => {
    const { segments, used } = dmxMapSegments(project, {
      fixtures: [range('a', 500, 520, { outOfRange: true }), range('c', 1, 4, { missingType: true })],
    });
    expect(segments).toHaveLength(1);
    expect(segments[0].end).toBe(512);
    expect(used).toBe(13);
  });

  it('finds a free address inside a gap, and says none is left when the universe is full', () => {
    const gap = dmxMapSegments(project, { fixtures: [range('a', 2, 7)] });
    expect(gap.nextFree).toBe(1);
    const full = dmxMapSegments(project, { fixtures: [range('a', 1, 512)] });
    expect(full.nextFree).toBeNull();
  });

  it('is empty for an empty rig', () => {
    expect(dmxMapSegments({ fixtures: [] }, { fixtures: [] })).toEqual({ segments: [], used: 0, nextFree: 1 });
  });
});
