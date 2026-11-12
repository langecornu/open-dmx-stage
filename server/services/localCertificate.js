// The certificate for the app's https address on the local network (ADR 0009). Browsers only give the microphone and
// MIDI to secure pages, and a phone reaches this computer by its network address, so the app serves https too, with a
// certificate it makes itself. It is self-signed, so each device shows a warning once and the person accepts it.
//
// The certificate covers localhost and this computer's current names and addresses. It is kept in `<data>/tls/` and
// made again when an address it does not cover appears (the computer moved to another network) or when it has less than
// 30 days left. It lasts 397 days, uses SHA-256 and says it is for a server, as Apple devices require.
import { X509Certificate } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { generate } from 'selfsigned';

const LIFETIME_DAYS = 397;
const RENEW_BEFORE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * @typedef {{ cert: string, key: string, fingerprint: string, validTo: string, names: string[], created: boolean }}
 *   LocalCertificate `fingerprint`: SHA-256, as browsers show it, so a person can check the warning is about this app
 */

/**
 * One spelling per address: an IPv6 address in its short form ("0:0:0:0:0:0:0:1" is "::1"), names as they are.
 * @param {string} name
 */
const canonical = (name) => (name.includes(':') ? new URL(`http://[${name}]`).hostname.slice(1, -1) : name);

/**
 * The names and addresses a certificate covers, from its subject alternative names.
 * @param {X509Certificate} certificate
 * @returns {Set<string>}
 */
function coveredBy(certificate) {
  return new Set(
    (certificate.subjectAltName ?? '')
      .split(',')
      .map((entry) => entry.trim().replace(/^(DNS|IP Address):/, ''))
      .filter(Boolean)
      .map(canonical),
  );
}

/**
 * Loads the certificate, making a new one when there is none, it is about to expire, or it misses a name.
 * @param {{ dataDir: string, names: string[], now?: Date, make?: typeof generate }} options `names`: host names and IPv4
 *   addresses to cover; localhost and the loopback addresses are always covered
 * @returns {Promise<LocalCertificate>}
 */
export async function loadOrCreateCertificate({ dataDir, names, now = new Date(), make = generate }) {
  const wanted = [...new Set(['localhost', '127.0.0.1', '::1', ...names.filter(Boolean)])];
  const dir = path.join(dataDir, 'tls');
  const certFile = path.join(dir, 'cert.pem');
  const keyFile = path.join(dir, 'key.pem');

  try {
    const [cert, key] = await Promise.all([readFile(certFile, 'utf8'), readFile(keyFile, 'utf8')]);
    const certificate = new X509Certificate(cert);
    const covered = coveredBy(certificate);
    const daysLeft = (new Date(certificate.validTo).getTime() - now.getTime()) / DAY_MS;
    if (daysLeft > RENEW_BEFORE_DAYS && wanted.every((name) => covered.has(canonical(name)))) {
      return {
        cert,
        key,
        fingerprint: certificate.fingerprint256,
        validTo: new Date(certificate.validTo).toISOString(),
        names: [...covered],
        created: false,
      };
    }
  } catch {
    // No certificate yet, or one that cannot be read: make a new one.
  }

  const made = await make([{ name: 'commonName', value: 'Open DMX Stage' }], {
    keyType: 'ec',
    curve: 'P-256',
    algorithm: 'sha256',
    notBeforeDate: new Date(now.getTime() - DAY_MS), // a day early, for a device whose clock is a little behind
    notAfterDate: new Date(now.getTime() + LIFETIME_DAYS * DAY_MS),
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: wanted.map((name) =>
          IPV4.test(name) || name.includes(':') ? { type: 7, ip: name } : { type: 2, value: name },
        ),
      },
    ],
  });
  await mkdir(dir, { recursive: true });
  for (const [file, text, mode] of /** @type {const} */ ([
    [keyFile, made.private, 0o600],
    [certFile, made.cert, 0o644],
  ])) {
    const temp = `${file}.tmp`;
    await writeFile(temp, text, { encoding: 'utf8', mode });
    await chmod(temp, mode);
    await rename(temp, file);
  }
  const certificate = new X509Certificate(made.cert);
  return {
    cert: made.cert,
    key: made.private,
    fingerprint: certificate.fingerprint256,
    validTo: new Date(certificate.validTo).toISOString(),
    names: wanted,
    created: true,
  };
}
