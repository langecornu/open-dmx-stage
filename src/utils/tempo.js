// Tap tempo: works out beats per minute from the times of recent taps, and converts beats to milliseconds.
import { MAX_BPM, MIN_BPM } from '../../shared/effects.js';

export const TAP_RESET_MS = 2000; // a longer pause starts a new count
export const MAX_TAPS = 8; // only the most recent taps matter

/**
 * @param {number[]} taps times of earlier taps, oldest first
 * @param {number} now time of this tap
 * @returns {number[]} the taps to keep, including this one
 */
export function addTap(taps, now) {
  const recent = taps.length > 0 && now - taps[taps.length - 1] > TAP_RESET_MS ? [] : taps;
  return [...recent, now].slice(-MAX_TAPS);
}

/**
 * @param {number[]} taps
 * @returns {number | null} beats per minute to one decimal place, or null until there are two taps
 */
export function bpmFromTaps(taps) {
  if (taps.length < 2) {
    return null;
  }
  const averageInterval = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
  return clampBpm(Math.round((60000 / averageInterval) * 10) / 10);
}

/** @param {number} bpm @returns {number} the tempo limited to what the engine accepts */
export function clampBpm(bpm) {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
}

/**
 * @param {{ fadeMs: number, holdMs: number, fadeBeats: number, holdBeats: number }} step
 * @param {'seconds' | 'beats'} timing
 * @param {number} bpm
 * @returns {{ fadeMs: number, holdMs: number }} how long the step really lasts at this tempo
 */
export function stepDurations(step, timing, bpm) {
  if (timing === 'beats') {
    const beatMs = 60000 / bpm;
    return { fadeMs: Math.round(step.fadeBeats * beatMs), holdMs: Math.round(step.holdBeats * beatMs) };
  }
  return { fadeMs: step.fadeMs, holdMs: step.holdMs };
}
