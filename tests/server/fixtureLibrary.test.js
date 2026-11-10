// Tests for the Open Fixture Library converter, including negative cases.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fixtureTypeSchema } from '../../server/schemas/projectSchema.js';
import {
  BUILTIN_FIXTURE_TYPES,
  convertOpenFixtureLibrary,
  oflFixtureId,
} from '../../server/services/fixtureLibrary.js';
import { LEVEL_TYPES } from '../../shared/patch.js';

const SAMPLE = {
  name: 'Test Par',
  availableChannels: {
    Dimmer: { capability: { type: 'Intensity' }, defaultValue: 255 },
    Red: { capability: { type: 'ColorIntensity', color: 'Red' } },
    Pan: { fineChannelAliases: ['Pan fine'], capability: { type: 'Pan' }, defaultValue: '50%' },
  },
  modes: [{ name: 'Basic', channels: ['Dimmer', 'Red', 'Pan', 'Pan fine', null] }],
};

describe('convertOpenFixtureLibrary', () => {
  it('maps capabilities to channel types, defaults, fine channels and null placeholders', () => {
    const type = convertOpenFixtureLibrary(SAMPLE, 'Acme');
    const channels = type.modes[0].channels;
    assert.deepEqual(
      channels.map((channel) => channel.type),
      ['intensity', 'red', 'pan', 'other', 'other'],
    );
    assert.equal(channels[0].defaultValue, 255, 'numeric default is kept');
    assert.equal(channels[2].defaultValue, 128, 'percentage default is converted to 0-255');
    assert.equal(type.id, 'ofl-acme-test-par', 'id is derived from manufacturer and name');
  });

  it('rejects documents that are not OFL fixtures', () => {
    assert.throws(() => convertOpenFixtureLibrary({ foo: 1 }), /Not an Open Fixture Library fixture/);
  });

  it('rejects fixtures with no usable modes', () => {
    assert.throws(() => convertOpenFixtureLibrary({ ...SAMPLE, modes: [] }), /could not be converted/);
  });
});

describe('built-in U`King moving head profile', () => {
  const profile = BUILTIN_FIXTURE_TYPES.find((type) => type.id === 'uking-40w-beam-moving-head');
  const channels = profile?.modes[0].channels ?? [];

  it('matches the 13 channel table in the maker manual, in order', () => {
    assert.equal(channels.length, 13, 'it has 13 channels');
    assert.deepEqual(
      channels.map((channel) => channel.type),
      [
        'pan',
        'other',
        'tilt',
        'other',
        'speed',
        'intensity',
        'strobe',
        'red',
        'green',
        'blue',
        'white',
        'other',
        'other',
      ],
      'the channel order follows the manual',
    );
    assert.equal(fixtureTypeSchema.safeParse(profile).success, true, 'it is a valid fixture type');
  });

  it('keeps the program and reset channels at 0 and out of the master, so the head cannot reset or leave manual mode', () => {
    assert.equal(channels[11].defaultValue, 0, 'channel 12 (programs and sound) defaults to 0');
    assert.equal(channels[12].defaultValue, 0, 'channel 13 (reset) defaults to 0');
    assert.equal(
      LEVEL_TYPES.has(channels[11].type) || LEVEL_TYPES.has(channels[12].type),
      false,
      'master never scales them',
    );
    assert.equal(channels[5].defaultValue, 255, 'the dimmer defaults to open so colours show');
  });
});

describe('fixture descriptions', () => {
  const example = BUILTIN_FIXTURE_TYPES.find((type) => type.id === 'uking-40w-beam-moving-head');

  it('describes the U`King moving head with its manufacturer, model and description', () => {
    assert.equal(example?.manufacturer, "U'King", 'the brand');
    assert.equal(example?.name, '40W RGBW Moving Head Light', 'the model');
    assert.equal(example?.description, '40W Beam Moving Head Light DMX512 RGBW Stage Light', 'the description');
  });

  it('gives every built-in fixture a description, and accepts them all under the schema', () => {
    for (const type of BUILTIN_FIXTURE_TYPES) {
      assert.ok(type.description.length > 0, `${type.name} has a description`);
      assert.equal(fixtureTypeSchema.safeParse(type).success, true, `${type.name} is valid`);
    }
  });

  it('defaults a missing description to empty (older shows) and refuses an oversized or unknown field', () => {
    const base = { id: 'x', name: 'X', modes: [{ name: 'm', channels: [{ name: 'c', type: 'other' }] }] };
    assert.equal(fixtureTypeSchema.parse(base).description, '', 'a show saved before descriptions still loads');
    assert.equal(fixtureTypeSchema.safeParse({ ...base, description: 'x'.repeat(501) }).success, false, 'too long');
    assert.equal(fixtureTypeSchema.safeParse({ ...base, surprise: 1 }).success, false, 'unknown fields are refused');
  });
});

describe('built-in profiles from maker manuals', () => {
  const byId = (id) => BUILTIN_FIXTURE_TYPES.find((type) => type.id === id);
  const typesOf = (id, mode = 0) => byId(id).modes[mode].channels.map((channel) => channel.type);

  it('has unique ids', () => {
    const ids = BUILTIN_FIXTURE_TYPES.map((type) => type.id);
    assert.equal(new Set(ids).size, ids.length, 'no two built-in fixtures share an id');
  });

  it('lays out the 36 LED par in 7 channels as its manual says', () => {
    assert.deepEqual(
      typesOf('generic-led-par-36-7ch'),
      ['intensity', 'red', 'green', 'blue', 'strobe', 'other', 'speed'],
      'dimmer, red, green, blue, strobe, programs, speed',
    );
  });

  it('lays out the mini spider light in 7 channels as its manual says', () => {
    assert.deepEqual(
      typesOf('generic-mini-spider-light'),
      ['tilt', 'tilt', 'intensity', 'strobe', 'other', 'speed', 'other'],
      'two motors, dimmer, strobe, effect, effect speed, reset',
    );
  });

  it('lays out the mini gobo head in 12 and 10 channels as its manual says', () => {
    assert.equal(byId('generic-mini-moving-head-gobo').modes.length, 2, 'two modes');
    assert.deepEqual(
      typesOf('generic-mini-moving-head-gobo', 0),
      [
        'pan',
        'other',
        'tilt',
        'other',
        'color-wheel',
        'gobo',
        'strobe',
        'intensity',
        'speed',
        'other',
        'other',
        'other',
      ],
      'the 12 channel layout',
    );
    assert.deepEqual(
      typesOf('generic-mini-moving-head-gobo', 1),
      ['pan', 'tilt', 'color-wheel', 'gobo', 'strobe', 'intensity', 'speed', 'other', 'other', 'other'],
      'the 10 channel layout',
    );
  });

  it('keeps every reset, program and automatic-mode channel at 0, typed other, so a light cannot reset or leave manual', () => {
    for (const type of BUILTIN_FIXTURE_TYPES) {
      for (const mode of type.modes) {
        for (const channel of mode.channels) {
          if (/reset|keep at 0|automatic mode|programs/i.test(channel.name)) {
            assert.equal(channel.defaultValue, 0, `${type.name} ${mode.name}: ${channel.name} rests at 0`);
            assert.equal(channel.type, 'other', `${type.name} ${mode.name}: ${channel.name} is never scaled`);
          }
        }
      }
    }
  });
});

describe('Open Fixture Library conversion details', () => {
  it('credits the library and authors only when a source is given', () => {
    const document = { ...SAMPLE, categories: ['Moving Head'], meta: { authors: ['Ann', 'Bob'] } };
    const credited = convertOpenFixtureLibrary(document, 'Acme', { key: 'acme/test-par' });
    assert.match(
      credited.description,
      /^Moving Head\. From the Open Fixture Library \(open-fixture-library\.org\/acme\/test-par\)\. Authors: Ann, Bob\.$/,
    );
    assert.equal(convertOpenFixtureLibrary(document, 'Acme').description, '', 'a file import has no credit text');
  });

  it('refuses a fixture whose modes use pixel or matrix inserts instead of guessing the channels', () => {
    const matrix = {
      ...SAMPLE,
      modes: [{ name: 'Pixels', channels: ['Dimmer', { insert: 'matrixChannels', repeatFor: 'eachPixelABC' }] }],
    };
    assert.throws(
      () => convertOpenFixtureLibrary(matrix, 'Acme'),
      (error) => error.status === 400 && /pixel or matrix/.test(error.message),
    );
  });
});

describe('oflFixtureId', () => {
  it('makes a readable id from a key, and keeps long different keys apart within 64 characters', () => {
    assert.equal(oflFixtureId('uking/mini-gobo'), 'ofl-uking-mini-gobo');
    const long = (suffix) => `a-very-long-manufacturer-name-indeed/${'fixture-name-'.repeat(8)}${suffix}`;
    const first = oflFixtureId(long('one'));
    const second = oflFixtureId(long('two'));
    assert.ok(first.length <= 64 && second.length <= 64, 'within the id limit');
    assert.notEqual(first, second, 'different keys give different ids');
    assert.equal(first, oflFixtureId(long('one')), 'the same key always gives the same id');
  });
});
