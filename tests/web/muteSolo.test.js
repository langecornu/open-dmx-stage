// Tests for mute and solo in words: which lights are dark, and the one-line reminder for the On stage bar.
import { describe, expect, it } from 'vitest';

import { describeFixtures, summariseMuteSolo } from '../../src/utils/muteSolo.js';

const fixtures = [
  { id: 'a', name: 'Par 1' },
  { id: 'b', name: 'Par 2' },
];

describe('describeFixtures', () => {
  it('marks muted lights, and every other light while one is soloed, as dark', () => {
    expect(describeFixtures(fixtures, { muted: [], soloed: ['a'] }).map((state) => state.isDark)).toEqual([
      false,
      true,
    ]);
    expect(describeFixtures(fixtures, { muted: ['a'], soloed: [] }).map((state) => state.isDark)).toEqual([
      true,
      false,
    ]);
  });

  it('ignores a solo on a light that has left the rig, as the engine does', () => {
    expect(describeFixtures(fixtures, { muted: [], soloed: ['gone'] }).some((state) => state.isDark)).toBe(false);
  });

  it('copes with a server that does not send mute and solo', () => {
    expect(describeFixtures(fixtures, {}).some((state) => state.isDark)).toBe(false);
  });
});

describe('summariseMuteSolo', () => {
  it('is empty when every light is free, and names the soloed and muted lights otherwise', () => {
    expect(summariseMuteSolo(fixtures, { muted: [], soloed: [] })).toBeNull();
    expect(summariseMuteSolo(fixtures, { muted: ['b'], soloed: ['a'] })).toBe('Solo: Par 1 · Muted: Par 2');
  });
});
