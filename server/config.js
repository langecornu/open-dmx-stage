// Central configuration. This is the only module allowed to read process.env; it validates at startup.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  DMX_DRIVER: z.enum(['mock', 'enttec-pro']).default('mock'),
  DMX_SERIAL_PATH: z.string().default(''),
  DMX_FRAME_RATE: z.coerce.number().int().min(1).max(44).default(30),
  DATA_DIR: z.string().default('server/data'),
});

export function loadConfig(env = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`[config] Invalid environment: ${parsed.error.message}`);
  }
  const values = parsed.data;
  if (values.DMX_DRIVER === 'enttec-pro' && !values.DMX_SERIAL_PATH) {
    throw new Error('[config] DMX_SERIAL_PATH is required when DMX_DRIVER=enttec-pro');
  }
  return {
    port: values.PORT,
    allowedOrigins: values.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()),
    dmxDriver: values.DMX_DRIVER,
    dmxSerialPath: values.DMX_SERIAL_PATH,
    dmxFrameRate: values.DMX_FRAME_RATE,
    dataDir: path.resolve(ROOT_DIR, values.DATA_DIR),
    distDir: path.join(ROOT_DIR, 'dist'),
  };
}
