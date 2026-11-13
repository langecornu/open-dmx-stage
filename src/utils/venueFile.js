// One venue as a file of its own, to take a room's setup to another show: its lights (fixture, mode, address, name, type
// and place on the rig), groups, output, the visualizer's rig, and the fixture definitions it uses that are not built in.
// Importing adds it as another venue of the show, never replacing anything: a light id that is already used gets a new
// one, and a fixture definition the show already has is kept as it is. Pure, so the rules are easy to test.
import { venuesOf } from '../../shared/venues.js';

export const VENUE_FILE_FORMAT = 'open-dmx-stage.venue';

/** Bump when the file changes shape, and keep reading older files. */
export const CURRENT_VENUE_FILE_VERSION = 1;

/**
 * @param {any} project
 * @param {string} venueId
 * @param {{ output?: any }} [options] the output in use, for the venue being worked on (others keep their own)
 * @returns {object} the file's contents
 */
export function exportVenue(project, venueId, { output = null } = {}) {
  const venue = venuesOf(project).find((candidate) => candidate.id === venueId);
  if (!venue) {
    throw new Error(`No venue with id ${venueId}`);
  }
  const used = new Set(venue.fixtures.map((fixture) => fixture.typeId));
  const venueOutput = venue.isActive ? output : venue.output;
  return {
    format: VENUE_FILE_FORMAT,
    version: CURRENT_VENUE_FILE_VERSION,
    venue: {
      name: venue.name,
      fixtures: venue.fixtures,
      groups: venue.groups,
      ...(venue.rig ? { rig: venue.rig } : {}),
      ...(venueOutput ? { output: venueOutput } : {}),
    },
    fixtureTypes: (project.fixtureTypes ?? []).filter((type) => used.has(type.id)),
  };
}

/**
 * @param {unknown} file parsed JSON
 * @returns {string | null} why it cannot be imported, or null when it looks like a venue file
 */
export function checkVenueFile(file) {
  if (!file || typeof file !== 'object' || /** @type {any} */ (file).format !== VENUE_FILE_FORMAT) {
    return 'This is not an Open DMX Stage venue file.';
  }
  const { version, venue, fixtureTypes } = /** @type {any} */ (file);
  if (typeof version !== 'number' || version > CURRENT_VENUE_FILE_VERSION) {
    return 'This venue was saved by a newer version of Open DMX Stage. Please update the app.';
  }
  if (!venue || !Array.isArray(venue.fixtures) || !Array.isArray(venue.groups) || !Array.isArray(fixtureTypes)) {
    return 'The venue file is incomplete.';
  }
  return null;
}

/**
 * Adds a venue file to a show as another venue (not the active one).
 * @param {any} project
 * @param {any} file a checked venue file
 * @param {() => string} makeId
 * @returns {{ project: any, venueId: string, report: { name: string, lights: number, addedTypes: number } }}
 */
export function importVenue(project, file, makeId) {
  // Light ids must be unique within the show's venues; any already in use get a new one, and the groups follow.
  const taken = new Set(venuesOf(project).flatMap((venue) => venue.fixtures.map((fixture) => fixture.id)));
  /** @type {Map<string, string>} */
  const renamed = new Map();
  const fixtures = file.venue.fixtures.map((fixture) => {
    if (!taken.has(fixture.id)) {
      taken.add(fixture.id);
      return fixture;
    }
    const id = makeId();
    renamed.set(fixture.id, id);
    taken.add(id);
    return { ...fixture, id };
  });
  const groups = file.venue.groups.map((group) => ({
    ...group,
    id: makeId(),
    fixtureIds: group.fixtureIds.map((id) => renamed.get(id) ?? id),
  }));

  const known = new Set((project.fixtureTypes ?? []).map((type) => type.id));
  const addedTypes = file.fixtureTypes.filter((type) => !known.has(type.id));

  const names = new Set(venuesOf(project).map((venue) => venue.name));
  const base = String(file.venue.name || 'Imported venue').slice(0, 74);
  let name = base;
  for (let number = 2; names.has(name); number += 1) {
    name = `${base} ${number}`;
  }
  const venueId = makeId();
  const venue = {
    id: venueId,
    name,
    fixtures,
    groups,
    ...(file.venue.rig ? { rig: file.venue.rig } : {}),
    ...(file.venue.output ? { output: file.venue.output } : {}),
  };
  return {
    project: {
      ...project,
      fixtureTypes: [...(project.fixtureTypes ?? []), ...addedTypes],
      venues: [...(project.venues ?? []), venue],
    },
    venueId,
    report: { name, lights: fixtures.length, addedTypes: addedTypes.length },
  };
}

/**
 * @param {string} name
 * @returns {string} a file name for a venue
 */
export function venueFileName(name) {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'venue';
  return `${slug}.venue.json`;
}
