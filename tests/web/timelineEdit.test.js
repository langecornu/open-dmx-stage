// Tests for timeline editing rules: snapping, drawing across lanes, moving and resizing inside the timeline, and words.
import { describe, expect, it } from 'vitest';

import { evaluateBlock } from '../../shared/timeline.js';
import {
  DEFAULT_STYLE,
  clampLength,
  describeBlock,
  dragSpan,
  drawBlocks,
  moveBlocks,
  repeatBlocks,
  shorteningLoss,
  snapDown,
} from '../../src/utils/timelineEdit.js';

const block = (fields) => ({ id: 'b', fixtureId: 'f', start: 0, length: 4, ...DEFAULT_STYLE, ...fields });

describe('timeline editing', () => {
  it('snaps down to the grid', () => {
    expect(snapDown(2.9, 1)).toBe(2);
    expect(snapDown(2.9, 0.5)).toBe(2.5);
    expect(snapDown(3, 0.25)).toBe(3);
  });

  it('covers whole grid cells from where the drag began to where it is, in either direction', () => {
    expect(dragSpan(1.2, 3.7, 1, 16)).toEqual({ start: 1, length: 3 });
    expect(dragSpan(3.7, 1.2, 1, 16)).toEqual({ start: 1, length: 3 });
    expect(dragSpan(2.1, 2.3, 0.5, 16)).toEqual({ start: 2, length: 0.5 });
    expect(dragSpan(14, 40, 1, 16)).toEqual({ start: 14, length: 2 });
  });

  it('draws one block per lane covered, in the current style', () => {
    let next = 0;
    const blocks = drawBlocks(['a', 'b'], { start: 2, length: 4 }, { color: '#00ff3c' }, () => `id${(next += 1)}`);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => [b.id, b.fixtureId, b.start, b.length, b.color])).toEqual([
      ['id1', 'a', 2, 4, '#00ff3c'],
      ['id2', 'b', 2, 4, '#00ff3c'],
    ]);
  });

  it('moves blocks together and stops them at the edges of the timeline', () => {
    const blocks = [block({ id: 'x', start: 2, length: 2 }), block({ id: 'y', start: 6, length: 4 })];
    expect([...moveBlocks(blocks, 3, 16)]).toEqual([
      ['x', 5],
      ['y', 9],
    ]);
    expect([...moveBlocks(blocks, -5, 16)]).toEqual([
      ['x', 0],
      ['y', 4],
    ]);
    expect([...moveBlocks(blocks, 20, 16)]).toEqual([
      ['x', 8],
      ['y', 12],
    ]);
  });

  it('keeps a resized block at least a quarter beat long and inside the timeline', () => {
    expect(clampLength(block({ start: 12 }), 10, 16)).toBe(4);
    expect(clampLength(block({ start: 0 }), 0, 16)).toBe(0.25);
  });

  it('describes a block in words, counting beats from 1', () => {
    expect(describeBlock(block({ start: 0, length: 4, color: '#ff0000', intensity: 80 }), 'Par 1')).toBe(
      'Par 1, beats 1 to 5, Red at 80%',
    );
    expect(
      describeBlock(block({ transition: 'fade', endColor: '#0040ff', endIntensity: 20, effect: 'strobe' }), 'Par 2'),
    ).toBe('Par 2, beats 1 to 5, Red at 100%, fading to Blue at 20%, strobe');
  });
});

describe('repeat and shorten', () => {
  it('repeats a selection straight after itself, keeping lights and gaps, and leaves out copies that do not fit', () => {
    let next = 0;
    const makeId = () => `c${(next += 1)}`;
    const selection = [
      block({ id: 'x', fixtureId: 'a', start: 0, length: 2 }),
      block({ id: 'y', fixtureId: 'b', start: 3, length: 1 }),
    ];
    expect(repeatBlocks(selection, 16, makeId).map((b) => [b.id, b.fixtureId, b.start, b.length])).toEqual([
      ['c1', 'a', 4, 2],
      ['c2', 'b', 7, 1],
    ]);
    expect(repeatBlocks([block({ start: 12, length: 4 })], 16, makeId)).toEqual([]);
    expect(repeatBlocks([], 16, makeId)).toEqual([]);
  });

  it('counts the blocks a shorter timeline would remove or cut', () => {
    const blocks = [block({ start: 0, length: 4 }), block({ start: 6, length: 4 }), block({ start: 12, length: 2 })];
    expect(shorteningLoss(blocks, 8)).toEqual({ removed: 1, cut: 1 });
    expect(shorteningLoss(blocks, 16)).toEqual({ removed: 0, cut: 0 });
  });
});

describe('evaluateBlock', () => {
  it('holds a colour, or fades it with its intensity across the block', () => {
    expect(evaluateBlock(block({ intensity: 40 }), 2, 0)).toEqual({ red: 255, green: 0, blue: 0, level: 0.4 });
    const fade = block({ transition: 'fade', color: '#ff0000', endColor: '#0000ff', intensity: 100, endIntensity: 0 });
    expect(evaluateBlock(fade, 1, 0)).toEqual({ red: 191, green: 0, blue: 64, level: 0.75 });
  });
});
