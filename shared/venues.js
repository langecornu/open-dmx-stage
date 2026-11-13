// Venues: one show, several rigs. A venue is a named set of lights (with their fixture, mode and DMX address) and groups.
// The show's looks and sequences are shared by every venue; the active venue's rig is the show's `fixtures` and
// `groups`, and the others wait in `venues`. Switching venue matches each light to one of the same kind in the other
// rig (the same light first, then the same name, then the next of its kind) and moves every look value and block onto
// it. A light with no match loses nothing: its look values are set aside on the look (`parked`) and come back at a
// venue that has that light again, and its blocks keep pointing at it. A venue also remembers how DMX leaves the
// computer there (its output), which the app sets again on the server when the show comes back. Pure, so the rules are
// easy to test.
import { buildPatch } from './patch.js';
import { kindOf, matchLights } from './lightMatch.js';

/** The venue a show has before any other is added. */
export const FIRST_VENUE = Object.freeze({ id: 'main', name: 'My venue' });

/** At most this many venues in a show. */
export const MAX_VENUES = 20;

/**
 * @typedef {import('./types.js').Project} Project
 * @typedef {import('./types.js').Fixture} Fixture
 * @typedef {import('./types.js').OutputSettings} OutputSettings
 * @typedef {{ id: string, name: string, fixtures: Fixture[], groups: Project['groups'], output?: OutputSettings,
 *   rig?: Project['rig'] }} Venue
 */

/**
 * Every venue of the show, the active one first and the rest by name.
 * @param {Project} project
 * @returns {(Venue & { isActive: boolean })[]}
 */
export function venuesOf(project) {
  const active = project.venue ?? FIRST_VENUE;
  return [
    {
      id: active.id,
      name: active.name,
      fixtures: project.fixtures,
      groups: project.groups,
      ...(project.rig ? { rig: project.rig } : {}),
      isActive: true,
    },
    ...[...(project.venues ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((venue) => ({ ...venue, isActive: false })),
  ];
}

/**
 * What moving to a venue would do, in numbers and names, to show before switching.
 * @param {Project} project
 * @param {string} venueId
 * @returns {{ venue: Venue, matched: number, unmatched: string[], unused: string[] }}
 *   unmatched: lights here with no light of their kind there; unused: lights there that nothing here moves onto
 */
export function planVenueSwitch(project, venueId) {
  const venue = (project.venues ?? []).find((candidate) => candidate.id === venueId);
  if (!venue) {
    throw new Error(`No venue with id ${venueId}`);
  }
  const matches = matchLights(project.fixtures, venue.fixtures, { byId: true });
  const targets = new Set([...matches.values()].map((light) => light.id));
  return {
    venue,
    matched: matches.size,
    unmatched: project.fixtures.filter((light) => !matches.has(light.id)).map((light) => light.name),
    unused: venue.fixtures.filter((light) => !targets.has(light.id)).map((light) => light.name),
  };
}

/**
 * Makes another venue the active one, moving looks and blocks onto its lights.
 * @param {Project} project
 * @param {string} venueId
 * @param {import('./types.js').FixtureType[]} builtinTypes the fixture types that come with the app
 * @param {{ currentOutput?: OutputSettings | null }} [options] how DMX leaves the computer now, remembered with the
 *   venue being left so it comes back with it
 * @returns {Project}
 */
export function switchVenue(project, venueId, builtinTypes, { currentOutput = null } = {}) {
  const { venue } = planVenueSwitch(project, venueId);
  const matches = matchLights(project.fixtures, venue.fixtures, { byId: true });
  const from = buildPatch(project, builtinTypes);
  const to = buildPatch({ ...project, fixtures: venue.fixtures }, builtinTypes);
  const toRanges = new Map(to.fixtures.map((range) => [range.id, range]));
  const fromKinds = new Map(project.fixtures.map((light) => [light.id, kindOf(light)]));
  const active = project.venue ?? FIRST_VENUE;

  const scenes = project.scenes.map((scene) => {
    /** @type {Record<string, number>} */
    const values = {};
    /** @type {Record<string, { kind: string, values: Record<string, number> }>} */
    const parked = copy(scene.parked ?? {});
    for (const [key, value] of Object.entries(scene.values)) {
      const channel = Number(key);
      const owner = from.channels.get(channel);
      if (!owner) {
        // A channel no light uses: a raw value set by hand, kept where it is.
        values[key] = value;
        continue;
      }
      const target = matches.get(owner.fixtureId);
      if (target) {
        const range = toRanges.get(target.id);
        const moved = target.address + owner.offset;
        if (range && moved <= range.end && moved <= 512) {
          values[moved] = value;
        }
      } else {
        parked[owner.fixtureId] ??= { kind: fromKinds.get(owner.fixtureId) ?? '', values: {} };
        parked[owner.fixtureId].values[owner.offset] = value;
      }
    }
    // Values set aside at another venue come back where that light is in this one.
    for (const light of venue.fixtures) {
      const waiting = parked[light.id];
      const range = toRanges.get(light.id);
      if (!waiting || waiting.kind !== kindOf(light) || !range || range.missingType) {
        continue;
      }
      for (const [offset, value] of Object.entries(waiting.values)) {
        const channel = light.address + Number(offset);
        if (channel <= range.end && channel <= 512 && values[channel] === undefined) {
          values[channel] = value;
        }
      }
      delete parked[light.id];
    }
    const rest = { ...scene, values };
    delete rest.parked;
    return Object.keys(parked).length > 0 ? { ...rest, parked } : rest;
  });

  const chases = project.chases.map((chase) => ({
    ...chase,
    blocks: (chase.blocks ?? []).map((block) => {
      const target = matches.get(block.fixtureId);
      return target ? { ...block, fixtureId: target.id } : block;
    }),
  }));

  // The venue's own output, if it has one, is set by the caller on the server; it is not part of the active rig.
  // The rig is the venue's: the one being left goes with it above; the one coming in replaces it (or there is none).
  const rest = { ...project };
  delete rest.rig;
  return {
    ...rest,
    ...(venue.rig ? { rig: venue.rig } : {}),
    fixtures: venue.fixtures,
    groups: venue.groups,
    venue: { id: venue.id, name: venue.name },
    venues: [
      ...(project.venues ?? []).filter((candidate) => candidate.id !== venue.id),
      {
        id: active.id,
        name: active.name,
        fixtures: project.fixtures,
        groups: project.groups,
        ...(currentOutput ? { output: currentOutput } : {}),
        ...(project.rig ? { rig: project.rig } : {}),
      },
    ],
    scenes,
    chases,
  };
}

/**
 * Adds a venue (not active): empty, or a copy of the active venue's rig with the same lights, to move to other
 * addresses.
 * @param {Project} project
 * @param {string} name
 * @param {{ copyActive: boolean, makeId: () => string }} options
 * @returns {{ project: Project, venueId: string }}
 */
export function addVenue(project, name, { copyActive, makeId }) {
  const id = makeId();
  const venue = {
    id,
    name: uniqueName(project, name),
    fixtures: copyActive ? copy(project.fixtures) : [],
    groups: copyActive ? copy(project.groups) : [],
    ...(copyActive && project.rig ? { rig: copy(project.rig) } : {}),
  };
  return { project: { ...project, venues: [...(project.venues ?? []), venue] }, venueId: id };
}

/**
 * @param {Project} project
 * @param {string} venueId
 * @param {string} name
 * @returns {Project}
 */
export function renameVenue(project, venueId, name) {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) {
    return project;
  }
  const active = project.venue ?? FIRST_VENUE;
  if (active.id === venueId) {
    return { ...project, venue: { ...active, name: trimmed } };
  }
  return {
    ...project,
    venues: (project.venues ?? []).map((venue) => (venue.id === venueId ? { ...venue, name: trimmed } : venue)),
  };
}

/**
 * Removes a venue that is not active. Look values set aside for lights that no venue has any more go with it.
 * @param {Project} project
 * @param {string} venueId
 * @returns {Project}
 */
export function removeVenue(project, venueId) {
  const venues = (project.venues ?? []).filter((venue) => venue.id !== venueId);
  const known = new Set([...project.fixtures, ...venues.flatMap((venue) => venue.fixtures)].map((light) => light.id));
  const scenes = project.scenes.map((scene) => {
    if (!scene.parked) {
      return scene;
    }
    const parked = Object.fromEntries(Object.entries(scene.parked).filter(([lightId]) => known.has(lightId)));
    const rest = { ...scene };
    delete rest.parked;
    return Object.keys(parked).length > 0 ? { ...rest, parked } : rest;
  });
  return { ...project, venues, scenes };
}

/** A deep copy of plain show data. */
/** @template T @param {T} value @returns {T} */
const copy = (value) => structuredClone(value);

/**
 * A venue name not already used in the show: "Club" becomes "Club 2" when there is a Club.
 * @param {Project} project
 * @param {string} name
 * @returns {string}
 */
function uniqueName(project, name) {
  const base = name.trim().slice(0, 74) || 'Venue';
  const taken = new Set(venuesOf(project).map((venue) => venue.name));
  if (!taken.has(base)) {
    return base;
  }
  let number = 2;
  while (taken.has(`${base} ${number}`)) {
    number += 1;
  }
  return `${base} ${number}`;
}
