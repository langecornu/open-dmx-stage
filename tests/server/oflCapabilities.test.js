// Tests for importing Open Fixture Library capabilities: value ranges, slot names and colours, directions, and what a
// channel is overall, using a moving head and a fog machine written the way OFL writes them.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { convertOpenFixtureLibrary } from '../../server/services/fixtureLibrary.js';
import { classifyOflChannel, convertCapabilities } from '../../server/services/oflCapabilities.js';

const movingHead = {
  name: 'Test Spot',
  wheels: {
    'Color Wheel': {
      slots: [
        { type: 'Open' },
        { type: 'Color', name: 'Red', colors: ['#FF0000'] },
        { type: 'Color', name: 'Deep blue', colors: ['#0000ff'] },
      ],
    },
    'Gobo Wheel': { slots: [{ type: 'Open' }, { type: 'Gobo', name: 'Star' }] },
  },
  availableChannels: {
    Pan: { fineChannelAliases: ['Pan fine'], capability: { type: 'Pan', angleStart: '0deg', angleEnd: '540deg' } },
    'Color Wheel': {
      capabilities: [
        { dmxRange: [0, 9], type: 'WheelSlot', slotNumber: 1 },
        { dmxRange: [10, 19], type: 'WheelSlot', slotNumber: 2 },
        { dmxRange: [20, 29], type: 'WheelSlot', slotNumber: 3 },
        { dmxRange: [30, 255], type: 'WheelRotation', speedStart: 'slow CW', speedEnd: 'fast CW' },
      ],
    },
    'Gobo Wheel': {
      capabilities: [
        { dmxRange: [0, 63], type: 'WheelSlot', slotNumber: 1 },
        { dmxRange: [64, 127], type: 'WheelSlot', slotNumber: 2 },
        { dmxRange: [128, 255], type: 'WheelShake', slotNumber: 2, shakeSpeedStart: 'slow', shakeSpeedEnd: 'fast' },
      ],
    },
    Shutter: {
      capabilities: [
        { dmxRange: [0, 7], type: 'ShutterStrobe', shutterEffect: 'Closed' },
        { dmxRange: [8, 15], type: 'ShutterStrobe', shutterEffect: 'Open' },
        { dmxRange: [16, 255], type: 'ShutterStrobe', shutterEffect: 'Strobe', speedStart: '1Hz', speedEnd: '20Hz' },
      ],
    },
    'Pan/Tilt Speed': { capability: { type: 'PanTiltSpeed', speedStart: 'fast', speedEnd: 'slow' } },
    Dimmer: { capability: { type: 'Intensity' } },
  },
  modes: [{ name: 'Standard', channels: ['Pan', 'Pan fine', 'Color Wheel', 'Gobo Wheel', 'Shutter', 'Dimmer'] }],
};

describe('convertCapabilities', () => {
  it('keeps every range of a channel with the names and colours of its wheel slots', () => {
    const capabilities = convertCapabilities(
      movingHead.availableChannels['Color Wheel'],
      'Color Wheel',
      movingHead.wheels,
    );
    assert.deepEqual(capabilities, [
      { from: 0, to: 9, type: 'color-slot', label: 'Open (white)', color: '#ffffff' },
      { from: 10, to: 19, type: 'color-slot', label: 'Red', color: '#ff0000' },
      { from: 20, to: 29, type: 'color-slot', label: 'Deep blue', color: '#0000ff' },
      { from: 30, to: 255, type: 'wheel-rotation', label: 'Rotation' },
    ]);
  });

  it('turns a shutter into closed, open and a strobe range', () => {
    const capabilities = convertCapabilities(movingHead.availableChannels.Shutter, 'Shutter', {});
    assert.deepEqual(
      capabilities.map((capability) => [capability.type, capability.from, capability.to]),
      [
        ['shutter-closed', 0, 7],
        ['shutter-open', 8, 15],
        ['strobe', 16, 255],
      ],
    );
  });

  it('marks a range that runs from high to low, and leaves a single full-range capability unlisted', () => {
    const reversed = convertCapabilities(
      {
        capabilities: [
          { dmxRange: [0, 127], type: 'Speed', speedStart: 'fast', speedEnd: 'slow' },
          { dmxRange: [128, 255], type: 'NoFunction' },
        ],
      },
      'Speed',
      {},
    );
    assert.equal(reversed[0].reverse, true);
    assert.deepEqual(convertCapabilities(movingHead.availableChannels.Dimmer, 'Dimmer', {}), []);
  });

  it('ignores ranges that are not 8-bit values', () => {
    const capabilities = convertCapabilities(
      {
        capabilities: [
          { dmxRange: [0, 65535], type: 'Pan' },
          { dmxRange: [0, 9], type: 'NoFunction' },
          { type: 'Pan' },
        ],
      },
      'Pan',
      {},
    );
    assert.deepEqual(capabilities, [{ from: 0, to: 9, type: 'none', label: 'No function' }]);
  });
});

describe('classifyOflChannel', () => {
  it('tells what a channel is from its capabilities and its wheel', () => {
    const { availableChannels: c, wheels } = movingHead;
    assert.equal(classifyOflChannel('Color Wheel', c['Color Wheel'], wheels), 'color-wheel');
    assert.equal(classifyOflChannel('Gobo Wheel', c['Gobo Wheel'], wheels), 'gobo');
    assert.equal(classifyOflChannel('Shutter', c.Shutter, wheels), 'strobe');
    assert.equal(classifyOflChannel('Pan/Tilt Speed', c['Pan/Tilt Speed'], wheels), 'pan-tilt-speed');
    assert.equal(classifyOflChannel('Fog', { capability: { type: 'FogOutput' } }), 'fog');
    assert.equal(classifyOflChannel('Fan', { capability: { type: 'Speed' } }), 'fan');
    assert.equal(
      classifyOflChannel('Zoom', { capability: { type: 'Zoom', angleStart: '10deg', angleEnd: '40deg' } }),
      'zoom',
    );
    assert.equal(
      classifyOflChannel('WW', { capability: { type: 'ColorIntensity', color: 'Warm White' } }),
      'warm-white',
    );
  });
});

describe('convertOpenFixtureLibrary with capabilities', () => {
  it('imports a moving head with its ranges, and its pan fine channel as the fine half of pan', () => {
    const converted = convertOpenFixtureLibrary(movingHead, 'Test');
    const channels = converted.modes[0].channels;
    assert.deepEqual(
      channels.map((channel) => [channel.name, channel.type, (channel.capabilities ?? []).length]),
      [
        ['Pan', 'pan', 0],
        ['Pan fine', 'pan-fine', 0],
        ['Color Wheel', 'color-wheel', 4],
        ['Gobo Wheel', 'gobo', 3],
        ['Shutter', 'strobe', 3],
        ['Dimmer', 'intensity', 0],
      ],
    );
  });
});
