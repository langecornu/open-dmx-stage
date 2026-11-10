// Central configuration. This is the only module allowed to read process.env; it validates at startup.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { HOST_HELP, isAllowedHost } from './utils/networkHost.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  // The control surface has no login, so it listens on loopback unless you opt in (ADR 0005).
  HOST: z.string().min(1).max(253).default('127.0.0.1'),
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

export function loadConfig(env = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`[config] Invalid environment: ${parsed.error.message}`);
  }
  const values = parsed.data;
  return {
    port: values.PORT,
    host: values.HOST,
    nodeEnv: values.NODE_ENV,
    logLevel: values.LOG_LEVEL,
    logFormat: values.LOG_FORMAT ?? (values.NODE_ENV === 'production' ? 'json' : 'text'),
    allowedOrigins: values.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()),
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
