// Tests for the live link helpers: reconnect backoff with jitter, and the shared frame store.
import { describe, expect, it, vi } from 'vitest';

import { frameStore } from '../../src/hooks/frameStore.js';
import { reconnectDelay } from '../../src/hooks/useLive.js';

describe('reconnectDelay', () => {
  it('doubles each attempt up to a cap', () => {
    const noJitter = () => 1; // 100% of the base delay
    expect([0, 1, 2, 3, 4, 5, 10].map((attempt) => reconnectDelay(attempt, noJitter))).toEqual([
      1000, 2000, 4000, 8000, 15000, 15000, 15000,
    ]);
  });

  it('jitters between half and all of the base delay so clients do not retry together', () => {
    expect(reconnectDelay(2, () => 0)).toBe(2000);
    expect(reconnectDelay(2, () => 1)).toBe(4000);
    expect(reconnectDelay(2, () => 0.5)).toBe(3000);
  });
});

describe('frameStore', () => {
  it('starts with 512 zeros and tells subscribers when a new frame arrives', () => {
    expect(frameStore.get()).toHaveLength(512);
    const listener = vi.fn();
    const stop = frameStore.subscribe(listener);
    const frame = new Array(512).fill(7);
    frameStore.set(frame);
    expect(frameStore.get()).toBe(frame);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    frameStore.set(new Array(512).fill(0));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
