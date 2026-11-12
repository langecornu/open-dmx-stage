// Helpers for the Fixtures screen: make, copy and check fixture definitions (manufacturer, model, description and the
// channel layout of each mode). Pure, so the rules are easy to test.
import { CHANNEL_TYPES, DMX_CHANNELS } from '../../shared/patch.js';
import { makeId } from './ids.js';

export const MAX_FIXTURE_TYPES = 200;
export const MAX_MODES = 32;
export const MAX_NAME_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 500;

/** What each channel type is called on screen. */
export const CHANNEL_TYPE_LABELS = {
  intensity: 'Dimmer (brightness)',
  red: 'Red',
  green: 'Green',
  blue: 'Blue',
  white: 'White',
  'warm-white': 'Warm white',
  'cold-white': 'Cold white',
  amber: 'Amber',
  uv: 'UV',
  lime: 'Lime',
  indigo: 'Indigo',
  cyan: 'Cyan',
  magenta: 'Magenta',
  yellow: 'Yellow',
  'color-temperature': 'Colour temperature',
  'color-wheel': 'Colour wheel',
  'color-macro': 'Colour macro / preset',
  strobe: 'Shutter / strobe',
  pan: 'Pan',
  'pan-fine': 'Pan fine (16-bit)',
  tilt: 'Tilt',
  'tilt-fine': 'Tilt fine (16-bit)',
  'pan-tilt-speed': 'Pan and tilt speed',
  gobo: 'Gobo wheel',
  'gobo-rotation': 'Gobo rotation',
  prism: 'Prism',
  'prism-rotation': 'Prism rotation',
  frost: 'Frost',
  iris: 'Iris',
  zoom: 'Zoom',
  focus: 'Focus',
  fog: 'Fog / haze output',
  'fog-type': 'Fog type',
  fan: 'Fan',
  effect: 'Program / effect',
  'effect-speed': 'Program speed',
  'sound-sensitivity': 'Sound sensitivity',
  rotation: 'Rotation',
  speed: 'Speed',
  maintenance: 'Maintenance (reset, lamp)',
  other: 'Other (fixed)',
};

/** @returns {string[]} every channel type, in the order the menu shows them */
export function channelTypes() {
  return [...CHANNEL_TYPES];
}

/** @returns {import('../../shared/types.js').FixtureChannel} a new channel with a sensible start */
export function newChannel() {
  return { name: 'Channel', type: 'other', defaultValue: 0 };
}

/** @returns {import('../../shared/types.js').FixtureType} a new fixture with one mode and one dimmer channel */
export function newFixtureType() {
  return {
    id: makeId(),
    manufacturer: '',
    name: 'New fixture',
    description: '',
    modes: [{ name: '1 channel', channels: [{ name: 'Intensity', type: 'intensity', defaultValue: 0 }] }],
  };
}

/**
 * A copy with a new id, so a built-in example (which cannot be changed) becomes one you own.
 * @param {import('../../shared/types.js').FixtureType} type
 * @returns {import('../../shared/types.js').FixtureType}
 */
export function duplicateFixtureType(type) {
  const copy = structuredClone(type);
  copy.id = makeId();
  copy.name = `${type.name} (copy)`.slice(0, MAX_NAME_LENGTH);
  return copy;
}

/**
 * @param {Pick<import('../../shared/types.js').Project, 'fixtures'>} project
 * @param {string} typeId
 * @returns {number} how many lights in the rig use this fixture type
 */
export function usageCount(project, typeId) {
  return project.fixtures.filter((fixture) => fixture.typeId === typeId).length;
}

/**
 * @param {import('../../shared/types.js').FixtureType} type
 * @returns {string} for example "U'King 40W RGBW Moving Head Light", or just the model when there is no brand
 */
export function fixtureTitle(type) {
  return type.manufacturer ? `${type.manufacturer} ${type.name}` : type.name;
}

/** @param {number} count @returns {boolean} true while another channel still fits in one universe */
export function canAddChannel(count) {
  return count < DMX_CHANNELS;
}
