// The tags behind the Looks and Sequences filters: palette, speed and style, read from what a look or sequence does.
import { describe, expect, it } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { NO_FILTER, chaseTags, matchesFilter, paletteOf, sceneTags } from '../../src/utils/lookTags.js';
import { BUILTIN_TYPES, makeShow } from './fixtures.js';

const rgb = (hex, weight = 1) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255, weight };
};

describe('paletteOf', () => {
  it('names blues, violets, warm, greens and white', () => {
    expect(paletteOf([rgb('#0033cc'), rgb('#00c8ff')])).toBe('Blues');
    expect(paletteOf([rgb('#8000ff'), rgb('#ff00ff')])).toBe('Violets');
    expect(paletteOf([rgb('#ff2000'), rgb('#ffb000')])).toBe('Warm');
    expect(paletteOf([rgb('#00ff40')])).toBe('Greens');
    expect(paletteOf([rgb('#ffffff')])).toBe('White');
  });

  it('calls blue with violet a blend, and several families mixed', () => {
    expect(paletteOf([rgb('#0033cc'), rgb('#8000ff')])).toBe('Blue and violet');
    expect(paletteOf([rgb('#ff0000'), rgb('#00ff00'), rgb('#0000ff')])).toBe('Mixed');
  });

  it('is null for a dark look and ignores white accents among colours', () => {
    expect(paletteOf([rgb('#000000')])).toBeNull();
    expect(paletteOf([rgb('#0033cc', 5), rgb('#ffffff', 1)])).toBe('Blues');
  });
});

describe('chaseTags', () => {
  const project = makeShow();
  const patch = buildPatch(project, BUILTIN_TYPES);
  const block = (changes) => ({
    id: 'b',
    fixtureId: 'f',
    start: 0,
    length: 4,
    color: '#0033cc',
    intensity: 100,
    transition: 'none',
    endColor: '#0033cc',
    endIntensity: 100,
    effect: 'none',
    strobeSpeed: 50,
    ...changes,
  });
  const chase = (blocks, tempo = 120) => ({
    id: 'c',
    name: 'C',
    loop: true,
    timing: 'beats',
    steps: [],
    blocks,
    tempo,
  });

  it('reads palette and styles from the blocks', () => {
    const tags = chaseTags(
      chase([
        block({ effect: 'strobe' }),
        block({
          settings: { pan: 10, tilt: 20 },
          endSettings: { pan: 90, tilt: 80 },
          transition: 'fade',
          endIntensity: 20,
        }),
      ]),
      project,
      patch,
    );
    expect(tags.palette).toBe('Blues');
    expect([...tags.styles].sort()).toEqual(['Dimming', 'Movement', 'Strobe']);
  });

  it('is faster with quick rhythms and a quick tempo than with long blocks', () => {
    const slow = chaseTags(chase([block({ length: 32 })]), project, patch).speed;
    const quick = chaseTags(
      chase([block({ length: 8, effect: 'flash', rhythmBeats: 0.25 })], 170),
      project,
      patch,
    ).speed;
    expect(slow).toBe('Slow');
    expect(quick).toBe('Max');
  });

  it('filters by each tag', () => {
    const tags = { palette: 'Blues', speed: 'Fast', styles: new Set(['Strobe']) };
    expect(matchesFilter(tags, NO_FILTER)).toBe(true);
    expect(matchesFilter(tags, { ...NO_FILTER, palette: 'Blues', style: 'Strobe' })).toBe(true);
    expect(matchesFilter(tags, { ...NO_FILTER, speed: 'Slow' })).toBe(false);
    expect(matchesFilter(tags, { ...NO_FILTER, style: 'Beat' })).toBe(false);
  });
});

describe('sceneTags', () => {
  it('reads a look: palette from its lit lights, and Still when nothing moves or strobes', () => {
    const project = makeShow({ scenes: [{ id: 's', name: 'Blue', values: { 3: 255 } }] });
    const patch = buildPatch(project, BUILTIN_TYPES);
    const tags = sceneTags(project.scenes[0], project, patch);
    expect(tags.palette).toBe('Blues');
    expect([...tags.styles]).toEqual(['Still']);
  });
});
