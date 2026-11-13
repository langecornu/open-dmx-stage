// The maths behind the two decks on Perform: the crossfader's curve, which deck the room hears, where a track is in its
// beat and bar, when the next downbeat falls (to lock the lights' tempo to it), and a track's waveform outline. Pure, so
// it is easy to test.

/** Turntable speed: a record turns at 33⅓ revolutions a minute. */
export const RPM = 100 / 3;
/** How far the tempo fader reaches: ±8 %, as on most decks. */
export const PITCH_RANGE = 8;
/** How many slices a waveform outline has. */
export const PEAKS = 600;
/** Below this level a playing deck does not count as heard. */
const QUIET = 0.05;

/**
 * @typedef {{ bpm: number, firstBeatSeconds: number, durationSeconds: number, peaks: number[] }} Analysis
 */

/**
 * The gain of each deck through the crossfader: a constant-power curve, so the middle is as loud as either side.
 * @param {number} crossfader -1 (all A) to 1 (all B)
 * @returns {[number, number]}
 */
export function crossfadeGains(crossfader) {
  const t = (Math.max(-1, Math.min(1, crossfader)) + 1) / 2;
  return [Math.cos((t * Math.PI) / 2), Math.sin((t * Math.PI) / 2)];
}

/**
 * The deck the room hears most, among those playing: its channel volume times its side of the crossfader.
 * @param {{ playing: boolean, volume: number }[]} decks
 * @param {number} crossfader
 * @returns {number} the deck's index, or -1 when none is heard
 */
export function heardDeck(decks, crossfader) {
  const sides = crossfadeGains(crossfader);
  let best = -1;
  let loudest = QUIET;
  decks.forEach((deck, index) => {
    const level = deck.playing ? deck.volume * sides[index] : 0;
    if (level > loudest) {
      loudest = level;
      best = index;
    }
  });
  return best;
}

/**
 * Where the music is in its beat, from the track's analysis.
 * @param {Analysis | null} analysis
 * @param {number} seconds where the track is
 * @returns {{ beats: number, beat: number, phase: number, bar: number } | null} beats since the first downbeat
 *   (fractional), the whole beat, how far into it (0 to 1), and how far into the bar of four (0 to 1)
 */
export function beatAt(analysis, seconds) {
  if (!analysis || !(analysis.bpm > 0)) {
    return null;
  }
  const beats = ((seconds - analysis.firstBeatSeconds) * analysis.bpm) / 60;
  const beat = Math.floor(beats);
  return { beats, beat, phase: beats - beat, bar: (((beats % 4) + 4) % 4) / 4 };
}

/**
 * When the next downbeat (the first beat of a bar) falls.
 * @param {Analysis | null} analysis
 * @param {number} seconds where the track is
 * @param {number} rate how fast it plays (1 is normal speed)
 * @returns {{ wait: number, bar: number } | null} real seconds until it, and which bar it starts
 */
export function nextDownbeat(analysis, seconds, rate = 1) {
  const position = beatAt(analysis, seconds);
  if (!position || !(rate > 0)) {
    return null;
  }
  const beatsLeft = 4 - position.bar * 4;
  const bar = Math.round((position.beats + beatsLeft) / 4);
  return { wait: (beatsLeft * 60) / /** @type {Analysis} */ (analysis).bpm / rate, bar };
}

/**
 * The tempo a deck plays at, with its tempo fader.
 * @param {Analysis | null} analysis
 * @param {number} pitch % from -8 to 8
 * @returns {number | null}
 */
export function playingBpm(analysis, pitch) {
  return analysis ? Math.round(analysis.bpm * (1 + pitch / 100) * 10) / 10 : null;
}

/**
 * The tempo fader setting that makes one deck play at another's tempo, within the fader's reach.
 * @param {number} bpm the deck's own tempo
 * @param {number} target the tempo to match
 * @returns {number} the pitch, %
 */
export function pitchToMatch(bpm, target) {
  // A track at about half or double the other's tempo is matched beat for two.
  let goal = target;
  while (goal / bpm > 1.5) {
    goal /= 2;
  }
  while (goal / bpm < 0.75) {
    goal *= 2;
  }
  const pitch = (goal / bpm - 1) * 100;
  return Math.round(Math.max(-PITCH_RANGE, Math.min(PITCH_RANGE, pitch)) * 100) / 100;
}

/**
 * The loudness outline of a track, for its waveform: the peak of each slice, 0 to 1.
 * @param {Float32Array} samples
 * @param {number} [count]
 * @returns {number[]}
 */
export function peaksOf(samples, count = PEAKS) {
  const size = Math.max(1, Math.floor(samples.length / count));
  const peaks = [];
  let loudest = 0;
  for (let slice = 0; slice < count; slice += 1) {
    let peak = 0;
    const end = Math.min(samples.length, (slice + 1) * size);
    // Every few samples is plenty for an outline, and keeps a long track quick on a phone.
    for (let index = slice * size; index < end; index += 8) {
      peak = Math.max(peak, Math.abs(samples[index]));
    }
    peaks.push(peak);
    loudest = Math.max(loudest, peak);
  }
  return peaks.map((peak) => Math.round((peak / (loudest || 1)) * 1000) / 1000);
}
