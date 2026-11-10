// Tests for the Open Fixture Library converter, including negative cases.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fixtureTypeSchema } from '../../server/schemas/projectSchema.js';
import { BUILTIN_FIXTURE_TYPES, convertOpenFixtureLibrary } from '../../server/services/fixtureLibrary.js';
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
