// AI show generation: asks Claude to design looks and sequences for the active venue's rig, from the person's choices
// and, optionally, a song's tempo and energy map (numbers only; the audio never leaves the browser). The answer comes back
// as JSON in a fixed shape (structured outputs), then shared/aiShow.js checks it and turns it into looks and sequences
// on this rig's channels. The API key stays on the server.
import Anthropic, {
  APIConnectionError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import { DEFAULT_AI_MODEL, aiModel } from '../../shared/aiModels.js';
import { MAX_AI_BLOCKS, buildGeneratedShow, describeRig, venueFeatures } from '../../shared/aiShow.js';
import { unplacedLights } from '../../shared/stageRig.js';
import { logger } from '../logger.js';
import { httpError } from '../utils/httpError.js';

const log = logger.child({ module: 'ai' });

/** A setting on a light: a control by its key, with a choice by its label for a control with choices, and a level. */
const settingSchema = z.object({
  control: z.string().describe('A control key from the rig, for example "pan" or "gobo"'),
  option: z.string().nullable().describe('For a choice control: the option label exactly as listed; otherwise null'),
  level: z.number().describe('0 to 100: the level of a level control, or of an option that takes a level'),
});

const lightStateSchema = z.object({
  lightId: z.string(),
  color: z.string().describe('#rrggbb'),
  intensity: z.number().describe('0 to 100'),
  settings: z.array(settingSchema),
});

/** What Claude answers: the shape is enforced by the API, the values are checked in shared/aiShow.js. */
export const generatedShowSchema = z.object({
  summary: z.string().describe('Two or three sentences for the person: the idea of the show and how it uses the rig'),
  looks: z.array(
    z.object({
      name: z.string().describe('Short and evocative, at most 30 characters'),
      lights: z.array(lightStateSchema),
    }),
  ),
  sequences: z.array(
    z.object({
      name: z.string(),
      loop: z.boolean(),
      lengthBeats: z.number().describe('How long the sequence runs, in beats'),
      steps: z.array(
        z.object({
          look: z.string().describe('The name of one of the looks above'),
          fadeBeats: z.number(),
          holdBeats: z.number(),
        }),
      ),
      blocks: z.array(
        z.object({
          lightId: z.string(),
          startBeat: z.number().describe('From 0'),
          lengthBeats: z.number(),
          color: z.string().describe('#rrggbb'),
          intensity: z.number().describe('0 to 100'),
          fadeTo: z
            .object({ color: z.string(), intensity: z.number() })
            .nullable()
            .describe('Fade across the block to this colour and intensity, or null to hold'),
          strobe: z.number().nullable().describe('Strobe speed 0 (slow) to 100 (fast), or null for no strobe'),
          settings: z.array(settingSchema),
          endSettings: z
            .array(settingSchema)
            .describe('With fadeTo: the level controls (pan, tilt, zoom…) fade to these by the end. Otherwise empty'),
        }),
      ),
    }),
  ),
});

// Stable, so it is cached between generations.
const SYSTEM_PROMPT = `You are a lighting designer programming a small DMX light show in Open DMX Stage. You design looks (still states of the lights) and sequences (looks chained over time, plus blocks drawn on single lights) for the rig you are given.

How the app works:
- Every light takes a colour (#rrggbb) and an intensity (0 to 100). Lights that cannot mix colour use the nearest colour wheel slot, or only follow the brightness.
- Beyond colour, a light has controls, listed per light with a key. Use a control only on a light that lists it. A "level" control takes a level 0 to 100 (pan and tilt: 50 is the centre). A "choice" control takes one of its options, by its label exactly as listed, plus a level for options that take one (a strobe or rotation speed).
- A sequence runs in beats and follows the live tempo. Steps play looks one after another (fade, then hold, in beats). Blocks override single lights for a span of beats: a colour and intensity, optionally fading to another colour and intensity across the block, optionally strobing, and optionally settings (with end settings that level controls fade to, which is how moving heads sweep). Where a light has no block, the step's look shows on it.
- Avoid overlapping blocks on the same light. Keep each sequence's blocks within its length.

Design well:
- Build contrast and a story: calm and building parts, peaks and drops, and moments of rest. Match energy to the music when a song is given: its sections are listed with their energy, in bars of four beats from the first downbeat.
- Use what the rig has: sweeps and positions for moving heads, gobos and prisms on peaks, smoke or haze in short bursts (a few beats, a few times, never continuously at full), colour wheel slots on lights without colour mixing.
- Use where the lights are. Each light has a place (in words and in metres, left and right as the audience sees the stage), the rig lists the lights on each rail in order and what each rail faces across the floor, and the mirror pairs. Run chases that travel across the space in that order (left to right, back to front, around a square), move mirror pairs together or against each other, answer one side with the opposite one, and cross beams from lights facing each other. Lights at the front light the people; lights at the back throw beams and silhouettes toward the audience; floor lights uplight.
- Aim moving heads from where each one hangs: pan and tilt so beams meet at a point on the floor, fan out from the middle, or sweep the audience together.
- Strobe sparingly: only at peaks, at most 8 beats at a time, and never fast for long, to be kind to people sensitive to flashing light.
- Respect every choice the person made. "more" means use it often, "less" means rarely, "off" means never, "avoid" for a colour means never use it.
- Give every look a different idea. Name things so a performer recognises them on a pad.`;

/** @param {number} energy 0 to 1 */
const energyWord = (energy) => (energy < 0.33 ? 'quiet' : energy < 0.66 ? 'medium' : 'high');

/**
 * The request: the rig, the choices and the song, as the AI reads them.
 * @param {import('../../shared/types.js').Project} project
 * @param {import('../../shared/types.js').FixtureType[]} builtinTypes
 * @param {any} preferences validated by aiGenerateSchema
 */
export function buildRequest(project, builtinTypes, preferences) {
  const features = venueFeatures(project, builtinTypes);
  const parts = [
    `The rig at ${project.venue?.name ?? 'the venue'}:`,
    JSON.stringify(describeRig(project, builtinTypes), null, 1),
  ];
  const song = preferences.song;
  const songBeats = song
    ? Math.max(4, Math.round(((song.durationSeconds - song.firstBeatSeconds) * song.bpm) / 60))
    : 0;
  if (song) {
    parts.push(
      `A song to design for: ${song.bpm} beats a minute, ${songBeats} beats (${Math.round(songBeats / 4)} bars) from the first downbeat. Its sections:`,
      song.sections
        .map(
          (/** @type {{ startBar: number, bars: number, energy: number }} */ section) =>
            `- bars ${section.startBar + 1} to ${section.startBar + section.bars}: ${energyWord(section.energy)} energy (${Math.round(section.energy * 100)}%)`,
        )
        .join('\n'),
      `Make the first sequence follow the whole song, section by section: loop false, lengthBeats ${songBeats}, starting at beat 0 on the first downbeat.`,
    );
  }
  if (preferences.auto) {
    parts.push(
      `The person leaves everything to you. Make about ${preferences.looks} looks and ${preferences.sequences} ${preferences.sequences === 1 ? 'sequence' : 'sequences'}${song ? '' : ` of about ${preferences.bars} bars that loop`}, using everything the rig can do.`,
    );
  } else {
    const wanted = Object.entries(preferences.features)
      .filter(([id, amount]) => amount !== 'auto' && features.some((feature) => feature.id === id))
      .map(([id, amount]) => `- ${features.find((feature) => feature.id === id)?.label}: ${amount}`);
    parts.push(
      `Make ${preferences.looks} looks and ${preferences.sequences} ${preferences.sequences === 1 ? 'sequence' : 'sequences'}${song ? '' : ` of ${preferences.bars} bars that loop`}.`,
      preferences.mood ? `The mood or style the person asked for: ${preferences.mood}` : '',
      preferences.energy === null ? '' : `Overall energy: ${preferences.energy} out of 100.`,
      preferences.colours.length > 0
        ? `Colours:\n${preferences.colours.map((/** @type {{ hex: string, amount: string }} */ colour) => `- ${colour.hex}: ${colour.amount}`).join('\n')}`
        : '',
      wanted.length > 0 ? `Features:\n${wanted.join('\n')}` : '',
      'Use everything else the rig can do as you see fit.',
    );
  }
  parts.push(`Keep the whole answer under ${MAX_AI_BLOCKS} blocks in total.`);
  return { text: parts.filter(Boolean).join('\n\n'), songBeats };
}

/**
 * Turns an API failure into a message for the person, without internals.
 * @param {unknown} error
 * @returns {Error & { status: number }}
 */
export function explainAiError(error) {
  if (error instanceof AuthenticationError) {
    return httpError(400, 'Anthropic refused the API key. Paste a valid key in Settings.');
  }
  if (error instanceof PermissionDeniedError || error instanceof NotFoundError) {
    return httpError(
      400,
      'This API key cannot use the AI model. Check the key and its workspace in the Anthropic Console.',
    );
  }
  if (error instanceof RateLimitError) {
    return httpError(
      429,
      'The API key has reached its usage limit for now. Try again in a minute, or check its limits.',
    );
  }
  if (error instanceof BadRequestError) {
    return httpError(400, `Anthropic could not take the request: ${error.message}`);
  }
  if (error instanceof APIConnectionError) {
    return httpError(503, 'Could not reach Anthropic. Check the internet connection.', { expose: true });
  }
  return httpError(503, 'Anthropic did not answer as expected. Try again in a moment.', { expose: true });
}

/**
 * Checks a key by asking about the model it will use.
 * @param {string} apiKey
 * @param {(apiKey: string) => Anthropic} [createClient]
 */
export async function checkApiKey(apiKey, createClient = (key) => new Anthropic({ apiKey: key })) {
  try {
    await createClient(apiKey).models.retrieve(DEFAULT_AI_MODEL);
  } catch (error) {
    log.warn({ status: error instanceof Anthropic.APIError ? error.status : undefined }, 'API key check failed');
    throw explainAiError(error);
  }
}

/**
 * @param {{
 *   apiKey: string,
 *   project: import('../../shared/types.js').Project,
 *   builtinTypes: import('../../shared/types.js').FixtureType[],
 *   preferences: any,
 *   makeId: () => string,
 *   createClient?: (apiKey: string) => Anthropic,
 * }} options
 */
export async function generateShow({
  apiKey,
  project,
  builtinTypes,
  preferences,
  makeId,
  createClient = (key) => new Anthropic({ apiKey: key }),
}) {
  if (project.fixtures.length === 0) {
    throw httpError(400, 'Add lights to this venue in Setup first: the AI designs for the lights you have.');
  }
  if (unplacedLights(project.fixtures).length > 0) {
    throw httpError(
      400,
      'Place the lights on the stage first (AI shows, Arrange the lights): the AI designs for where they are.',
    );
  }
  const { text } = buildRequest(project, builtinTypes, preferences);
  let message;
  try {
    // Streamed, so a long answer does not hit an HTTP timeout. On models that have one, a request the model declines is
    // retried on a fallback model. The answer may use the model's full output, so a big rig does not run out of room.
    const model = aiModel(preferences.model ?? DEFAULT_AI_MODEL);
    const stream = createClient(apiKey).beta.messages.stream({
      model: model.id,
      max_tokens: 128000,
      ...(model.hasFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
      output_config: { effort: 'medium', format: zodOutputFormat(generatedShowSchema) },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: text }],
    });
    message = await stream.finalMessage();
  } catch (error) {
    log.warn({ err: error instanceof Error ? error.message : String(error) }, 'Show generation failed');
    throw explainAiError(error);
  }
  if (message.stop_reason === 'refusal') {
    throw httpError(422, 'The AI declined to design this show. Try different words for the mood.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw httpError(422, 'The show was too big to finish. Ask for fewer looks or sequences, or a shorter length.');
  }
  const textBlock = message.content.find((block) => block.type === 'text');
  let generated;
  try {
    generated = generatedShowSchema.parse(JSON.parse(textBlock && 'text' in textBlock ? textBlock.text : ''));
  } catch {
    throw httpError(502, 'The AI answered in an unexpected shape. Try again.', { expose: true });
  }
  const tempo = preferences.song ? preferences.song.bpm : null;
  const show = buildGeneratedShow(generated, project, builtinTypes, { makeId, tempo });
  log.info(
    {
      model: message.model,
      looks: show.looks.length,
      sequences: show.sequences.length,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
    'Generated a show',
  );
  return {
    ...show,
    // The model that answered, which a fallback may have changed, so the cost shown is at its prices.
    model: message.model,
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
  };
}
