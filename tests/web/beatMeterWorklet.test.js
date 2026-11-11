// Tests for the audio-thread meter: it should respond to kick and bass and ignore everything above them.
import { describe, expect, it } from 'vitest';

import { LowBandMeter } from '../../src/audio/beatMeterWorklet.js';

const RATE = 48000;

/** Runs a sine of the given frequency through the meter and returns the strengths it reports. */
function measure(frequencyHz, seconds = 1, amplitude = 0.8) {
  const meter = new LowBandMeter(RATE);
  const reports = [];
  for (let index = 0; index < RATE * seconds; index += 1) {
    const strength = meter.push(amplitude * Math.sin((2 * Math.PI * frequencyHz * index) / RATE));
    if (strength !== null) {
      reports.push(strength);
    }
  }
  return reports;
}

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

describe('LowBandMeter', () => {
  it('reports about fifty strengths a second', () => {
    expect(measure(60).length).toBe(50);
  });

  it('is loud for a kick-drum frequency and quiet for a hi-hat frequency', () => {
    const kick = average(measure(60).slice(10));
    const voice = average(measure(1000).slice(10));
    const hat = average(measure(8000).slice(10));
    expect(kick).toBeGreaterThan(0.3);
    expect(voice).toBeLessThan(kick / 8);
    expect(hat).toBeLessThan(kick / 100);
  });

  it('reports zero for silence and scales with the loudness', () => {
    expect(Math.max(...measure(60, 1, 0))).toBe(0);
    const loud = average(measure(60, 1, 0.8).slice(10));
    const quiet = average(measure(60, 1, 0.2).slice(10));
    expect(loud / quiet).toBeGreaterThan(3.5);
    expect(loud / quiet).toBeLessThan(4.5);
  });

  it('returns nothing until a window is complete', () => {
    const meter = new LowBandMeter(RATE);
    const windowSamples = Math.round((RATE * 20) / 1000);
    for (let index = 0; index < windowSamples - 1; index += 1) {
      expect(meter.push(0.5)).toBeNull();
    }
    expect(meter.push(0.5)).not.toBeNull();
  });
});
