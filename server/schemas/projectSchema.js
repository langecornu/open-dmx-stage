// zod schemas for the project document, live socket messages and imports. Unknown keys are rejected.
import { z } from 'zod';

import { CHANNEL_TYPES, DMX_CHANNELS } from '../../shared/patch.js';

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

export const chaseSchema = z
  .object({
    id,
    name: label,
    loop: z.boolean(),
    steps: z
      .array(
        z
          .object({
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

export function createEmptyProject() {
  return { name: 'Untitled show', fixtureTypes: [], fixtures: [], scenes: [], chases: [] };
}
