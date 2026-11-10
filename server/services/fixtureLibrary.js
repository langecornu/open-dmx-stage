// Built-in fixture profiles plus a converter for Open Fixture Library (OFL) JSON files.
// The OFL fixture format is described at https://github.com/OpenLightingProject/open-fixture-library
// (docs/fixture-format.md). OFL warns the format is unstable, so all of it is isolated in this module.
import { httpError } from '../utils/httpError.js';
import { slugify } from '../utils/slugify.js';

import { fixtureTypeSchema } from '../schemas/projectSchema.js';

/**
 * @param {string} name
 * @param {string} type one of CHANNEL_TYPES
 * @param {number} [defaultValue]
 */
const ch = (name, type, defaultValue = 0) => ({ name, type, defaultValue });

export const BUILTIN_FIXTURE_TYPES = [
  {
    id: 'generic-dimmer',
    manufacturer: 'Generic',
    name: 'Dimmer',
    description: 'A single dimmer channel, for lamps and dimmer packs.',
    modes: [{ name: '1 channel', channels: [ch('Intensity', 'intensity')] }],
  },
  {
    id: 'generic-rgb-par',
    manufacturer: 'Generic',
    name: 'RGB LED par',
    description:
      'A colour-mixing LED par with 3 channels (red, green, blue) or 6 channels (adds dimmer, strobe, speed).',
    modes: [
      { name: '3 channel', channels: [ch('Red', 'red'), ch('Green', 'green'), ch('Blue', 'blue')] },
      {
        name: '6 channel',
        channels: [
          ch('Dimmer', 'intensity', 255),
          ch('Red', 'red'),
          ch('Green', 'green'),
          ch('Blue', 'blue'),
          ch('Strobe', 'strobe'),
          ch('Speed', 'speed'),
        ],
      },
    ],
  },
  {
    id: 'generic-rgbw-par',
    manufacturer: 'Generic',
    name: 'RGBW LED par',
    description: 'A colour-mixing LED par with red, green, blue and white.',
    modes: [
      {
        name: '4 channel',
        channels: [ch('Red', 'red'), ch('Green', 'green'), ch('Blue', 'blue'), ch('White', 'white')],
      },
    ],
  },
  {
    id: 'uking-40w-beam-moving-head',
    manufacturer: "U'King",
    name: '40W RGBW Moving Head Light',
    description: '40W Beam Moving Head Light DMX512 RGBW Stage Light',
    // From the maker's user manual, "13channelmode". Channel 12 must stay below 31 (31 and up start the built-in
    // programs or sound mode) and channel 13 must stay at 0 (250 and up reset the head), so both default to 0 and are
    // typed 'other', which master and blackout never touch.
    modes: [
      {
        name: '13 channel',
        channels: [
          ch('Pan', 'pan', 128),
          ch('Pan fine', 'other'),
          ch('Tilt', 'tilt', 128),
          ch('Tilt fine', 'other'),
          ch('Speed', 'speed'),
          ch('Dimmer', 'intensity', 255),
          ch('Strobe', 'strobe'),
          ch('Red', 'red'),
          ch('Green', 'green'),
          ch('Blue', 'blue'),
          ch('White', 'white'),
          ch('Programs and sound (keep at 0)', 'other'),
          ch('Reset (keep at 0)', 'other'),
        ],
      },
    ],
  },
  {
    id: 'generic-led-par-36-7ch',
    manufacturer: 'Generic',
    name: '36 LED RGB par (7 channel)',
    description:
      'A 36 LED RGB par with 7 DMX channels, from a manual with an A-003 remote. Set the light to its 7 channel DMX mode on its display. Check the channel count your light shows before choosing this one.',
    // Channel 6 selects the built-in programs; 0 to 10 means "manual", so it stays at 0 and is typed 'other' (never
    // scaled by master). Channel 7 sets the speed or shade of whichever program channel 6 selected.
    modes: [
      {
        name: '7 channel',
        channels: [
          ch('Dimmer', 'intensity', 255),
          ch('Red', 'red'),
          ch('Green', 'green'),
          ch('Blue', 'blue'),
          ch('Strobe', 'strobe'),
          ch('Programs (keep at 0 for manual colour)', 'other'),
          ch('Program speed', 'speed'),
        ],
      },
    ],
  },
  {
    id: 'generic-mini-spider-light',
    manufacturer: 'Generic',
    name: 'Mini Spider Light (8 x RGBW)',
    description:
      'A mini spider moving light: eight RGBW LEDs on two tilting arms. 7 channel DMX mode only (the 15 channel mode is not included). It has no separate red, green or blue channel in this mode, so colours come from its built-in effects.',
    // Channel 5 picks one of 25 built-in effects (0 to 7 is none) and channel 7 resets the light, so both stay at 0.
    modes: [
      {
        name: '7 channel',
        channels: [
          ch('Motor 1 (tilt, 0 to 135 degrees)', 'tilt', 128),
          ch('Motor 2 (tilt, 0 to 135 degrees)', 'tilt', 128),
          ch('Dimmer', 'intensity', 255),
          ch('Strobe', 'strobe'),
          ch('Effect (keep at 0 for none)', 'other'),
          ch('Effect speed', 'speed'),
          ch('Reset (keep at 0)', 'other'),
        ],
      },
    ],
  },
  {
    id: 'generic-mini-moving-head-gobo',
    manufacturer: 'Generic',
    name: 'Mini Moving Head Gobo Light',
    description:
      'A mini moving head with one white LED plus 12 RGB LEDs, a colour wheel of 7 colours, 7 gobos and a ring light. 12 and 10 channel DMX modes; pick the one set on the light (CHnd on its display).',
    // Channel "Automatic mode" must stay at 0 to 59 so the other channels work; "Reset" must stay at 0 (250 and up resets
    // the head). Both are typed 'other' so master and blackout never touch them.
    modes: [
      {
        name: '12 channel',
        channels: [
          ch('Pan', 'pan', 128),
          ch('Pan fine', 'other'),
          ch('Tilt', 'tilt', 128),
          ch('Tilt fine', 'other'),
          ch('Colour wheel', 'color-wheel'),
          ch('Gobo', 'gobo'),
          ch('Strobe', 'strobe'),
          ch('Dimmer', 'intensity', 255),
          ch('Motor speed (0 fast, 255 slow)', 'speed'),
          ch('Automatic mode (keep at 0)', 'other'),
          ch('Reset (keep at 0)', 'other'),
          ch('Light strips (5 to 109 colour, 110 and up auto)', 'other'),
        ],
      },
      {
        name: '10 channel',
        channels: [
          ch('Pan', 'pan', 128),
          ch('Tilt', 'tilt', 128),
          ch('Colour wheel', 'color-wheel'),
          ch('Gobo', 'gobo'),
          ch('Strobe', 'strobe'),
          ch('Dimmer', 'intensity', 255),
          ch('Motor speed (0 fast, 255 slow)', 'speed'),
          ch('Automatic mode (keep at 0)', 'other'),
          ch('Reset (keep at 0)', 'other'),
          ch('Light strips (5 to 109 colour, 110 and up auto)', 'other'),
        ],
      },
    ],
  },
  {
    id: 'generic-moving-head',
    manufacturer: 'Generic',
    name: 'Moving head (basic)',
    description: 'A simple 8 channel moving head: pan, tilt, colour wheel, gobo, strobe, dimmer, speed and control.',
    modes: [
      {
        name: '8 channel',
        channels: [
          ch('Pan', 'pan', 128),
          ch('Tilt', 'tilt', 128),
          ch('Color wheel', 'color-wheel'),
          ch('Gobo', 'gobo'),
          ch('Strobe', 'strobe'),
          ch('Dimmer', 'intensity'),
          ch('Speed', 'speed'),
          ch('Control', 'other'),
        ],
      },
    ],
  },
];

/** @type {Record<string, string>} */
const COLOR_TYPES = {
  red: 'red',
  green: 'green',
  blue: 'blue',
  white: 'white',
  warm: 'white',
  cold: 'white',
  amber: 'amber',
  uv: 'uv',
};

/**
 * @param {Record<string, any> | undefined} definition an Open Fixture Library channel definition
 * @returns {Record<string, any> | undefined}
 */
function firstCapability(definition) {
  if (definition?.capability) {
    return definition.capability;
  }
  return Array.isArray(definition?.capabilities) ? definition.capabilities[0] : undefined;
}

/**
 * @param {string} name
 * @param {Record<string, any> | undefined} definition
 * @returns {string} one of CHANNEL_TYPES
 */
function classifyChannel(name, definition) {
  const capability = firstCapability(definition);
  const capType = capability?.type;
  if (capType === 'ColorIntensity') {
    return COLOR_TYPES[String(capability?.color ?? '').toLowerCase()] ?? 'other';
  }
  if (capType === 'Intensity') {
    return 'intensity';
  }
  if (capType === 'Pan' || capType === 'PanContinuous') {
    return 'pan';
  }
  if (capType === 'Tilt' || capType === 'TiltContinuous') {
    return 'tilt';
  }
  if (capType === 'ShutterStrobe') {
    return 'strobe';
  }
  if (capType === 'ColorPreset' || (capType === 'WheelSlot' && /colou?r/i.test(name))) {
    return 'color-wheel';
  }
  if (capType === 'WheelSlot' && /gobo/i.test(name)) {
    return 'gobo';
  }
  if (capType === 'Speed' || capType === 'PanTiltSpeed') {
    return 'speed';
  }
  return 'other';
}

/**
 * @param {unknown} value a number, or a percentage string such as "50%"
 * @returns {number} 0 to 255
 */
function parseDefault(value) {
  if (typeof value === 'number') {
    return Math.max(0, Math.min(255, Math.round(value)));
  }
  if (typeof value === 'string' && /^\d+(\.\d+)?%$/.test(value)) {
    return Math.max(0, Math.min(255, Math.round((parseFloat(value) / 100) * 255)));
  }
  return 0;
}

// Converts one OFL fixture document into a validated fixture type. Throws a 400 for unusable input.
/**
 * Converts one Open Fixture Library fixture document into a validated fixture type.
 * @param {Record<string, any>} document untrusted JSON from an OFL fixture file
 * @param {string} [manufacturer]
 * @returns {import('../../shared/types.js').FixtureType}
 * @throws {Error & { status: number }} 400 when the document is not a usable fixture
 */
export function convertOpenFixtureLibrary(document, manufacturer = '') {
  const availableChannels = document.availableChannels;
  const modes = document.modes;
  if (typeof document.name !== 'string' || typeof availableChannels !== 'object' || !Array.isArray(modes)) {
    throw httpError(400, 'Not an Open Fixture Library fixture (missing name, availableChannels or modes)');
  }

  /** @type {Map<string, string>} */
  const fineAliases = new Map();
  for (const [name, definition] of Object.entries(availableChannels)) {
    for (const alias of definition?.fineChannelAliases ?? []) {
      fineAliases.set(alias, name);
    }
  }

  /** @param {string | null} name */
  const resolveChannel = (name) => {
    if (name === null || typeof name !== 'string') {
      return { name: 'Unused', type: 'other', defaultValue: 0 };
    }
    const baseName = fineAliases.get(name);
    if (baseName) {
      return { name, type: 'other', defaultValue: 0 };
    }
    const definition = availableChannels[name];
    return { name, type: classifyChannel(name, definition), defaultValue: parseDefault(definition?.defaultValue) };
  };

  const converted = {
    id: `ofl-${slugify(manufacturer)}-${slugify(document.name)}`.replace(/-+$/, ''),
    manufacturer,
    name: document.name,
    modes: modes.slice(0, 32).map((mode) => ({
      name: String(mode.name ?? 'Mode'),
      channels: (mode.channels ?? []).map((/** @type {string | null} */ name) => resolveChannel(name)),
    })),
  };

  const result = fixtureTypeSchema.safeParse(converted);
  if (!result.success) {
    throw httpError(400, 'The fixture could not be converted (unsupported or empty modes)');
  }
  return result.data;
}
