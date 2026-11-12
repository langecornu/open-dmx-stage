// Works out a song's tempo, where its first downbeat is, and how its energy changes, from the decoded audio, in the
// browser. Only these numbers are used afterwards (and sent to the AI); the audio itself never leaves the page.
//
// How: the audio is mixed to mono and thinned to about 11 kHz; its loudness is measured in short frames, and every rise
// in loudness counts as an onset. The tempo is the beat spacing whose onsets line up best with themselves
// (autocorrelation), preferring tempos people dance to; the beat grid is then slid to the offset with the strongest
// onsets, and the bar to the beat of the four that hits hardest. Energy is the loudness of each bar, scaled between the
// song's quiet and loud parts, then grouped into sections. Pure apart from `analyseSongFile`, so it is easy to test.

const TARGET_RATE = 11025;
const HOP = 256; // samples between frames at the target rate, about 23 ms
const MIN_BPM = 70;
const MAX_BPM = 180;

/**
 * @typedef {{ startBar: number, bars: number, energy: number }} SongSection energy from 0 (the quietest part) to 1
 * @typedef {{ bpm: number, firstBeatSeconds: number, durationSeconds: number, bars: number,
 *   sections: SongSection[] }} SongAnalysis
 */

/**
 * @param {Float32Array} samples mono
 * @param {number} sampleRate
 * @returns {{ envelope: Float32Array, loudness: Float32Array, frameRate: number }}
 */
function measure(samples, sampleRate) {
  const step = Math.max(1, Math.floor(sampleRate / TARGET_RATE));
  const rate = sampleRate / step;
  const frames = Math.floor(samples.length / step / HOP);
  const loudness = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    const from = frame * HOP * step;
    for (let index = 0; index < HOP; index += 1) {
      const value = samples[from + index * step] ?? 0;
      sum += value * value;
    }
    loudness[frame] = Math.sqrt(sum / HOP);
  }
  // Onsets: how much louder each frame is than the one before, on a log scale so quiet and loud parts both count.
  const envelope = new Float32Array(frames);
  for (let frame = 1; frame < frames; frame += 1) {
    const rise = Math.log1p(1000 * loudness[frame]) - Math.log1p(1000 * loudness[frame - 1]);
    envelope[frame] = Math.max(0, rise);
  }
  return { envelope, loudness, frameRate: rate / HOP };
}

/**
 * The beat spacing, in frames, that the onsets repeat at best.
 * @param {Float32Array} envelope
 * @param {number} frameRate
 * @returns {number}
 */
function bestPeriod(envelope, frameRate) {
  const mean = envelope.reduce((sum, value) => sum + value, 0) / Math.max(1, envelope.length);
  const centred = envelope.map((value) => value - mean);
  const shortest = Math.floor((60 / MAX_BPM) * frameRate);
  const longest = Math.ceil((60 / MIN_BPM) * frameRate);
  const scores = new Float64Array(longest + 2);
  for (let lag = shortest - 1; lag <= longest + 1; lag += 1) {
    let sum = 0;
    for (let frame = lag; frame < centred.length; frame += 1) {
      sum += centred[frame] * centred[frame - lag];
    }
    scores[lag] = sum / Math.max(1, centred.length - lag);
  }
  let best = shortest;
  let bestScore = -Infinity;
  for (let lag = shortest; lag <= longest; lag += 1) {
    // Prefer tempos around 120 beats a minute, so a half or double tempo does not win by a hair.
    const bpm = (60 * frameRate) / lag;
    const preference = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    // A beat that also lines up at twice its spacing is more likely the real one.
    const score = (scores[lag] + 0.5 * (scores[lag * 2] ?? 0)) * preference;
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  // Between whole frames: fit a parabola through the best score and its neighbours.
  const [before, at, after] = [scores[best - 1], scores[best], scores[best + 1]];
  const curve = before - 2 * at + after;
  return curve < 0 ? best + (0.5 * (before - after)) / curve : best;
}

/**
 * @param {Float32Array} envelope
 * @param {number} period frames a beat
 * @param {number} offset frames
 */
function gridStrength(envelope, period, offset) {
  let sum = 0;
  for (let position = offset; position < envelope.length; position += period) {
    const frame = Math.round(position);
    sum += Math.max(envelope[frame] ?? 0, envelope[frame - 1] ?? 0, envelope[frame + 1] ?? 0);
  }
  return sum;
}

/**
 * Fits the beat grid to the onsets themselves: near each beat the grid predicts, the onset peak is found, then a straight
 * line through those peaks (least squares) gives the exact beat spacing and where the beats fall. A small error in the
 * first estimate would otherwise add up over a whole song.
 * @param {Float32Array} envelope
 * @param {number} period frames a beat, roughly
 * @param {number} offset frames, roughly
 * @returns {{ period: number, offset: number }}
 */
function fitGrid(envelope, period, offset) {
  let current = { period, offset };
  for (let pass = 0; pass < 3; pass += 1) {
    const points = [];
    const reach = Math.max(1, Math.floor(current.period / 4));
    for (let beat = 0; current.offset + beat * current.period < envelope.length; beat += 1) {
      const expected = Math.round(current.offset + beat * current.period);
      let peak = -1;
      let peakValue = 0;
      for (let frame = expected - reach; frame <= expected + reach; frame += 1) {
        if ((envelope[frame] ?? 0) > peakValue) {
          peakValue = envelope[frame];
          peak = frame;
        }
      }
      if (peak >= 0) {
        points.push([beat, peak, peakValue]);
      }
    }
    if (points.length < 4) {
      return current;
    }
    // Weighted least squares: strong onsets count more than faint ones.
    let sw = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (const [x, y, weight] of points) {
      sw += weight;
      sx += weight * x;
      sy += weight * y;
      sxx += weight * x * x;
      sxy += weight * x * y;
    }
    const slope = (sw * sxy - sx * sy) / (sw * sxx - sx * sx);
    if (!Number.isFinite(slope) || slope <= 0) {
      return current;
    }
    const intercept = (sy - slope * sx) / sw;
    current = { period: slope, offset: ((intercept % slope) + slope) % slope };
  }
  return current;
}

/**
 * Bars grouped into sections of like energy, in steps of four bars so a single loud bar does not make a section.
 * @param {number[]} barEnergy 0 to 1 per bar
 * @returns {SongSection[]}
 */
export function groupSections(barEnergy) {
  const chunks = [];
  for (let start = 0; start < barEnergy.length; start += 4) {
    const bars = barEnergy.slice(start, start + 4);
    chunks.push({
      startBar: start,
      bars: bars.length,
      energy: bars.reduce((sum, value) => sum + value, 0) / bars.length,
    });
  }
  const level = (energy) => (energy < 0.33 ? 0 : energy < 0.66 ? 1 : 2);
  /** @type {SongSection[]} */
  const sections = [];
  for (const chunk of chunks) {
    const last = sections.at(-1);
    if (last && level(last.energy) === level(chunk.energy)) {
      const bars = last.bars + chunk.bars;
      last.energy = (last.energy * last.bars + chunk.energy * chunk.bars) / bars;
      last.bars = bars;
    } else {
      sections.push({ ...chunk });
    }
  }
  return sections.slice(0, 200).map((section) => ({ ...section, energy: Math.round(section.energy * 100) / 100 }));
}

/**
 * @param {Float32Array} samples mono, -1 to 1
 * @param {number} sampleRate
 * @returns {SongAnalysis}
 */
export function analyseSong(samples, sampleRate) {
  const durationSeconds = samples.length / sampleRate;
  const { envelope, loudness, frameRate } = measure(samples, sampleRate);
  if (envelope.length < frameRate * 4) {
    throw new Error('The song is too short to find its tempo (at least a few seconds are needed).');
  }
  const rough = bestPeriod(envelope, frameRate);
  // Slide the beat grid to where the onsets are strongest.
  let roughOffset = 0;
  let strongest = -Infinity;
  for (let candidate = 0; candidate < rough; candidate += 0.5) {
    const strength = gridStrength(envelope, rough, candidate);
    if (strength > strongest) {
      strongest = strength;
      roughOffset = candidate;
    }
  }
  const { period, offset } = fitGrid(envelope, rough, roughOffset);
  let downbeat = 0;
  let loudest = -Infinity;
  for (let beat = 0; beat < 4; beat += 1) {
    const strength = gridStrength(envelope, period * 4, offset + beat * period);
    if (strength > loudest) {
      loudest = strength;
      downbeat = beat;
    }
  }
  const firstDownbeat = (offset + downbeat * period) % (period * 4);
  const bpm = Math.round(((60 * frameRate) / period) * 10) / 10;

  // Loudness per bar, scaled between the song's quiet (10th percentile) and loud (90th) bars.
  const barFrames = period * 4;
  const barLoudness = [];
  for (let start = firstDownbeat; start + barFrames <= loudness.length + barFrames / 2; start += barFrames) {
    const from = Math.round(start);
    const to = Math.min(loudness.length, Math.round(start + barFrames));
    if (to <= from) {
      break;
    }
    let sum = 0;
    for (let frame = from; frame < to; frame += 1) {
      sum += loudness[frame];
    }
    barLoudness.push(sum / (to - from));
  }
  const sorted = [...barLoudness].sort((a, b) => a - b);
  const low = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
  const high = sorted[Math.floor(sorted.length * 0.9)] ?? 1;
  const span = Math.max(1e-6, high - low);
  const barEnergy = barLoudness.map((value) => Math.max(0, Math.min(1, (value - low) / span)));

  return {
    bpm,
    firstBeatSeconds: Math.round((firstDownbeat / frameRate) * 1000) / 1000,
    durationSeconds: Math.round(durationSeconds * 10) / 10,
    bars: barEnergy.length,
    sections: groupSections(barEnergy),
  };
}

/**
 * Decodes an audio file in the browser and analyses it.
 * @param {File} file
 * @returns {Promise<SongAnalysis>}
 */
export async function analyseSongFile(file) {
  const Context = window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext;
  if (!Context) {
    throw new Error('This browser cannot read audio files.');
  }
  const context = new Context();
  try {
    let audio;
    try {
      audio = await context.decodeAudioData(await file.arrayBuffer());
    } catch {
      throw new Error('That file could not be read as audio. Try an MP3, WAV, AAC or FLAC file.');
    }
    const mono = new Float32Array(audio.length);
    for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
      const data = audio.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) {
        mono[index] += data[index] / audio.numberOfChannels;
      }
    }
    return analyseSong(mono, audio.sampleRate);
  } finally {
    context.close?.();
  }
}
