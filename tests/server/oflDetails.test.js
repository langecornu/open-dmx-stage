// Tests for the fixture details summary: plain data only, links limited to http and https, matrix modes flagged.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describeCapability, summariseOflFixture } from '../../server/services/oflDetails.js';

const DOCUMENT = {
  name: 'Illusion Dotz',
  categories: ['Matrix', 'Moving Head'],
  meta: { authors: ['Ann', 'Bob'], createDate: '2019-10-30', lastModifyDate: '2020-01-02' },
  links: {
    manual: ['https://example.test/manual.pdf', 'javascript:alert(1)', 'ftp://example.test/x', 'not a url'],
    productPage: ['http://example.test/product'],
    video: [],
  },
  helpWanted: 'Is the pixel order right?',
  physical: {
    dimensions: [492, 467, 393],
    weight: 16.5,
    power: 468,
    DMXconnector: '3-pin and 5-pin',
    bulb: { type: '16× 30W RGB COB LEDs' },
    lens: { degreesMinMax: [15, 15] },
  },
  availableChannels: {
    Pan: {
      fineChannelAliases: ['Pan fine'],
      defaultValue: '50%',
      capability: { type: 'Pan', angleStart: '0deg', angleEnd: '540deg' },
    },
    Shutter: {
      defaultValue: 32,
      capabilities: [
        { dmxRange: [0, 31], type: 'ShutterStrobe', shutterEffect: 'Closed' },
        { dmxRange: [32, 63], type: 'ShutterStrobe', shutterEffect: 'Open', comment: 'normal' },
      ],
    },
    Red: { capability: { type: 'ColorIntensity', color: 'Red' } },
  },
  modes: [
    { name: 'Basic', channels: ['Pan', 'Pan fine', 'Shutter', 'Red'] },
    { name: 'Pixels', channels: ['Red', { insert: 'matrixChannels', repeatFor: 'eachPixelABC' }] },
  ],
};

describe('summariseOflFixture', () => {
  const summary = summariseOflFixture(DOCUMENT);

  it('carries the names, dates and credit', () => {
    assert.equal(summary.name, 'Illusion Dotz');
    assert.deepEqual(summary.categories, ['Matrix', 'Moving Head']);
    assert.deepEqual(summary.authors, ['Ann', 'Bob']);
    assert.equal(summary.createDate, '2019-10-30');
    assert.equal(summary.lastModifyDate, '2020-01-02');
    assert.equal(summary.note, 'Is the pixel order right?');
  });

  it('passes on only http and https links', () => {
    assert.deepEqual(
      summary.links.manual,
      ['https://example.test/manual.pdf'],
      'javascript:, ftp: and junk are dropped',
    );
    assert.deepEqual(summary.links.productPage, ['http://example.test/product']);
    assert.deepEqual(summary.links.video, []);
    assert.deepEqual(summary.links.other, []);
  });

  it('lists the specifications that are present, with units', () => {
    const byLabel = Object.fromEntries(summary.specifications.map((row) => [row.label, row.value]));
    assert.equal(byLabel['Size (width × height × depth)'], '492 × 467 × 393 mm');
    assert.equal(byLabel.Weight, '16.5 kg');
    assert.equal(byLabel.Power, '468 W');
    assert.equal(byLabel['DMX connector'], '3-pin and 5-pin');
    assert.equal(byLabel['Light source'], '16× 30W RGB COB LEDs');
    assert.equal(byLabel['Beam angle'], '15°');
  });

  it('lists each mode with its channels, types, resting values and value ranges', () => {
    const basic = summary.modes[0];
    assert.equal(basic.name, 'Basic');
    assert.equal(basic.isSupported, true);
    assert.deepEqual(
      basic.channels.map((channel) => [channel.name, channel.type, channel.defaultValue]),
      [
        ['Pan', 'pan', 128],
        ['Pan fine', 'other', 0],
        ['Shutter', 'strobe', 32],
        ['Red', 'red', 0],
      ],
    );
    assert.deepEqual(basic.channels[2].ranges, [
      { range: '0–31', label: 'Closed' },
      { range: '32–63', label: 'Open (normal)' },
    ]);
    assert.deepEqual(basic.channels[0].ranges, [{ range: '0–255', label: 'Pan' }], 'one capability covers 0 to 255');
    assert.deepEqual(basic.channels[1].ranges, [], 'a fine channel has no ranges of its own');
  });

  it('flags a mode that uses pixel channels as not supported, and lists only its normal channels', () => {
    const pixels = summary.modes[1];
    assert.equal(pixels.isSupported, false);
    assert.deepEqual(
      pixels.channels.map((channel) => channel.name),
      ['Red'],
    );
  });

  it('survives a hostile or empty document and cuts long text', () => {
    const empty = summariseOflFixture({});
    assert.deepEqual(empty.modes, []);
    assert.deepEqual(empty.links, { manual: [], productPage: [], video: [], other: [] });
    const hostile = summariseOflFixture({
      name: 'x'.repeat(5000),
      categories: 'nope',
      meta: { authors: [1, null, 'ok'] },
      links: { manual: 'https://a.test' },
      physical: { dimensions: ['a', 'b', 'c'], weight: 'heavy', lens: { degreesMinMax: 'wide' } },
      availableChannels: null,
      modes: [{ name: 7, channels: 'nope' }, null],
    });
    assert.equal(hostile.name.length, 200, 'names are cut');
    assert.deepEqual(hostile.categories, []);
    assert.deepEqual(hostile.authors, ['ok']);
    assert.deepEqual(hostile.specifications, [], 'bad numbers are skipped');
    assert.equal(hostile.modes[0].name, 'Mode', 'a non-text name falls back');
  });
});

describe('summariseOflFixture with pixel templates', () => {
  it('describes a channel named from a template using the template definition', () => {
    const summary = summariseOflFixture({
      name: 'Matrix',
      availableChannels: {},
      templateChannels: { 'Red $pixelKey': { defaultValue: 10, capability: { type: 'ColorIntensity', color: 'Red' } } },
      modes: [{ name: 'Master', channels: ['Red Master'] }],
    });
    assert.deepEqual(summary.modes[0].channels[0], {
      name: 'Red Master',
      type: 'red',
      defaultValue: 10,
      ranges: [{ range: '0–255', label: 'Red intensity' }],
    });
  });
});

describe('describeCapability', () => {
  it('describes the common capability types in plain words', () => {
    assert.equal(describeCapability({ type: 'ColorIntensity', color: 'Green' }), 'Green intensity');
    assert.equal(describeCapability({ type: 'Intensity' }), 'Brightness');
    assert.equal(describeCapability({ type: 'Effect', effectName: 'Rainbow' }), 'Rainbow');
    assert.equal(describeCapability({ type: 'NoFunction' }), 'No function');
    assert.equal(describeCapability({ type: 'PanTiltSpeed' }), 'Pan tilt speed');
    assert.equal(describeCapability({ type: 'Maintenance', comment: 'Reset' }), 'Maintenance (Reset)');
  });
});
