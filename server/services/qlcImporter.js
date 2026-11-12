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
  isArray: (name) => ['Channel', 'Mode', 'Capability'].includes(name),
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
  IntensityLime: 'lime',
  IntensityIndigo: 'indigo',
  IntensityCyan: 'cyan',
  IntensityMagenta: 'magenta',
  IntensityYellow: 'yellow',
  IntensityWarmWhite: 'warm-white',
  IntensityColdWhite: 'cold-white',
  PositionPan: 'pan',
  PositionPanFine: 'pan-fine',
  PositionTilt: 'tilt',
  PositionTiltFine: 'tilt-fine',
};

/** @type {Record<string, string>} */
const COLOUR_TYPES = {
  red: 'red',
  green: 'green',
  blue: 'blue',
  white: 'white',
  amber: 'amber',
  uv: 'uv',
  lime: 'lime',
  indigo: 'indigo',
  cyan: 'cyan',
  magenta: 'magenta',
  yellow: 'yellow',
};

/** @type {Record<string, string>} */
const GROUP_TYPES = {
  pan: 'pan',
  tilt: 'tilt',
  colour: 'color-wheel',
  gobo: 'gobo',
  shutter: 'strobe',
  speed: 'speed',
  prism: 'prism',
  effect: 'effect',
  maintenance: 'maintenance',
};

/** Preset name parts, for the presets not listed above (first match wins). @type {[RegExp, string][]} */
const PRESET_PARTS = [
  [/^ShutterStrobe|^Shutter/, 'strobe'],
  [/^SpeedPanTilt/, 'pan-tilt-speed'],
  [/^Speed/, 'speed'],
  [/^ColorWheel|^ColorMacro/, 'color-wheel'],
  [/^ColorCTO|^ColorCTB|Temperature/, 'color-temperature'],
  [/^GoboWheelRotation|^GoboRotation|Rotation.*Gobo/, 'gobo-rotation'],
  [/^Gobo/, 'gobo'],
  [/^PrismRotation/, 'prism-rotation'],
  [/^Prism/, 'prism'],
  [/^BeamZoom/, 'zoom'],
  [/^BeamFocus/, 'focus'],
  [/^BeamIris/, 'iris'],
  [/^BeamFrost/, 'frost'],
];

/** Beam channels named for what they do. @type {[RegExp, string][]} */
const BEAM_NAMES = [
  [/zoom/i, 'zoom'],
  [/focus/i, 'focus'],
  [/iris/i, 'iris'],
  [/frost/i, 'frost'],
];

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
  return PRESET_PARTS.find(([pattern]) => pattern.test(preset))?.[1] ?? 'other';
}

/** @param {any} group the parsed <Group> element @returns {string} one of CHANNEL_TYPES */
function classifyByGroup(group, channelName = '') {
  const name = textOf(group).toLowerCase();
  const isFine = String(group?.['@_Byte'] ?? '0') !== '0';
  if (isFine) {
    return name === 'pan' ? 'pan-fine' : name === 'tilt' ? 'tilt-fine' : 'other';
  }
  if (name === 'intensity') {
    return 'intensity';
  }
  if (name === 'beam') {
    return BEAM_NAMES.find(([pattern]) => pattern.test(channelName))?.[1] ?? 'other';
  }
  if (/fog|haze|smoke/i.test(channelName)) {
    return /fan/i.test(channelName) ? 'fan' : 'fog';
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
  const type = classifyByGroup(definition.Group, String(definition['@_Name'] ?? ''));
  if (type === 'intensity') {
    return COLOUR_TYPES[textOf(definition.Colour).toLowerCase()] ?? 'intensity';
  }
  return type;
}

/**
 * What one QLC+ capability range does, from the channel's type and the range's name and preset.
 * @param {string} channelType
 * @param {string} label
 * @param {string} preset
 * @param {boolean} isRange whether it spans more than one value
 * @returns {{ type: string, reverse?: boolean }}
 */
function capabilityType(channelType, label, preset, isRange) {
  const words = `${preset} ${label}`;
  const reverse = /FastToSlow|fast\s*(?:to|-|→)\s*slow|BigSmall|FarNear/i.test(words) ? { reverse: true } : {};
  if (/no function|nothing|^\s*$/i.test(label) && !preset) {
    return { type: 'none' };
  }
  if (channelType === 'strobe') {
    if (/open/i.test(words)) {
      return { type: 'shutter-open' };
    }
    if (/clos/i.test(words) || /blackout/i.test(words)) {
      return { type: 'shutter-closed' };
    }
    return { type: /strobe/i.test(words) ? 'strobe' : 'shutter-effect', ...reverse };
  }
  if (channelType === 'color-wheel' || channelType === 'gobo') {
    if (/rotat|scroll|spin/i.test(words)) {
      return { type: 'wheel-rotation', ...reverse };
    }
    if (/shak/i.test(words)) {
      return { type: 'gobo-shake', ...reverse };
    }
    return { type: channelType === 'gobo' ? 'gobo-slot' : 'color-slot' };
  }
  if (/sound/i.test(words)) {
    return { type: 'sound' };
  }
  if (/reset|lamp|maintenance/i.test(words)) {
    return { type: 'maintenance' };
  }
  /** @type {Record<string, string>} */
  const continuous = {
    pan: 'pan',
    tilt: 'tilt',
    zoom: 'zoom',
    focus: 'focus',
    iris: 'iris',
    frost: 'frost',
    fog: 'fog',
    fan: 'fan',
    prism: 'prism',
    'prism-rotation': 'prism-rotation',
    'gobo-rotation': 'wheel-rotation',
    'pan-tilt-speed': 'pan-tilt-speed',
    speed: 'speed',
    'effect-speed': 'effect-speed',
    intensity: 'intensity',
  };
  if (channelType === 'effect') {
    return isRange && /speed/i.test(words) ? { type: 'effect-speed', ...reverse } : { type: 'effect' };
  }
  return { type: continuous[channelType] ?? 'generic', ...reverse };
}

/**
 * The value ranges of a QLC+ channel. A channel with one range over all its values needs no list, so it gets none.
 * @param {Record<string, any> | undefined} definition the parsed <Channel> element
 * @param {string} channelType
 * @returns {import('../../shared/capabilities.js').Capability[]}
 */
function capabilitiesOf(definition, channelType) {
  const raw = Array.isArray(definition?.Capability) ? definition.Capability : [];
  if (raw.length <= 1) {
    return [];
  }
  const ranges = raw.slice(0, 64).flatMap((/** @type {Record<string, any>} */ capability) => {
    const from = Number(capability['@_Min']);
    const to = Number(capability['@_Max']);
    if (![from, to].every((value) => Number.isInteger(value) && value >= 0 && value <= 255) || from > to) {
      return [];
    }
    const label = textOf(capability).slice(0, 80);
    const preset = String(capability['@_Preset'] ?? '');
    const colour = [capability['@_Res1'], capability['@_Res'], capability['@_Color']].find(
      (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value),
    );
    return [
      {
        from,
        to,
        ...capabilityType(channelType, label, preset, to > from),
        ...(label ? { label } : {}),
        ...(colour ? { color: colour.toLowerCase() } : {}),
      },
    ];
  });
  return /** @type {import('../../shared/capabilities.js').Capability[]} */ (ranges);
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
      const definition = definitions.get(name);
      const type = classifyChannel(definition);
      const capabilities = capabilitiesOf(definition, type);
      return {
        name,
        type,
        defaultValue: type === 'pan' || type === 'tilt' ? 128 : 0,
        ...(capabilities.length > 0 ? { capabilities } : {}),
      };
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
