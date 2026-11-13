// Tests for a venue as a file: what goes in it, and how importing it adds a venue to another show without clashing.
import { describe, expect, it } from 'vitest';

import {
  CURRENT_VENUE_FILE_VERSION,
  VENUE_FILE_FORMAT,
  checkVenueFile,
  exportVenue,
  importVenue,
  venueFileName,
} from '../../src/utils/venueFile.js';

const custom = { id: 'my-type', manufacturer: 'Me', name: 'Home made', description: '', modes: [] };
const other = { id: 'unused-type', manufacturer: 'Me', name: 'Unused', description: '', modes: [] };
const show = {
  venue: { id: 'main', name: 'Club Soda' },
  rig: { shape: 'square', uprights: true, width: 9, depth: 7, height: 4 },
  fixtures: [
    { id: 'p1', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1, stage: { rail: 'back', at: 0.2 } },
    { id: 'h1', name: 'Head', typeId: 'my-type', mode: 0, address: 10 },
  ],
  groups: [{ id: 'g1', name: 'All', fixtureIds: ['p1', 'h1'] }],
  fixtureTypes: [custom, other],
  venues: [
    {
      id: 'bar',
      name: 'Bar',
      fixtures: [],
      groups: [],
      output: { driver: 'artnet', serialPath: '', host: '10.0.0.5' },
    },
  ],
  scenes: [],
  chases: [],
};
const cable = { driver: 'open-dmx', serialPath: '/dev/ttyUSB0', host: '' };

describe('exportVenue', () => {
  it('holds the venue being worked on with the output in use, its rig, and the custom fixtures it uses', () => {
    const file = exportVenue(show, 'main', { output: cable });
    expect(file).toMatchObject({ format: VENUE_FILE_FORMAT, version: CURRENT_VENUE_FILE_VERSION });
    expect(file.venue).toEqual({
      name: 'Club Soda',
      fixtures: show.fixtures,
      groups: show.groups,
      rig: show.rig,
      output: cable,
    });
    expect(file.fixtureTypes).toEqual([custom]);
  });

  it('holds another venue with its own remembered output', () => {
    expect(exportVenue(show, 'bar', { output: cable }).venue.output).toEqual(show.venues[0].output);
    expect(() => exportVenue(show, 'nowhere')).toThrow();
  });

  it('names the file after the venue', () => {
    expect(venueFileName('Club Soda!')).toBe('club-soda.venue.json');
  });
});

describe('checkVenueFile', () => {
  it('accepts a venue file and explains anything else', () => {
    expect(checkVenueFile(exportVenue(show, 'main'))).toBeNull();
    expect(checkVenueFile({ format: 'open-dmx-stage.sequence' })).toMatch(/not an Open DMX Stage venue/);
    expect(checkVenueFile({ ...exportVenue(show, 'main'), version: 99 })).toMatch(/newer version/);
    expect(checkVenueFile({ format: VENUE_FILE_FORMAT, version: 1, venue: {} })).toMatch(/incomplete/);
  });
});

describe('importVenue', () => {
  let counter = 0;
  const makeId = () => `new-${(counter += 1)}`;

  it('adds the venue alongside the others, with a name of its own', () => {
    const empty = { venue: { id: 'main', name: 'Club Soda' }, fixtures: [], groups: [], fixtureTypes: [], venues: [] };
    const { project, venueId, report } = importVenue(empty, exportVenue(show, 'main', { output: cable }), makeId);
    const added = project.venues.find((venue) => venue.id === venueId);
    expect(added).toMatchObject({ name: 'Club Soda 2', rig: show.rig, output: cable });
    expect(added.fixtures.map((fixture) => fixture.id)).toEqual(['p1', 'h1']);
    expect(project.fixtureTypes).toEqual([custom]);
    expect(report).toEqual({ name: 'Club Soda 2', lights: 2, addedTypes: 1 });
  });

  it('gives lights whose ids are taken new ones, follows them in groups, and keeps fixtures the show has', () => {
    const { project, venueId } = importVenue(show, exportVenue(show, 'main'), makeId);
    const added = project.venues.find((venue) => venue.id === venueId);
    const newIds = added.fixtures.map((fixture) => fixture.id);
    expect(newIds.some((id) => ['p1', 'h1'].includes(id))).toBe(false);
    expect(added.groups[0].fixtureIds).toEqual(newIds);
    expect(project.fixtureTypes).toEqual([custom, other]);
  });
});
