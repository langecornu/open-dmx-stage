// New ids for looks, sequences, steps, blocks, groups and venues. `crypto.randomUUID` only exists on secure pages
// (https, or localhost), so a phone that opens the app at this computer's network address (plain http) gets one made
// from `crypto.getRandomValues`, which every page has, in the same format.

/** @returns {string} a random version 4 UUID */
export function makeId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
