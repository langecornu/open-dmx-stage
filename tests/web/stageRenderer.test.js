// Tests for the visualizer's renderer, with a stand-in 2D canvas that records what is drawn (jsdom has no canvas): every
// kind of light in every view, smoke, fans, bubbles, strobes, arranging, picking a light, and lighter detail.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { positionOf } from '../../shared/stageRig.js';
import { createStageRenderer } from '../../src/utils/stageRenderer.js';

/** A stand-in 2D context: every drawing call is counted; gradients and patterns are inert. */
function fakeContext(counts) {
  const gradient = { addColorStop: () => {} };
  return new Proxy(
    {
      canvas: null,
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      createPattern: () => ({}),
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      measureText: (text) => ({ width: text.length * 6 }),
    },
    {
      get(target, key) {
        if (key in target) {
          return target[key];
        }
        return (...args) => {
          counts[key] = (counts[key] ?? 0) + 1;
          return args;
        };
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    },
  );
}

const rig = { shape: 'square', uprights: true, width: 8, depth: 6, height: 4 };
const lit = (r, g, b, level = 1) => ({ r, g, b, level });
const base = {
  color: { r: 255, g: 0, b: 0 },
  intensity: 1,
  pan: null,
  tilt: null,
  spread: 12,
  strobeHz: 0,
  gobo: false,
  prism: false,
  fog: 0,
  cells: [lit(255, 0, 0)],
  tilts: [],
  rotation: 0,
  fan: 0,
  effect: 0,
};

/** One light of every kind, each doing what makes it draw its own way. */
const lights = [
  ['par', { rail: 'back', at: 0.2 }, {}],
  ['moving-head', { rail: 'front', at: 0.5 }, { pan: 40, tilt: 30, gobo: true, prism: true, strobeHz: 10 }],
  ['spot', { rail: 'left', at: 0.5 }, { gobo: true }],
  ['scanner', { rail: 'right', at: 0.5 }, { pan: -20, tilt: 60 }],
  ['barrel-scanner', { rail: 'back', at: 0.9 }, { pan: 10, tilt: 10 }],
  [
    'led-bar',
    { rail: 'back', at: 0.5 },
    { cells: [lit(255, 0, 0), lit(0, 0, 255), lit(0, 255, 0), lit(255, 255, 255)] },
  ],
  ['matrix', { rail: 'post-back-left', at: 0.5 }, { cells: Array.from({ length: 9 }, () => lit(255, 0, 255)) }],
  ['spider', { rail: 'front', at: 0.2 }, { tilts: [-30, 30], cells: [lit(255, 0, 0), lit(0, 255, 0)] }],
  ['effect', { rail: 'right', at: 0.2 }, { rotation: 0.5, cells: [lit(255, 0, 0), lit(0, 0, 255)] }],
  ['flower', { rail: 'floor', x: 0.8, z: 0.2 }, { rotation: 0.8 }],
  ['laser', { rail: 'back', at: 0.7 }, { rotation: 0.4, color: { r: 0, g: 255, b: 0 } }],
  ['strobe', { rail: 'front', at: 0.8 }, { strobeHz: 15 }],
  ['blinder', { rail: 'front', at: 0.9 }, { cells: [lit(255, 200, 140), lit(255, 200, 140, 0)] }],
  ['mirror-ball', { rail: 'front', at: 0.4 }, { rotation: 0.3, cells: [], intensity: 0 }],
  ['smoke', { rail: 'floor', x: 0.05, z: 0.05 }, { fog: 1, cells: [], intensity: 0 }],
  ['hazer', { rail: 'floor', x: 0.95, z: 0.95 }, { fog: 0.8, cells: [], intensity: 0 }],
  ['fan', { rail: 'floor', x: 0.1, z: 0.9 }, { fan: 1, cells: [], intensity: 0 }],
  ['special-effect', { rail: 'floor', x: 0.5, z: 0.95 }, { effect: 1, cells: [], intensity: 0 }],
  ['dimmer', { rail: 'floor', x: 0.3, z: 0.3 }, {}],
].map(([category, mount, changes], index) => ({
  id: `l${index}`,
  name: `${category} light`,
  category,
  position: positionOf(rig, mount),
  state: { ...base, ...changes },
}));

let counts;
let canvas;
beforeEach(() => {
  counts = {};
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext(counts));
  canvas = document.createElement('canvas');
});
afterEach(() => vi.restoreAllMocks());

function run(renderer, frames, options = {}) {
  for (let index = 0; index < frames; index += 1) {
    renderer.frame({
      lights,
      dt: 1 / 30,
      time: index / 30,
      haze: 0.4,
      flashing: true,
      editing: false,
      selectedId: null,
      showNames: false,
      ...options,
    });
  }
}

describe('createStageRenderer', () => {
  it('is nothing where the browser cannot draw', () => {
    vi.restoreAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(createStageRenderer(document.createElement('canvas'))).toBeNull();
  });

  it.each(['front', 'corner', 'above'])('draws every kind of light from the %s, over a few seconds', (view) => {
    const renderer = createStageRenderer(canvas);
    renderer.resize(1200, 800);
    renderer.setScene({ view, rig });
    run(renderer, 90);
    expect(counts.fill).toBeGreaterThan(100);
    expect(counts.drawImage).toBeGreaterThan(0); // the beam layer, added to the picture
    expect(canvas.width).toBe(1200);
  });

  it('labels the lights and rings them while arranging, and finds the light under a finger', () => {
    const renderer = createStageRenderer(canvas);
    renderer.resize(1200, 800);
    renderer.setScene({ view: 'above', rig });
    run(renderer, 2, { editing: true, selectedId: 'l0', showNames: true });
    expect(counts.fillText).toBe(lights.length * 2); // one label per light, in each of the two frames
    const at = renderer.camera().project(lights[0].position);
    expect(renderer.hitTest(at.x, at.y + 0.15 * at.scale)).toBe('l0');
    expect(renderer.hitTest(-500, -500)).toBeNull();
  });

  it('draws with lighter detail when asked, and keeps working', () => {
    const renderer = createStageRenderer(canvas);
    renderer.resize(800, 600);
    renderer.setScene({ view: 'corner', rig: { shape: 'none' } });
    renderer.setQuality('low');
    run(renderer, 30, { flashing: false });
    renderer.setQuality('high');
    run(renderer, 5);
    expect(counts.fill).toBeGreaterThan(0);
  });
});
