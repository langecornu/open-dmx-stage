// Tests for the visualizer's rig: the rails each truss shape has, where a mounted light is and which way it faces, and
// the first places given to lights not placed yet.
import { describe, expect, it } from 'vitest';

import { DEFAULT_RIG, mountsOf, positionOf, railsOf, rigOrDefault } from '../../shared/stageRig.js';

const ids = (rig) => railsOf(rig).map((rail) => rail.id);

describe('railsOf', () => {
  it('gives each shape its truss sides, and uprights where they stand', () => {
    expect(ids({ shape: 'line', uprights: true })).toEqual(['back', 'post-back-left', 'post-back-right']);
    expect(ids({ shape: 'u', uprights: false })).toEqual(['back', 'left', 'right']);
    expect(ids({ shape: 'square', uprights: true })).toEqual([
      'back',
      'front',
      'left',
      'right',
      'post-back-left',
      'post-back-right',
      'post-front-left',
      'post-front-right',
    ]);
    expect(ids({ shape: 'front-back', uprights: false })).toEqual(['back', 'front']);
    expect(ids({ shape: 'none', uprights: true })).toEqual([]);
  });

  it('puts the truss at the rig height around a floor of its size, and uprights from the floor up', () => {
    const rails = railsOf({ shape: 'square', uprights: true, width: 10, depth: 6, height: 5 });
    expect(rails.find((rail) => rail.id === 'back')).toMatchObject({
      from: { x: -5, y: 5, z: -3 },
      to: { x: 5, y: 5, z: -3 },
      vertical: false,
    });
    expect(rails.find((rail) => rail.id === 'post-front-right')).toMatchObject({
      from: { x: 5, y: 0, z: 3 },
      to: { x: 5, y: 5, z: 3 },
      vertical: true,
    });
  });
});

describe('rigOrDefault', () => {
  it('fills in what is missing and keeps sizes within limits', () => {
    expect(rigOrDefault(undefined)).toEqual(DEFAULT_RIG);
    expect(rigOrDefault({ shape: 'nonsense', width: 999, height: 0 })).toMatchObject({
      shape: 'line',
      width: 40,
      height: 1.5,
    });
  });
});

describe('positionOf', () => {
  const rig = { shape: 'square', uprights: true, width: 8, depth: 6, height: 4 };

  it('hangs a light under its rail at its place along it, facing the middle of the floor', () => {
    const middleOfBack = positionOf(rig, { rail: 'back', at: 0.5 });
    expect(middleOfBack).toMatchObject({ x: 0, y: 3.75, z: -3, hung: true, rail: 'back' });
    expect(middleOfBack.facing).toBeCloseTo(0); // toward the front
    const rightSide = positionOf(rig, { rail: 'right', at: 0.5 });
    expect(rightSide.x).toBe(4);
    expect(rightSide.facing).toBeCloseTo(-90); // toward the middle, on its left
  });

  it('stands a light on an upright, a little in from the corner, at its height', () => {
    const post = positionOf(rig, { rail: 'post-back-left', at: 0.5 });
    expect(post).toMatchObject({ y: 2, hung: false, rail: 'post-back-left' });
    expect(post.x).toBeGreaterThan(-4);
    expect(post.z).toBeGreaterThan(-3);
  });

  it('puts a light on the floor, or there when its rail is gone', () => {
    expect(positionOf(rig, { rail: 'floor', x: 0, z: 1 })).toMatchObject({ x: -4, y: 0.2, z: 3, hung: false });
    expect(positionOf({ ...rig, shape: 'line' }, { rail: 'front', at: 0.5 }).rail).toBe('floor');
  });
});

describe('mountsOf', () => {
  const category = (fixture) => fixture.kind;

  it('shares lights among the truss rails in turn, spaced along each, and machines at the floor corners', () => {
    const fixtures = [
      { id: 'a', kind: 'par' },
      { id: 'b', kind: 'par' },
      { id: 'c', kind: 'par' },
      { id: 'smoke', kind: 'smoke' },
    ];
    const mounts = mountsOf(fixtures, category, { shape: 'front-back' });
    expect(mounts.get('a')).toEqual({ rail: 'back', at: 1 / 3 });
    expect(mounts.get('b')).toEqual({ rail: 'front', at: 0.5 });
    expect(mounts.get('c')).toEqual({ rail: 'back', at: 2 / 3 });
    expect(mounts.get('smoke')).toMatchObject({ rail: 'floor' });
  });

  it('keeps where a light was placed, and puts lights on the floor when there is no truss', () => {
    const fixtures = [
      { id: 'placed', kind: 'par', stage: { rail: 'left', at: 0.2 } },
      { id: 'other', kind: 'par' },
    ];
    expect(mountsOf(fixtures, category, { shape: 'u' }).get('placed')).toEqual({ rail: 'left', at: 0.2 });
    expect(mountsOf(fixtures, category, { shape: 'none' }).get('other')).toMatchObject({ rail: 'floor' });
  });
});
