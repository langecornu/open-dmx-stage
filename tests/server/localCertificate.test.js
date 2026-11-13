// Tests for the app's own https certificate: what it covers, reusing it, making a new one for a new address or before
// it expires, keeping the key private, and serving a real https request with it.
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { mkdtemp, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:https';
import { after, before, describe, it } from 'node:test';

import { loadOrCreateCertificate } from '../../server/services/localCertificate.js';

let dataDir;
before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'odmx-tls-'));
});
after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

const DAY = 24 * 60 * 60 * 1000;

describe('loadOrCreateCertificate', () => {
  it("makes a certificate for this computer's addresses and names, for a server, lasting 397 days", async () => {
    const made = await loadOrCreateCertificate({ dataDir, names: ['192.168.1.117', 'stage-mac.local'] });
    assert.equal(made.created, true);
    const certificate = new X509Certificate(made.cert);
    for (const covered of [
      'DNS:localhost',
      'IP Address:127.0.0.1',
      'IP Address:192.168.1.117',
      'DNS:stage-mac.local',
    ]) {
      assert.ok(certificate.subjectAltName.includes(covered), covered);
    }
    assert.deepEqual(certificate.keyUsage, ['1.3.6.1.5.5.7.3.1'], 'for server authentication');
    assert.equal(certificate.ca, false);
    const days = (new Date(certificate.validTo).getTime() - Date.now()) / DAY;
    assert.ok(days > 395 && days < 398, `lasts about 397 days (${days})`);
    assert.match(made.fingerprint, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    assert.equal((await stat(path.join(dataDir, 'tls', 'key.pem'))).mode & 0o077, 0, 'the key is private');
  });

  it('reuses it while it covers the addresses, and makes a new one for a new address or before it expires', async () => {
    const first = await loadOrCreateCertificate({ dataDir, names: ['192.168.1.117'] });
    assert.equal(first.created, false);
    const moved = await loadOrCreateCertificate({ dataDir, names: ['10.0.0.8'] });
    assert.equal(moved.created, true);
    assert.notEqual(moved.fingerprint, first.fingerprint);
    const later = await loadOrCreateCertificate({
      dataDir,
      names: ['10.0.0.8'],
      now: new Date(Date.now() + 380 * DAY),
    });
    assert.equal(later.created, true, 'renewed with less than 30 days left');
  });

  it('makes a new one when the saved files cannot be read', async () => {
    await mkdir(path.join(dataDir, 'tls'), { recursive: true });
    await writeFile(path.join(dataDir, 'tls', 'cert.pem'), 'not a certificate');
    assert.equal((await loadOrCreateCertificate({ dataDir, names: [] })).created, true);
  });

  it('serves a real https request with the certificate it made', async () => {
    const made = await loadOrCreateCertificate({ dataDir, names: [] });
    const server = createServer({ cert: made.cert, key: made.key }, (_req, res) => res.end('hello over https'));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const body = await new Promise((resolve, reject) => {
        const req = request(
          { host: '127.0.0.1', port: server.address().port, path: '/', ca: made.cert, servername: 'localhost' },
          (res) => {
            let text = '';
            res.on('data', (chunk) => (text += chunk));
            res.on('end', () => resolve(text));
          },
        );
        req.on('error', reject);
        req.end();
      });
      assert.equal(body, 'hello over https', 'trusted when the certificate is accepted, as a person does once');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
