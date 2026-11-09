// Tests for turning a colour and brightness into DMX channel values per fixture.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyColor } from '../src/utils/colorControl.js';

function patchOf(types) {
  const channels = new Map();
  types.forEach((type, index) => channels.set(index + 1, { type }));
  return { channels };
}
const range = (count) => ({ start: 1, end: count });

describe('applyColor', () => {
  it('scales RGB by brightness when the fixture has no dimmer channel', () => {
    const values = applyColor(range(3), patchOf(['red', 'green', 'blue']), [200, 100, 0], 0.5);
    assert.deepEqual(values, { 1: 100, 2: 50, 3: 0 }, 'colour is scaled by brightness');
  });

  it('keeps the colour pure and uses the dimmer channel for brightness when present', () => {
    const values = applyColor(range(4), patchOf(['intensity', 'red', 'green', 'blue']), [200, 100, 0], 0.5);
    assert.deepEqual(values, { 1: 128, 2: 200, 3: 100, 4: 0 }, 'dimmer carries brightness, colour untouched');
  });

  it('zeroes white, amber and UV so a colour is not washed out', () => {
    const values = applyColor(range(5), patchOf(['red', 'green', 'blue', 'white', 'uv']), [255, 0, 0], 1);
    assert.equal(values[4], 0, 'white is cleared');
    assert.equal(values[5], 0, 'UV is cleared');
  });

  it('drives a dimmer-only fixture by brightness and ignores fixtures with nothing to light', () => {
    assert.deepEqual(
      applyColor(range(1), patchOf(['intensity']), [255, 0, 0], 0.25),
      { 1: 64 },
      'dimmer follows brightness',
    );
    assert.deepEqual(
      applyColor(range(2), patchOf(['pan', 'tilt']), [255, 0, 0], 1),
      {},
      'position-only fixtures are untouched',
    );
    assert.deepEqual(applyColor(undefined, patchOf([]), [255, 0, 0], 1), {}, 'a missing fixture is ignored');
  });

  it('switches a dimmer-and-RGB fixture fully off for the Off colour', () => {
    const values = applyColor(range(4), patchOf(['intensity', 'red', 'green', 'blue']), [0, 0, 0], 1);
    assert.equal(values[1], 0, 'dimmer goes to zero for black');
  });
});

describe('averageColor', () => {
  it('averages only lit fixtures and falls back to all when everything is dark', async () => {
    const { averageColor } = await import('../src/utils/sceneColors.js');
    const lit = averageColor([
      { r: 200, g: 0, b: 0, level: 0.8 },
      { r: 0, g: 0, b: 0, level: 0 },
      { r: 100, g: 100, b: 0, level: 0.4 },
    ]);
    assert.deepEqual([lit.r, lit.g, lit.b], [150, 50, 0], 'dark fixtures are ignored in the mean');
    const dark = averageColor([{ r: 0, g: 0, b: 0, level: 0 }]);
    assert.equal(dark.level, 0, 'all-dark input stays dark');
    assert.equal(averageColor([]).css, 'rgb(0, 0, 0)', 'no fixtures gives black');
  });
});
