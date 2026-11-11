// Timelines: one lane per light, with blocks drawn on a grid of beats. A block has a colour and an intensity, can fade to
// an end colour and intensity, and can strobe. Pure, and shared by the engine (which plays a timeline) and the editor
// (which previews it), so what you draw is exactly what plays.

/** Lengths a timeline can have, in beats: one, two, four, eight or sixteen bars of four beats. */
export const TIMELINE_BEATS = [4, 8, 16, 32, 64];

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
