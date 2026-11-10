// zod schemas for the project document, live socket messages and imports. Unknown keys are rejected.
import { z } from 'zod';

import { CHANNEL_TYPES, DMX_CHANNELS } from '../../shared/patch.js';
import { HOST_HELP, isAllowedHost } from '../utils/networkHost.js';

const id = z.string().min(1).max(64);
const label = z.string().trim().min(1).max(80);
const dmxValue = z.number().int().min(0).max(255);

export const channelSchema = z
  .object({
    name: label,
    type: z.enum(CHANNEL_TYPES),
    defaultValue: dmxValue.default(0),
  })
  .strict();

export const fixtureTypeSchema = z
  .object({
    id,
    manufacturer: z.string().trim().max(80).default(''),
    name: label,
    modes: z
      .array(z.object({ name: label, channels: z.array(channelSchema).min(1).max(DMX_CHANNELS) }).strict())
      .min(1)
      .max(32),
  })
  .strict();

export const fixtureSchema = z
  .object({
    id,
    name: label,
    typeId: id,
    mode: z.number().int().min(0).max(31),
    address: z.number().int().min(1).max(DMX_CHANNELS),
  })
  .strict();

const channelKey = z
  .string()
  .regex(/^[1-9]\d{0,2}$/)
  .refine((key) => Number(key) <= DMX_CHANNELS, 'DMX channel must be 1-512');

export const sceneSchema = z
  .object({
    id,
    name: label,
    values: z.record(channelKey, dmxValue).refine((values) => Object.keys(values).length <= DMX_CHANNELS),
  })
  .strict();

/** Bump with every change to the saved show format, and add a migration in server/services/projectMigrations.js. */
export const CURRENT_SCHEMA_VERSION = /** @type {const} */ (2);

export const chaseSchema = z
  .object({
    id,
    name: label,
    loop: z.boolean(),
    steps: z
      .array(
        z
          .object({
            id,
            sceneId: id,
            fadeMs: z.number().int().min(0).max(600000),
            holdMs: z.number().int().min(0).max(600000),
          })
          .strict(),
      )
      .max(256),
  })
  .strict();

export const projectSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    name: label,
    fixtureTypes: z.array(fixtureTypeSchema).max(200),
    fixtures: z.array(fixtureSchema).max(256),
    scenes: z.array(sceneSchema).max(500),
    chases: z.array(chaseSchema).max(100),
  })
  .strict();

export const liveMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set'), values: z.record(channelKey, dmxValue) }).strict(),
  z.object({ type: z.literal('clearProgrammer') }).strict(),
  z.object({ type: z.literal('master'), level: z.number().min(0).max(1) }).strict(),
  z.object({ type: z.literal('blackout'), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal('recall'), sceneId: id, fadeMs: z.number().int().min(0).max(60000).default(0) }).strict(),
  z.object({ type: z.literal('chaseStart'), chaseId: id }).strict(),
  z.object({ type: z.literal('chaseStop') }).strict(),
]);

export const importFixtureSchema = z
  .object({ fixture: z.record(z.string(), z.unknown()), manufacturer: z.string().max(80).optional() })
  .strict();

export const importQlcSchema = z.object({ xml: z.string().min(1).max(300_000) }).strict();

export const DRIVER_NAMES = ['mock', 'enttec-pro', 'open-dmx', 'artnet', 'sacn'];

export const outputSettingsSchema = z
  .object({
    driver: z.enum(DRIVER_NAMES),
    serialPath: z.string().max(200).default(''),
    host: z.string().max(253).default('').refine(isAllowedHost, HOST_HELP),
    universe: z.number().int().min(0).max(63999).optional(),
  })
  .strict()
  .superRefine((settings, context) => {
    if (settings.universe === undefined) {
      return;
    }
    if (settings.driver === 'artnet' && settings.universe > 32767) {
      context.addIssue({ code: 'custom', path: ['universe'], message: 'Art-Net universe must be 0 to 32767' });
    }
    if (settings.driver === 'sacn' && settings.universe < 1) {
      context.addIssue({ code: 'custom', path: ['universe'], message: 'sACN universe must be 1 to 63999' });
    }
  });

/** @returns {import('../../shared/types.js').Project} an empty show at the current schema version */
export function createEmptyProject() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name: 'Untitled show',
    fixtureTypes: [],
    fixtures: [],
    scenes: [],
    chases: [],
  };
}
