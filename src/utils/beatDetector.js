// Finds the beat in music from the strength of the low frequencies over time, and works out the tempo from the beats.
// Pure functions and a small state machine, so they are easy to test with made-up data.

export const MIN_BEAT_GAP_MS = 280; // no beats closer than this (about 214 per minute)
export const MIN_LEVEL = 0.004; // below this it is silence, whatever the loudness history says
const HISTORY_WINDOWS = 100; // about two seconds of 20 ms windows
const THRESHOLD_DEVIATIONS = 1.6; // how far above the recent average a hit must rise
const RELATIVE_RISE = 1.35; // and by how much relative to that average

const MIN_FOLDED_BPM = 70;
const MAX_FOLDED_BPM = 180;
const MIN_INTERVALS = 6; // do not trust a tempo from fewer beats than this
const MIN_CONSISTENCY = 0.7;
const TOLERANCE = 0.12; // how far a gap may differ from the typical one and still count as the same beat
const MAX_GAP_MS = 2000; // a longer silence between beats starts a new count

/** @param {number[]} values @returns {number} */
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Detects hits in a stream of low-band strengths. Feed it one value per window, with the time of that window.
 * A hit is a value that rises clearly above the recent average, once per beat.
 * @returns {{ feed: (strength: number, timeMs: number) => boolean, reset: () => void }}
 */
export function createBeatDetector() {
  /** @type {number[]} */
  let history = [];
  let lastBeatAt = -Infinity;
  let wasAbove = false;

  return {
    /**
     * @param {number} strength the strength of the low band in this window
     * @param {number} timeMs the time of this window, in milliseconds on any steady clock
     * @returns {boolean} true when this window is a beat
     */
    feed(strength, timeMs) {
      let isBeat = false;
      if (history.length >= 10) {
        const average = mean(history);
        const deviation = Math.sqrt(mean(history.map((value) => (value - average) ** 2)));
        const threshold = Math.max(MIN_LEVEL, average + THRESHOLD_DEVIATIONS * deviation, average * RELATIVE_RISE);
        const isAbove = strength > threshold;
        if (isAbove && !wasAbove && timeMs - lastBeatAt >= MIN_BEAT_GAP_MS) {
          isBeat = true;
          lastBeatAt = timeMs;
        }
        wasAbove = isAbove;
      }
      history.push(strength);
      if (history.length > HISTORY_WINDOWS) {
        history = history.slice(-HISTORY_WINDOWS);
      }
      return isBeat;
    },
    reset() {
      history = [];
      lastBeatAt = -Infinity;
      wasAbove = false;
    },
  };
}

/** @param {number[]} values @returns {number} the middle value */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

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
 * Works out the tempo from the times of recent beats. It uses the typical gap, ignores a gap after a long silence, and
 * only answers when most gaps agree with it (allowing for a missed beat or an extra one).
 * @param {number[]} beatTimes times in milliseconds, oldest first
 * @returns {{ bpm: number, confidence: number } | null} null until there are enough steady beats
 */
export function tempoFromBeats(beatTimes) {
  /** @type {number[]} */
  let run = [];
  for (const time of beatTimes) {
    if (run.length > 0 && time - run[run.length - 1] > MAX_GAP_MS) {
      run = [];
    }
    run.push(time);
  }
  const intervals = run.slice(1).map((time, index) => time - run[index]);
  if (intervals.length < MIN_INTERVALS) {
    return null;
  }
  const typical = median(intervals);
  const consistent = intervals.filter((gap) => {
    const ratio = gap / typical;
    return (
      Math.abs(ratio - 1) < TOLERANCE || Math.abs(ratio - 2) < 2 * TOLERANCE || Math.abs(ratio - 0.5) < TOLERANCE / 2
    );
  });
  const confidence = consistent.length / intervals.length;
  if (confidence < MIN_CONSISTENCY) {
    return null;
  }
  // The tempo is the average of the gaps that match the typical one (the median alone would pick one of two alternating gaps).
  const matching = consistent.filter((gap) => Math.abs(gap / typical - 1) < TOLERANCE);
  const bpm = foldTempo(60000 / mean(matching));
  return { bpm: Math.round(bpm * 10) / 10, confidence };
}

/**
 * Moves a tempo part of the way towards a new estimate, so it follows the music without jumping at every beat.
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
