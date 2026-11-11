// Finds the beat and the tempo of music from how the sound's strength changes over time. It does not count single hits
// (which fails on real music: a kick sits on top of a bass line, hi-hats and snares add more hits, and a laptop microphone
// hears little bass). Instead it measures how strongly the sound "attacks" in each short window, and finds the tempo from
// how that pattern repeats (autocorrelation), the way beat trackers do. Pure functions and a small state machine, so they
// can be tested with made-up sound.

export const WINDOW_MS = 20; // the audio worklet reports one low-band and one full-band strength per window

const HISTORY_WINDOWS = 400; // eight seconds of attack strengths
const MIN_WINDOWS = 150; // three seconds before the first tempo estimate
const ESTIMATE_EVERY = 25; // then an estimate every half second
const MIN_LAG = 15; // 200 beats per minute
const MAX_LAG = 75; // 40 beats per minute (a slow pattern is folded up to the usual range afterwards)
const MIN_CONFIDENCE = 0.2; // how strongly the pattern must repeat before a tempo is believed
const AGREE = 0.035; // three estimates this close (35 parts in a thousand) count as the same tempo
const MIN_FOLDED_BPM = 70;
const MAX_FOLDED_BPM = 180;
const SILENCE_MS = 4000;
const SILENT_LEVEL = 0.0004; // below this, nothing is happening

/** @param {number[]} values @returns {number} */
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** @param {number} bpm @returns {number} the tempo doubled or halved until it is in the range dance music uses */
export function foldTempo(bpm) {
  let folded = bpm;
  while (folded < MIN_FOLDED_BPM) {
    folded *= 2;
  }
  while (folded > MAX_FOLDED_BPM) {
    folded /= 2;
  }
  return folded;
}

/**
 * Works out the tempo from how a series of attack strengths repeats.
 * @param {number[]} strengths one attack strength per window, oldest first
 * @returns {{ bpm: number, confidence: number } | null} null when nothing repeats clearly enough
 */
export function estimateTempo(strengths) {
  const count = strengths.length;
  if (count < MIN_WINDOWS) {
    return null;
  }
  const average = mean(strengths);
  const centred = strengths.map((value) => value - average);
  const variance = mean(centred.map((value) => value * value));
  if (variance < 1e-9) {
    return null;
  }
  /** @type {number[]} */
  const correlation = [];
  for (let lag = 0; lag <= MAX_LAG + 1; lag += 1) {
    let sum = 0;
    for (let index = lag; index < count; index += 1) {
      sum += centred[index] * centred[index - lag];
    }
    correlation[lag] = sum / ((count - lag) * variance);
  }
  let bestLag = -1;
  let bestScore = -Infinity;
  for (let lag = MIN_LAG; lag <= MAX_LAG; lag += 1) {
    const bpm = 60000 / (lag * WINDOW_MS);
    // A gentle preference for the tempos most music uses, so a pattern that repeats at twice the beat is not chosen
    // over the beat itself when both look alike.
    const preference = Math.exp(-0.5 * (Math.log2(bpm / 115) / 0.8) ** 2);
    const score = correlation[lag] * preference;
    const isPeak = correlation[lag] >= correlation[lag - 1] && correlation[lag] >= correlation[lag + 1];
    if (isPeak && score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || correlation[bestLag] < MIN_CONFIDENCE) {
    return null;
  }
  // Refine the peak between windows with a parabola through its neighbours.
  const before = correlation[bestLag - 1];
  const after = correlation[bestLag + 1];
  const curve = before - 2 * correlation[bestLag] + after;
  const offset = curve === 0 ? 0 : (0.5 * (before - after)) / curve;
  const lag = bestLag + Math.max(-0.5, Math.min(0.5, offset));
  return { bpm: foldTempo(60000 / (lag * WINDOW_MS)), confidence: correlation[bestLag] };
}

/** @param {number[]} values @returns {number} the middle value */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Moves a tempo part of the way towards a new estimate, so it follows the music without jumping.
 * @param {number | null} previous
 * @param {number} estimate
 * @param {number} [weight] how much of the new estimate to take, 0 to 1
 * @returns {number}
 */
export function smoothTempo(previous, estimate, weight = 0.35) {
  if (previous === null || Math.abs(estimate - previous) > previous * 0.2) {
    return estimate; // the first estimate, or a real change of song
  }
  return Math.round((previous + weight * (estimate - previous)) * 10) / 10;
}

/**
 * @typedef {object} TrackerResult
 * @property {boolean} isBeat true when this window is a beat that fits the tempo
 * @property {number | null} bpm the tempo once it has been steady for a moment, else null
 * @property {number | null} candidateBpm the latest estimate, even before it is believed
 * @property {number} confidence how strongly the rhythm repeats, 0 to 1
 * @property {number} beatsHeard how many beats have been found so far
 */

/**
 * Follows music window by window. Feed it the low-band and full-band strength of each 20 ms window.
 * @returns {{ feed: (band: { low: number, full: number }, timeMs: number) => TrackerResult, reset: () => void }}
 */
export function createBeatTracker() {
  /** @type {number[]} */
  let attacks = [];
  let slowLow = 0;
  let slowFull = 0;
  let peakLow = 1e-6;
  let peakFull = 1e-6;
  let windows = 0;
  /** @type {number[]} */
  let recentEstimates = [];
  /** @type {number | null} */
  let bpm = null;
  /** @type {number | null} */
  let candidateBpm = null;
  let confidence = 0;
  let lastBeatAt = -Infinity;
  let lastActiveAt = -Infinity;
  let beatsHeard = 0;

  /** The attack strength of the previous window is a beat when it is a clear peak that fits the tempo. */
  function isBeatAt(/** @type {number} */ timeMs) {
    const length = attacks.length;
    if (length < 12) {
      return false;
    }
    const latest = attacks[length - 1];
    const peak = attacks[length - 2];
    const before = attacks[length - 3];
    const recent = attacks.slice(-100);
    const average = mean(recent);
    const deviation = Math.sqrt(mean(recent.map((value) => (value - average) ** 2)));
    const threshold = average + 1.0 * deviation;
    if (!(peak > before && peak >= latest && peak > threshold && peak > 0.05)) {
      return false;
    }
    const at = timeMs - WINDOW_MS;
    const sinceLast = at - lastBeatAt;
    if (bpm === null) {
      return sinceLast >= 250;
    }
    const period = 60000 / bpm;
    if (sinceLast < 0.55 * period) {
      return false;
    }
    // On the beat when it falls close to where the tempo says, or when the beat has been lost and this is a fresh start.
    return Math.abs(sinceLast - period) <= 0.28 * period || sinceLast > 1.7 * period;
  }

  return {
    feed({ low, full }, timeMs) {
      windows += 1;
      peakLow = Math.max(low, peakLow * 0.998);
      peakFull = Math.max(full, peakFull * 0.998);
      const lowNow = low / peakLow;
      const fullNow = full / peakFull;
      const isQuiet = full < SILENT_LEVEL;
      // How far each band has jumped above its own recent average: a sustained bass line gives nothing, a hit gives a lot.
      const attack = isQuiet ? 0 : Math.max(0, lowNow - slowLow) + 0.6 * Math.max(0, fullNow - slowFull);
      slowLow += 0.15 * (lowNow - slowLow);
      slowFull += 0.15 * (fullNow - slowFull);
      if (!isQuiet) {
        lastActiveAt = timeMs;
      }
      attacks.push(attack);
      if (attacks.length > HISTORY_WINDOWS) {
        attacks = attacks.slice(-HISTORY_WINDOWS);
      }

      if (windows % ESTIMATE_EVERY === 0) {
        const estimate = estimateTempo(attacks);
        if (estimate) {
          candidateBpm = Math.round(estimate.bpm * 10) / 10;
          confidence = estimate.confidence;
          recentEstimates = [...recentEstimates, estimate.bpm].slice(-3);
          if (
            recentEstimates.length === 3 &&
            recentEstimates.every(
              (value) => Math.abs(value - median(recentEstimates)) <= median(recentEstimates) * AGREE,
            )
          ) {
            bpm = smoothTempo(bpm, Math.round(median(recentEstimates) * 10) / 10);
          }
        } else {
          recentEstimates = [];
          confidence = 0;
        }
        if (timeMs - lastActiveAt > SILENCE_MS) {
          bpm = null;
          candidateBpm = null;
          recentEstimates = [];
        }
      }

      const isBeat = isBeatAt(timeMs);
      if (isBeat) {
        lastBeatAt = timeMs - WINDOW_MS;
        beatsHeard += 1;
      }
      return { isBeat, bpm, candidateBpm, confidence, beatsHeard };
    },
    reset() {
      attacks = [];
      slowLow = 0;
      slowFull = 0;
      peakLow = 1e-6;
      peakFull = 1e-6;
      windows = 0;
      recentEstimates = [];
      bpm = null;
      candidateBpm = null;
      confidence = 0;
      lastBeatAt = -Infinity;
      lastActiveAt = -Infinity;
      beatsHeard = 0;
    },
  };
}
