// Pure patch maths shared by the server and the browser: resolves fixtures to absolute DMX channels.

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

export function indexFixtureTypes(project, builtinTypes) {
  const byId = new Map();
  for (const type of builtinTypes) {
    byId.set(type.id, type);
  }
  for (const type of project.fixtureTypes) {
    byId.set(type.id, type);
  }
  return byId;
}

// Returns { channels: Map<number, info>, fixtures: [{ id, start, end, outOfRange, overlaps }] }.
export function buildPatch(project, builtinTypes) {
  const typesById = indexFixtureTypes(project, builtinTypes);
  const channels = new Map();
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

export function levelChannelsOf(patch) {
  const levels = new Set();
  for (const [channel, info] of patch.channels) {
    if (LEVEL_TYPES.has(info.type)) {
      levels.add(channel);
    }
  }
  return levels;
}
