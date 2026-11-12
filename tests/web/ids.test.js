// Tests for new ids: a UUID on a secure page, and one in the same format on a phone at this computer's network address
// (plain http), where crypto.randomUUID does not exist.
import { describe, expect, it } from 'vitest';

import { makeId } from '../../src/utils/ids.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('makeId', () => {
  it('uses the browser UUID when the page has it', () => {
    expect(makeId()).toMatch(UUID_V4);
  });

  it('makes a version 4 UUID from random bytes when crypto.randomUUID is missing, all different', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
    try {
      const ids = Array.from({ length: 200 }, () => makeId());
      expect(ids.every((id) => UUID_V4.test(id))).toBe(true);
      expect(new Set(ids).size).toBe(200);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: original });
    }
  });
});
