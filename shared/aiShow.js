// AI show generation, the parts that do not talk to the AI: what the active venue's lights can do (to offer only the
// toggles that matter), the description of the rig and the person's choices that the AI works from, and turning the AI's
// answer (looks and sequences described by light, colour and named settings) into real looks and sequences on this
// rig's DMX channels. Everything the AI says is checked and clamped here: unknown lights, settings and options are left
// out, numbers are kept in range, so a mistake can never produce an invalid show. Pure, so the rules are easy to test.
import { controlsByFixture } from './capabilities.js';
import { categoryOf } from './categories.js';
import { buildPatch, channelsByFixture, indexFixtureTypes } from './patch.js';
import { RIG_SHAPE_LABELS, describePlace, mountsOf, positionOf, railsOf, rigOrDefault } from './stageRig.js';
import { MAX_SEQUENCE_UNITS, MIN_BLOCK_BEATS, blockWrites } from './timeline.js';

/** How strongly the person wants something: left to the AI, more of it, less of it, or none. */
export const AMOUNTS = /** @type {const} */ (['auto', 'more', 'less', 'off']);

/** How a chosen colour should be used. */
export const COLOUR_AMOUNTS = /** @type {const} */ (['more', 'less', 'avoid']);

export const MAX_AI_LOOKS = 16;
export const MAX_AI_SEQUENCES = 4;
export const MAX_AI_BLOCKS = 600;

/**
 * Things a rig may be able to do beyond colour and brightness, each offered as a toggle only when a light in the
 * active venue can do it. `controls` are control keys (or key prefixes ending in `*`); `categories` are device types.
 * @type {{ id: string, label: string, hint: string, controls: string[], categories?: string[] }[]}
 */
export const AI_FEATURES = [
  { id: 'strobe', label: 'Strobe', hint: 'Flashing lights, for drops and peaks', controls: [] },
  { id: 'movement', label: 'Movement', hint: 'Pan and tilt sweeps on moving heads', controls: ['pan', 'tilt'] },
  { id: 'colour-wheel', label: 'Colour wheel', hint: 'Colour wheel slots and spins', controls: ['color-wheel'] },
  {
    id: 'gobos',
    label: 'Gobos',
    hint: 'Patterns in the beam, and their rotation',
    controls: ['gobo', 'gobo-rotation'],
  },
  { id: 'prism', label: 'Prism', hint: 'Split beams', controls: ['prism', 'prism-rotation'] },
  {
    id: 'beam',
    label: 'Beam shape',
    hint: 'Zoom, focus, frost and iris',
    controls: ['zoom', 'focus', 'frost', 'iris'],
  },
  {
    id: 'atmosphere',
    label: 'Smoke and haze',
    hint: 'Bursts of fog or a steady haze',
    controls: ['fog', 'fog-type', 'fan'],
    categories: ['smoke', 'hazer'],
  },
  {
    id: 'programs',
    label: 'Built-in programs',
    hint: "The lights' own effects and patterns",
    controls: ['effect', 'effect-speed'],
    categories: ['laser', 'effect', 'flower'],
  },
];

/**
 * @param {import('./types.js').Project} project
 * @param {import('./types.js').FixtureType[]} builtinTypes
 */
function rigOf(project, builtinTypes) {
  const typesById = indexFixtureTypes(project, builtinTypes);
  const patch = buildPatch(project, builtinTypes);
  return {
    typesById,
    patch,
    channels: channelsByFixture(patch),
    controls: controlsByFixture(project, typesById),
  };
}

/**
 * The features the active venue's lights have, with the lights that have each.
 * @param {import('./types.js').Project} project
 * @param {import('./types.js').FixtureType[]} builtinTypes
 * @returns {{ id: string, label: string, hint: string, lights: string[] }[]}
 */
export function venueFeatures(project, builtinTypes) {
  const { typesById, controls } = rigOf(project, builtinTypes);
  return AI_FEATURES.map((feature) => ({
    id: feature.id,
    label: feature.label,
    hint: feature.hint,
    lights: project.fixtures
      .filter((fixture) => {
        if (feature.id === 'strobe') {
          return true; // any light can flash
        }
        const keys = (controls.get(fixture.id) ?? []).map((control) => control.key.split(':')[0]);
        const category = categoryOf(fixture, typesById.get(fixture.typeId));
        return feature.controls.some((key) => keys.includes(key)) || (feature.categories ?? []).includes(category);
      })
      .map((fixture) => fixture.name),
  })).filter((feature) => feature.lights.length > 0);
}

/**
 * The rig as the AI sees it: each light with its type, how it makes colour, and every control with its choices.
 * @param {import('./types.js').Project} project
 * @param {import('./types.js').FixtureType[]} builtinTypes
 */
export function describeRig(project, builtinTypes) {
  const { typesById, channels, controls } = rigOf(project, builtinTypes);
  const stage = describeStage(project, (fixture) => categoryOf(fixture, typesById.get(fixture.typeId)));
  return {
    venue: project.venue?.name ?? 'My venue',
    stage: stage.layout,
    lights: project.fixtures.map((fixture) => {
      const type = typesById.get(fixture.typeId);
      const own = channels.get(fixture.id);
      const hasRgb = own?.red !== undefined && own?.green !== undefined && own?.blue !== undefined;
      const lightControls = controls.get(fixture.id) ?? [];
      return {
        lightId: fixture.id,
        name: fixture.name,
        type: categoryOf(fixture, type),
        place: stage.places.get(fixture.id),
        fixture: type ? `${type.manufacturer} ${type.name}`.trim() : 'Unknown fixture',
        colour: hasRgb
          ? 'mixes any colour (red, green, blue)'
          : lightControls.some((control) => control.key === 'color-wheel')
            ? 'colour wheel only: the nearest slot is used for the colour you give'
            : 'no colour: only its brightness follows the colour you give',
        dimmer: (own?.dimmers ?? []).length > 0,
        controls: lightControls
          .filter((control) => !control.key.startsWith('channel:'))
          .map((control) => ({
            control: control.key,
            label: control.label,
            group: control.group,
            ...(control.kind === 'range'
              ? { kind: 'level 0 to 100' }
              : {
                  kind: 'choice',
                  options: control.options.map(
                    (option) => `${option.label}${option.continuous ? ' (takes a level 0 to 100)' : ''}`,
                  ),
                }),
          })),
      };
    }),
    groups: project.groups.map((group) => ({
      name: group.name,
      lightIds: group.fixtureIds,
    })),
  };
}

/** @param {number} value metres, to the nearest 10 cm */
const metres = (value) => Math.round(value * 10) / 10;

/**
 * Where the lights are, for the AI: the truss and its size, each light's place in words and in metres (left and right
 * as the audience sees the stage), the lights on each rail in order, what each rail faces across the floor, and the
 * pairs of lights that mirror each other. So it can run chases across the rig in order, keep symmetry, and cross beams.
 * @param {import('./types.js').Project} project
 * @param {(fixture: import('./types.js').Fixture) => string} categoryFn
 */
export function describeStage(project, categoryFn) {
  const rig = rigOrDefault(project.rig);
  const mounts = mountsOf(project.fixtures, categoryFn, rig);
  const rails = railsOf(rig);
  /** @type {Map<string, { where: string, x: number, y: number, z: number, aim: string }>} */
  const places = new Map();
  /** @type {Map<string, { x: number, y: number, z: number }>} */
  const points = new Map();
  for (const fixture of project.fixtures) {
    const mount = /** @type {import('./stageRig.js').Mount} */ (mounts.get(fixture.id));
    const position = positionOf(rig, mount);
    points.set(fixture.id, position);
    places.set(fixture.id, {
      where: describePlace(rig, mount),
      x: metres(position.x),
      y: metres(position.y),
      z: metres(position.z),
      aim: position.hung
        ? 'hangs from the truss, pointing down at the floor'
        : position.rail === 'floor'
          ? 'stands on the floor, facing the middle'
          : 'on an upright, facing the middle',
    });
  }
  const opposite = /** @type {Record<string, string>} */ ({
    back: 'front',
    front: 'back',
    left: 'right',
    right: 'left',
  });
  const rows = [...rails, { id: 'floor', label: 'The floor', vertical: false }]
    .map((rail) => {
      const on = project.fixtures.filter((fixture) => (mounts.get(fixture.id)?.rail ?? 'floor') === rail.id);
      const across = rail.id === 'back' || rail.id === 'front' || rail.id === 'floor';
      const key = (/** @type {{ id: string }} */ fixture) => {
        const point = /** @type {{ x: number, y: number, z: number }} */ (points.get(fixture.id));
        return rail.vertical ? point.y : across ? point.x : point.z;
      };
      const facing = rails.find((candidate) => candidate.id === opposite[rail.id]);
      return {
        rail: rail.label,
        order: rail.vertical ? 'bottom to top' : across ? 'left to right' : 'back to front',
        lightIds: on.sort((a, b) => key(a) - key(b)).map((fixture) => fixture.id),
        ...(facing ? { facesAcrossTheFloor: facing.label } : {}),
      };
    })
    .filter((row) => row.lightIds.length > 0);
  // Mirror pairs: the same kind of light at the same depth and height, on opposite sides of the middle.
  const tolerance = Math.max(0.4, rig.width * 0.06);
  /** @type {[string, string][]} */
  const mirrorPairs = [];
  const paired = new Set();
  for (const fixture of project.fixtures) {
    const a = /** @type {{ x: number, y: number, z: number }} */ (points.get(fixture.id));
    if (paired.has(fixture.id) || Math.abs(a.x) < tolerance) {
      continue;
    }
    const twin = project.fixtures.find((other) => {
      const b = /** @type {{ x: number, y: number, z: number }} */ (points.get(other.id));
      return (
        other.id !== fixture.id &&
        !paired.has(other.id) &&
        categoryFn(other) === categoryFn(fixture) &&
        Math.abs(a.x + b.x) < tolerance &&
        Math.abs(a.y - b.y) < tolerance &&
        Math.abs(a.z - b.z) < tolerance
      );
    });
    if (twin) {
      paired.add(fixture.id).add(twin.id);
      mirrorPairs.push(a.x < 0 ? [fixture.id, twin.id] : [twin.id, fixture.id]);
    }
  }
  return {
    places,
    layout: {
      truss: RIG_SHAPE_LABELS[rig.shape],
      size: `${rig.width} m wide, ${rig.depth} m deep, ${rig.height} m high`,
      axes: 'In metres from the middle of the dance floor: x is left (negative) to right (positive) as the audience sees the stage, y is the height above the floor, z is the back (negative) to the front, where the audience is (positive).',
      rows,
      mirrorPairs,
    },
  };
}

/** @param {unknown} value @param {number} low @param {number} high @param {number} fallback */
const clamp = (value, low, high, fallback) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;

/** @param {unknown} value @param {string} fallback */
const hex = (value, fallback = '#ffffff') =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;

/** @param {unknown} value @param {string} fallback */
const label = (value, fallback) => {
  const text = typeof value === 'string' ? value.trim().slice(0, 80) : '';
  return text || fallback;
};

/** Quarter beats, the finest the editor shows. @param {number} value */
const quarter = (value) => Math.round(value * 4) / 4;

/**
 * The AI's settings for a light, as the control values a block or look takes: known controls only, an option chosen by
 * its label, levels from 0 to 100.
 * @param {{ control: string, option?: string | null, level?: number }[] | undefined} settings
 * @param {import('./capabilities.js').Control[]} controls the light's controls
 * @returns {Record<string, import('./capabilities.js').ControlValue>}
 */
export function settingsFor(settings, controls) {
  /** @type {Record<string, import('./capabilities.js').ControlValue>} */
  const values = {};
  for (const setting of settings ?? []) {
    const control = controls.find((candidate) => candidate.key === setting.control);
    if (!control) {
      continue;
    }
    const level = Math.round(clamp(setting.level, 0, 100, 50));
    if (control.kind === 'range') {
      values[control.key] = level;
      continue;
    }
    const wanted = String(setting.option ?? '')
      .trim()
      .toLowerCase();
    /** @param {string} text */
    const strip = (text) => text.toLowerCase().replace(/\s*\(takes a level.*\)$/, '');
    let option = control.options.findIndex((candidate) => strip(candidate.label) === strip(wanted));
    if (option < 0 && wanted) {
      option = control.options.findIndex((candidate) => strip(candidate.label).includes(strip(wanted)));
    }
    if (option >= 0 && Object.keys(values).length < 64) {
      values[control.key] = { option, level };
    }
  }
  return values;
}

/**
 * Turns the AI's answer into looks and sequences for this rig.
 * @param {any} generated the AI's answer, already parsed from JSON
 * @param {import('./types.js').Project} project
 * @param {import('./types.js').FixtureType[]} builtinTypes
 * @param {{ makeId: () => string, tempo?: number | null }} options `tempo`: a song's, for a sequence made for it
 * @returns {{ summary: string, looks: import('./types.js').Scene[], sequences: import('./types.js').Chase[] }}
 */
export function buildGeneratedShow(generated, project, builtinTypes, { makeId, tempo = null }) {
  const { channels, controls } = rigOf(project, builtinTypes);
  const lights = new Set(project.fixtures.map((fixture) => fixture.id));
  const takenLooks = new Set(project.scenes.map((scene) => scene.name));
  const takenSequences = new Set(project.chases.map((chase) => chase.name));
  /** @param {string} name @param {Set<string>} taken */
  const unique = (name, taken) => {
    let candidate = name;
    for (let number = 2; taken.has(candidate); number += 1) {
      candidate = `${name.slice(0, 74)} ${number}`;
    }
    taken.add(candidate);
    return candidate;
  };

  /** @type {Map<string, string>} the AI's look name to the new look's id */
  const lookIds = new Map();
  const looks = /** @type {any[]} */ (Array.isArray(generated?.looks) ? generated.looks : [])
    .slice(0, MAX_AI_LOOKS)
    .map((look, index) => {
      /** @type {Record<string, number>} */
      const values = {};
      for (const light of Array.isArray(look?.lights) ? look.lights : []) {
        if (!lights.has(light?.lightId)) {
          continue;
        }
        const own = channels.get(light.lightId);
        const lightControls = controls.get(light.lightId) ?? [];
        if (!own) {
          continue;
        }
        const color = hex(light.color, '#000000');
        const intensity = Math.round(clamp(light.intensity, 0, 100, 100));
        const still = {
          id: 'still',
          fixtureId: light.lightId,
          start: 0,
          length: 1,
          color,
          intensity,
          transition: /** @type {const} */ ('none'),
          endColor: color,
          endIntensity: intensity,
          effect: /** @type {const} */ ('none'),
          strobeSpeed: 50,
          settings: settingsFor(light.settings, lightControls),
        };
        for (const [channel, value] of blockWrites(still, 0, 0, own, lightControls)) {
          if (channel >= 1 && channel <= 512) {
            values[channel] = Math.max(0, Math.min(255, Math.round(value)));
          }
        }
      }
      const name = unique(label(look?.name, `AI look ${index + 1}`), takenLooks);
      const id = makeId();
      lookIds.set(String(look?.name ?? ''), id);
      return { id, name, values, origin: /** @type {const} */ ('ai') };
    });

  let blockBudget = MAX_AI_BLOCKS;
  const sequences = /** @type {any[]} */ (Array.isArray(generated?.sequences) ? generated.sequences : [])
    .slice(0, MAX_AI_SEQUENCES)
    .map((sequence, index) => {
      const steps = /** @type {any[]} */ (Array.isArray(sequence?.steps) ? sequence.steps : [])
        .filter((step) => lookIds.has(String(step?.look ?? '')))
        .slice(0, 200)
        .map((step) => {
          const fadeBeats = quarter(clamp(step.fadeBeats, 0, 64, 0));
          const holdBeats = quarter(clamp(step.holdBeats, 0, 64, 4));
          return {
            id: makeId(),
            sceneId: /** @type {string} */ (lookIds.get(String(step.look))),
            fadeBeats,
            holdBeats,
            // The same timing in seconds at 120 beats a minute, for when the sequence is switched to seconds.
            fadeMs: Math.round(fadeBeats * 500),
            holdMs: Math.round(holdBeats * 500),
          };
        });
      const length = quarter(clamp(sequence?.lengthBeats, 0, MAX_SEQUENCE_UNITS, 0));
      const blocks = [];
      for (const block of Array.isArray(sequence?.blocks) ? sequence.blocks : []) {
        if (blockBudget <= 0 || !lights.has(block?.lightId)) {
          continue;
        }
        const start = quarter(clamp(block.startBeat, 0, MAX_SEQUENCE_UNITS - MIN_BLOCK_BEATS, 0));
        const blockLength = Math.max(
          MIN_BLOCK_BEATS,
          quarter(clamp(block.lengthBeats, MIN_BLOCK_BEATS, MAX_SEQUENCE_UNITS - start, 4)),
        );
        const lightControls = controls.get(block.lightId) ?? [];
        const color = hex(block.color);
        const intensity = Math.round(clamp(block.intensity, 0, 100, 100));
        const fade = block.fadeTo && typeof block.fadeTo === 'object' ? block.fadeTo : null;
        const strobe = typeof block.strobe === 'number' ? Math.round(clamp(block.strobe, 0, 100, 50)) : null;
        const settings = settingsFor(block.settings, lightControls);
        const endSettings = fade ? settingsFor(block.endSettings, lightControls) : {};
        blocks.push({
          id: makeId(),
          fixtureId: block.lightId,
          start,
          length: blockLength,
          color,
          intensity,
          transition: /** @type {'fade' | 'none'} */ (fade ? 'fade' : 'none'),
          endColor: fade ? hex(fade.color, color) : color,
          endIntensity: fade ? Math.round(clamp(fade.intensity, 0, 100, intensity)) : intensity,
          effect: /** @type {'none' | 'strobe'} */ (strobe === null ? 'none' : 'strobe'),
          strobeSpeed: strobe ?? 50,
          ...(Object.keys(settings).length > 0 ? { settings } : {}),
          ...(Object.keys(endSettings).length > 0 ? { endSettings } : {}),
        });
        blockBudget -= 1;
      }
      return {
        id: makeId(),
        name: unique(label(sequence?.name, `AI sequence ${index + 1}`), takenSequences),
        loop: tempo ? false : sequence?.loop !== false,
        timing: /** @type {const} */ ('beats'),
        steps,
        blocks,
        ...(length > 0 ? { length } : {}),
        ...(tempo ? { tempo: Math.round(tempo * 10) / 10 } : {}),
        origin: /** @type {const} */ ('ai'),
      };
    })
    .filter((sequence) => sequence.steps.length > 0 || sequence.blocks.length > 0);

  return {
    summary: typeof generated?.summary === 'string' ? generated.summary.slice(0, 2000) : '',
    looks,
    sequences,
  };
}
