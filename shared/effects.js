// Pure maths for the live effects (pulse, sweep, rainbow), shared by the server engine and the tests. An effect is a
// function of the beat: `phase` runs from 0 to 1 once per cycle, so every effect stays locked to the tempo.

export const EFFECT_TYPES = /** @type {const} */ (['pulse', 'sweep', 'rainbow']);

/** How many beats one cycle of an effect lasts. */
export const EFFECT_BEATS = [0.5, 1, 2, 4, 8];

export const MIN_BPM = 30;
export const MAX_BPM = 300;

const DIMMEST = 0.1; // pulse and sweep never go fully dark, so the rig stays readable

/** @param {number} value @returns {number} the fractional part, always 0 up to (not including) 1 */
function wrap(value) {
  return value - Math.floor(value);
}

/**
 * Pulse: every light swells and fades together, brightest on the beat.
 * @param {number} phase 0 to 1
 * @returns {number} brightness multiplier from 0.1 to 1
 */
export function pulseGain(phase) {
  return DIMMEST + (1 - DIMMEST) * (0.5 + 0.5 * Math.cos(2 * Math.PI * phase));
}

/**
 * Sweep: a bright spot runs along the lights in order and fades behind it.
 * @param {number} phase 0 to 1
 * @param {number} index position of this light in the group, from 0
 * @param {number} count how many lights are in the group
 * @returns {number} brightness multiplier from 0.1 to 1
 */
export function sweepGain(phase, index, count) {
  const behind = wrap(phase - index / count); // how far the spot has moved past this light, as a share of the cycle
  return DIMMEST + (1 - DIMMEST) * Math.max(0, 1 - behind * count);
}

/**
 * Rainbow: colours cycle through the hues, offset along the lights so a row shows the whole spectrum.
 * @param {number} phase 0 to 1
 * @param {number} index
 * @param {number} count
 * @returns {[number, number, number]} red, green and blue, 0 to 255
 */
export function rainbowRgb(phase, index, count) {
  const hue = wrap(phase + index / count) * 6;
  const sector = Math.floor(hue);
  const rise = hue - sector;
  const up = Math.round(255 * rise);
  const down = 255 - up;
  switch (sector) {
    case 0:
      return [255, up, 0];
    case 1:
      return [down, 255, 0];
    case 2:
      return [0, 255, up];
    case 3:
      return [0, down, 255];
    case 4:
      return [up, 0, 255];
    default:
      return [255, 0, down];
  }
}
