// zod schemas for the project document, live socket messages and imports. Unknown keys are rejected.
import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { AUTO_BEATS, AUTO_ORDERS, AUTO_SOURCES } from '../../shared/autoShow.js';
import { EFFECT_BEATS, EFFECT_TYPES, MAX_BPM, MIN_BPM } from '../../shared/effects.js';
import { CAPABILITY_TYPES } from '../../shared/capabilities.js';
import { DEVICE_CATEGORIES } from '../../shared/categories.js';
import { CHANNEL_TYPES, DMX_CHANNELS } from '../../shared/patch.js';
import { AMOUNTS, COLOUR_AMOUNTS, MAX_AI_LOOKS, MAX_AI_SEQUENCES } from '../../shared/aiShow.js';
import { FIRST_VENUE, MAX_VENUES } from '../../shared/venues.js';
import { BLOCK_EFFECTS, MAX_SEQUENCE_UNITS, MIN_BLOCK_BEATS, TRANSITIONS } from '../../shared/timeline.js';
import { HOST_HELP, isAllowedHost } from '../utils/networkHost.js';

const id = z.string().min(1).max(64);
const label = z.string().trim().min(1).max(80);
const dmxValue = z.number().int().min(0).max(255);

const hexColour = z.string().regex(/^#[0-9a-f]{6}$/i, 'Colour must be #rrggbb');

/** One range of a channel's values and what it does (a gobo, "shutter open", "strobe slow to fast"). */
export const capabilitySchema = z
  .object({
    from: dmxValue,
    to: dmxValue,
    type: z.enum(CAPABILITY_TYPES),
    label: z.string().trim().max(80).optional(),
    color: hexColour.optional(),
    reverse: z.boolean().optional(),
  })
  .strict()
  .refine((capability) => capability.from <= capability.to, 'A range must start at or before its end');

export const channelSchema = z
  .object({
    name: label,
    type: z.enum(CHANNEL_TYPES),
    defaultValue: dmxValue.default(0),
    capabilities: z.array(capabilitySchema).max(64).optional(),
  })
  .strict();

export const fixtureTypeSchema = z
  .object({
    id,
    manufacturer: z.string().trim().max(80).default(''),
    name: label, // the model
    description: z.string().trim().max(500).default(''),
    category: z.enum(DEVICE_CATEGORIES).optional(), // what kind of device it is; guessed when missing
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
    category: z.enum(DEVICE_CATEGORIES).optional(), // set on this light, over its fixture type's
  })
  .strict();

const channelKey = z
  .string()
  .regex(/^[1-9]\d{0,2}$/)
  .refine((key) => Number(key) <= DMX_CHANNELS, 'DMX channel must be 1-512');

/** A channel of a light counted from its first, 0 to 511. */
const offsetKey = z
  .string()
  .regex(/^(0|[1-9]\d{0,2})$/)
  .refine((key) => Number(key) < DMX_CHANNELS, 'Channel offset must be 0-511');

/** A look's values for a light the active venue does not have, kept until a venue has it again. */
const parkedLightSchema = z
  .object({
    kind: z.string().max(140), // fixture type and mode, so the values only return to the same kind of light
    values: z.record(offsetKey, dmxValue).refine((values) => Object.keys(values).length <= DMX_CHANNELS),
  })
  .strict();

export const sceneSchema = z
  .object({
    id,
    name: label,
    values: z.record(channelKey, dmxValue).refine((values) => Object.keys(values).length <= DMX_CHANNELS),
    parked: z
      .record(id, parkedLightSchema)
      .refine((parked) => Object.keys(parked).length <= 256)
      .optional(),
    origin: z.enum(['ai']).optional(), // made by AI show generation
  })
  .strict();

/** Bump with every change to the saved show format, and add a migration in server/services/projectMigrations.js. */
export const CURRENT_SCHEMA_VERSION = /** @type {const} */ (6);

export const groupSchema = z.object({ id, name: label, fixtureIds: z.array(id).max(256) }).strict();

const percent = z.number().min(0).max(100);
const controlValue = z.union([percent, z.object({ option: z.number().int().min(0).max(63), level: percent }).strict()]);
const blockSettings = z
  .record(z.string().min(1).max(100), controlValue)
  .refine((settings) => Object.keys(settings).length <= 64, 'Too many settings');

/** A block on a timeline lane: a light, a span of beats, a colour and intensity, a transition and an effect. */
export const timelineBlockSchema = z
  .object({
    id,
    fixtureId: id,
    start: z.number().min(0).max(MAX_SEQUENCE_UNITS),
    length: z
      .number()
      .min(MIN_BLOCK_BEATS / 4)
      .max(MAX_SEQUENCE_UNITS),
    color: hexColour,
    intensity: percent,
    transition: z.enum(TRANSITIONS),
    endColor: hexColour,
    endIntensity: percent,
    effect: z.enum(BLOCK_EFFECTS),
    strobeSpeed: z.number().min(1).max(100),
    // What else the block sets on its light, by control key (see shared/capabilities.js): a level from 0 to 100, or a
    // choice and its level. `endSettings` are where a fade ends, for the controls that fade (pan, tilt, zoom…).
    settings: blockSettings.optional(),
    endSettings: blockSettings.optional(),
  })
  .strict();

/** A sequence: a chain of looks with fades (its steps), and free blocks per light drawn over them. */
export const chaseSchema = z
  .object({
    id,
    name: label,
    loop: z.boolean(),
    // `seconds` uses each step's fadeMs and holdMs; `beats` uses fadeBeats and holdBeats, so the sequence follows the tempo.
    timing: z.enum(['seconds', 'beats']),
    steps: z
      .array(
        z
          .object({
            id,
            sceneId: id,
            fadeMs: z.number().int().min(0).max(600000),
            holdMs: z.number().int().min(0).max(600000),
            fadeBeats: z.number().min(0).max(64),
            holdBeats: z.number().min(0).max(64),
          })
          .strict(),
      )
      .max(256),
    // Free blocks drawn over the looks, one light each, in the sequence's units (beats, or seconds); see
    // shared/timeline.js. While a block runs, it replaces the look on its light.
    blocks: z.array(timelineBlockSchema).max(2000).default([]),
    // How long the sequence runs when that is longer than its steps and blocks, in its units.
    length: z.number().min(0).max(MAX_SEQUENCE_UNITS).optional(),
    // The tempo of the song it was made for: starting the sequence sets it, and the beat follower carries on from there.
    tempo: z.number().min(MIN_BPM).max(MAX_BPM).optional(),
    origin: z.enum(['ai']).optional(), // made by AI show generation
  })
  .strict();

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

/** A rig that is not the active one: its lights and groups, waiting for the show to move there. */
export const venueSchema = z
  .object({
    id,
    name: label,
    fixtures: z.array(fixtureSchema).max(256),
    groups: z.array(groupSchema).max(100),
    // How DMX leaves the computer at this venue (a USB cable, Art-Net…), set again when the show moves there.
    output: outputSettingsSchema.optional(),
  })
  .strict();

export const projectSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    id: id.default(() => randomUUID()), // tells saved shows apart in the show list
    name: label,
    venue: z
      .object({ id, name: label })
      .strict()
      .default({ ...FIRST_VENUE }), // the active venue: fixtures and groups
    venues: z
      .array(venueSchema)
      .max(MAX_VENUES - 1)
      .default([]), // the other venues
    fixtureTypes: z.array(fixtureTypeSchema).max(200),
    fixtures: z.array(fixtureSchema).max(256),
    scenes: z.array(sceneSchema).max(500),
    chases: z.array(chaseSchema).max(100),
    groups: z.array(groupSchema).max(100),
  })
  .strict();

/** An Anthropic API key, pasted once in Settings. */
export const aiKeySchema = z
  .object({
    apiKey: z
      .string()
      .trim()
      .min(20)
      .max(400)
      .regex(/^sk-ant-[A-Za-z0-9_-]+$/, 'That does not look like an Anthropic API key (they start with sk-ant-).'),
  })
  .strict();

/** What the person asks AI show generation for. The song is numbers only, worked out in the browser. */
export const aiGenerateSchema = z
  .object({
    auto: z.boolean(),
    mood: z.string().trim().max(500).default(''),
    energy: z.number().int().min(0).max(100).nullable().default(null),
    colours: z
      .array(z.object({ hex: hexColour, amount: z.enum(COLOUR_AMOUNTS) }).strict())
      .max(12)
      .default([]),
    features: z
      .record(z.string().max(40), z.enum(AMOUNTS))
      .refine((features) => Object.keys(features).length <= 20)
      .default({}),
    looks: z.number().int().min(2).max(MAX_AI_LOOKS).default(8),
    sequences: z.number().int().min(1).max(MAX_AI_SEQUENCES).default(2),
    bars: z.number().int().min(1).max(64).default(16),
    song: z
      .object({
        bpm: z.number().min(MIN_BPM).max(MAX_BPM),
        durationSeconds: z.number().min(1).max(3600),
        firstBeatSeconds: z.number().min(0).max(120),
        sections: z
          .array(
            z
              .object({
                startBar: z.number().int().min(0).max(4000),
                bars: z.number().int().min(1).max(4000),
                energy: z.number().min(0).max(1),
              })
              .strict(),
          )
          .max(200),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();

/** The name for a new show. */
export const showNameSchema = z.object({ name: label }).strict();

/** A folder in the show list, as "Clubs/Montreal"; "" is the top. Checked further by the show library. */
const showFolder = z.string().max(400).default('');

/** File > Save: the show's name, and the folder to keep it in. */
export const showSaveSchema = z.object({ name: label, folder: showFolder }).strict();

/** A folder to make or remove in the show list. */
export const showFolderSchema = z.object({ folder: showFolder }).strict();

export const liveMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set'), values: z.record(channelKey, dmxValue) }).strict(),
  z.object({ type: z.literal('clearProgrammer') }).strict(),
  z.object({ type: z.literal('master'), level: z.number().min(0).max(1) }).strict(),
  z.object({ type: z.literal('blackout'), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal('recall'), sceneId: id, fadeMs: z.number().int().min(0).max(60000).default(0) }).strict(),
  z.object({ type: z.literal('chaseStart'), chaseId: id }).strict(),
  z.object({ type: z.literal('chaseStop') }).strict(),
  z.object({ type: z.literal('release'), fadeMs: z.number().int().min(0).max(60000).default(0) }).strict(),
  z
    .object({ type: z.literal('tempo'), bpm: z.number().min(MIN_BPM).max(MAX_BPM), sync: z.boolean().default(false) })
    .strict(),
  z
    .object({
      type: z.literal('effectStart'),
      effect: z.enum(EFFECT_TYPES),
      beats: z.number().refine((beats) => EFFECT_BEATS.includes(beats), 'Unsupported effect length'),
      groupId: id.nullable().default(null),
    })
    .strict(),
  z.object({ type: z.literal('effectStop') }).strict(),
  z
    .object({
      type: z.literal('autoStart'),
      source: z.enum(AUTO_SOURCES),
      beats: z.number().refine((beats) => AUTO_BEATS.includes(beats), 'Unsupported auto show length'),
      order: z.enum(AUTO_ORDERS),
    })
    .strict(),
  z.object({ type: z.literal('autoStop') }).strict(),
  z.object({ type: z.literal('mute'), fixtureId: id, muted: z.boolean() }).strict(),
  z.object({ type: z.literal('solo'), fixtureId: id, soloed: z.boolean() }).strict(),
  z.object({ type: z.literal('clearMuteSolo') }).strict(),
]);

export const importFixtureSchema = z
  .object({ fixture: z.record(z.string(), z.unknown()), manufacturer: z.string().max(80).optional() })
  .strict();

export const detectAdapterSchema = z.object({ serialPath: z.string().min(1).max(200) }).strict();

/** An Open Fixture Library key is `manufacturer/fixture`, both lower-case slugs. */
export const FIXTURE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}\/[a-z0-9][a-z0-9-]{0,120}$/;

export const oflSearchSchema = z.object({ q: z.string().trim().min(2).max(80) }).strict();

export const oflDetailsSchema = z.object({ key: z.string().regex(FIXTURE_KEY_PATTERN) }).strict();

export const oflImportSchema = z.object({ key: z.string().regex(FIXTURE_KEY_PATTERN) }).strict();

export const importQlcSchema = z.object({ xml: z.string().min(1).max(300_000) }).strict();

/** @returns {import('../../shared/types.js').Project} an empty show at the current schema version */
export function createEmptyProject() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: randomUUID(),
    name: 'Untitled show',
    venue: { ...FIRST_VENUE },
    venues: [],
    fixtureTypes: [],
    fixtures: [],
    scenes: [],
    chases: [],
    groups: [],
  };
}
