// Tests for the Open Fixture Library converter, including negative cases.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { convertOpenFixtureLibrary } from '../../server/services/fixtureLibrary.js';

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
