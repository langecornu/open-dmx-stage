// Built-in fixture profiles plus a converter for Open Fixture Library (OFL) JSON files.
// The OFL fixture format is described at https://github.com/OpenLightingProject/open-fixture-library
// (docs/fixture-format.md). OFL warns the format is unstable, so all of it is isolated in this module.
import { createHash } from 'node:crypto';

import { httpError } from '../utils/httpError.js';
import { slugify } from '../utils/slugify.js';
import { categoryFromOfl } from '../../shared/categories.js';
import { classifyOflChannel, convertCapabilities } from './oflCapabilities.js';

import { fixtureTypeSchema } from '../schemas/projectSchema.js';

/**
 * @param {string} name
 * @param {string} type one of CHANNEL_TYPES
 * @param {number} [defaultValue]
 * @param {{ from: number, to: number, type: string, label?: string, color?: string, reverse?: boolean }[]} [capabilities]
 *   its value ranges, when it has several (checked by the schema test of the built-in fixtures)
 */
const ch = (name, type, defaultValue = 0, capabilities = undefined) =>
  capabilities ? { name, type, defaultValue, capabilities } : { name, type, defaultValue };

// Typical ranges of inexpensive LED fixtures. Real fixtures vary, so these are a starting point; a copy of a built-in
// fixture can be edited to match the manual.
/** A shutter that is open (no strobe) at 0 to 9 and strobes slow to fast from 10. */
const SHUTTER = [
  { from: 0, to: 9, type: 'shutter-open', label: 'Open (no strobe)' },
  { from: 10, to: 255, type: 'strobe', label: 'Strobe slow to fast' },
];
/** Built-in programs: manual colour at 0 to 9, automatic programs above. */
const PROGRAMS = [
  { from: 0, to: 9, type: 'none', label: 'Manual (no program)' },
  { from: 10, to: 255, type: 'effect', label: 'Automatic programs' },
];
const RESET = [
  { from: 0, to: 249, type: 'none', label: 'Normal' },
  { from: 250, to: 255, type: 'maintenance', label: 'Reset' },
];
/** A motor speed where 0 is fastest. */
const MOTOR_SPEED = [{ from: 0, to: 255, type: 'pan-tilt-speed', label: 'Fast to slow', reverse: true }];
const COLOUR_WHEEL = [
  ['White', '#ffffff'],
  ['Red', '#ff0000'],
  ['Orange', '#ff7a00'],
  ['Yellow', '#ffd400'],
  ['Green', '#00ff3c'],
  ['Blue', '#0040ff'],
  ['Cyan', '#00e5ff'],
  ['Magenta', '#ff00c8'],
].map(([label, color], index) => ({ from: index * 16, to: index * 16 + 15, type: 'color-slot', label, color }));
const GOBO_WHEEL = [
  { from: 0, to: 15, type: 'gobo-slot', label: 'Open' },
  ...Array.from({ length: 7 }, (_, index) => ({
    from: 16 + index * 16,
    to: 31 + index * 16,
    type: 'gobo-slot',
    label: `Gobo ${index + 1}`,
  })),
  { from: 128, to: 255, type: 'gobo-shake', label: 'Gobo shake, slow to fast' },
];

/**
 * An LED bar with `cells` colour cells, in the modes such bars usually offer: the whole bar in one colour, each cell on
 * its own, and each cell with a master dimmer and strobe in front.
 * @param {number} cells
 */
const ledBar = (cells) => {
  const perCell = Array.from({ length: cells }, (_, index) => [
    ch(`Red ${index + 1}`, 'red'),
    ch(`Green ${index + 1}`, 'green'),
    ch(`Blue ${index + 1}`, 'blue'),
  ]).flat();
  return {
    id: `generic-led-bar-${cells}`,
    category: 'led-bar',
    manufacturer: 'Generic',
    name: `LED bar, ${cells} RGB cells`,
    description: `An LED bar or batten with ${cells} colour cells. Typical modes: the whole bar in one colour (3 channels), each cell on its own (${cells * 3} channels), or each cell with a master dimmer and strobe in front (${cells * 3 + 2} channels). Check the order in your manual.`,
    modes: [
      { name: '3 channel (whole bar)', channels: [ch('Red', 'red'), ch('Green', 'green'), ch('Blue', 'blue')] },
      { name: `${cells * 3} channel (each cell)`, channels: perCell },
      {
        name: `${cells * 3 + 2} channel (dimmer, strobe, each cell)`,
        channels: [ch('Dimmer', 'intensity', 255), ch('Strobe', 'strobe', 0, SHUTTER), ...perCell],
      },
    ],
  };
};

/** @type {import('../../shared/types.js').FixtureType[]} */
export const BUILTIN_FIXTURE_TYPES = /** @type {any} */ ([
  {
    id: 'generic-dimmer',
    category: 'dimmer',
    manufacturer: 'Generic',
    name: 'Dimmer',
    description: 'A single dimmer channel, for lamps and dimmer packs.',
    modes: [{ name: '1 channel', channels: [ch('Intensity', 'intensity')] }],
  },
  {
    id: 'generic-rgb-par',
    category: 'par',
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
          ch('Strobe', 'strobe', 0, SHUTTER),
          ch('Speed', 'speed'),
        ],
      },
    ],
  },
  {
    id: 'generic-rgbw-par',
    category: 'par',
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
    category: 'moving-head',
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
          ch('Pan fine', 'pan-fine'),
          ch('Tilt', 'tilt', 128),
          ch('Tilt fine', 'tilt-fine'),
          ch('Speed', 'pan-tilt-speed', 0, MOTOR_SPEED),
          ch('Dimmer', 'intensity', 255),
          ch('Strobe', 'strobe', 0, SHUTTER),
          ch('Red', 'red'),
          ch('Green', 'green'),
          ch('Blue', 'blue'),
          ch('White', 'white'),
          ch('Programs and sound', 'effect', 0, PROGRAMS),
          ch('Reset', 'maintenance', 0, RESET),
        ],
      },
    ],
  },
  {
    id: 'generic-led-par-36-7ch',
    category: 'par',
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
          ch('Strobe', 'strobe', 0, SHUTTER),
          ch('Programs', 'effect', 0, PROGRAMS),
          ch('Program speed', 'effect-speed'),
        ],
      },
    ],
  },
  {
    id: 'generic-mini-spider-light',
    category: 'spider',
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
          ch('Strobe', 'strobe', 0, SHUTTER),
          ch('Effect', 'effect', 0, PROGRAMS),
          ch('Effect speed', 'effect-speed'),
          ch('Reset', 'maintenance', 0, RESET),
        ],
      },
    ],
  },
  {
    id: 'generic-mini-moving-head-gobo',
    category: 'moving-head',
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
          ch('Pan fine', 'pan-fine'),
          ch('Tilt', 'tilt', 128),
          ch('Tilt fine', 'tilt-fine'),
          ch('Colour wheel', 'color-wheel'),
          ch('Gobo', 'gobo'),
          ch('Strobe', 'strobe', 0, SHUTTER),
          ch('Dimmer', 'intensity', 255),
          ch('Motor speed (0 fast, 255 slow)', 'pan-tilt-speed', 0, MOTOR_SPEED),
          ch('Automatic mode', 'effect', 0, PROGRAMS),
          ch('Reset', 'maintenance', 0, RESET),
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
          ch('Strobe', 'strobe', 0, SHUTTER),
          ch('Dimmer', 'intensity', 255),
          ch('Motor speed (0 fast, 255 slow)', 'pan-tilt-speed', 0, MOTOR_SPEED),
          ch('Automatic mode', 'effect', 0, PROGRAMS),
          ch('Reset', 'maintenance', 0, RESET),
          ch('Light strips (5 to 109 colour, 110 and up auto)', 'other'),
        ],
      },
    ],
  },
  {
    id: 'generic-moving-head',
    category: 'moving-head',
    manufacturer: 'Generic',
    name: 'Moving head (basic)',
    description:
      'A simple 8 channel moving head: pan, tilt, colour wheel, gobo, strobe, dimmer, speed and control. The colour and ' +
      'gobo slots are typical ones; make a copy and edit them to match your manual.',
    modes: [
      {
        name: '8 channel',
        channels: [
          ch('Pan', 'pan', 128),
          ch('Tilt', 'tilt', 128),
          ch('Color wheel', 'color-wheel', 0, COLOUR_WHEEL),
          ch('Gobo', 'gobo', 0, GOBO_WHEEL),
          ch('Strobe', 'strobe', 0, SHUTTER),
          ch('Dimmer', 'intensity'),
          ch('Speed', 'pan-tilt-speed', 0, MOTOR_SPEED),
          ch('Control', 'maintenance', 0, RESET),
        ],
      },
    ],
  },
  {
    id: 'generic-fog-machine',
    category: 'smoke',
    manufacturer: 'Generic',
    name: 'Smoke machine (1 channel)',
    description: 'A DMX smoke (fog) machine: one channel sets how much fog it puts out. Most need to warm up first.',
    modes: [
      {
        name: '1 channel',
        channels: [
          ch('Fog output', 'fog', 0, [
            { from: 0, to: 9, type: 'none', label: 'Off' },
            { from: 10, to: 255, type: 'fog', label: 'Fog, little to a lot' },
          ]),
        ],
      },
    ],
  },
  {
    id: 'generic-hazer',
    category: 'hazer',
    manufacturer: 'Generic',
    name: 'Hazer (2 channel)',
    description: 'A DMX hazer: haze output and fan speed, which spreads the haze.',
    modes: [{ name: '2 channel', channels: [ch('Haze output', 'fog'), ch('Fan', 'fan')] }],
  },
  ledBar(4),
  ledBar(8),
  ledBar(12),
  ledBar(16),
  {
    id: 'generic-spider-8x10w-rgbw',
    category: 'spider',
    manufacturer: 'Generic',
    name: 'LED spider, 8 x 10 W RGBW (15 channel)',
    description:
      'A spider moving light: two bars of four RGBW LEDs that tilt on their own motors. This is the common 15 channel layout of 8 x 10 W spiders (two tilt motors, motor speed, dimmer, strobe, each bar in RGBW, programs, reset); makers vary, so check the order in your manual.',
    modes: [
      {
        name: '15 channel',
        channels: [
          ch('Motor 1 (tilt, bar 1)', 'tilt', 128),
          ch('Motor 2 (tilt, bar 2)', 'tilt', 128),
          ch('Motor speed', 'pan-tilt-speed', 0, MOTOR_SPEED),
          ch('Dimmer', 'intensity', 255),
          ch('Strobe', 'strobe', 0, SHUTTER),
          ch('Red (bar 1)', 'red'),
          ch('Green (bar 1)', 'green'),
          ch('Blue (bar 1)', 'blue'),
          ch('White (bar 1)', 'white'),
          ch('Red (bar 2)', 'red'),
          ch('Green (bar 2)', 'green'),
          ch('Blue (bar 2)', 'blue'),
          ch('White (bar 2)', 'white'),
          ch('Programs', 'effect', 0, PROGRAMS),
          ch('Reset', 'maintenance', 0, RESET),
        ],
      },
    ],
  },
  {
    id: 'generic-led-derby-rgbw',
    category: 'effect',
    manufacturer: 'Generic',
    name: 'LED derby, RGBW (6 channel)',
    description:
      'A derby effect: many coloured beams from a rotating lens. Red, green, blue and white, strobe and rotation.',
    modes: [
      {
        name: '6 channel',
        channels: [
          ch('Red', 'red'),
          ch('Green', 'green'),
          ch('Blue', 'blue'),
          ch('White', 'white'),
          ch('Strobe', 'strobe', 0, SHUTTER),
          ch('Rotation', 'rotation', 0, [
            { from: 0, to: 9, type: 'none', label: 'Stopped' },
            { from: 10, to: 255, type: 'rotation', label: 'Rotate, slow to fast' },
          ]),
        ],
      },
    ],
  },
  {
    id: 'generic-rgb-laser',
    category: 'laser',
    manufacturer: 'Generic',
    name: 'RGB party laser (5 channel)',
    description:
      'A small party laser: brightness, colour, pattern, rotation and speed. Lasers can harm eyes: keep beams above head height and follow local rules.',
    modes: [
      {
        name: '5 channel',
        channels: [
          ch('Brightness', 'intensity'),
          ch('Colour', 'color-wheel', 0, COLOUR_WHEEL),
          ch('Pattern', 'effect', 0, PROGRAMS),
          ch('Rotation', 'rotation'),
          ch('Speed', 'effect-speed'),
        ],
      },
    ],
  },
  {
    id: 'generic-strobe',
    category: 'strobe',
    manufacturer: 'Generic',
    name: 'Strobe (2 channel)',
    description: 'A white strobe: brightness, and flash rate from slow to fast.',
    modes: [
      {
        name: '2 channel',
        channels: [ch('Brightness', 'intensity'), ch('Flash rate', 'strobe', 0, SHUTTER)],
      },
    ],
  },
  {
    id: 'generic-blinder-2',
    category: 'blinder',
    manufacturer: 'Generic',
    name: 'Audience blinder, 2 lamps (2 channel)',
    description: 'A two-lamp warm white blinder, each lamp on its own dimmer channel.',
    modes: [{ name: '2 channel', channels: [ch('Lamp 1', 'intensity'), ch('Lamp 2', 'intensity')] }],
  },
  {
    id: 'generic-led-spot',
    category: 'spot',
    manufacturer: 'Generic',
    name: 'LED spot with gobos (6 channel)',
    description: 'A fixed LED spot (profile): dimmer, shutter, colour wheel, gobo wheel, zoom and focus.',
    modes: [
      {
        name: '6 channel',
        channels: [
          ch('Dimmer', 'intensity'),
          ch('Shutter', 'strobe', 0, SHUTTER),
          ch('Colour wheel', 'color-wheel', 0, COLOUR_WHEEL),
          ch('Gobo wheel', 'gobo', 0, GOBO_WHEEL),
          ch('Zoom', 'zoom', 128),
          ch('Focus', 'focus', 128),
        ],
      },
    ],
  },
  {
    id: 'generic-led-scanner',
    category: 'scanner',
    manufacturer: 'Generic',
    name: 'LED scanner (7 channel)',
    description:
      'A scanner: a moving mirror sweeps the beam. Pan, tilt, colour wheel, gobo wheel, shutter, dimmer and speed.',
    modes: [
      {
        name: '7 channel',
        channels: [
          ch('Pan (mirror)', 'pan', 128),
          ch('Tilt (mirror)', 'tilt', 128),
          ch('Colour wheel', 'color-wheel', 0, COLOUR_WHEEL),
          ch('Gobo wheel', 'gobo', 0, GOBO_WHEEL),
          ch('Shutter', 'strobe', 0, SHUTTER),
          ch('Dimmer', 'intensity'),
          ch('Mirror speed', 'pan-tilt-speed', 0, MOTOR_SPEED),
        ],
      },
    ],
  },
  {
    id: 'generic-barrel-scanner',
    category: 'barrel-scanner',
    manufacturer: 'Generic',
    name: 'Barrel scanner (6 channel)',
    description:
      'A barrel scanner: a rotating mirror drum sweeps the beam side to side. Barrel position, colour, gobo, shutter and dimmer.',
    modes: [
      {
        name: '6 channel',
        channels: [
          ch('Barrel position', 'pan', 128),
          ch('Tilt', 'tilt', 128),
          ch('Colour wheel', 'color-wheel', 0, COLOUR_WHEEL),
          ch('Gobo wheel', 'gobo', 0, GOBO_WHEEL),
          ch('Shutter', 'strobe', 0, SHUTTER),
          ch('Dimmer', 'intensity'),
        ],
      },
    ],
  },
  {
    id: 'generic-led-matrix-3x3',
    category: 'matrix',
    manufacturer: 'Generic',
    name: 'LED matrix, 3 x 3 RGB (27 channel)',
    description: 'A 3 by 3 panel of RGB pixels, each with its own red, green and blue, in rows from the top left.',
    modes: [
      {
        name: '27 channel',
        channels: Array.from({ length: 9 }, (_, index) => [
          ch(`Red ${index + 1}`, 'red'),
          ch(`Green ${index + 1}`, 'green'),
          ch(`Blue ${index + 1}`, 'blue'),
        ]).flat(),
      },
    ],
  },
  {
    id: 'generic-led-flower',
    category: 'flower',
    manufacturer: 'Generic',
    name: 'LED flower, RGBW (6 channel)',
    description:
      'A flower effect: dozens of coloured beams from one lens, turning. Red, green, blue, white, strobe and rotation.',
    modes: [
      {
        name: '6 channel',
        channels: [
          ch('Red', 'red'),
          ch('Green', 'green'),
          ch('Blue', 'blue'),
          ch('White', 'white'),
          ch('Strobe', 'strobe', 0, SHUTTER),
          ch('Rotation', 'rotation', 0, [
            { from: 0, to: 9, type: 'none', label: 'Stopped' },
            { from: 10, to: 255, type: 'rotation', label: 'Rotate, slow to fast' },
          ]),
        ],
      },
    ],
  },
  {
    id: 'generic-dmx-fan',
    category: 'fan',
    manufacturer: 'Generic',
    name: 'DMX fan (1 channel)',
    description: 'A DMX fan that blows smoke or haze across the stage: one channel sets its speed.',
    modes: [{ name: '1 channel', channels: [ch('Fan speed', 'fan')] }],
  },
  {
    id: 'generic-bubble-machine',
    category: 'special-effect',
    manufacturer: 'Generic',
    name: 'Bubble machine (1 channel)',
    description: 'A DMX bubble machine: one channel turns the bubbles on, more for more bubbles.',
    modes: [{ name: '1 channel', channels: [ch('Bubbles', 'intensity')] }],
  },
  {
    id: 'generic-mirror-ball-motor',
    category: 'mirror-ball',
    manufacturer: 'Generic',
    name: 'Mirror ball motor (1 channel)',
    description: 'A DMX mirror ball motor: rotation speed. Light it with a spot or a par to scatter the dots.',
    modes: [
      {
        name: '1 channel',
        channels: [
          ch('Rotation', 'rotation', 0, [
            { from: 0, to: 9, type: 'none', label: 'Stopped' },
            { from: 10, to: 255, type: 'rotation', label: 'Rotate, slow to fast' },
          ]),
        ],
      },
    ],
  },
]);

/**
 * What an OFL channel is, as one of CHANNEL_TYPES. Kept here for callers of the converter; the work is in
 * oflCapabilities.js.
 * @param {string} name
 * @param {Record<string, any> | undefined} definition
 * @param {Record<string, any>} [wheels] the fixture's wheels, to tell a colour wheel from a gobo wheel
 * @returns {string}
 */
export function classifyChannel(name, definition, wheels = {}) {
  return classifyOflChannel(name, definition, wheels);
}

/**
 * @param {unknown} value a number, or a percentage string such as "50%"
 * @returns {number} 0 to 255
 */
export function parseDefault(value) {
  if (typeof value === 'number') {
    return Math.max(0, Math.min(255, Math.round(value)));
  }
  if (typeof value === 'string' && /^\d+(\.\d+)?%$/.test(value)) {
    return Math.max(0, Math.min(255, Math.round((parseFloat(value) / 100) * 255)));
  }
  return 0;
}

/**
 * A stable id for a fixture fetched from the library, so adding the same one twice is recognised. Ids are 64 characters
 * at most, so a long key is cut and given a short hash to keep different keys apart.
 * @param {string} key `manufacturer/fixture`
 * @returns {string}
 */
export function oflFixtureId(key) {
  const plain = `ofl-${key.replace('/', '-')}`;
  if (plain.length <= 64) {
    return plain;
  }
  return `${plain.slice(0, 55)}-${createHash('sha1').update(key).digest('hex').slice(0, 8)}`;
}

/**
 * Credits the Open Fixture Library and its authors in the description of a fixture fetched from it.
 * @param {Record<string, any>} document
 * @param {{ key: string, creditKey?: string } | null} source
 * @param {string[]} leftOut names of modes that were not copied
 * @returns {string}
 */
function describeSource(document, source, leftOut) {
  if (!source) {
    return '';
  }
  const text = (/** @type {unknown} */ list) =>
    Array.isArray(list) ? list.filter((item) => typeof item === 'string').join(', ') : '';
  const categories = text(document.categories);
  const authors = text(document.meta?.authors);
  const parts = [
    categories ? `${categories}.` : '',
    `From the Open Fixture Library (open-fixture-library.org/${source.creditKey ?? source.key}).`,
    authors ? `Authors: ${authors}.` : '',
    leftOut.length > 0 ? `Not copied (pixel channels are not supported yet): ${leftOut.join(', ')}.` : '',
  ];
  return parts.filter(Boolean).join(' ').slice(0, 500);
}

const MAX_TEMPLATE_KEY = 100;

/** @param {string} text @returns {string} the text with regular expression characters made literal */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds the definition of a channel by name. The library describes most channels in `availableChannels`, but channels
 * repeated for each pixel (for example "Red Master") come from `templateChannels` keys such as "Red $pixelKey", so a
 * name that is not listed is matched against those too. Fine channels ("Pan fine") are recognised the same way.
 * @param {Record<string, any>} document untrusted fixture document
 * @returns {{ definitionOf: (name: string) => Record<string, any> | undefined, isFine: (name: string) => boolean, coarseOf: (name: string) => string | undefined }}
 */
export function createChannelLookup(document) {
  const asEntries = (/** @type {unknown} */ value) =>
    typeof value === 'object' && value !== null ? Object.entries(value) : [];
  const available = new Map(asEntries(document.availableChannels));
  /** @param {string} template */
  const toPattern = (template) => {
    const parts = template.split('$pixelKey');
    if (template.length > MAX_TEMPLATE_KEY || parts.length < 2 || parts.length > 3) {
      return null;
    }
    return new RegExp(`^${parts.map(escapeRegExp).join('(.+)')}$`);
  };
  /** @type {{ pattern: RegExp, definition: Record<string, any> }[]} */
  const templates = [];
  /** @type {RegExp[]} */
  const fineTemplates = [];
  const fine = new Set();
  /** @type {Map<string, string>} fine alias to the name of its coarse channel */
  const coarse = new Map();
  for (const [name, definition] of available) {
    for (const alias of definition?.fineChannelAliases ?? []) {
      fine.add(alias);
      coarse.set(alias, name);
    }
  }
  for (const [name, definition] of asEntries(document.templateChannels)) {
    const pattern = toPattern(name);
    if (pattern) {
      templates.push({ pattern, definition });
    }
    for (const alias of definition?.fineChannelAliases ?? []) {
      const aliasPattern = typeof alias === 'string' ? toPattern(alias) : null;
      if (aliasPattern) {
        fineTemplates.push(aliasPattern);
      }
    }
  }
  return {
    definitionOf: (name) => available.get(name) ?? templates.find((entry) => entry.pattern.test(name))?.definition,
    isFine: (name) => fine.has(name) || fineTemplates.some((pattern) => pattern.test(name)),
    coarseOf: (name) => coarse.get(name),
  };
}

/**
 * Converts one Open Fixture Library fixture document into a validated fixture type.
 * @param {Record<string, any>} document untrusted JSON from an OFL fixture file
 * @param {string} [manufacturer]
 * @param {{ key: string, creditKey?: string } | null} [source] set when the fixture was fetched from the library: `key`
 *   is what the person chose (it makes the id) and `creditKey` the entry the channels really came from, if different
 * @returns {import('../../shared/types.js').FixtureType}
 * @throws {Error & { status: number }} 400 when the document is not a usable fixture
 */
export function convertOpenFixtureLibrary(document, manufacturer = '', source = null) {
  const modes = document.modes;
  if (typeof document.name !== 'string' || typeof document.availableChannels !== 'object' || !Array.isArray(modes)) {
    throw httpError(400, 'Not an Open Fixture Library fixture (missing name, availableChannels or modes)');
  }

  // A mode entry that is not a channel name or null (for example a pixel matrix insert) would be turned into one
  // placeholder channel and shift every address after it. Such modes are left out rather than guessed; the fixture is
  // refused only when no mode is left.
  const usesInserts = (/** @type {Record<string, any>} */ mode) =>
    (mode?.channels ?? []).some((/** @type {unknown} */ entry) => entry !== null && typeof entry !== 'string');
  const supportedModes = modes.filter((/** @type {Record<string, any>} */ mode) => !usesInserts(mode));
  if (modes.length > 0 && supportedModes.length === 0) {
    throw httpError(400, 'This fixture uses pixel or matrix channels, which are not supported yet.');
  }
  const leftOut = modes
    .filter(usesInserts)
    .map((/** @type {Record<string, any>} */ mode) => String(mode.name ?? 'Mode'));

  const lookup = createChannelLookup(document);
  const wheels = typeof document.wheels === 'object' && document.wheels !== null ? document.wheels : {};

  /** @param {string | null} name */
  const resolveChannel = (name) => {
    if (name === null || typeof name !== 'string') {
      return { name: 'Unused', type: 'other', defaultValue: 0 };
    }
    if (lookup.isFine(name)) {
      // The fine half of a 16-bit pan or tilt goes with its coarse channel; other fine channels rest at 0.
      const coarseName = lookup.coarseOf(name);
      const coarseType = coarseName ? classifyChannel(coarseName, lookup.definitionOf(coarseName), wheels) : 'other';
      const type = coarseType === 'pan' ? 'pan-fine' : coarseType === 'tilt' ? 'tilt-fine' : 'other';
      return { name, type, defaultValue: 0 };
    }
    const definition = lookup.definitionOf(name);
    const capabilities = convertCapabilities(definition, name, wheels);
    return {
      name,
      type: classifyChannel(name, definition, wheels),
      defaultValue: parseDefault(definition?.defaultValue),
      ...(capabilities.length > 0 ? { capabilities } : {}),
    };
  };

  const converted = {
    id: source ? oflFixtureId(source.key) : `ofl-${slugify(manufacturer)}-${slugify(document.name)}`.replace(/-+$/, ''),
    manufacturer,
    name: document.name,
    description: describeSource(document, source, leftOut),
    ...(categoryFromOfl(document.categories) ? { category: categoryFromOfl(document.categories) } : {}),
    modes: supportedModes.slice(0, 32).map((/** @type {Record<string, any>} */ mode) => ({
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
