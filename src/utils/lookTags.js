// Works out, from what a look or a sequence does, the tags the filters use: its colour palette, how fast it moves, and
// its style. Nothing is stored in the show: the tags are read from the colours, timing and settings every time, so they
// also describe looks and sequences made before the filters existed.
import { fixtureColors } from './sceneColors.js';

export const PALETTES = ['Blues', 'Violets', 'Blue and violet', 'Warm', 'Greens', 'White', 'Mixed'];
export const SPEEDS = ['Slow', 'Medium', 'Fast', 'Max'];
export const STYLES = ['Movement', 'Strobe', 'Beat', 'Chase', 'Colour fade', 'Dimming', 'Built-in program', 'Still'];

/** @param {string} hex `#rrggbb` @returns {[number, number, number]} */
function rgbOf(hex) {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * Hue (0 to 360), saturation and brightness (0 to 1) of a colour.
 * @param {number} r @param {number} g @param {number} b 0 to 255
 */
export function hsv(r, g, b) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    const [rn, gn, bn] = [r / 255, g / 255, b / 255];
    if (max === rn) {
      hue = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      hue = (bn - rn) / delta + 2;
    } else {
      hue = (rn - gn) / delta + 4;
    }
    hue = (hue * 60 + 360) % 360;
  }
  return { hue, saturation: max === 0 ? 0 : delta / max, value: max };
}

/** @param {number} hue @returns {'blue' | 'violet' | 'warm' | 'green'} the family of a hue */
function familyOf(hue) {
  if (hue >= 165 && hue < 255) {
    return 'blue'; // cyan, azure, blue
  }
  if (hue >= 255 && hue < 335) {
    return 'violet'; // indigo, violet, purple, magenta
  }
  if (hue >= 70 && hue < 165) {
    return 'green';
  }
  return 'warm'; // pink-red, red, orange, yellow
}

/**
 * The palette of a set of colours, each with how much of the show it takes.
 * @param {{ r: number, g: number, b: number, weight: number }[]} colours
 * @returns {string | null} one of PALETTES, or null when there is nothing lit
 */
export function paletteOf(colours) {
  const share = { blue: 0, violet: 0, warm: 0, green: 0, white: 0 };
  let total = 0;
  for (const { r, g, b, weight } of colours) {
    const { hue, saturation, value } = hsv(r, g, b);
    const amount = weight * value;
    if (amount <= 0) {
      continue;
    }
    total += amount;
    share[saturation < 0.25 ? 'white' : familyOf(hue)] += amount;
  }
  if (total === 0) {
    return null;
  }
  const part = (/** @type {keyof typeof share} */ key) => share[key] / total;
  if (part('white') >= 0.75) {
    return 'White';
  }
  const coloured = total - share.white;
  const of = (/** @type {keyof typeof share} */ key) => (coloured > 0 ? share[key] / coloured : 0);
  if (of('blue') >= 0.75) {
    return 'Blues';
  }
  if (of('violet') >= 0.75) {
    return 'Violets';
  }
  if (of('blue') + of('violet') >= 0.85) {
    return 'Blue and violet';
  }
  if (of('warm') >= 0.75) {
    return 'Warm';
  }
  if (of('green') >= 0.75) {
    return 'Greens';
  }
  return 'Mixed';
}

/** @param {{ from: number, to: number, type: string }[] | undefined} capabilities @param {number} value */
const capabilityAt = (capabilities, value) =>
  (capabilities ?? []).find((capability) => value >= capability.from && value <= capability.to)?.type;

/**
 * Tags of a saved look.
 * @param {{ values: Record<string, number> }} scene
 * @param {any} project
 * @param {any} patch
 * @returns {{ palette: string | null, styles: Set<string> }}
 */
export function sceneTags(scene, project, patch) {
  const colours = fixtureColors(project, patch, scene.values).map((colour) => ({ ...colour, weight: 1 }));
  const styles = new Set();
  for (const [channel, value] of Object.entries(scene.values)) {
    const info = patch.channels.get(Number(channel));
    if (!info) {
      continue;
    }
    const kind = capabilityAt(info.capabilities, value);
    if ((info.type === 'pan' || info.type === 'tilt') && Math.abs(value - info.defaultValue) > 12) {
      styles.add('Movement');
    } else if (kind === 'strobe') {
      styles.add('Strobe');
    } else if (kind === 'effect') {
      styles.add('Built-in program');
    }
  }
  if (styles.size === 0) {
    styles.add('Still');
  }
  return { palette: paletteOf(colours), styles };
}

/**
 * Tags of a sequence.
 * @param {any} chase
 * @param {any} project
 * @param {any} patch
 * @returns {{ palette: string | null, speed: string, styles: Set<string>, perSecond: number }}
 */
export function chaseTags(chase, project, patch) {
  const blocks = chase.blocks ?? [];
  const colours = [];
  const styles = new Set();
  let events = 0; // changes a second per light, summed over the blocks, weighted by how long each lasts
  let blockBeats = 0;
  const lights = new Set();
  const offsets = new Set();
  for (const block of blocks) {
    const [r, g, b] = rgbOf(block.color);
    const [er, eg, eb] = rgbOf(block.endColor ?? block.color);
    const weight = block.length * (block.intensity / 100 || 0.01);
    colours.push({ r, g, b, weight: block.transition === 'fade' ? weight / 2 : weight });
    if (block.transition === 'fade') {
      colours.push({ r: er, g: eg, b: eb, weight: weight / 2 });
      if (block.endColor && block.endColor.toLowerCase() !== block.color.toLowerCase()) {
        styles.add('Colour fade');
      }
      if (block.endIntensity < block.intensity - 20) {
        styles.add('Dimming');
      }
    }
    lights.add(block.fixtureId);
    blockBeats += block.length;
    const moves = block.settings && ('pan' in block.settings || 'tilt' in block.settings);
    let rate = 0;
    if (moves) {
      styles.add('Movement');
      rate += block.endSettings ? 1 / block.length : 0;
    }
    if (block.transition === 'fade') {
      rate += 1 / Math.max(block.length, 1);
    }
    if (block.effect === 'strobe') {
      styles.add('Strobe');
      rate += 4;
    }
    if (block.effect === 'pulse' || block.effect === 'flash') {
      styles.add('Beat');
      rate += 1 / (block.rhythmBeats ?? 1);
      offsets.add(block.rhythmOffset ?? 0);
    }
    if (block.settings && ('effect' in block.settings || 'effect-speed' in block.settings)) {
      styles.add('Built-in program');
    }
    events += rate * block.length;
  }
  for (const step of chase.steps ?? []) {
    const values = project.scenes.find((scene) => scene.id === step.sceneId)?.values ?? {};
    for (const colour of fixtureColors(project, patch, values)) {
      colours.push({ ...colour, weight: Math.max(1, step.holdBeats ?? 1) });
    }
    const beats = chase.timing === 'beats' ? (step.fadeBeats ?? 0) + (step.holdBeats ?? 1) : 1;
    events += 1;
    blockBeats += beats;
    lights.add('steps');
  }
  if (offsets.size > 1) {
    styles.add('Chase');
  }
  if (styles.size === 0) {
    styles.add('Still');
  }
  const bpm = chase.tempo ?? 120;
  // Changes a second for each light, at the sequence's own tempo when it has one.
  const perBeat = blockBeats > 0 ? events / Math.max(1, lights.size) / (blockBeats / Math.max(1, lights.size)) : 0;
  const perSecond = chase.timing === 'beats' ? (perBeat * bpm) / 60 : perBeat;
  const speed = perSecond < 1.6 ? 'Slow' : perSecond < 3 ? 'Medium' : perSecond < 5 ? 'Fast' : 'Max';
  return { palette: paletteOf(colours), speed, styles, perSecond };
}

/**
 * @param {{ palette: string | null, speed?: string, styles: Set<string> }} tags
 * @param {{ palette: string, speed: string, style: string }} filter 'all' (or '') for no filter on that tag
 */
export function matchesFilter(tags, filter) {
  return (
    (filter.palette === 'all' || tags.palette === filter.palette) &&
    (filter.speed === 'all' || tags.speed === filter.speed) &&
    (filter.style === 'all' || tags.styles.has(filter.style))
  );
}

export const NO_FILTER = { palette: 'all', speed: 'all', style: 'all' };
