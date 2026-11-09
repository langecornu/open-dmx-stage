// Built-in fixture profiles plus a converter for Open Fixture Library (OFL) JSON files.
// The OFL fixture format is described at https://github.com/OpenLightingProject/open-fixture-library
// (docs/fixture-format.md). OFL warns the format is unstable, so all of it is isolated in this module.
import { httpError } from '../utils/httpError.js';
import { slugify } from '../utils/slugify.js';

import { fixtureTypeSchema } from '../schemas/projectSchema.js';

const ch = (name, type, defaultValue = 0) => ({ name, type, defaultValue });

export const BUILTIN_FIXTURE_TYPES = [
  {
    id: 'generic-dimmer',
    manufacturer: 'Generic',
    name: 'Dimmer',
    modes: [{ name: '1 channel', channels: [ch('Intensity', 'intensity')] }],
  },
  {
    id: 'generic-rgb-par',
    manufacturer: 'Generic',
    name: 'RGB LED par',
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
    modes: [
      {
        name: '4 channel',
        channels: [ch('Red', 'red'), ch('Green', 'green'), ch('Blue', 'blue'), ch('White', 'white')],
      },
    ],
  },
  {
    id: 'generic-moving-head',
    manufacturer: 'Generic',
    name: 'Moving head (basic)',
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

function firstCapability(definition) {
  if (definition?.capability) {
    return definition.capability;
  }
  return Array.isArray(definition?.capabilities) ? definition.capabilities[0] : undefined;
}

function classifyChannel(name, definition) {
  const capability = firstCapability(definition);
  const capType = capability?.type;
  if (capType === 'ColorIntensity') {
    return COLOR_TYPES[String(capability.color ?? '').toLowerCase()] ?? 'other';
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
export function convertOpenFixtureLibrary(document, manufacturer = '') {
  const availableChannels = document.availableChannels;
  const modes = document.modes;
  if (typeof document.name !== 'string' || typeof availableChannels !== 'object' || !Array.isArray(modes)) {
    throw httpError(400, 'Not an Open Fixture Library fixture (missing name, availableChannels or modes)');
  }

  const fineAliases = new Map();
  for (const [name, definition] of Object.entries(availableChannels)) {
    for (const alias of definition?.fineChannelAliases ?? []) {
      fineAliases.set(alias, name);
    }
  }

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
      channels: (mode.channels ?? []).map((name) => resolveChannel(name)),
    })),
  };

  const result = fixtureTypeSchema.safeParse(converted);
  if (!result.success) {
    throw httpError(400, 'The fixture could not be converted (unsupported or empty modes)');
  }
  return result.data;
}
