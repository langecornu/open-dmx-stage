// Converts a QLC+ fixture definition (.qxf, XML) into an Open DMX Stage fixture type.
// QLC+ (https://github.com/mcallegari/qlcplus, Apache-2.0) documents and ships this format; no QLC+ data
// or code is bundled here, users import files they already have.
import { XMLParser } from 'fast-xml-parser';

import { fixtureTypeSchema } from '../schemas/projectSchema.js';
import { httpError } from '../utils/httpError.js';
import { slugify } from '../utils/slugify.js';

// Entities are never expanded and the DOCTYPE is ignored, so hostile XML cannot blow up memory.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  processEntities: false,
  ignoreDeclaration: true,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => ['Channel', 'Mode'].includes(name),
});

/** @type {Record<string, string>} */
const PRESET_TYPES = {
  IntensityMasterDimmer: 'intensity',
  IntensityDimmer: 'intensity',
  IntensityRed: 'red',
  IntensityGreen: 'green',
  IntensityBlue: 'blue',
  IntensityWhite: 'white',
  IntensityAmber: 'amber',
  IntensityUV: 'uv',
  PositionPan: 'pan',
  PositionTilt: 'tilt',
};

/** @type {Record<string, string>} */
const COLOUR_TYPES = { red: 'red', green: 'green', blue: 'blue', white: 'white', amber: 'amber', uv: 'uv' };

/** @type {Record<string, string>} */
const GROUP_TYPES = {
  pan: 'pan',
  tilt: 'tilt',
  colour: 'color-wheel',
  gobo: 'gobo',
  shutter: 'strobe',
  speed: 'speed',
};

/**
 * @param {any} node a parsed XML node: text, or an object with `#text`
 * @returns {string}
 */
function textOf(node) {
  if (node === undefined || node === null) {
    return '';
  }
  return String(typeof node === 'object' ? (node['#text'] ?? '') : node).trim();
}

/** @param {string} preset a QLC+ channel preset name @returns {string} one of CHANNEL_TYPES */
function classifyByPreset(preset) {
  if (PRESET_TYPES[preset]) {
    return PRESET_TYPES[preset];
  }
  if (preset.endsWith('Fine')) {
    return 'other';
  }
  if (preset.startsWith('Shutter')) {
    return 'strobe';
  }
  if (preset.startsWith('Speed')) {
    return 'speed';
  }
  if (preset.startsWith('ColorWheel') || preset.startsWith('ColorMacro')) {
    return 'color-wheel';
  }
  if (preset.startsWith('Gobo')) {
    return 'gobo';
  }
  return 'other';
}

/** @param {any} group the parsed <Group> element @returns {string} one of CHANNEL_TYPES */
function classifyByGroup(group) {
  const name = textOf(group).toLowerCase();
  const isFine = String(group?.['@_Byte'] ?? '0') !== '0';
  if (isFine) {
    return 'other';
  }
  if (name === 'intensity') {
    return 'intensity';
  }
  return GROUP_TYPES[name] ?? 'other';
}

/** @param {Record<string, any> | undefined} definition the parsed <Channel> element @returns {string} */
function classifyChannel(definition) {
  if (!definition) {
    return 'other';
  }
  const preset = definition['@_Preset'];
  if (preset) {
    return classifyByPreset(preset);
  }
  const type = classifyByGroup(definition.Group);
  if (type === 'intensity') {
    return COLOUR_TYPES[textOf(definition.Colour).toLowerCase()] ?? 'intensity';
  }
  return type;
}

/**
 * Converts a QLC+ fixture definition (.qxf) into a validated fixture type.
 * @param {string} xml the file contents
 * @returns {import('../../shared/types.js').FixtureType}
 * @throws {Error & { status: number }} 400 when the file is not a usable fixture definition
 */
export function convertQlcPlus(xml) {
  let document;
  try {
    document = parser.parse(xml);
  } catch {
    throw httpError(400, 'The file is not valid XML');
  }
  const root = document.FixtureDefinition;
  if (!root || typeof root !== 'object') {
    throw httpError(400, 'Not a QLC+ fixture definition (missing FixtureDefinition)');
  }

  const manufacturer = textOf(root.Manufacturer);
  const model = textOf(root.Model);
  /** @type {Map<string, Record<string, any>>} */
  const definitions = new Map();
  for (const channel of root.Channel ?? []) {
    definitions.set(channel['@_Name'], channel);
  }

  const modes = (root.Mode ?? []).map((/** @type {Record<string, any>} */ mode) => {
    const slots = [];
    for (const entry of mode.Channel ?? []) {
      const number = Number(entry['@_Number']);
      if (Number.isInteger(number) && number >= 0 && number < 512) {
        slots[number] = textOf(entry);
      }
    }
    const channels = Array.from(slots, (name) => {
      if (!name) {
        return { name: 'Unused', type: 'other', defaultValue: 0 };
      }
      const type = classifyChannel(definitions.get(name));
      return { name, type, defaultValue: type === 'pan' || type === 'tilt' ? 128 : 0 };
    });
    return { name: mode['@_Name'] ?? 'Mode', channels };
  });

  const converted = {
    id: `qlc-${slugify(manufacturer)}-${slugify(model)}`.replace(/-+$/, ''),
    manufacturer,
    name: model,
    modes,
  };
  const result = fixtureTypeSchema.safeParse(converted);
  if (!result.success) {
    throw httpError(400, 'The fixture could not be converted (missing model name or empty modes)');
  }
  return result.data;
}
