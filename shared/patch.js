// Pure patch maths shared by the server and the browser: resolves fixtures to absolute DMX channels.

/** @typedef {import('./types.js').Project} Project */
/** @typedef {import('./types.js').FixtureType} FixtureType */
/** @typedef {import('./types.js').Patch} Patch */
/** @typedef {import('./types.js').FixtureRange} FixtureRange */
/** @typedef {import('./types.js').PatchChannel} PatchChannel */

export const DMX_CHANNELS = 512;

// Channel types that represent "how bright" a fixture is; the master and blackout act on these only.
export const LEVEL_TYPES = new Set(['intensity', 'red', 'green', 'blue', 'white', 'amber', 'uv']);

export const CHANNEL_TYPES = [
  'intensity',
  'red',
  'green',
  'blue',
  'white',
  'amber',
  'uv',
  'pan',
  'tilt',
  'strobe',
  'color-wheel',
  'gobo',
  'speed',
  'other',
];

/**
 * @param {Pick<Project, 'fixtureTypes'>} project
 * @param {FixtureType[]} builtinTypes the generic profiles shipped with the app
 * @returns {Map<string, FixtureType>} every known fixture type by id; the project's own override the built-in ones
 */
export function indexFixtureTypes(project, builtinTypes) {
  /** @type {Map<string, FixtureType>} */
  const byId = new Map();
  for (const type of builtinTypes) {
    byId.set(type.id, type);
  }
  for (const type of project.fixtureTypes) {
    byId.set(type.id, type);
  }
  return byId;
}

/**
 * Resolves every fixture to absolute DMX channels and flags problems (running past 512, overlapping, missing type).
 * @param {Pick<Project, 'fixtureTypes' | 'fixtures'>} project
 * @param {FixtureType[]} builtinTypes
 * @returns {Patch}
 */
export function buildPatch(project, builtinTypes) {
  const typesById = indexFixtureTypes(project, builtinTypes);
  /** @type {Map<number, PatchChannel>} */
  const channels = new Map();
  /** @type {FixtureRange[]} */
  const fixtures = [];

  for (const fixture of project.fixtures) {
    const type = typesById.get(fixture.typeId);
    const mode = type?.modes[fixture.mode];
    if (!mode) {
      fixtures.push({ id: fixture.id, start: fixture.address, end: fixture.address, missingType: true });
      continue;
    }
    const start = fixture.address;
    const end = start + mode.channels.length - 1;
    /** @type {FixtureRange & { overlaps: string[] }} */
    const entry = { id: fixture.id, start, end, outOfRange: end > DMX_CHANNELS, overlaps: [] };
    mode.channels.forEach((channel, offset) => {
      const absolute = start + offset;
      if (absolute > DMX_CHANNELS) {
        return;
      }
      const existing = channels.get(absolute);
      if (existing) {
        entry.overlaps.push(existing.fixtureId);
      }
      channels.set(absolute, {
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        channelName: channel.name,
        type: channel.type,
        defaultValue: channel.defaultValue,
        offset,
      });
    });
    fixtures.push(entry);
  }

  return { channels, fixtures };
}

/**
 * @param {Patch} patch
 * @returns {Set<number>} the channels that master and blackout scale (brightness and colour, not position)
 */
export function levelChannelsOf(patch) {
  /** @type {Set<number>} */
  const levels = new Set();
  for (const [channel, info] of patch.channels) {
    if (LEVEL_TYPES.has(info.type)) {
      levels.add(channel);
    }
  }
  return levels;
}

/**
 * @typedef {object} FixtureChannels
 * @property {number} [red] absolute DMX channel of the red channel, when the fixture has one
 * @property {number} [green]
 * @property {number} [blue]
 * @property {number[]} levels every brightness channel (see LEVEL_TYPES) of the fixture
 * @property {number[]} dimmers its intensity (dimmer) channels, which a timeline sets apart from the colour
 */

/**
 * Groups the patch by fixture, in rig order, so effects can reach a fixture's colour and brightness channels.
 * @param {Patch} patch
 * @returns {Map<string, FixtureChannels>}
 */
export function channelsByFixture(patch) {
  /** @type {Map<string, FixtureChannels>} */
  const byFixture = new Map();
  for (const [channel, info] of patch.channels) {
    const entry = byFixture.get(info.fixtureId) ?? { levels: [], dimmers: [] };
    if (info.type === 'red' || info.type === 'green' || info.type === 'blue') {
      entry[info.type] = channel;
    }
    if (LEVEL_TYPES.has(info.type)) {
      entry.levels.push(channel);
    }
    if (info.type === 'intensity') {
      entry.dimmers.push(channel);
    }
    byFixture.set(info.fixtureId, entry);
  }
  return byFixture;
}

/**
 * The value each patched channel sits at when nothing sets it (a pan or tilt at the centre, a dimmer open). Channels that
 * rest at 0 are left out, since 0 is what an unset channel already is.
 * @param {Patch} patch
 * @returns {Map<number, number>} resting value by 1-based channel, for channels that rest above 0
 */
export function restingValuesOf(patch) {
  /** @type {Map<number, number>} */
  const resting = new Map();
  for (const [channel, info] of patch.channels) {
    if (info.defaultValue > 0) {
      resting.set(channel, info.defaultValue);
    }
  }
  return resting;
}
