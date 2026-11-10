// Turns an untrusted Open Fixture Library fixture document into a small, plain summary for the "View details" window:
// who made it, its specifications, links, and every mode with each channel's values. Every string is cut to a safe
// length and every link must be http or https, so the browser only ever receives data it can show as text.
import { classifyChannel, createChannelLookup, parseDefault } from './fixtureLibrary.js';

const MAX_TEXT = 200;
const MAX_MODES = 32;
const MAX_CHANNELS = 512;
const MAX_RANGES = 64;
const MAX_LINKS = 8;

/** @param {unknown} value @returns {string} a short plain string, or empty when the value is not text */
function text(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';
}

/** @param {unknown} list @returns {string[]} the strings in a list */
function textList(list) {
  return Array.isArray(list) ? list.map(text).filter(Boolean).slice(0, 20) : [];
}

/** @param {unknown} list @returns {string[]} the http and https links in a list (nothing else is ever passed on) */
function links(list) {
  return textList(list)
    .filter((link) => {
      try {
        return ['http:', 'https:'].includes(new URL(link).protocol);
      } catch {
        return false;
      }
    })
    .slice(0, MAX_LINKS);
}

/** @param {string} word @returns {string} for example "ShutterStrobe" as "Shutter strobe" */
function spaced(word) {
  const words = word.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * @param {Record<string, any>} capability one entry of an OFL channel
 * @returns {string} a short human description of what this range of values does
 */
export function describeCapability(capability) {
  const type = text(capability?.type);
  let label;
  switch (type) {
    case 'ShutterStrobe':
      label = text(capability.shutterEffect) || 'Shutter';
      break;
    case 'ColorIntensity':
      label = `${text(capability.color) || 'Colour'} intensity`;
      break;
    case 'Intensity':
      label = 'Brightness';
      break;
    case 'Effect':
      label = text(capability.effectName) || text(capability.effectPreset) || 'Effect';
      break;
    case 'Pan':
    case 'Tilt':
      label = type;
      break;
    case 'NoFunction':
      label = 'No function';
      break;
    default:
      label = spaced(type || 'Function');
  }
  const comment = text(capability.comment);
  return (comment && comment !== label ? `${label} (${comment})` : label).slice(0, MAX_TEXT);
}

/**
 * @param {Record<string, any> | undefined} definition an OFL channel definition
 * @returns {{ range: string, label: string }[]}
 */
function capabilitiesOf(definition) {
  const list = definition?.capability ? [definition.capability] : (definition?.capabilities ?? []);
  if (!Array.isArray(list)) {
    return [];
  }
  return list.slice(0, MAX_RANGES).map((capability) => {
    const range = Array.isArray(capability?.dmxRange) ? capability.dmxRange : [0, 255];
    return { range: `${Number(range[0])}–${Number(range[1])}`, label: describeCapability(capability) };
  });
}

/** @param {Record<string, any>} physical @returns {{ label: string, value: string }[]} */
function specifications(physical) {
  /** @type {{ label: string, value: string }[]} */
  const rows = [];
  const add = (/** @type {string} */ label, /** @type {string} */ value) => {
    if (value) {
      rows.push({ label, value });
    }
  };
  const dimensions = physical?.dimensions;
  if (
    Array.isArray(dimensions) &&
    dimensions.length === 3 &&
    dimensions.every((/** @type {unknown} */ n) => Number.isFinite(n))
  ) {
    add('Size (width × height × depth)', `${dimensions.join(' × ')} mm`);
  }
  if (Number.isFinite(physical?.weight)) {
    add('Weight', `${physical.weight} kg`);
  }
  if (Number.isFinite(physical?.power)) {
    add('Power', `${physical.power} W`);
  }
  add('DMX connector', text(physical?.DMXconnector));
  add('Light source', text(physical?.bulb?.type));
  const lens = physical?.lens;
  if (
    Array.isArray(lens?.degreesMinMax) &&
    lens.degreesMinMax.every((/** @type {unknown} */ n) => Number.isFinite(n))
  ) {
    const [low, high] = lens.degreesMinMax;
    add('Beam angle', low === high ? `${low}°` : `${low}° to ${high}°`);
  }
  return rows;
}

/**
 * @param {Record<string, any>} document untrusted fixture JSON from the library
 * @returns {{
 *   name: string, categories: string[], authors: string[], createDate: string, lastModifyDate: string,
 *   links: { manual: string[], productPage: string[], video: string[], other: string[] },
 *   specifications: { label: string, value: string }[], note: string,
 *   modes: { name: string, isSupported: boolean, channels: { name: string, type: string, defaultValue: number, ranges: { range: string, label: string }[] }[] }[],
 * }}
 */
export function summariseOflFixture(document) {
  const lookup = createChannelLookup(document);
  const modes = (Array.isArray(document.modes) ? document.modes : [])
    .slice(0, MAX_MODES)
    .map((/** @type {Record<string, any>} */ mode) => {
      const entries = Array.isArray(mode?.channels) ? mode.channels.slice(0, MAX_CHANNELS) : [];
      const isSupported = entries.every((/** @type {unknown} */ entry) => entry === null || typeof entry === 'string');
      const channels = entries
        .filter((/** @type {unknown} */ entry) => typeof entry === 'string')
        .map((/** @type {string} */ name) => {
          const definition = lookup.definitionOf(name);
          const isFine = lookup.isFine(name);
          return {
            name: text(name) || 'Channel',
            type: isFine ? 'other' : classifyChannel(name, definition),
            defaultValue: parseDefault(definition?.defaultValue),
            ranges: isFine ? [] : capabilitiesOf(definition),
          };
        });
      return { name: text(mode?.name) || 'Mode', isSupported, channels };
    });
  const linkGroups = document.links ?? {};
  return {
    name: text(document.name),
    categories: textList(document.categories),
    authors: textList(document.meta?.authors),
    createDate: text(document.meta?.createDate),
    lastModifyDate: text(document.meta?.lastModifyDate),
    links: {
      manual: links(linkGroups.manual),
      productPage: links(linkGroups.productPage),
      video: links(linkGroups.video),
      other: links(linkGroups.other),
    },
    specifications: specifications(document.physical),
    note: text(document.helpWanted),
    modes,
  };
}
