// Lays the patch out on the 512 channels of the universe, so Setup can draw which lights use which addresses, where
// two collide, and what the next free address is.
import { DMX_CHANNELS } from '../../shared/patch.js';

/**
 * @param {{ fixtures: { id: string, name: string }[] }} project
 * @param {{ fixtures: { id: string, start: number, end: number, missingType?: boolean, outOfRange?: boolean, overlaps?: unknown[] }[] }} patch
 * @returns {{ segments: { id: string, name: string, start: number, end: number, isOverlap: boolean, hue: number }[],
 *   used: number, nextFree: number | null }}
 */
export function dmxMapSegments(project, patch) {
  const segments = [];
  const taken = new Set();
  project.fixtures.forEach((fixture, index) => {
    const range = patch.fixtures.find((entry) => entry.id === fixture.id);
    if (!range || range.missingType) {
      return;
    }
    const start = Math.max(1, range.start);
    const end = Math.min(DMX_CHANNELS, range.end);
    for (let channel = start; channel <= end; channel += 1) {
      taken.add(channel);
    }
    segments.push({
      id: fixture.id,
      name: fixture.name,
      start,
      end,
      isOverlap: Boolean(range.overlaps?.length),
      hue: (index * 47 + 12) % 360,
    });
  });
  let nextFree = null;
  for (let channel = 1; channel <= DMX_CHANNELS; channel += 1) {
    if (!taken.has(channel)) {
      nextFree = channel;
      break;
    }
  }
  return { segments, used: taken.size, nextFree };
}
