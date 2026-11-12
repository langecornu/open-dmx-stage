// Timelines: one lane per light, with blocks drawn on a grid of beats. A block has a colour and an intensity, can fade to
// an end colour and intensity, and can strobe. Pure, and shared by the engine (which plays a timeline) and the editor
// (which previews it), so what you draw is exactly what plays.
import { controlDmx, nearestColourOption } from './capabilities.js';

export const BEATS_PER_BAR = 4;

/** Lengths offered in the editor, in bars of four beats. Any whole number of bars up to the maximum is valid. */
export const TIMELINE_BARS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];

/** The shortest block, and the finest grid step, in beats. */
export const MIN_BLOCK_BEATS = 0.25;

export const TRANSITIONS = /** @type {const} */ (['none', 'fade']);

export const BLOCK_EFFECTS = /** @type {const} */ (['none', 'strobe']);

/** Strobe speed runs from 1 (slow) to 100 (fast): 2 to 20 flashes a second, each lit for a third of its cycle. */
const STROBE_MIN_HZ = 2;
const STROBE_MAX_HZ = 20;
const STROBE_DUTY = 1 / 3;

/**
 * @typedef {object} TimelineBlock
 * @property {string} id
 * @property {string} fixtureId the light (lane) it belongs to
 * @property {number} start in beats from the start of the timeline
 * @property {number} length in beats
 * @property {string} color `#rrggbb`
 * @property {number} intensity 0 to 100
 * @property {'none' | 'fade'} transition `fade` goes from colour and intensity to the end colour and intensity
 * @property {string} endColor `#rrggbb`
 * @property {number} endIntensity 0 to 100
 * @property {'none' | 'strobe'} effect
 * @property {number} strobeSpeed 1 to 100
 */

/**
 * @param {string} hex `#rrggbb`
 * @returns {[number, number, number]}
 */
export function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * @param {number} speed 1 to 100
 * @returns {number} flashes per second
 */
export function strobeHz(speed) {
  const clamped = Math.max(1, Math.min(100, speed));
  return STROBE_MIN_HZ + ((clamped - 1) / 99) * (STROBE_MAX_HZ - STROBE_MIN_HZ);
}

/**
 * The block playing on a lane at a beat. When blocks overlap, the one drawn last wins, as it sits on top in the editor.
 * @param {TimelineBlock[]} blocks the lane's blocks, in the order they were drawn
 * @param {number} beat
 * @returns {TimelineBlock | null}
 */
export function blockAt(blocks, beat) {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (beat >= block.start && beat < block.start + block.length) {
      return block;
    }
  }
  return null;
}

/**
 * What a block shows at a beat.
 * @param {TimelineBlock} block
 * @param {number} beat
 * @param {number} ms the clock, for the strobe (which flashes in real time, not in beats)
 * @returns {{ red: number, green: number, blue: number, level: number }} colour 0 to 255, level 0 to 1
 */
export function evaluateBlock(block, beat, ms) {
  const progress = block.length > 0 ? Math.max(0, Math.min(1, (beat - block.start) / block.length)) : 0;
  const isFade = block.transition === 'fade';
  const from = hexToRgb(block.color);
  const to = isFade ? hexToRgb(block.endColor) : from;
  const mix = (/** @type {number} */ a, /** @type {number} */ b) => Math.round(a + (b - a) * (isFade ? progress : 0));
  const intensity = isFade ? block.intensity + (block.endIntensity - block.intensity) * progress : block.intensity;
  let level = Math.max(0, Math.min(100, intensity)) / 100;
  if (block.effect === 'strobe') {
    const cycle = ((ms / 1000) * strobeHz(block.strobeSpeed)) % 1;
    if (cycle >= STROBE_DUTY) {
      level = 0;
    }
  }
  return { red: mix(from[0], to[0]), green: mix(from[1], to[1]), blue: mix(from[2], to[2]), level };
}

/**
 * A block's settings at a beat: during a fade, a continuous setting moves from its start value to its end value, and a
 * choice keeps its option while its level moves.
 * @param {TimelineBlock & { settings?: Record<string, import('./capabilities.js').ControlValue>, endSettings?: Record<string, import('./capabilities.js').ControlValue> }} block
 * @param {number} beat
 * @returns {Map<string, import('./capabilities.js').ControlValue>}
 */
export function settingsAt(block, beat) {
  const start = block.settings ?? {};
  const end = block.transition === 'fade' ? (block.endSettings ?? {}) : {};
  const progress = block.length > 0 ? Math.max(0, Math.min(1, (beat - block.start) / block.length)) : 0;
  const mix = (/** @type {number} */ a, /** @type {number} */ b) => a + (b - a) * progress;
  const result = new Map();
  for (const [key, value] of Object.entries(start)) {
    const target = end[key];
    if (typeof value === 'number' && typeof target === 'number') {
      result.set(key, mix(value, target));
    } else if (typeof value === 'object' && typeof target === 'object' && value.option === target.option) {
      result.set(key, { option: value.option, level: mix(value.level, target.level) });
    } else {
      result.set(key, value);
    }
  }
  return result;
}

/**
 * Everything a block sets on a light besides its red, green, blue and dimmer: its settings, plus what makes the light
 * show the block at all. The shutter opens (unless the block sets it), a light with a colour wheel instead of red,
 * green and blue gets the nearest colour, and a light that mixes cyan, magenta and yellow gets those from the colour.
 * @param {Parameters<typeof settingsAt>[0]} block
 * @param {number} beat
 * @param {{ red: number, green: number, blue: number, level: number }} shown what evaluateBlock gave
 * @param {import('./capabilities.js').Control[]} controls the light's controls
 * @param {boolean} hasRgb whether the light has red, green and blue channels
 * @returns {[number, number][]} pairs of absolute DMX channel and value
 */
export function blockControlWrites(block, beat, shown, controls, hasRgb) {
  const settings = settingsAt(block, beat);
  const byKey = new Map(controls.map((control) => [control.key, control]));
  /** @type {[number, number][]} */
  const writes = [];
  const shutter = byKey.get('strobe');
  if (shutter && !settings.has('strobe') && shutter.kind === 'choice') {
    const open = shutter.options.findIndex((option) => option.type === 'shutter-open');
    if (open >= 0) {
      writes.push(...controlDmx(shutter, { option: open, level: 0 }));
    }
  }
  if (!hasRgb) {
    const wheel = byKey.get('color-wheel') ?? byKey.get('color-macro');
    if (wheel && wheel.kind === 'choice' && !settings.has(wheel.key)) {
      const nearest = nearestColourOption(wheel, [shown.red, shown.green, shown.blue]);
      if (nearest >= 0) {
        writes.push(...controlDmx(wheel, { option: nearest, level: 0 }));
      }
    }
    const subtractive = { cyan: shown.red, magenta: shown.green, yellow: shown.blue };
    for (const [key, additive] of Object.entries(subtractive)) {
      const control = byKey.get(key);
      if (control && !settings.has(key)) {
        writes.push(...controlDmx(control, 100 - (additive / 255) * 100));
      }
    }
  }
  for (const [key, value] of settings) {
    const control = byKey.get(key);
    if (control) {
      writes.push(...controlDmx(control, value));
    }
  }
  return writes;
}

/** The longest a sequence can run: an hour, in its units (beats or seconds). */
export const MAX_SEQUENCE_UNITS = 3600;

/**
 * How long one step lasts, in the sequence's units: beats when it follows the tempo, else seconds.
 * @param {{ fadeMs: number, holdMs: number, fadeBeats?: number, holdBeats?: number }} step
 * @param {'seconds' | 'beats'} timing
 * @returns {{ fade: number, hold: number }}
 */
export function stepUnits(step, timing) {
  return timing === 'beats'
    ? { fade: step.fadeBeats ?? 0, hold: step.holdBeats ?? 1 }
    : { fade: step.fadeMs / 1000, hold: step.holdMs / 1000 };
}

/**
 * How long a whole sequence runs, in its units: its chain of looks, its blocks, or the length it was given, whichever is
 * longest, and never nothing.
 * @param {{ timing?: 'seconds' | 'beats', steps: Parameters<typeof stepUnits>[0][], blocks?: { start: number, length: number }[], length?: number }} sequence
 * @returns {number}
 */
export function sequenceLength(sequence) {
  const timing = sequence.timing ?? 'seconds';
  const steps = sequence.steps.reduce((sum, step) => {
    const { fade, hold } = stepUnits(step, timing);
    return sum + fade + hold;
  }, 0);
  const blocks = Math.max(0, ...(sequence.blocks ?? []).map((block) => block.start + block.length));
  return Math.max(steps, blocks, sequence.length ?? 0, timing === 'beats' ? 1 : 0.1);
}

/**
 * Everything a block sends to its light at one moment: red, green and blue (scaled by the intensity when the light has
 * no dimmer), the dimmer, and its other settings. Used by the engine as a sequence plays, and to turn a still block into
 * a look.
 * @param {Parameters<typeof evaluateBlock>[0] & Parameters<typeof settingsAt>[0]} block
 * @param {number} position where the sequence is, in its units
 * @param {number} at the time in ms, for a strobe
 * @param {{ red?: number, green?: number, blue?: number, dimmers?: number[] }} channels the light's colour and dimmer
 *   channels
 * @param {import('./capabilities.js').Control[]} controls the light's controls
 * @returns {[number, number][]} pairs of absolute DMX channel and value
 */
export function blockWrites(block, position, at, channels, controls) {
  const shown = evaluateBlock(block, position, at);
  const dimmers = channels.dimmers ?? [];
  const scale = dimmers.length > 0 ? 1 : shown.level;
  /** @type {[number, number][]} */
  const writes = [];
  for (const [channel, value] of /** @type {[number | undefined, number][]} */ ([
    [channels.red, shown.red],
    [channels.green, shown.green],
    [channels.blue, shown.blue],
  ])) {
    if (channel !== undefined) {
      writes.push([channel, Math.round(value * scale)]);
    }
  }
  const hasColour = channels.red !== undefined || channels.green !== undefined || channels.blue !== undefined;
  // A light with only a dimmer shows the block's brightness: its intensity times how bright the colour is.
  const dimmerLevel = hasColour ? shown.level : shown.level * (Math.max(shown.red, shown.green, shown.blue) / 255);
  for (const channel of dimmers) {
    writes.push([channel, Math.round(dimmerLevel * 255)]);
  }
  writes.push(...blockControlWrites(block, position, shown, controls, hasColour));
  return writes;
}
