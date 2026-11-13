// Tests for what each light is doing, read from the DMX frame, for the visualizer: colour, brightness, movement, cells,
// strobe, fog, fan and effects, across the built-in fixtures.
import { describe, expect, it } from 'vitest';

import { controlsByFixture } from '../../shared/capabilities.js';
import { buildPatch, indexFixtureTypes } from '../../shared/patch.js';
import { BUILTIN_FIXTURE_TYPES } from '../../server/services/fixtureLibrary.js';
import { colourCells, visualState } from '../../src/utils/visualState.js';

/** Reads one light from a frame of values by channel. */
function stateOf(typeId, mode, values, category) {
  const project = { fixtureTypes: [], fixtures: [{ id: 'f', name: 'F', typeId, mode, address: 1 }] };
  const patch = buildPatch(project, BUILTIN_FIXTURE_TYPES);
  const controls = controlsByFixture(project, indexFixtureTypes(project, BUILTIN_FIXTURE_TYPES)).get('f') ?? [];
  return visualState({
    range: patch.fixtures[0],
    patch,
    controls,
    category,
    valueOf: (channel) => values[channel] ?? 0,
  });
}

describe('visualState', () => {
  it('reads an RGB par: its colour at full brightness and how bright it is', () => {
    const state = stateOf('generic-rgb-par', 0, { 1: 128, 2: 0, 3: 64 }, 'par');
    expect(state.intensity).toBeCloseTo(128 / 255);
    expect(state.color).toEqual({ r: 255, g: 0, b: 127.5 });
    expect(state.pan).toBeNull();
  });

  it('reads a moving head: pan and tilt in degrees from centre, its dimmer, and a closed shutter as dark', () => {
    const type = BUILTIN_FIXTURE_TYPES.find((entry) => entry.id === 'generic-moving-head');
    const channels = type.modes[0].channels;
    const at = (kind) => channels.findIndex((channel) => channel.type === kind) + 1;
    const values = { [at('pan')]: 255, [at('tilt')]: 128, [at('intensity')]: 255 };
    const state = stateOf('generic-moving-head', 0, values, 'moving-head');
    expect(state.pan).toBeCloseTo(270);
    expect(Math.abs(state.tilt)).toBeLessThan(2);
  });

  it('gives an LED bar one cell per segment, each in its own colour', () => {
    const values = {};
    for (let cell = 0; cell < 8; cell += 1) {
      values[cell * 3 + 1] = cell % 2 === 0 ? 255 : 0; // red on even cells
      values[cell * 3 + 3] = cell % 2 === 0 ? 0 : 255; // blue on odd ones
    }
    const state = stateOf('generic-led-bar-8', 1, values, 'led-bar');
    expect(state.cells).toHaveLength(8);
    expect(state.cells[0]).toMatchObject({ r: 255, b: 0, level: 1 });
    expect(state.cells[1]).toMatchObject({ r: 0, b: 255, level: 1 });
  });

  it('gives a spider two bars and both tilt motors', () => {
    const state = stateOf('generic-spider-8x10w-rgbw', 0, { 1: 0, 2: 255, 4: 255, 6: 255, 11: 255 }, 'spider');
    expect(state.tilts).toHaveLength(2);
    expect(state.tilts[0]).toBeLessThan(0);
    expect(state.tilts[1]).toBeGreaterThan(0);
    expect(state.cells).toHaveLength(2);
    expect(state.cells[0]).toMatchObject({ r: 255, g: 0 });
    expect(state.cells[1]).toMatchObject({ g: 255 });
  });

  it('flashes a strobe from its own flash rate channel', () => {
    expect(stateOf('generic-strobe', 0, { 1: 255, 2: 0 }, 'strobe').strobeHz).toBe(0);
    expect(stateOf('generic-strobe', 0, { 1: 255, 2: 255 }, 'strobe').strobeHz).toBeCloseTo(20);
  });

  it('colours a laser or a scanner from its colour wheel', () => {
    const laser = stateOf('generic-rgb-laser', 0, { 1: 255, 2: 20 }, 'laser');
    expect(laser.color).toEqual({ r: 255, g: 0, b: 0 });
    expect(laser.intensity).toBe(1);
  });

  it('reads fog from a fog channel with an off range, a fan speed, and bubbles', () => {
    expect(stateOf('generic-fog-machine', 0, { 1: 5 }, 'smoke').fog).toBe(0);
    expect(stateOf('generic-fog-machine', 0, { 1: 255 }, 'smoke').fog).toBeGreaterThan(0.9);
    expect(stateOf('generic-fog-machine', 0, { 1: 255 }, 'smoke').cells).toEqual([]);
    expect(stateOf('generic-dmx-fan', 0, { 1: 128 }, 'fan').fan).toBeCloseTo(0.5, 1);
    expect(stateOf('generic-bubble-machine', 0, { 1: 255 }, 'special-effect').effect).toBe(1);
  });

  it('turns a derby or mirror ball by its rotation channel', () => {
    expect(stateOf('generic-led-derby-rgbw', 0, { 6: 0 }, 'effect').rotation).toBe(0);
    expect(stateOf('generic-led-derby-rgbw', 0, { 6: 255 }, 'effect').rotation).toBeGreaterThan(0.9);
    expect(stateOf('generic-mirror-ball-motor', 0, { 1: 200 }, 'mirror-ball').rotation).toBeGreaterThan(0.5);
  });

  it('is dark for a light whose fixture is missing', () => {
    expect(
      visualState({
        range: undefined,
        patch: { channels: new Map() },
        controls: [],
        category: 'par',
        valueOf: () => 0,
      }),
    ).toMatchObject({ intensity: 0, cells: [] });
  });
});

describe('colourCells', () => {
  it('gives a blinder a warm white lamp per dimmer', () => {
    const project = {
      fixtureTypes: [],
      fixtures: [{ id: 'f', name: 'F', typeId: 'generic-blinder-2', mode: 0, address: 1 }],
    };
    const patch = buildPatch(project, BUILTIN_FIXTURE_TYPES);
    const cells = colourCells(patch.fixtures[0], patch, (channel) => (channel === 1 ? 255 : 0));
    expect(cells.map((cell) => cell.level)).toEqual([1, 0]);
    expect(cells[0].b).toBeLessThan(cells[0].r);
  });
});
