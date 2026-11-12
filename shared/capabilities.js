// What DMX fixtures can do, and how to set it. The vocabulary follows the Open Fixture Library's capability types
// (docs/capability-types.md in its repository), simplified to what a show needs. A channel has one type (see
// CHANNEL_TYPES in shared/patch.js) and, when it does several things across its 0 to 255 range, a list of capabilities:
// for example a shutter that is closed at 0 to 9, open at 10 to 19 and strobes slow to fast from 20 to 255, or a gobo
// wheel with one range per gobo. From a fixture's channels this module works out its **controls**: a slider for a
// continuous channel, or a choice (with a level when the chosen range is continuous). Pure, and shared by the engine,
// the editors and the importers, so every part of the app reads a fixture the same way.

/**
 * What one range of a channel does. `continuous` ranges (a strobe speed, a zoom) are set with a level from 0 to 100%;
 * the others (a gobo, "shutter open") are picked as a whole.
 */
export const CAPABILITY_TYPES = /** @type {const} */ ([
  'none',
  'intensity',
  'color',
  'color-slot',
  'color-preset',
  'color-temperature',
  'shutter-open',
  'shutter-closed',
  'strobe',
  'shutter-effect',
  'pan',
  'tilt',
  'pan-tilt-speed',
  'gobo-slot',
  'gobo-shake',
  'wheel-rotation',
  'prism',
  'prism-rotation',
  'frost',
  'iris',
  'zoom',
  'focus',
  'fog',
  'fog-type',
  'fan',
  'effect',
  'effect-speed',
  'sound',
  'speed',
  'rotation',
  'maintenance',
  'generic',
]);

/** What each capability type is called on screen. @type {Record<string, string>} */
export const CAPABILITY_LABELS = {
  none: 'No function',
  intensity: 'Intensity',
  color: 'Colour level',
  'color-slot': 'Colour (wheel slot)',
  'color-preset': 'Colour preset',
  'color-temperature': 'Colour temperature',
  'shutter-open': 'Shutter open',
  'shutter-closed': 'Shutter closed',
  strobe: 'Strobe (slow to fast)',
  'shutter-effect': 'Shutter effect (pulse, ramp…)',
  pan: 'Pan',
  tilt: 'Tilt',
  'pan-tilt-speed': 'Movement speed',
  'gobo-slot': 'Gobo',
  'gobo-shake': 'Gobo shake',
  'wheel-rotation': 'Wheel rotation',
  prism: 'Prism',
  'prism-rotation': 'Prism rotation',
  frost: 'Frost',
  iris: 'Iris',
  zoom: 'Zoom',
  focus: 'Focus',
  fog: 'Fog output',
  'fog-type': 'Fog type',
  fan: 'Fan',
  effect: 'Program or effect',
  'effect-speed': 'Program speed',
  sound: 'Sound active',
  speed: 'Speed',
  rotation: 'Rotation',
  maintenance: 'Maintenance (reset, lamp…)',
  generic: 'Level',
};

/** Capabilities picked as a whole, even when they span several values. */
const STEPPED = new Set([
  'none',
  'color-slot',
  'color-preset',
  'shutter-open',
  'shutter-closed',
  'gobo-slot',
  'fog-type',
  'effect',
  'sound',
  'maintenance',
]);

/**
 * @typedef {object} Capability one range of a channel's values
 * @property {number} from first DMX value, 0 to 255
 * @property {number} to last DMX value
 * @property {typeof CAPABILITY_TYPES[number]} type
 * @property {string} [label] its name, for example "Gobo 3" or "Strobe slow to fast"
 * @property {string} [color] `#rrggbb`, for a colour slot or preset
 * @property {boolean} [reverse] true when the level runs from `to` down to `from` (fast to slow, for example)
 */

/**
 * @param {Capability} capability
 * @returns {boolean} whether it is set with a level (a speed, a position) rather than picked as a whole
 */
export function isContinuous(capability) {
  return capability.to > capability.from && !STEPPED.has(capability.type);
}

/**
 * Where each channel type appears in the editors, and what it is called. Colour and brightness (red, green, blue and
 * the dimmer) are set by a block's colour and intensity, and fine channels go with their coarse channel, so they are
 * not controls of their own.
 * @type {Record<string, { group: string, label: string }>}
 */
const CONTROL_INFO = {
  white: { group: 'Colour', label: 'White' },
  'warm-white': { group: 'Colour', label: 'Warm white' },
  'cold-white': { group: 'Colour', label: 'Cold white' },
  amber: { group: 'Colour', label: 'Amber' },
  uv: { group: 'Colour', label: 'UV' },
  lime: { group: 'Colour', label: 'Lime' },
  indigo: { group: 'Colour', label: 'Indigo' },
  cyan: { group: 'Colour', label: 'Cyan' },
  magenta: { group: 'Colour', label: 'Magenta' },
  yellow: { group: 'Colour', label: 'Yellow' },
  'color-temperature': { group: 'Colour', label: 'Colour temperature' },
  'color-wheel': { group: 'Colour', label: 'Colour wheel' },
  'color-macro': { group: 'Colour', label: 'Colour macro' },
  strobe: { group: 'Shutter', label: 'Shutter and strobe' },
  pan: { group: 'Movement', label: 'Pan' },
  tilt: { group: 'Movement', label: 'Tilt' },
  'pan-tilt-speed': { group: 'Movement', label: 'Movement speed' },
  gobo: { group: 'Beam', label: 'Gobo' },
  'gobo-rotation': { group: 'Beam', label: 'Gobo rotation' },
  prism: { group: 'Beam', label: 'Prism' },
  'prism-rotation': { group: 'Beam', label: 'Prism rotation' },
  frost: { group: 'Beam', label: 'Frost' },
  iris: { group: 'Beam', label: 'Iris' },
  zoom: { group: 'Beam', label: 'Zoom' },
  focus: { group: 'Beam', label: 'Focus' },
  fog: { group: 'Atmosphere', label: 'Fog output' },
  'fog-type': { group: 'Atmosphere', label: 'Fog type' },
  fan: { group: 'Atmosphere', label: 'Fan' },
  effect: { group: 'Program', label: 'Program' },
  'effect-speed': { group: 'Program', label: 'Program speed' },
  'sound-sensitivity': { group: 'Program', label: 'Sound sensitivity' },
  rotation: { group: 'Other', label: 'Rotation' },
  speed: { group: 'Other', label: 'Speed' },
  maintenance: { group: 'Other', label: 'Maintenance' },
  other: { group: 'Other', label: '' },
};

/** The order groups are shown in. */
export const CONTROL_GROUPS = ['Colour', 'Shutter', 'Movement', 'Beam', 'Atmosphere', 'Program', 'Other'];

/** Channel types set by a block's colour and intensity, or by their coarse channel. */
const NOT_CONTROLS = new Set(['intensity', 'red', 'green', 'blue', 'pan-fine', 'tilt-fine']);

/**
 * @typedef {object} ControlOption one choice of a control with ranges
 * @property {string} label
 * @property {number} from
 * @property {number} to
 * @property {string} type a capability type
 * @property {boolean} continuous whether it also takes a level
 * @property {string} [color]
 * @property {boolean} [reverse]
 */

/**
 * @typedef {object} Control something a fixture can be set to do
 * @property {string} key the same for the same kind of thing on any fixture ("zoom", "gobo"), so one setting can apply
 *   to several fixtures; a channel of type "other" uses its name ("channel:Macro")
 * @property {string} group one of CONTROL_GROUPS
 * @property {string} label
 * @property {string} type the channel type
 * @property {'range' | 'choice'} kind a slider, or a list of choices
 * @property {number} channel absolute DMX channel
 * @property {number} [fineChannel] absolute DMX channel of its fine (16-bit) partner
 * @property {number} from for a range: first DMX value
 * @property {number} to for a range: last DMX value
 * @property {boolean} [reverse]
 * @property {ControlOption[]} options for a choice
 */

/** @typedef {number | { option: number, level: number }} ControlValue a level from 0 to 100, or a choice and its level */

const fullRange = { from: 0, to: 255 };

/**
 * The controls of one fixture.
 * @param {{ name: string, type: string, capabilities?: Capability[] }[]} channels the mode's channels, in order
 * @param {number} address its first DMX channel
 * @returns {Control[]}
 */
export function fixtureControls(channels, address) {
  /** @type {Control[]} */
  const controls = [];
  const seen = new Map();
  channels.forEach((channel, offset) => {
    if (NOT_CONTROLS.has(channel.type)) {
      return;
    }
    const info = CONTROL_INFO[channel.type] ?? CONTROL_INFO.other;
    const count = (seen.get(channel.type) ?? 0) + 1;
    seen.set(channel.type, count);
    // A second channel of a kind (two tilt motors) gets its own key and its own name.
    const key =
      channel.type === 'other' || channel.type === 'maintenance'
        ? `channel:${channel.name}`
        : count === 1
          ? channel.type
          : `${channel.type}:${count}`;
    const label = channel.type === 'other' || count > 1 || !info.label ? channel.name : info.label;
    const capabilities = (channel.capabilities ?? []).filter((capability) => capability.to >= capability.from);
    const isSingleRange =
      capabilities.length <= 1 &&
      (!capabilities[0] || isContinuous(capabilities[0]) || capabilities[0].type === 'none');
    const fineType = channel.type === 'pan' ? 'pan-fine' : channel.type === 'tilt' ? 'tilt-fine' : null;
    const fineOffset = fineType ? channels.findIndex((candidate) => candidate.type === fineType) : -1;
    const range = capabilities[0] && isContinuous(capabilities[0]) ? capabilities[0] : fullRange;
    controls.push({
      key,
      group: info.group,
      label,
      type: channel.type,
      kind: isSingleRange ? 'range' : 'choice',
      channel: address + offset,
      ...(fineOffset >= 0 && range.from === 0 && range.to === 255 ? { fineChannel: address + fineOffset } : {}),
      from: range.from,
      to: range.to,
      reverse: Boolean(capabilities[0]?.reverse) && isSingleRange,
      options: isSingleRange
        ? []
        : capabilities.map((capability) => ({
            label: capability.label || CAPABILITY_LABELS[capability.type] || 'Range',
            from: capability.from,
            to: capability.to,
            type: capability.type,
            continuous: isContinuous(capability),
            ...(capability.color ? { color: capability.color } : {}),
            ...(capability.reverse ? { reverse: true } : {}),
          })),
    });
  });
  return controls;
}

/**
 * @param {number} from
 * @param {number} to
 * @param {number} level 0 to 100
 * @param {boolean} [reverse]
 * @returns {number} a DMX value in the range
 */
function scale(from, to, level, reverse = false) {
  const share = Math.max(0, Math.min(100, level)) / 100;
  return Math.round(reverse ? to - (to - from) * share : from + (to - from) * share);
}

/**
 * What a control value sends.
 * @param {Control} control
 * @param {ControlValue} value
 * @returns {[number, number][]} pairs of absolute DMX channel and value (two for a 16-bit pan or tilt)
 */
export function controlDmx(control, value) {
  if (control.kind === 'range') {
    const level = typeof value === 'number' ? value : value.level;
    if (control.fineChannel) {
      const fine = Math.round((Math.max(0, Math.min(100, level)) / 100) * 65535);
      const both = control.reverse ? 65535 - fine : fine;
      return [
        [control.channel, Math.floor(both / 256)],
        [control.fineChannel, both % 256],
      ];
    }
    return [[control.channel, scale(control.from, control.to, level, control.reverse)]];
  }
  const choice = typeof value === 'number' ? { option: value, level: 0 } : value;
  const option = control.options[choice.option];
  if (!option) {
    return [];
  }
  const dmx = option.continuous
    ? scale(option.from, option.to, choice.level, option.reverse)
    : Math.round((option.from + option.to) / 2);
  return [[control.channel, dmx]];
}

/**
 * The value a control shows for what a channel is sending now, the reverse of controlDmx.
 * @param {Control} control
 * @param {number} dmx the channel's current value
 * @param {number} [fineDmx]
 * @returns {ControlValue}
 */
export function controlValueOf(control, dmx, fineDmx = 0) {
  if (control.kind === 'range') {
    if (control.fineChannel) {
      const both = dmx * 256 + fineDmx;
      return Math.round(((control.reverse ? 65535 - both : both) / 65535) * 1000) / 10;
    }
    const span = control.to - control.from;
    if (span <= 0) {
      return 0;
    }
    const share = (Math.max(control.from, Math.min(control.to, dmx)) - control.from) / span;
    return Math.round((control.reverse ? 1 - share : share) * 1000) / 10;
  }
  const index = control.options.findIndex((option) => dmx >= option.from && dmx <= option.to);
  const option = control.options[index];
  if (!option) {
    return { option: -1, level: 0 };
  }
  const span = option.to - option.from;
  const share = span > 0 ? (dmx - option.from) / span : 0;
  return { option: index, level: Math.round((option.reverse ? 1 - share : share) * 100) };
}

/**
 * Controls of the same kind on several fixtures, merged so one setting applies to all of them. A choice keeps the
 * options of the first fixture that has it.
 * @param {Control[][]} perFixture
 * @returns {Control[]} in group order
 */
export function mergeControls(perFixture) {
  const byKey = new Map();
  for (const controls of perFixture) {
    for (const control of controls) {
      if (!byKey.has(control.key)) {
        byKey.set(control.key, control);
      }
    }
  }
  return [...byKey.values()].sort((a, b) => CONTROL_GROUPS.indexOf(a.group) - CONTROL_GROUPS.indexOf(b.group));
}

/**
 * A choice option in another fixture's control with the same key: the one with the same label, or else the same
 * position. Lets "Gobo 3" picked on one fixture land on gobo 3 of another.
 * @param {Control} source the control the value was picked on
 * @param {Control} target
 * @param {number} option
 * @returns {number} an index into target.options, or -1
 */
export function matchOption(source, target, option) {
  const label = source.options[option]?.label;
  const byLabel = target.options.findIndex((candidate) => candidate.label === label);
  if (byLabel >= 0) {
    return byLabel;
  }
  return option < target.options.length ? option : -1;
}

/**
 * The colour slot nearest to a colour, for a fixture that makes colour with a wheel instead of red, green and blue.
 * @param {Control} control a colour wheel or macro control
 * @param {[number, number, number]} rgb
 * @returns {number} an index into control.options, or -1 when no slot has a known colour
 */
export function nearestColourOption(control, rgb) {
  let best = -1;
  let bestDistance = Infinity;
  control.options.forEach((option, index) => {
    if (!option.color) {
      return;
    }
    const value = Number.parseInt(option.color.slice(1), 16);
    const slot = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
    const distance = slot.reduce((sum, part, i) => sum + (part - rgb[i]) ** 2, 0);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

/**
 * The controls of every fixture in a show.
 * @param {{ fixtures: { id: string, typeId: string, mode: number, address: number }[] }} project
 * @param {Map<string, { modes: { channels: { name: string, type: string, capabilities?: Capability[] }[] }[] }>} typesById
 * @returns {Map<string, Control[]>} by fixture id
 */
export function controlsByFixture(project, typesById) {
  const byFixture = new Map();
  for (const fixture of project.fixtures) {
    const mode = typesById.get(fixture.typeId)?.modes[fixture.mode];
    byFixture.set(fixture.id, mode ? fixtureControls(mode.channels, fixture.address) : []);
  }
  return byFixture;
}
