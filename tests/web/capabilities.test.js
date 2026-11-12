// Tests for fixture capabilities: the controls worked out from a fixture's channels, what a control value sends, and
// what a timeline block writes to a light besides its colour.
import { describe, expect, it } from 'vitest';

import {
  controlDmx,
  controlValueOf,
  fixtureControls,
  matchOption,
  mergeControls,
  nearestColourOption,
} from '../../shared/capabilities.js';
import { blockControlWrites, settingsAt } from '../../shared/timeline.js';

// A moving head: pan and pan fine, tilt, a colour wheel with three colours, a gobo wheel, a shutter, a dimmer.
const movingHead = [
  { name: 'Pan', type: 'pan' },
  { name: 'Pan fine', type: 'pan-fine' },
  { name: 'Tilt', type: 'tilt' },
  {
    name: 'Colour',
    type: 'color-wheel',
    capabilities: [
      { from: 0, to: 9, type: 'color-slot', label: 'White', color: '#ffffff' },
      { from: 10, to: 19, type: 'color-slot', label: 'Red', color: '#ff0000' },
      { from: 20, to: 29, type: 'color-slot', label: 'Blue', color: '#0000ff' },
    ],
  },
  {
    name: 'Gobo',
    type: 'gobo',
    capabilities: [
      { from: 0, to: 7, type: 'gobo-slot', label: 'Open' },
      { from: 8, to: 15, type: 'gobo-slot', label: 'Star' },
    ],
  },
  {
    name: 'Shutter',
    type: 'strobe',
    capabilities: [
      { from: 0, to: 9, type: 'shutter-closed' },
      { from: 10, to: 19, type: 'shutter-open' },
      { from: 20, to: 255, type: 'strobe', label: 'Strobe slow to fast' },
    ],
  },
  { name: 'Dimmer', type: 'intensity' },
  { name: 'Macro', type: 'other' },
];

const head = fixtureControls(movingHead, 101);
const byKey = (controls, key) => controls.find((control) => control.key === key);

describe('fixtureControls', () => {
  it('makes a control of everything but colour, dimmer and fine channels, in place on the DMX line', () => {
    expect(head.map((control) => [control.key, control.group, control.kind, control.channel])).toEqual([
      ['pan', 'Movement', 'range', 101],
      ['tilt', 'Movement', 'range', 103],
      ['color-wheel', 'Colour', 'choice', 104],
      ['gobo', 'Beam', 'choice', 105],
      ['strobe', 'Shutter', 'choice', 106],
      ['channel:Macro', 'Other', 'range', 108],
    ]);
    expect(byKey(head, 'pan').fineChannel).toBe(102);
    expect(byKey(head, 'channel:Macro').label).toBe('Macro');
  });

  it('names a second channel of the same kind after itself', () => {
    const spider = fixtureControls(
      [
        { name: 'Motor 1', type: 'tilt' },
        { name: 'Motor 2', type: 'tilt' },
      ],
      1,
    );
    expect(spider.map((control) => [control.key, control.label])).toEqual([
      ['tilt', 'Tilt'],
      ['tilt:2', 'Motor 2'],
    ]);
  });
});

describe('controlDmx and controlValueOf', () => {
  it('sends a 16-bit pan on its coarse and fine channels, and reads it back', () => {
    const pan = byKey(head, 'pan');
    expect(controlDmx(pan, 50)).toEqual([
      [101, 128],
      [102, 0],
    ]); // 50% of 65535 rounds to 32768
    expect(controlValueOf(pan, 128, 0)).toBe(50);
    expect(controlDmx(pan, 25)).toEqual([
      [101, 64],
      [102, 0],
    ]);
  });

  it('sends the middle of a picked range, or a level inside a continuous one', () => {
    const shutter = byKey(head, 'strobe');
    expect(controlDmx(shutter, { option: 1, level: 0 })).toEqual([[106, 15]]);
    expect(controlDmx(shutter, { option: 2, level: 50 })).toEqual([[106, 138]]);
    expect(controlValueOf(shutter, 138)).toEqual({ option: 2, level: 50 });
  });

  it('runs a reversed range from its end down to its start', () => {
    const [speed] = fixtureControls(
      [{ name: 'Speed', type: 'speed', capabilities: [{ from: 0, to: 255, type: 'speed', reverse: true }] }],
      1,
    );
    expect(controlDmx(speed, 100)).toEqual([[1, 0]]);
    expect(controlDmx(speed, 0)).toEqual([[1, 255]]);
  });
});

describe('merging and matching', () => {
  it('merges controls of several fixtures by kind, in group order', () => {
    const fog = fixtureControls([{ name: 'Output', type: 'fog' }], 200);
    const merged = mergeControls([fog, head]);
    expect(merged.map((control) => control.key)).toEqual([
      'color-wheel',
      'strobe',
      'pan',
      'tilt',
      'gobo',
      'fog',
      'channel:Macro',
    ]);
  });

  it('matches a choice on another fixture by name, else by position', () => {
    const other = fixtureControls(
      [
        {
          name: 'Gobo',
          type: 'gobo',
          capabilities: [
            { from: 0, to: 9, type: 'gobo-slot', label: 'Star' },
            { from: 10, to: 19, type: 'gobo-slot', label: 'Dots' },
          ],
        },
      ],
      1,
    )[0];
    expect(matchOption(byKey(head, 'gobo'), other, 1)).toBe(0); // "Star"
    expect(matchOption(byKey(head, 'gobo'), other, 0)).toBe(0); // "Open" is not there: same position
  });

  it('finds the colour slot nearest to a colour', () => {
    expect(nearestColourOption(byKey(head, 'color-wheel'), [230, 20, 10])).toBe(1);
    expect(nearestColourOption(byKey(head, 'color-wheel'), [10, 30, 200])).toBe(2);
  });
});

describe('what a block writes to a light', () => {
  const block = (fields) => ({
    id: 'b',
    fixtureId: 'f',
    start: 0,
    length: 4,
    color: '#0000ff',
    intensity: 100,
    transition: 'none',
    endColor: '#0000ff',
    endIntensity: 100,
    effect: 'none',
    strobeSpeed: 50,
    ...fields,
  });
  const blue = { red: 0, green: 0, blue: 255, level: 1 };

  it('opens the shutter and picks the nearest colour slot on a light with a colour wheel', () => {
    expect(blockControlWrites(block({}), 0, blue, head, false)).toEqual([
      [106, 15],
      [104, 25],
    ]);
  });

  it('applies the block’s settings, and its own shutter setting instead of opening it', () => {
    const writes = blockControlWrites(
      block({ settings: { gobo: { option: 1, level: 0 }, strobe: { option: 0, level: 0 } } }),
      0,
      blue,
      head,
      true,
    );
    expect(writes).toEqual([
      [105, 12],
      [106, 5],
    ]);
  });

  it('fades a pan across the block, so the head moves', () => {
    const moving = block({ transition: 'fade', settings: { pan: 0 }, endSettings: { pan: 100 } });
    expect(settingsAt(moving, 2).get('pan')).toBe(50);
    expect(blockControlWrites(moving, 4, blue, [byKey(head, 'pan')], true)).toEqual([
      [101, 255],
      [102, 255],
    ]);
  });

  it('sets cyan, magenta and yellow from the colour on a light that mixes colour that way', () => {
    const cmy = fixtureControls(
      [
        { name: 'C', type: 'cyan' },
        { name: 'M', type: 'magenta' },
        { name: 'Y', type: 'yellow' },
      ],
      1,
    );
    expect(blockControlWrites(block({}), 0, blue, cmy, false)).toEqual([
      [1, 255],
      [2, 255],
      [3, 0],
    ]);
  });
});
