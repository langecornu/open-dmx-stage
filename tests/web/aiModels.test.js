// Unit tests for the AI model list, prices and the cost estimate shown before generating.
import { describe, expect, it } from 'vitest';

import {
  AI_MODELS,
  DEFAULT_AI_MODEL,
  aiModel,
  costOf,
  estimateCost,
  estimateTokens,
  formatPrice,
  formatPriceRange,
} from '../../shared/aiModels.js';

const demo = {
  lights: 12,
  looks: 8,
  sequences: 2,
  bars: 16,
  song: { durationSeconds: 180, bpm: 144, sections: new Array(11) },
};

describe('AI models', () => {
  it('lists Haiku, Sonnet and Opus from cheapest, with Opus the default', () => {
    expect(AI_MODELS.map((model) => model.id)).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']);
    expect(DEFAULT_AI_MODEL).toBe('claude-opus-5-5');
    expect(aiModel('claude-haiku-5-5').hasFallback).toBe(false);
    expect(aiModel('unknown').id).toBe('claude-opus-5-5');
  });

  it('prices tokens at each model list price', () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    expect(costOf(usage, 'claude-opus-5-5')).toBe(24);
    expect(costOf(usage, 'claude-sonnet-5-5')).toBe(12);
    expect(costOf(usage, 'claude-haiku-5-5')).toBeCloseTo(0.6);
  });
});

describe('estimateTokens', () => {
  it('matches the demo generations: about 4,400 in (3,600 plus the places) and 21,000 to 28,000 out', () => {
    const { inputTokens, outputTokens } = estimateTokens(demo);
    expect(inputTokens).toBeGreaterThan(4000);
    expect(inputTokens).toBeLessThan(5000);
    expect(outputTokens[0]).toBeGreaterThan(19000);
    expect(outputTokens[1]).toBeLessThan(31000);
    expect(outputTokens[0]).toBeLessThan(outputTokens[1]);
  });

  it('grows with the lights, the looks and the song', () => {
    const base = estimateTokens({ lights: 4, looks: 4, sequences: 1, bars: 16 }).outputTokens[1];
    expect(estimateTokens({ lights: 20, looks: 4, sequences: 1, bars: 16 }).outputTokens[1]).toBeGreaterThan(base);
    expect(estimateTokens({ lights: 4, looks: 12, sequences: 1, bars: 16 }).outputTokens[1]).toBeGreaterThan(base);
    const songless = estimateTokens({ ...demo, song: null }).outputTokens[1];
    expect(estimateTokens(demo).outputTokens[1]).toBeGreaterThan(songless);
    expect(estimateTokens({ ...demo, song: { durationSeconds: 180, bpm: 120 } }).inputTokens).toBeGreaterThan(3000);
  });
});

describe('estimateCost and prices', () => {
  it('puts the demo near what it really cost on Opus, half on Sonnet, and cents on Haiku', () => {
    const [low, high] = estimateCost(demo, 'claude-opus-5-5');
    expect(low).toBeGreaterThan(0.4);
    expect(high).toBeLessThan(0.65);
    expect(estimateCost(demo, 'claude-sonnet-5-5')[1]).toBeCloseTo(high / 2, 1);
    expect(estimateCost(demo, 'claude-haiku-5-5')[1]).toBeLessThan(0.03);
  });

  it('writes prices as cents or dollars, and ranges as one figure when both ends agree', () => {
    expect(formatPrice(0.004)).toBe('under 1¢');
    expect(formatPrice(0.44)).toBe('44¢');
    expect(formatPrice(1.234)).toBe('$1.23');
    expect(formatPriceRange([0.45, 0.58])).toBe('about 45¢ to 58¢');
    expect(formatPriceRange([0.012, 0.014])).toBe('about 1¢');
    expect(formatPriceRange([0.001, 0.002])).toBe('under 1¢');
    expect(formatPriceRange([0.008, 0.012])).toBe('up to 1¢');
  });
});
