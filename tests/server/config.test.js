// Tests for the configuration: defaults, validation, and which browser pages are trusted.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadConfig } from '../../server/config.js';

describe('loadConfig', () => {
  it('uses its defaults: every network address, the simulator and port 4000', () => {
    const config = loadConfig({}, { ownAddresses: () => [] });
    assert.equal(config.port, 4000, 'default port');
    assert.equal(config.host, '0.0.0.0', 'reachable from a phone or tablet on the same network');
    assert.equal(config.dmxDriver, 'mock', 'the simulator');
    assert.equal(config.httpsPort, 4443, 'a secure address beside it, for phones');
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

  it("trust this computer's own network addresses and name, so a phone can open the app and its live link", () => {
    const { allowedOrigins } = loadConfig({}, { ownAddresses: () => ['192.168.1.50', 'stage-mac.local'] });
    assert.ok(allowedOrigins.includes('http://192.168.1.50:4000'));
    assert.ok(allowedOrigins.includes('http://stage-mac.local:4000'));
    assert.ok(allowedOrigins.includes('https://192.168.1.50:4443'), 'the secure address too');
    assert.ok(allowedOrigins.includes('https://localhost:4443'));
    const off = loadConfig({ HTTPS_PORT: '0' }, { ownAddresses: () => ['192.168.1.50'] });
    assert.equal(
      off.allowedOrigins.some((origin) => origin.startsWith('https:')),
      false,
      'none when https is off',
    );
  });

  it('do not trust other addresses on the network, other ports, or own addresses when kept to this computer', () => {
    const { allowedOrigins } = loadConfig({}, { ownAddresses: () => ['192.168.1.50'] });
    assert.ok(!allowedOrigins.includes('http://192.168.1.20:4000'), 'another machine needs to be listed');
    assert.ok(!allowedOrigins.includes('http://localhost:3000'), 'another local port is not trusted');
    const local = loadConfig({ HOST: '127.0.0.1' }, { ownAddresses: () => ['192.168.1.50'] });
    assert.ok(!local.allowedOrigins.includes('http://192.168.1.50:4000'), 'nothing to trust beyond this computer');
  });
});
