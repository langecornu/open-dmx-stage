// Tests for output settings validation: allowed destination hosts and per-driver universe ranges.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { outputSettingsSchema } from '../../server/schemas/projectSchema.js';
import { isAllowedHost } from '../../server/utils/networkHost.js';

describe('isAllowedHost', () => {
  it('accepts empty, private, loopback, link-local, multicast and broadcast IPv4 addresses', () => {
    for (const host of [
      '',
      '192.168.1.50',
      '10.0.0.7',
      '172.16.5.5',
      '172.31.255.1',
      '127.0.0.1',
      '169.254.1.1',
      '239.255.0.1',
      '255.255.255.255',
    ]) {
      assert.equal(isAllowedHost(host), true, `${host || '(empty)'} should be allowed`);
    }
  });

  it('rejects public addresses, hostnames and malformed addresses', () => {
    for (const host of [
      '8.8.8.8',
      '172.32.0.1',
      '192.169.1.1',
      'example.com',
      'node.local',
      '192.168.1',
      '192.168.1.256',
      '0.0.0.0',
      '1.2.3.4.5',
      '192.168.1.50 ',
    ]) {
      assert.equal(isAllowedHost(host), false, `${host} should be rejected`);
    }
  });
});

describe('outputSettingsSchema', () => {
  it('rejects a public destination host', () => {
    const result = outputSettingsSchema.safeParse({ driver: 'artnet', host: '8.8.8.8' });
    assert.equal(result.success, false, 'a public IP must not be accepted as an output destination');
  });

  it('enforces the universe range for each protocol', () => {
    assert.equal(
      outputSettingsSchema.safeParse({ driver: 'sacn', universe: 0 }).success,
      false,
      'sACN universe 0 is invalid',
    );
    assert.equal(
      outputSettingsSchema.safeParse({ driver: 'sacn', universe: 1 }).success,
      true,
      'sACN universe 1 is valid',
    );
    assert.equal(
      outputSettingsSchema.safeParse({ driver: 'artnet', universe: 32768 }).success,
      false,
      'Art-Net above 32767 is invalid',
    );
    assert.equal(
      outputSettingsSchema.safeParse({ driver: 'artnet', universe: 32767 }).success,
      true,
      'Art-Net 32767 is valid',
    );
    assert.equal(
      outputSettingsSchema.safeParse({ driver: 'artnet', universe: 0 }).success,
      true,
      'Art-Net universe 0 is valid',
    );
  });
});
