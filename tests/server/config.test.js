// Tests for the configuration: defaults, validation, and which browser pages are trusted.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadConfig } from '../../server/config.js';

describe('loadConfig', () => {
  it('uses safe defaults: loopback, the simulator and port 4000', () => {
    const config = loadConfig({});
    assert.equal(config.port, 4000, 'default port');
    assert.equal(config.host, '127.0.0.1', 'loopback only');
    assert.equal(config.dmxDriver, 'mock', 'the simulator');
    assert.equal(config.isOflEnabled, true, 'online fixture search is on');
  });

  it('turns online fixture search off when asked', () => {
    assert.equal(loadConfig({ OFL_ENABLED: 'false' }).isOflEnabled, false);
  });

  it('refuses values that are not valid, naming the setting', () => {
    assert.throws(() => loadConfig({ PORT: '99999' }), /PORT/);
    assert.throws(() => loadConfig({ DMX_DRIVER: 'laser' }), /DMX_DRIVER/);
    assert.throws(() => loadConfig({ OFL_ENABLED: 'maybe' }), /OFL_ENABLED/);
    assert.throws(() => loadConfig({ DMX_NET_HOST: 'example.com' }), /DMX_NET_HOST/);
  });
});

describe('trusted browser origins', () => {
  it("always include this server's own address, so the built app can open its live link", () => {
    const { allowedOrigins } = loadConfig({});
    assert.ok(allowedOrigins.includes('http://localhost:4000'), 'localhost on the server port');
    assert.ok(allowedOrigins.includes('http://127.0.0.1:4000'), 'the loopback address');
    assert.ok(allowedOrigins.includes('http://[::1]:4000'), 'the IPv6 loopback address');
  });

  it('follow the port the server is set to listen on', () => {
    const { allowedOrigins } = loadConfig({ PORT: '4500' });
    assert.ok(allowedOrigins.includes('http://localhost:4500'));
    assert.ok(!allowedOrigins.includes('http://localhost:4000'), 'the default port is not trusted by accident');
  });

  it('keep the pages you list, trimmed, without blanks or repeats', () => {
    const { allowedOrigins } = loadConfig({
      ALLOWED_ORIGINS: ' http://192.168.1.20:4000 , ,http://localhost:5173,http://localhost:5173',
    });
    assert.deepEqual(allowedOrigins.slice(0, 2), ['http://192.168.1.20:4000', 'http://localhost:5173']);
    assert.equal(new Set(allowedOrigins).size, allowedOrigins.length, 'no repeats');
    assert.ok(!allowedOrigins.includes(''), 'no blank entry');
  });

  it('do not trust other addresses on the same machine or network by default', () => {
    const { allowedOrigins } = loadConfig({});
    assert.ok(!allowedOrigins.includes('http://192.168.1.20:4000'), 'a network address needs to be listed');
    assert.ok(!allowedOrigins.includes('http://localhost:3000'), 'another local port is not trusted');
  });
});
