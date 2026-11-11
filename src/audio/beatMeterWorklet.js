// Runs on the browser's audio thread (an AudioWorklet), where it is not slowed down when the page is in the background:
// it listens to the sound and reports about fifty times a second how strong it is, both overall and in the low
// frequencies (the kick drum and bass), with the time on the audio clock. The beat finding itself happens in
// src/utils/beatTracker.js on the page. Nothing here records or stores sound.
/* global AudioWorkletProcessor, registerProcessor, sampleRate, currentTime */

const CUTOFF_HZ = 150; // below this is kick and bass
const WINDOW_MS = 20; // one report per window

/** Measures the strength of the whole sound and of its low frequencies, one report per short window. */
export class BandMeter {
  /** @param {number} rate samples per second */
  constructor(rate) {
    this.alpha = 1 - Math.exp((-2 * Math.PI * CUTOFF_HZ) / rate);
    this.windowSamples = Math.max(1, Math.round((rate * WINDOW_MS) / 1000));
    this.stageOne = 0;
    this.stageTwo = 0;
    this.sumOfSquares = 0;
    this.sumOfSquaresFull = 0;
    this.count = 0;
  }

  /**
   * @param {number} sample one mono sample from -1 to 1
   * @returns {{ low: number, full: number } | null} the strength (root mean square) of the low band and of the whole sound
   *   when a window has just finished, else null
   */
  push(sample) {
    // Two one-pole filters in a row: a gentle but useful 12 dB per octave cut above the cutoff.
    this.stageOne += this.alpha * (sample - this.stageOne);
    this.stageTwo += this.alpha * (this.stageOne - this.stageTwo);
    this.sumOfSquares += this.stageTwo * this.stageTwo;
    this.sumOfSquaresFull += sample * sample;
    this.count += 1;
    if (this.count < this.windowSamples) {
      return null;
    }
    const strength = {
      low: Math.sqrt(this.sumOfSquares / this.count),
      full: Math.sqrt(this.sumOfSquaresFull / this.count),
    };
    this.sumOfSquares = 0;
    this.sumOfSquaresFull = 0;
    this.count = 0;
    return strength;
  }
}

if (typeof AudioWorkletProcessor !== 'undefined') {
  class BeatMeterProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.meter = new BandMeter(sampleRate);
    }

    /** @param {Float32Array[][]} inputs */
    process(inputs) {
      const channels = inputs[0];
      if (!channels || channels.length === 0) {
        return true;
      }
      const frames = channels[0].length;
      for (let index = 0; index < frames; index += 1) {
        let mono = 0;
        for (const channel of channels) {
          mono += channel[index];
        }
        const strength = this.meter.push(mono / channels.length);
        if (strength !== null) {
          this.port.postMessage({ low: strength.low, full: strength.full, time: currentTime * 1000 });
        }
      }
      return true;
    }
  }
  registerProcessor('beat-meter', BeatMeterProcessor);
}
