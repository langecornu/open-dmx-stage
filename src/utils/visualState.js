// What each light is doing, read from the live DMX frame, for the visualizer: its colour and brightness, where a moving
// head points, how wide the beam is, whether it strobes (and how fast), whether a gobo or prism is in, and how much fog a
// smoke machine is putting out. The same frame drives the real lights, so the picture matches the stage. Pure, so the
// rules are easy to test; the drawing is in src/components/Visualizer.jsx.
import { controlValueOf } from '../../shared/capabilities.js';
import { fixtureColor } from './sceneColors.js';

/** Typical ranges of a moving head, used where the fixture does not say: pan 540°, tilt 270°. */
export const PAN_RANGE = 540;
export const TILT_RANGE = 270;

/**
 * @typedef {object} VisualState
 * @property {{ r: number, g: number, b: number }} color the beam's colour, 0 to 255, at full brightness
 * @property {number} intensity 0 to 1
 * @property {number | null} pan degrees from centre, or null for a light that does not move
 * @property {number | null} tilt degrees from pointing straight out (down when hung), or null
 * @property {number} spread the beam's half-angle in degrees
 * @property {number} strobeHz flashes a second from the light's own shutter, 0 when steady
 * @property {boolean} gobo a pattern is in the beam
 * @property {boolean} prism the beam is split
 * @property {number} fog 0 to 1, for a smoke machine or hazer
 * @property {{ r: number, g: number, b: number, level: number }[]} cells each colour cell (an LED bar's segments, a
 *   spider's bars, a blinder's lamps), colour at full brightness and level 0 to 1; one for a single-cell light
 * @property {number[]} tilts every tilt motor in degrees (a spider has one per bar)
 * @property {number} rotation 0 to 1, how fast a derby, laser or mirror ball turns
 * @property {number} fan 0 to 1, how fast a fan blows
 * @property {number} effect 0 to 1, how much a special effect (bubbles, confetti, sparks) is putting out
 */

/**
 * The colour cells of a light, in channel order: a new cell starts when a colour comes again (Red 1, Green 1, Blue 1,
 * then Red 2…). A light with no colour channels but several dimmers (a blinder) has a warm white cell per dimmer.
 * @param {{ start: number, end: number }} range
 * @param {import('../../shared/types.js').Patch} patch
 * @param {(channel: number) => number} valueOf
 * @returns {{ r: number, g: number, b: number, level: number }[]}
 */
export function colourCells(range, patch, valueOf) {
  /** @type {{ red?: number, green?: number, blue?: number, white?: number }[]} */
  const cells = [];
  /** @type {Record<string, number>} */
  let current = {};
  const dimmers = [];
  for (let channel = range.start; channel <= Math.min(range.end, 512); channel += 1) {
    const type = patch.channels.get(channel)?.type;
    if (type === 'red' || type === 'green' || type === 'blue' || type === 'white') {
      if (type in current) {
        cells.push(current);
        current = {};
      }
      current[type] = valueOf(channel);
    } else if (type === 'intensity') {
      dimmers.push(valueOf(channel) / 255);
    }
  }
  if (Object.keys(current).length > 0) {
    cells.push(current);
  }
  if (cells.length === 0) {
    // No colour: a lamp per dimmer, warm white.
    return dimmers.map((level) => ({ r: 255, g: 200, b: 140, level }));
  }
  const master = dimmers.length > 0 ? dimmers[0] : 1;
  return cells.map((cell) => {
    const white = cell.white ?? 0;
    const r = Math.min(255, (cell.red ?? 0) + white);
    const g = Math.min(255, (cell.green ?? 0) + white);
    const b = Math.min(255, (cell.blue ?? 0) + white);
    const peak = Math.max(r, g, b);
    return peak > 0
      ? { r: (r / peak) * 255, g: (g / peak) * 255, b: (b / peak) * 255, level: (peak / 255) * master }
      : { r: 255, g: 255, b: 255, level: 0 };
  });
}

/** Beam half-angles by device type: a par is a wide wash, a moving head a tighter beam. */
const SPREAD = {
  par: 14,
  wash: 14,
  'led-bar': 22,
  matrix: 20,
  blinder: 30,
  strobe: 35,
  spot: 7,
  'moving-head': 6,
  scanner: 5,
  'barrel-scanner': 5,
  laser: 1,
  dimmer: 18,
};

/** @param {{ key: string }[]} controls @param {string} key */
const find = (controls, key) => controls.find((control) => control.key === key);

/**
 * @param {import('../../shared/capabilities.js').Control} control
 * @param {(channel: number) => number} valueOf
 */
const read = (control, valueOf) =>
  controlValueOf(control, valueOf(control.channel), control.fineChannel ? valueOf(control.fineChannel) : 0);

/**
 * @param {{
 *   range: { start: number, end: number, missingType?: boolean } | undefined,
 *   patch: import('../../shared/types.js').Patch,
 *   controls: import('../../shared/capabilities.js').Control[],
 *   category: string,
 *   valueOf: (channel: number) => number,
 * }} input
 * @returns {VisualState}
 */
export function visualState({ range, patch, controls, category, valueOf }) {
  const dark = {
    color: { r: 0, g: 0, b: 0 },
    intensity: 0,
    pan: null,
    tilt: null,
    spread: SPREAD[category] ?? 12,
    strobeHz: 0,
    gobo: false,
    prism: false,
    fog: 0,
    cells: [],
    tilts: [],
    rotation: 0,
    fan: 0,
    effect: 0,
  };
  if (!range || range.missingType) {
    return dark;
  }

  // Colour and brightness: red, green, blue, white and the dimmer, as the small stage view reads them.
  const mixed = fixtureColor(range, patch, valueOf);
  let level = mixed.level;
  /** @type {{ r: number, g: number, b: number }} */
  let color = level > 0 ? { r: mixed.r / level, g: mixed.g / level, b: mixed.b / level } : { r: 255, g: 255, b: 255 };

  // A colour wheel colours the beam when the light has no red, green and blue of its own.
  const wheel = find(controls, 'color-wheel') ?? find(controls, 'color-macro');
  let hasRgb = false;
  for (let channel = range.start; channel <= range.end; channel += 1) {
    const type = patch.channels.get(channel)?.type;
    if (type === 'red' || type === 'green' || type === 'blue') {
      hasRgb = true;
    }
  }
  if (wheel && wheel.kind === 'choice' && !hasRgb) {
    const value = read(wheel, valueOf);
    const slot = typeof value === 'object' ? wheel.options[value.option] : undefined;
    if (slot?.color) {
      const hex = slot.color.replace('#', '');
      color = {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }

  // The shutter: closed is dark, a strobe range flashes from 1 to 20 times a second by its level.
  let strobeHz = 0;
  const shutter = find(controls, 'strobe');
  if (shutter) {
    const value = read(shutter, valueOf);
    if (shutter.kind === 'choice' && typeof value === 'object') {
      const option = shutter.options[value.option];
      if (option?.type === 'shutter-closed') {
        level = 0;
      } else if (option && (option.type === 'strobe' || option.type === 'shutter-effect')) {
        strobeHz = 1 + (value.level / 100) * 19;
      }
    } else if (typeof value === 'number' && value > 5) {
      // A plain strobe channel: low values are open, the rest a strobe from slow to fast.
      strobeHz = 1 + (value / 100) * 19;
    }
  }

  // Where a moving head points: the centre of the pan and tilt ranges is straight out.
  const pan = find(controls, 'pan');
  const tilt = find(controls, 'tilt');
  const panValue = pan ? read(pan, valueOf) : null;
  const tiltValue = tilt ? read(tilt, valueOf) : null;

  const zoom = find(controls, 'zoom');
  const zoomValue = zoom ? read(zoom, valueOf) : null;
  const baseSpread = SPREAD[category] ?? 12;

  const gobo = find(controls, 'gobo');
  const goboValue = gobo ? read(gobo, valueOf) : null;
  const prism = find(controls, 'prism');
  const prismValue = prism ? read(prism, valueOf) : null;

  // Fog: the fog output control, or the brightness of a smoke machine with only a dimmer-like channel.
  const fogControl = find(controls, 'fog');
  const fogValue = fogControl ? read(fogControl, valueOf) : null;
  const isFogger = category === 'smoke' || category === 'hazer';
  // A choice of off or fog: the fog range's level (or full, for a plain on), nothing for off.
  const fogFromChoice =
    fogControl && fogValue !== null && typeof fogValue === 'object'
      ? fogControl.options[fogValue.option]?.type === 'fog'
        ? fogControl.options[fogValue.option].continuous
          ? Math.max(0.1, fogValue.level / 100)
          : 1
        : 0
      : null;
  const fog = typeof fogValue === 'number' ? fogValue / 100 : (fogFromChoice ?? (isFogger ? level : 0));

  // Every tilt motor (a spider has two), and how fast a rotating effect turns.
  const tilts = controls
    .filter((control) => control.key === 'tilt' || control.key.startsWith('tilt:'))
    .map((control) => read(control, valueOf))
    .filter((value) => typeof value === 'number')
    .map((value) => (value / 100 - 0.5) * (category === 'spider' ? 135 : TILT_RANGE));
  const rotationControl = find(controls, 'rotation');
  const rotationValue = rotationControl ? read(rotationControl, valueOf) : null;
  const rotation =
    rotationValue === null
      ? category === 'mirror-ball'
        ? 0.3
        : 0
      : typeof rotationValue === 'number'
        ? rotationValue / 100
        : rotationValue.option > 0
          ? Math.max(0.05, rotationValue.level / 100)
          : 0;

  const fanControl = find(controls, 'fan');
  const fanValue = fanControl ? read(fanControl, valueOf) : null;
  const fan = typeof fanValue === 'number' ? fanValue / 100 : category === 'fan' ? level : 0;
  const effect = category === 'special-effect' ? level : 0;

  // Cells: closed shutters darken them all; a colour wheel light is one cell in the wheel's colour.
  let cells = colourCells(range, patch, valueOf);
  if (cells.length === 0 || (wheel && !hasRgb)) {
    cells = [{ ...color, level }];
  } else if (level === 0) {
    cells = cells.map((cell) => ({ ...cell, level: 0 }));
  }

  return {
    color,
    cells: isFogger || category === 'fan' || category === 'special-effect' ? [] : cells,
    tilts,
    rotation,
    fan: Math.max(0, Math.min(1, fan)),
    effect,
    intensity: isFogger || category === 'fan' || category === 'special-effect' ? 0 : level,
    pan: typeof panValue === 'number' ? (panValue / 100 - 0.5) * PAN_RANGE : null,
    tilt: typeof tiltValue === 'number' ? (tiltValue / 100 - 0.5) * TILT_RANGE : null,
    spread: typeof zoomValue === 'number' ? 3 + (zoomValue / 100) * 22 : baseSpread,
    strobeHz,
    gobo:
      goboValue !== null &&
      typeof goboValue === 'object' &&
      goboValue.option > 0 &&
      gobo?.options[goboValue.option]?.type !== 'none',
    prism: prismValue !== null && (typeof prismValue === 'number' ? prismValue > 10 : prismValue.option > 0),
    fog: Math.max(0, Math.min(1, fog)),
  };
}

/**
 * The direction a beam leaves its light, facing the front: x across (right positive), y up, z forward. The renderer then
 * turns it to face the dance floor from where the light is. A hung light points down; one standing points up. Pan turns
 * around the vertical, tilt away from it.
 * @param {VisualState} state
 * @param {boolean} hung true for a light on the truss
 * @returns {{ x: number, y: number, z: number }}
 */
export function beamDirection(state, hung) {
  const down = hung ? -1 : 1;
  if (state.pan === null && state.tilt === null) {
    // A fixed light: aimed a little toward the audience.
    return { x: 0, y: down * Math.cos(0.35), z: Math.sin(0.35) };
  }
  const pan = ((state.pan ?? 0) * Math.PI) / 180;
  const tilt = ((state.tilt ?? 0) * Math.PI) / 180;
  return {
    x: Math.sin(tilt) * Math.sin(pan),
    y: down * Math.cos(tilt),
    z: Math.sin(tilt) * Math.cos(pan),
  };
}
