// What kind of device a fixture is (a par, a moving head, a smoke machine…), for its icon and so people can tell
// devices apart at a glance. The list follows the Open Fixture Library's fixture categories, with a few common devices
// it files under Effect or Other (spot, mirror ball, special effects such as bubbles, snow, CO2 or cold spark). A
// fixture type can name its category; a light in the rig can be set to another; otherwise it is guessed.

export const DEVICE_CATEGORIES = /** @type {const} */ ([
  'par',
  'spot',
  'moving-head',
  'scanner',
  'barrel-scanner',
  'led-bar',
  'matrix',
  'strobe',
  'blinder',
  'effect',
  'flower',
  'mirror-ball',
  'laser',
  'smoke',
  'hazer',
  'fan',
  'special-effect',
  'dimmer',
  'other',
]);

/** @typedef {typeof DEVICE_CATEGORIES[number]} DeviceCategory */

/** What each category is called on screen, and what it covers. */
export const CATEGORY_INFO = /** @type {Record<DeviceCategory, { label: string, hint: string }>} */ ({
  par: { label: 'Par / wash', hint: 'Colour-mixing LED par, wash light or uplight' },
  spot: { label: 'Spot / profile', hint: 'A fixed spotlight or profile with a sharp beam' },
  'moving-head': { label: 'Moving head', hint: 'Spot, wash or beam light that pans and tilts' },
  scanner: { label: 'Scanner', hint: 'A light that moves its beam with a mirror' },
  'barrel-scanner': { label: 'Barrel scanner', hint: 'A rotating barrel that sweeps its beam' },
  'led-bar': { label: 'LED bar', hint: 'Bar, batten or strip, with one or more colour cells' },
  matrix: { label: 'Matrix / panel', hint: 'A grid of pixels' },
  strobe: { label: 'Strobe', hint: 'A strobe light' },
  blinder: { label: 'Blinder', hint: 'Audience blinder' },
  effect: { label: 'Effect light', hint: 'Derby, spider, moonflower and other party effects' },
  flower: { label: 'Flower', hint: 'Flower effect with many coloured beams' },
  'mirror-ball': { label: 'Mirror ball', hint: 'Mirror ball or its motor' },
  laser: { label: 'Laser', hint: 'Laser projector' },
  smoke: { label: 'Smoke machine', hint: 'Fog or smoke machine' },
  hazer: { label: 'Hazer', hint: 'Haze machine' },
  fan: { label: 'Fan', hint: 'A DMX fan, for haze or wind' },
  'special-effect': { label: 'Special effect', hint: 'Bubbles, snow, CO2 jet, cold spark, confetti or flame' },
  dimmer: { label: 'Dimmer', hint: 'A lamp on a dimmer channel or dimmer pack' },
  other: { label: 'Other', hint: 'Anything else' },
});

/** Open Fixture Library categories, to ours. @type {Record<string, DeviceCategory>} */
const OFL_CATEGORIES = {
  'Color Changer': 'par',
  'Moving Head': 'moving-head',
  Scanner: 'scanner',
  'Barrel Scanner': 'barrel-scanner',
  'Pixel Bar': 'led-bar',
  Matrix: 'matrix',
  Strobe: 'strobe',
  Blinder: 'blinder',
  Effect: 'effect',
  Flower: 'flower',
  Laser: 'laser',
  Smoke: 'smoke',
  Hazer: 'hazer',
  Fan: 'fan',
  Dimmer: 'dimmer',
  Stand: 'other',
  Other: 'other',
};

/**
 * @param {unknown} categories an OFL fixture's `categories`
 * @returns {DeviceCategory | undefined} the first one we know, the most specific being listed first in OFL
 */
export function categoryFromOfl(categories) {
  if (!Array.isArray(categories)) {
    return undefined;
  }
  for (const name of categories) {
    const category = typeof name === 'string' ? OFL_CATEGORIES[name] : undefined;
    if (category && category !== 'other') {
      return category;
    }
  }
  return categories.length > 0 ? 'other' : undefined;
}

/** Words in a fixture's name, checked before its channels (first match wins). @type {[RegExp, DeviceCategory][]} */
const NAME_HINTS = [
  [/laser/i, 'laser'],
  [/haze/i, 'hazer'],
  [/fog|smoke/i, 'smoke'],
  [/bubble|snow|confetti|co2|spark|flame|jet/i, 'special-effect'],
  [/mirror ?ball|disco ?ball/i, 'mirror-ball'],
  [/flower/i, 'flower'],
  [/derby|spider|moon ?flower|effect/i, 'effect'],
  [/blinder/i, 'blinder'],
  [/barrel/i, 'barrel-scanner'],
  [/scanner/i, 'scanner'],
  [/moving|head|beam ?\d|yoke/i, 'moving-head'],
  [/matrix|panel|pixel/i, 'matrix'],
  [/\bbar\b|batten|strip/i, 'led-bar'],
  [/strobe/i, 'strobe'],
  [/\bfan\b/i, 'fan'],
  [/profile|ellipsoidal|\bspot\b|leko|fresnel/i, 'spot'],
  [/\bpar\b|wash|uplight/i, 'par'],
  [/dimmer|lamp|bulb/i, 'dimmer'],
];

/**
 * A best guess from a fixture type's name and channels.
 * @param {{ name?: string, modes?: { channels: { type: string }[] }[] }} type
 * @returns {DeviceCategory}
 */
export function guessCategory(type) {
  const byName = NAME_HINTS.find(([pattern]) => pattern.test(type.name ?? ''))?.[1];
  if (byName) {
    return byName;
  }
  const kinds = new Set((type.modes ?? []).flatMap((mode) => mode.channels.map((channel) => channel.type)));
  if (kinds.has('pan') && kinds.has('tilt')) {
    return 'moving-head';
  }
  if (kinds.has('fog')) {
    return kinds.has('fan') ? 'hazer' : 'smoke';
  }
  if (kinds.has('fan')) {
    return 'fan';
  }
  if (kinds.has('red') || kinds.has('green') || kinds.has('blue') || kinds.has('cyan')) {
    return 'par';
  }
  if (kinds.has('gobo') || kinds.has('color-wheel')) {
    return 'spot';
  }
  if (kinds.size > 0 && [...kinds].every((kind) => kind === 'intensity')) {
    return 'dimmer';
  }
  if (kinds.has('strobe') && !kinds.has('intensity')) {
    return 'strobe';
  }
  return 'other';
}

/**
 * The category of a light: its own setting, else its fixture type's, else a guess.
 * @param {{ category?: string }} fixture
 * @param {{ category?: string, name?: string, modes?: { channels: { type: string }[] }[] } | undefined} type
 * @returns {DeviceCategory}
 */
export function categoryOf(fixture, type) {
  const own = /** @type {DeviceCategory | undefined} */ (fixture.category);
  if (own && DEVICE_CATEGORIES.includes(own)) {
    return own;
  }
  const typed = /** @type {DeviceCategory | undefined} */ (type?.category);
  if (typed && DEVICE_CATEGORIES.includes(typed)) {
    return typed;
  }
  return type ? guessCategory(type) : 'other';
}
