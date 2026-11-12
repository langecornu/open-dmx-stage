// Open Fixture Library capabilities, turned into the app's own (shared/capabilities.js). OFL describes what every range
// of a channel's values does (docs/capability-types.md in its repository); this keeps those ranges, their names and
// colours, and works out what the channel is overall. Input is untrusted JSON, so every field is checked.

/** OFL colour names of ColorIntensity, to channel types. @type {Record<string, string>} */
const COLOUR_CHANNELS = {
  red: 'red',
  green: 'green',
  blue: 'blue',
  white: 'white',
  'warm white': 'warm-white',
  'cold white': 'cold-white',
  amber: 'amber',
  uv: 'uv',
  lime: 'lime',
  indigo: 'indigo',
  cyan: 'cyan',
  magenta: 'magenta',
  yellow: 'yellow',
};

/** Keyword values of OFL entities, as numbers, so a range can be told to run high to low. @type {Record<string, number>} */
const KEYWORDS = {
  'fast reverse': -100,
  'slow reverse': -1,
  stop: 0,
  slow: 1,
  fast: 100,
  'fast ccw': -100,
  'slow ccw': -1,
  'slow cw': 1,
  'fast cw': 100,
  instant: 0,
  short: 1,
  long: 100,
  near: 1,
  far: 100,
  off: 0,
  dark: 1,
  bright: 100,
  closed: 0,
  narrow: 1,
  wide: 100,
  weak: 1,
  strong: 100,
  low: 1,
  high: 100,
  small: 1,
  big: 100,
  out: 0,
  in: 100,
  open: 100,
  left: -100,
  center: 0,
  right: 100,
  top: -100,
  bottom: 100,
};

/** @param {unknown} value an OFL entity: a keyword, "50%", "10Hz", "90deg" or a number @returns {number | null} */
function entityNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const keyword = KEYWORDS[value.trim().toLowerCase()];
  if (keyword !== undefined) {
    return keyword;
  }
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Whether a capability's level runs from high to low (for example a speed from fast to slow): any entity whose start is
 * above its end.
 * @param {Record<string, any>} capability
 * @returns {boolean}
 */
function runsDown(capability) {
  for (const [key, start] of Object.entries(capability)) {
    if (!key.endsWith('Start')) {
      continue;
    }
    const a = entityNumber(start);
    const b = entityNumber(capability[`${key.slice(0, -5)}End`]);
    if (a !== null && b !== null && a !== b) {
      return a > b;
    }
  }
  return false;
}

const text = (/** @type {unknown} */ value, max = 80) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const isHex = (/** @type {unknown} */ value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

/**
 * @param {Record<string, any>} capability an OFL WheelSlot capability
 * @param {string} channelName
 * @param {Record<string, any>} wheels the fixture's `wheels`
 * @returns {Record<string, any> | null} the slot it points to
 */
function wheelSlot(capability, channelName, wheels) {
  const wheel = wheels?.[typeof capability.wheel === 'string' ? capability.wheel : channelName];
  const number = Number(capability.slotNumber);
  if (!Array.isArray(wheel?.slots) || !Number.isFinite(number)) {
    return null;
  }
  return wheel.slots[Math.floor(number) - 1] ?? null;
}

/**
 * One OFL capability as the app's: its type, name, colour and direction.
 * @param {Record<string, any>} capability
 * @param {string} channelName
 * @param {Record<string, any>} wheels
 * @returns {{ type: string, label: string, color?: string, reverse?: boolean }}
 */
function convertOne(capability, channelName, wheels) {
  const type = text(capability.type, 40);
  const comment = text(capability.comment);
  const reverse = runsDown(capability) || undefined;
  const named = (/** @type {string} */ appType, /** @type {string} */ fallback, extra = {}) => ({
    type: appType,
    label: comment || fallback,
    ...extra,
    ...(reverse ? { reverse } : {}),
  });
  switch (type) {
    case 'NoFunction':
      return named('none', 'No function');
    case 'ShutterStrobe': {
      const effect = text(capability.shutterEffect, 40);
      if (effect === 'Open') {
        return named('shutter-open', 'Open');
      }
      if (effect === 'Closed') {
        return named('shutter-closed', 'Closed');
      }
      return named(effect === 'Strobe' ? 'strobe' : 'shutter-effect', effect || 'Strobe');
    }
    case 'StrobeSpeed':
      return named('strobe', 'Strobe speed');
    case 'Intensity':
      return named('intensity', 'Intensity');
    case 'ColorIntensity':
      return named('color', text(capability.color) || 'Colour');
    case 'ColorPreset': {
      const colour = Array.isArray(capability.colors) ? capability.colors.find(isHex) : undefined;
      return named('color-preset', 'Colour preset', colour ? { color: colour.toLowerCase() } : {});
    }
    case 'ColorTemperature':
      return named('color-temperature', 'Colour temperature');
    case 'Pan':
    case 'PanContinuous':
      return named('pan', 'Pan');
    case 'Tilt':
    case 'TiltContinuous':
      return named('tilt', 'Tilt');
    case 'PanTiltSpeed':
      return named('pan-tilt-speed', 'Movement speed');
    case 'WheelSlot': {
      const slot = wheelSlot(capability, channelName, wheels);
      const slotType = text(slot?.type, 20);
      const slotName = text(slot?.name) || slotType || `Slot ${capability.slotNumber}`;
      if (slotType === 'Color') {
        const colour = Array.isArray(slot?.colors) ? slot.colors.find(isHex) : undefined;
        return named('color-slot', slotName, colour ? { color: colour.toLowerCase() } : {});
      }
      if (slotType === 'Open' && /colou?r/i.test(channelName)) {
        return named('color-slot', 'Open (white)', { color: '#ffffff' });
      }
      return named('gobo-slot', slotName);
    }
    case 'WheelShake':
      return named('gobo-shake', 'Shake');
    case 'WheelSlotRotation':
    case 'WheelRotation':
      return named('wheel-rotation', 'Rotation');
    case 'Effect':
      return named('effect', text(capability.effectName) || text(capability.effectPreset) || 'Effect');
    case 'EffectSpeed':
      return named('effect-speed', 'Program speed');
    case 'SoundSensitivity':
      return named('generic', 'Sound sensitivity');
    case 'BeamAngle':
    case 'Zoom':
      return named('zoom', 'Zoom');
    case 'Focus':
      return named('focus', 'Focus');
    case 'Iris':
    case 'IrisEffect':
      return named('iris', text(capability.effectName) || 'Iris');
    case 'Frost':
    case 'FrostEffect':
      return named('frost', text(capability.effectName) || 'Frost');
    case 'Prism':
      return named('prism', 'Prism');
    case 'PrismRotation':
      return named('prism-rotation', 'Prism rotation');
    case 'Fog':
    case 'FogOutput':
      return named('fog', text(capability.fogType) || 'Fog output');
    case 'FogType':
      return named('fog-type', text(capability.fogType) || 'Fog type');
    case 'Rotation':
      return named('rotation', 'Rotation');
    case 'Speed':
      return named(/fan/i.test(channelName) ? 'fan' : 'speed', 'Speed');
    case 'Maintenance':
      return named('maintenance', 'Maintenance');
    default:
      return named('generic', type || 'Level');
  }
}

/**
 * @param {Record<string, any> | undefined} definition an OFL channel definition
 * @returns {Record<string, any>[]} its capabilities, single or listed
 */
function rawCapabilities(definition) {
  if (Array.isArray(definition?.capabilities)) {
    return definition.capabilities.filter((capability) => capability && typeof capability === 'object');
  }
  return definition?.capability && typeof definition.capability === 'object' ? [definition.capability] : [];
}

/**
 * The value ranges of an OFL channel, as the app's capabilities. A channel with one capability over its whole range
 * needs no list, so it gets none.
 * @param {Record<string, any> | undefined} definition
 * @param {string} channelName
 * @param {Record<string, any>} wheels the fixture's `wheels`
 * @returns {import('../../shared/capabilities.js').Capability[]}
 */
export function convertCapabilities(definition, channelName, wheels) {
  const raw = rawCapabilities(definition);
  if (raw.length <= 1) {
    return [];
  }
  const converted = raw.slice(0, 64).flatMap((capability) => {
    const range = Array.isArray(capability.dmxRange) ? capability.dmxRange.map(Number) : [];
    // Only 8-bit ranges: a 16-bit range belongs to a coarse and fine pair, which is set as one level instead.
    if (range.length !== 2 || !range.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
      return [];
    }
    const [from, to] = range[0] <= range[1] ? range : [range[1], range[0]];
    const one = convertOne(capability, channelName, wheels);
    return [{ from, to, ...one, label: one.label.slice(0, 80) }];
  });
  return /** @type {import('../../shared/capabilities.js').Capability[]} */ (converted);
}

/** What a channel is overall, from the capability that matters most in it. @type {Record<string, string>} */
const CHANNEL_BY_CAPABILITY = {
  Intensity: 'intensity',
  ColorTemperature: 'color-temperature',
  ColorPreset: 'color-macro',
  Pan: 'pan',
  PanContinuous: 'pan',
  Tilt: 'tilt',
  TiltContinuous: 'tilt',
  PanTiltSpeed: 'pan-tilt-speed',
  ShutterStrobe: 'strobe',
  StrobeSpeed: 'strobe',
  StrobeDuration: 'strobe',
  WheelShake: 'gobo',
  Prism: 'prism',
  PrismRotation: 'prism-rotation',
  Frost: 'frost',
  FrostEffect: 'frost',
  Iris: 'iris',
  IrisEffect: 'iris',
  Zoom: 'zoom',
  BeamAngle: 'zoom',
  Focus: 'focus',
  Fog: 'fog',
  FogOutput: 'fog',
  FogType: 'fog-type',
  Effect: 'effect',
  EffectSpeed: 'effect-speed',
  EffectDuration: 'effect-speed',
  EffectParameter: 'effect',
  SoundSensitivity: 'sound-sensitivity',
  Rotation: 'rotation',
  Maintenance: 'maintenance',
};

/**
 * What an OFL channel is, as one of CHANNEL_TYPES.
 * @param {string} name
 * @param {Record<string, any> | undefined} definition
 * @param {Record<string, any>} [wheels]
 * @returns {string}
 */
export function classifyOflChannel(name, definition, wheels = {}) {
  const capabilities = rawCapabilities(definition);
  const main = capabilities.find((capability) => capability.type !== 'NoFunction') ?? capabilities[0];
  const type = typeof main?.type === 'string' ? main.type : '';
  if (type === 'ColorIntensity') {
    return COLOUR_CHANNELS[String(main.color ?? '').toLowerCase()] ?? 'other';
  }
  if (type === 'WheelSlot') {
    const slots = capabilities.map((capability) => text(wheelSlot(capability, name, wheels)?.type, 20)).filter(Boolean);
    if (slots.includes('Color') || (slots.length === 0 && /colou?r/i.test(name))) {
      return 'color-wheel';
    }
    return 'gobo';
  }
  if (type === 'WheelRotation' || type === 'WheelSlotRotation') {
    return /gobo/i.test(name) ? 'gobo-rotation' : 'rotation';
  }
  if (type === 'Speed') {
    return /fan/i.test(name) ? 'fan' : 'speed';
  }
  return CHANNEL_BY_CAPABILITY[type] ?? 'other';
}
