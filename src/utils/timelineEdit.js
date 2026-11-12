// Editing a timeline: snapping to the grid, drawing blocks across lanes, moving and resizing them inside the timeline,
// and describing a block in words. Pure, so the editor's drag handling stays small and every rule is easy to test.
import { MIN_BLOCK_BEATS } from '../../shared/timeline.js';

/** Grid steps offered in the editor, in beats. */
export const SNAPS = [1, 0.5, 0.25];

/** The look of a new block: what the last block edited looked like, or a full red. */
export const DEFAULT_STYLE = /** @type {const} */ ({
  color: '#ff0000',
  intensity: 100,
  transition: 'none',
  endColor: '#0040ff',
  endIntensity: 100,
  effect: 'none',
  strobeSpeed: 50,
});

/** Colours offered as one-click swatches. */
export const SWATCHES = [
  { name: 'Red', hex: '#ff0000' },
  { name: 'Orange', hex: '#ff7a00' },
  { name: 'Yellow', hex: '#ffd400' },
  { name: 'Green', hex: '#00ff3c' },
  { name: 'Cyan', hex: '#00e5ff' },
  { name: 'Blue', hex: '#0040ff' },
  { name: 'Purple', hex: '#8a00ff' },
  { name: 'Pink', hex: '#ff2fa8' },
  { name: 'White', hex: '#ffffff' },
];

const round = (value) => Math.round(value * 1000) / 1000;

/**
 * @param {number} beat
 * @param {number} snap
 * @returns {number} the grid line at or before `beat`
 */
export function snapDown(beat, snap) {
  return round(Math.floor(round(beat / snap)) * snap);
}

/**
 * @param {number} beat
 * @param {number} snap
 * @returns {number} the nearest grid line
 */
export function snapNearest(beat, snap) {
  return round(Math.round(beat / snap) * snap);
}

/**
 * The span covered by a drag from one grid cell to another, in either direction: at least one cell long, inside the
 * timeline.
 * @param {number} fromBeat where the pointer went down
 * @param {number} toBeat where it is now
 * @param {number} snap
 * @param {number} beats the timeline's length
 * @returns {{ start: number, length: number }}
 */
export function dragSpan(fromBeat, toBeat, snap, beats) {
  const a = Math.min(snapDown(fromBeat, snap), beats - snap);
  const b = Math.min(snapDown(toBeat, snap), beats - snap);
  const start = Math.max(0, Math.min(a, b));
  return { start, length: round(Math.max(a, b) + snap - start) };
}

/**
 * Blocks drawn by one drag: one per light in the lanes covered.
 * @param {string[]} fixtureIds
 * @param {{ start: number, length: number }} span
 * @param {Partial<typeof DEFAULT_STYLE>} style
 * @param {() => string} makeId
 * @returns {import('../../shared/timeline.js').TimelineBlock[]}
 */
export function drawBlocks(fixtureIds, span, style, makeId) {
  return fixtureIds.map((fixtureId) => ({
    id: makeId(),
    fixtureId,
    start: span.start,
    length: Math.max(MIN_BLOCK_BEATS, span.length),
    ...DEFAULT_STYLE,
    ...style,
  }));
}

/**
 * Moves blocks by a number of beats, together, without letting any of them leave the timeline.
 * @param {import('../../shared/timeline.js').TimelineBlock[]} blocks the blocks to move
 * @param {number} delta beats, negative for earlier
 * @param {number} beats the timeline's length
 * @returns {Map<string, number>} new start by block id
 */
export function moveBlocks(blocks, delta, beats) {
  const earliest = Math.min(...blocks.map((block) => block.start));
  const latestEnd = Math.max(...blocks.map((block) => block.start + block.length));
  const allowed = Math.max(-earliest, Math.min(beats - latestEnd, delta));
  return new Map(blocks.map((block) => [block.id, round(block.start + allowed)]));
}

/**
 * @param {import('../../shared/timeline.js').TimelineBlock} block
 * @param {number} length the wanted length in beats
 * @param {number} beats the timeline's length
 * @returns {number} a length of at least the smallest block that keeps the block inside the timeline
 */
export function clampLength(block, length, beats) {
  return round(Math.max(MIN_BLOCK_BEATS, Math.min(beats - block.start, length)));
}

/** @param {number} beat 0-based @returns {string} 1-based, as musicians count ("beat 1"), with halves as decimals */
export const beatLabel = (beat) => String(round(beat + 1));

/**
 * A stretch of a sequence in words: "beats 1 to 5" when it follows the tempo, "0 s to 4 s" when it is in seconds.
 * @param {number} from
 * @param {number} to
 * @param {'beats' | 'seconds'} unit
 * @param {boolean} [capital] start with a capital letter
 * @returns {string}
 */
export function spanLabel(from, to, unit, capital = false) {
  const text = unit === 'beats' ? `beats ${beatLabel(from)} to ${beatLabel(to)}` : `${round(from)} s to ${round(to)} s`;
  return capital ? text[0].toUpperCase() + text.slice(1) : text;
}

/**
 * A block in words, for its accessible name and tooltips.
 * @param {import('../../shared/timeline.js').TimelineBlock} block
 * @param {string} fixtureName
 * @returns {string}
 */
export function describeBlock(block, fixtureName, unit = 'beats') {
  const colour = SWATCHES.find((swatch) => swatch.hex === block.color.toLowerCase())?.name ?? block.color;
  const parts = [`${fixtureName}, ${spanLabel(block.start, block.start + block.length, unit)}`];
  parts.push(`${colour} at ${Math.round(block.intensity)}%`);
  if (block.transition === 'fade') {
    const end = SWATCHES.find((swatch) => swatch.hex === block.endColor.toLowerCase())?.name ?? block.endColor;
    parts.push(`fading to ${end} at ${Math.round(block.endIntensity)}%`);
  }
  if (block.effect === 'strobe') {
    parts.push('strobe');
  }
  return parts.join(', ');
}

/**
 * The background of a block in the editor: its colour, or a gradient for a fade. Intensity shows as opacity, so a dim
 * block looks dim.
 * @param {import('../../shared/timeline.js').TimelineBlock} block
 * @returns {string}
 */
export function blockBackground(block) {
  return block.transition === 'fade' ? `linear-gradient(90deg, ${block.color}, ${block.endColor})` : block.color;
}

/**
 * A small gradient of a timeline's colours, in time order, for its thumbnail and pad.
 * @param {{ blocks?: import('../../shared/timeline.js').TimelineBlock[] }} timeline
 * @returns {string}
 */
export function timelineGradient(timeline) {
  const colours = [...(timeline.blocks ?? [])].sort((a, b) => a.start - b.start).map((block) => block.color);
  if (colours.length === 0) {
    return 'linear-gradient(135deg, var(--surface-3), var(--surface-2))';
  }
  return colours.length === 1 ? colours[0] : `linear-gradient(120deg, ${colours.slice(0, 8).join(', ')})`;
}

/**
 * Copies of the selected blocks placed straight after them, so a pattern carries on: blocks covering beats 1 to 4 are
 * copied to 5 to 8, keeping their lights, gaps and looks. Copies that would run past the end are left out.
 * @param {import('../../shared/timeline.js').TimelineBlock[]} blocks the selection
 * @param {number} beats the timeline's length
 * @param {() => string} makeId
 * @returns {import('../../shared/timeline.js').TimelineBlock[]}
 */
export function repeatBlocks(blocks, beats, makeId) {
  if (blocks.length === 0) {
    return [];
  }
  const first = Math.min(...blocks.map((block) => block.start));
  const last = Math.max(...blocks.map((block) => block.start + block.length));
  const span = last - first;
  return blocks
    .map((block) => ({ ...block, id: makeId(), start: round(block.start + span) }))
    .filter((copy) => copy.start + copy.length <= beats + 1e-9);
}

/**
 * What making a timeline shorter would do to its blocks.
 * @param {import('../../shared/timeline.js').TimelineBlock[]} blocks
 * @param {number} beats the new length
 * @returns {{ removed: number, cut: number }} blocks that start past the end, and blocks that run past it
 */
export function shorteningLoss(blocks, beats) {
  return {
    removed: blocks.filter((block) => block.start >= beats).length,
    cut: blocks.filter((block) => block.start < beats && block.start + block.length > beats).length,
  };
}
