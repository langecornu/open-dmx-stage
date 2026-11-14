// The Claude models AI shows can use, their list prices, and a rough estimate of what a generation costs before it runs.
// Most of the cost is the answer: every look sets every light, sequence blocks grow with the song and the rig, and the
// model reasons before it writes. The estimate is calibrated on real generations (12 lights, 8 looks, 2 sequences, a
// three-minute song: 3,600 input and 21,000 to 28,000 output tokens on Opus; each light's place on the stage now adds
// about 60 input tokens, and blocks that follow the beat make a song's sequence about half as long again, an estimate
// still to be checked against real generations) and shown as a range. Pure, for browser and server.

/**
 * @typedef {{ id: string, name: string, summary: string, inputPerMillion: number, outputPerMillion: number,
 *   hasFallback: boolean }} AiModel prices in US dollars per million tokens, Anthropic list prices; `hasFallback`:
 *   a request the model declines is retried on another model
 */

/** @type {AiModel[]} cheapest first */
export const AI_MODELS = [
  {
    id: 'claude-haiku-5-5',
    name: 'Haiku 5.5',
    summary: 'Fastest and cheapest. Good for quick ideas and small rigs.',
    inputPerMillion: 0.1,
    outputPerMillion: 0.5,
    hasFallback: false,
  },
  {
    id: 'claude-sonnet-5-5',
    name: 'Sonnet 5.5',
    summary: 'Balanced: strong designs at half the price of Opus.',
    inputPerMillion: 2,
    outputPerMillion: 10,
    hasFallback: true,
  },
  {
    id: 'claude-opus-5-5',
    name: 'Opus 5.5',
    summary: 'The most creative and careful, for the show that matters.',
    inputPerMillion: 4,
    outputPerMillion: 20,
    hasFallback: true,
  },
];

export const DEFAULT_AI_MODEL = 'claude-opus-5-5';
export const AI_MODEL_IDS = /** @type {[string, ...string[]]} */ (AI_MODELS.map((model) => model.id));

/** @param {string} id @returns {AiModel} the model, or the default one for an unknown id */
export function aiModel(id) {
  const fallback = /** @type {AiModel} */ (AI_MODELS.find((model) => model.id === DEFAULT_AI_MODEL));
  return AI_MODELS.find((model) => model.id === id) ?? fallback;
}

/**
 * What tokens cost on a model, in US dollars.
 * @param {{ inputTokens: number, outputTokens: number }} usage
 * @param {string} modelId
 * @returns {number}
 */
export function costOf(usage, modelId) {
  const model = aiModel(modelId);
  return (usage.inputTokens * model.inputPerMillion + usage.outputTokens * model.outputPerMillion) / 1_000_000;
}

/**
 * Roughly how many tokens a generation uses.
 * @param {{ lights: number, looks: number, sequences: number, bars: number,
 *   song?: { durationSeconds: number, bpm: number, sections?: unknown[] } | null }} request
 * @returns {{ inputTokens: number, outputTokens: [number, number] }} output as a likely range
 */
export function estimateTokens({ lights, looks, sequences, bars, song = null }) {
  const lightCount = Math.max(1, lights);
  const songBars = song ? Math.round((song.durationSeconds * song.bpm) / 240) : 0;
  const sections = song ? (song.sections?.length ?? Math.max(1, Math.round(songBars / 8))) : 0;
  // The request: instructions, the rig (each light with what it can do and where it is), the choices and the song's
  // energy map.
  const inputTokens = Math.round(2650 + lightCount * 140 + sections * 25);
  // The answer: each look sets every light; each sequence has steps and per-light blocks, more for a song (one per
  // section and light, roughly) than for a loop of a few bars.
  const lookTokens = looks * (60 + lightCount * 40);
  // Since blocks can pulse and flash on the beat, a song gets about one per light in every section.
  const blocksPerSequence = song ? sections * Math.min(lightCount, 8) : (bars / 4) * Math.min(lightCount, 8) * 0.5;
  const sequenceTokens = sequences * (150 + blocksPerSequence * 45);
  const written = lookTokens + sequenceTokens;
  // Reasoning before writing comes on top: the whole answer is about two and a half to three and a half times what is
  // written.
  return { inputTokens, outputTokens: [Math.round(written * 2.6), Math.round(written * 3.4)] };
}

/**
 * Roughly what a generation costs on a model, in US dollars.
 * @param {Parameters<typeof estimateTokens>[0]} request
 * @param {string} modelId
 * @returns {[number, number]} likely range
 */
export function estimateCost(request, modelId) {
  const { inputTokens, outputTokens } = estimateTokens(request);
  return [
    costOf({ inputTokens, outputTokens: outputTokens[0] }, modelId),
    costOf({ inputTokens, outputTokens: outputTokens[1] }, modelId),
  ];
}

/**
 * A price for people: cents under a dollar, rounded sensibly.
 * @param {number} dollars
 * @returns {string}
 */
export function formatPrice(dollars) {
  if (dollars < 0.01) {
    return 'under 1¢';
  }
  if (dollars < 1) {
    return `${Math.round(dollars * 100)}¢`;
  }
  return `$${dollars.toFixed(2)}`;
}

/**
 * A cost range for people: "3¢ to 5¢", or one figure when both ends round the same.
 * @param {[number, number]} range
 * @returns {string}
 */
export function formatPriceRange([low, high]) {
  const from = formatPrice(low);
  const to = formatPrice(high);
  if (high < 0.01) {
    return from;
  }
  if (low < 0.01) {
    return `up to ${to}`;
  }
  return from === to ? `about ${from}` : `about ${from} to ${to}`;
}
