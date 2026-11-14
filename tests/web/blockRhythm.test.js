// Unit tests for blocks that follow the beat: a pulse swells and fades, a flash hits and dies away, both locked to the
// timeline's beats (not the block's start), and an offset makes a row of lights chase.
import { describe, expect, it } from 'vitest';

import { evaluateBlock, rhythmGain } from '../../shared/timeline.js';

const block = (overrides) => ({
  id: 'b',
  fixtureId: 'p1',
  start: 2,
  length: 16,
  color: '#ff0000',
  intensity: 100,
  transition: 'none',
  endColor: '#ff0000',
  endIntensity: 100,
  effect: 'flash',
  strobeSpeed: 50,
  ...overrides,
});

describe('rhythmGain', () => {
  it('flashes at full on the beat and is nearly dark just before the next', () => {
    expect(rhythmGain('flash', 4)).toBe(1);
    expect(rhythmGain('flash', 4.5)).toBeCloseTo(0.125);
    expect(rhythmGain('flash', 4.95)).toBeLessThan(0.001);
  });

  it('pulses smoothly, brightest on the hit and never fully dark', () => {
    expect(rhythmGain('pulse', 8)).toBeCloseTo(1);
    expect(rhythmGain('pulse', 8.5)).toBeCloseTo(0.1);
    expect(rhythmGain('pulse', 9, 2)).toBeCloseTo(0.1, 5);
  });

  it('comes late by its offset, so lights with offsets chase', () => {
    expect(rhythmGain('flash', 4.25, 1, 0.25)).toBe(1);
    expect(rhythmGain('flash', 4, 1, 0.25)).toBeCloseTo(0.0156, 3); // three quarters of a beat after its last hit
    expect(rhythmGain('flash', 5, 0)).toBe(1); // a zero period counts as one beat
  });
});

describe('evaluateBlock with a rhythm', () => {
  it('locks the hits to the timeline beats, not the start of the block', () => {
    const late = block({ start: 2.5, rhythmBeats: 1 });
    expect(evaluateBlock(late, 3, 0).level).toBe(1);
    expect(evaluateBlock(late, 3.5, 0).level).toBeCloseTo(0.125);
  });

  it('scales the block intensity, and uses one beat and no offset when they are missing', () => {
    const half = block({ intensity: 50, effect: 'pulse' });
    expect(evaluateBlock(half, 6, 0).level).toBeCloseTo(0.5);
    expect(evaluateBlock(half, 6, 0).red).toBe(255);
    expect(evaluateBlock(block({ effect: 'none' }), 6.5, 0).level).toBe(1);
  });
});
