// Central configuration. This is the only module allowed to read process.env; it validates at startup.
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { HOST_HELP, isAllowedHost } from './utils/networkHost.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  // The https address beside it, for phones and tablets that need the microphone or MIDI (ADR 0009). 0 turns it off.
  HTTPS_PORT: z.coerce.number().int().min(0).max(65535).default(4443),
  // Every network address by default, so a phone or tablet on the same network can run the show (ADR 0008). The
  // control surface has no login: set 127.0.0.1 to keep it on this computer.
  HOST: z.string().min(1).max(253).default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  LOG_FORMAT: z.enum(['text', 'json']).optional(),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  DMX_DRIVER: z.enum(['mock', 'enttec-pro', 'open-dmx', 'artnet', 'sacn']).default('mock'),
  DMX_SERIAL_PATH: z.string().default(''),
  DMX_NET_HOST: z.string().max(253).default('').refine(isAllowedHost, HOST_HELP),
  DMX_UNIVERSE: z.coerce.number().int().min(0).max(63999).optional(),
  DMX_FRAME_RATE: z.coerce.number().int().min(1).max(44).default(30),
  DATA_DIR: z.string().default('server/data'),
  // Online fixture search (Open Fixture Library). Turn it off to keep the app from contacting the internet.
  OFL_ENABLED: z.enum(['true', 'false']).default('true'),
});

/**
 * The browser pages allowed to talk to the API and the live socket: the ones you list in ALLOWED_ORIGINS, plus this
 * server's own address. The built app is served from the server's own port, so without its own address in the list the
 * live link is refused and the app says "Server offline".
 * @param {string} listed comma-separated origins from ALLOWED_ORIGINS
 * @param {number} port the port this server listens on
 * @param {number} httpsPort the https port beside it, or 0 when there is none
 * @param {string[]} ownAddresses this computer's network addresses and name, when it listens beyond itself
 * @returns {string[]}
 */
function trustedOrigins(listed, port, httpsPort, ownAddresses) {
  const configured = listed
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const hosts = ['localhost', '127.0.0.1', '[::1]', ...ownAddresses];
  const own = [
    ...hosts.map((address) => `http://${address}:${port}`),
    ...(httpsPort ? hosts.map((address) => `https://${address}:${httpsPort}`) : []),
  ];
  return [...new Set([...configured, ...own])];
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

/** @param {string} host @returns {boolean} true when the server only listens on this computer */
export const isLoopback = (host) => LOOPBACK.has(host);

/**
 * This computer's addresses on its networks (IPv4) and its name, which a phone or tablet uses to open the app.
 * @returns {string[]}
 */
export function networkAddresses() {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => /** @type {os.NetworkInterfaceInfo} */ (entry).address);
  // The name nearby devices find it by (Bonjour, or Avahi on Linux) ends in .local. A Mac announces the "local host
  // name" from its Sharing settings, which can differ from its computer name; elsewhere it is the host name's first
  // label (raspberrypi.local), even when the router gives a longer one.
  const name = os.hostname();
  let announced = name.split('.')[0];
  if (process.platform === 'darwin') {
    try {
      announced =
        execFileSync('scutil', ['--get', 'LocalHostName'], { encoding: 'utf8', timeout: 2000 }).trim() || announced;
    } catch {
      // Keep the host name's first label.
    }
  }
  return [...new Set([...addresses, name, `${announced}.local`])];
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ ownAddresses?: () => string[] }} [options] this computer's network addresses, replaceable for tests
 */
export function loadConfig(env = process.env, { ownAddresses = networkAddresses } = {}) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`[config] Invalid environment: ${parsed.error.message}`);
  }
  const values = parsed.data;
  return {
    port: values.PORT,
    httpsPort: values.HTTPS_PORT,
    host: values.HOST,
    nodeEnv: values.NODE_ENV,
    logLevel: values.LOG_LEVEL,
    logFormat: values.LOG_FORMAT ?? (values.NODE_ENV === 'production' ? 'json' : 'text'),
    // A page opened from one of this computer's own addresses is this app, so its live link is trusted too; listening
    // on loopback only, there are none to add.
    allowedOrigins: trustedOrigins(
      values.ALLOWED_ORIGINS,
      values.PORT,
      values.HTTPS_PORT,
      LOOPBACK.has(values.HOST) ? [] : ownAddresses(),
    ),
    dmxDriver: values.DMX_DRIVER,
    dmxSerialPath: values.DMX_SERIAL_PATH,
    dmxNetHost: values.DMX_NET_HOST,
    dmxUniverse: values.DMX_UNIVERSE,
    dmxFrameRate: values.DMX_FRAME_RATE,
    isOflEnabled: values.OFL_ENABLED === 'true',
    dataDir: path.resolve(ROOT_DIR, values.DATA_DIR),
    distDir: path.join(ROOT_DIR, 'dist'),
  };
}
