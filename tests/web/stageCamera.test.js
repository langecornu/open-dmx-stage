// Tests for the visualizer's camera: it frames the whole rig, cuts lines where they pass it, finds where beams land, and
// turns a finger on the screen into a place on a rail or the floor.
import { describe, expect, it } from 'vitest';

import { railsOf } from '../../shared/stageRig.js';
import { MAX_BEAM, beamEnd, makeCamera, screenToMount } from '../../src/utils/stageCamera.js';

const rig = { shape: 'square', uprights: true, width: 8, depth: 6, height: 4 };

describe('makeCamera', () => {
  it.each(['front', 'corner', 'above'])('frames every rail of the rig on screen from the %s', (view) => {
    for (const [width, height] of [
      [1600, 900],
      [820, 1100],
    ]) {
      const camera = makeCamera(width, height, view, rig);
      for (const rail of railsOf(rig)) {
        for (const point of [rail.from, rail.to]) {
          const at = camera.project(point);
          expect(at.visible).toBe(true);
          expect(at.x).toBeGreaterThanOrEqual(0);
          expect(at.x).toBeLessThanOrEqual(width);
          expect(at.y).toBeGreaterThanOrEqual(0);
          expect(at.y).toBeLessThanOrEqual(height);
        }
      }
    }
  });

  it('cuts a line where it passes the camera, and drops one wholly behind it', () => {
    const camera = makeCamera(1000, 800, 'front', rig);
    const behind = { x: 0, y: 2, z: camera.eye.z + 5 };
    const front = { x: 0, y: 2, z: 0 };
    const cut = camera.clip(front, behind);
    expect(cut).not.toBeNull();
    expect(camera.project(cut[1]).visible).toBe(true);
    expect(cut[1].z).toBeLessThan(camera.eye.z);
    expect(camera.clip(behind, { ...behind, x: 3 })).toBeNull();
  });
});

describe('beamEnd', () => {
  it('stops a beam on the floor, or at its longest in the air', () => {
    expect(beamEnd({ x: 0, y: 4, z: 0 }, { x: 0, y: -1, z: 0 })).toMatchObject({
      point: { x: 0, y: 0, z: 0 },
      length: 4,
      surface: 'floor',
    });
    expect(beamEnd({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 })).toMatchObject({ length: MAX_BEAM, surface: 'air' });
  });
});

describe('screenToMount', () => {
  it('finds the rail under a finger and where along it, or the floor elsewhere', () => {
    const camera = makeCamera(1200, 900, 'above', rig);
    const back = railsOf(rig).find((rail) => rail.id === 'back');
    const quarter = { x: back.from.x + (back.to.x - back.from.x) * 0.25, y: back.from.y, z: back.from.z };
    const at = camera.project(quarter);
    const mount = screenToMount(camera, rig, at.x, at.y);
    expect(mount.rail).toBe('back');
    expect(mount.at).toBeCloseTo(0.25, 1);

    const centre = camera.project({ x: 0, y: 0, z: 0 });
    expect(screenToMount(camera, rig, centre.x, centre.y)).toEqual({ rail: 'floor', x: 0.5, z: 0.5 });
  });
});
