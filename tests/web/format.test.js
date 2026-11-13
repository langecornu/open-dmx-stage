// Unit tests for the shared text formats.
import { describe, expect, it } from 'vitest';

import { formatTime, plural } from '../../src/utils/format.js';

describe('formatTime', () => {
  it('shows minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(75.9)).toBe('1:15');
    expect(formatTime(-3)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(59.6)).toBe('0:59');
  });
});

describe('plural', () => {
  it('adds an s unless the count is one', () => {
    expect(plural(1, 'look')).toBe('1 look');
    expect(plural(0, 'look')).toBe('0 looks');
    expect(plural(3, 'sequence')).toBe('3 sequences');
  });
});
