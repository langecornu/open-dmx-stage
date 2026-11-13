// Tests for device categories: best guesses from a fixture's name and channels, OFL categories, and which wins.
import { describe, expect, it } from 'vitest';

import { categoryFromOfl, categoryOf, guessCategory } from '../../shared/categories.js';

const withChannels = (name, ...types) => ({ name, modes: [{ channels: types.map((type) => ({ type })) }] });

describe('guessCategory', () => {
  it('reads the name first', () => {
    expect(guessCategory(withChannels('Mini Spider Light', 'tilt', 'tilt'))).toBe('spider');
    expect(guessCategory(withChannels('Hazer 2', 'fog', 'fan'))).toBe('hazer');
    expect(guessCategory(withChannels('Smoke machine', 'fog'))).toBe('smoke');
    expect(guessCategory(withChannels('RGB laser', 'other'))).toBe('laser');
    expect(guessCategory(withChannels('Cold spark machine', 'other'))).toBe('special-effect');
    expect(guessCategory(withChannels('LED bar 8', 'red'))).toBe('led-bar');
  });

  it('falls back to the channels', () => {
    expect(guessCategory(withChannels('X1', 'pan', 'tilt', 'gobo'))).toBe('moving-head');
    expect(guessCategory(withChannels('X2', 'intensity'))).toBe('dimmer');
    expect(guessCategory(withChannels('X3', 'intensity', 'red', 'green', 'blue'))).toBe('par');
    expect(guessCategory(withChannels('X4', 'fog'))).toBe('smoke');
    expect(guessCategory(withChannels('X5', 'gobo'))).toBe('spot');
    expect(guessCategory(withChannels('X6', 'other'))).toBe('other');
  });
});

describe('categoryFromOfl and categoryOf', () => {
  it('maps OFL categories, preferring a specific one', () => {
    expect(categoryFromOfl(['Moving Head', 'Color Changer'])).toBe('moving-head');
    expect(categoryFromOfl(['Other', 'Smoke'])).toBe('smoke');
    expect(categoryFromOfl(['Stand'])).toBe('other');
    expect(categoryFromOfl(undefined)).toBeUndefined();
  });

  it('uses the light’s own category, then its fixture type’s, then a guess', () => {
    const type = { ...withChannels('Par', 'red'), category: 'blinder' };
    expect(categoryOf({ category: 'strobe' }, type)).toBe('strobe');
    expect(categoryOf({}, type)).toBe('blinder');
    expect(categoryOf({}, withChannels('Par', 'red'))).toBe('par');
    expect(categoryOf({}, undefined)).toBe('other');
  });
});
