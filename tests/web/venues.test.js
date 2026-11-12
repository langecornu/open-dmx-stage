// Tests for venues: one show, several rigs. Switching moves looks and blocks onto the other rig's lights, and sets aside
// (never drops) what a light that is missing there was doing, until a venue has that light again.
import { describe, expect, it } from 'vitest';

import {
  FIRST_VENUE,
  addVenue,
  planVenueSwitch,
  removeVenue,
  renameVenue,
  switchVenue,
  venuesOf,
} from '../../shared/venues.js';
import { BUILTIN_TYPES } from './fixtures.js';

const par = (id, name, address) => ({ id, name, typeId: 'generic-rgb-par', mode: 0, address });
const block = (id, fixtureId) => ({
  id,
  fixtureId,
  start: 0,
  length: 4,
  color: '#ff0000',
  intensity: 100,
  transition: 'none',
  endColor: '#ff0000',
  endIntensity: 100,
  effect: 'none',
  strobeSpeed: 50,
});

// Home: three pars at 1, 4 and 7. A look sets all three, plus channel 500 by hand.
const home = {
  schemaVersion: 6,
  id: 'show',
  name: 'Show',
  venue: { ...FIRST_VENUE },
  venues: [],
  fixtureTypes: [],
  fixtures: [par('a', 'Left', 1), par('b', 'Centre', 4), par('c', 'Right', 7)],
  groups: [{ id: 'g', name: 'All', fixtureIds: ['a', 'b', 'c'] }],
  scenes: [{ id: 'look', name: 'Look', values: { 1: 10, 2: 11, 4: 20, 7: 30, 9: 31, 500: 99 } }],
  chases: [{ id: 'seq', name: 'Seq', loop: true, timing: 'beats', steps: [], blocks: [block('b1', 'c')] }],
};
let counter = 0;
const makeId = () => `venue-${(counter += 1)}`;

describe('venues', () => {
  it('starts with one venue, the rig the show has', () => {
    expect(venuesOf(home)).toEqual([
      { id: 'main', name: 'My venue', fixtures: home.fixtures, groups: home.groups, isActive: true },
    ]);
  });

  it('adds an empty venue or a copy of this one, with a name not already used, and renames one', () => {
    const { project: withClub, venueId } = addVenue(home, 'Club', { copyActive: false, makeId });
    expect(withClub.venues).toEqual([{ id: venueId, name: 'Club', fixtures: [], groups: [] }]);
    const { project: twice } = addVenue(withClub, 'Club', { copyActive: true, makeId });
    expect(twice.venues[1]).toMatchObject({ name: 'Club 2', fixtures: home.fixtures, groups: home.groups });
    expect(renameVenue(twice, 'main', '  Home  ').venue.name).toBe('Home');
    expect(renameVenue(twice, venueId, 'Bar').venues[0].name).toBe('Bar');
    expect(renameVenue(twice, venueId, '   ')).toBe(twice);
  });

  it('moves looks and blocks onto the same lights at other addresses in a copied venue', () => {
    const { project: withHall, venueId } = addVenue(home, 'Hall', { copyActive: true, makeId });
    const hall = {
      ...withHall,
      venues: [
        {
          ...withHall.venues[0],
          fixtures: [par('a', 'Left', 101), par('b', 'Centre', 104), par('c', 'Right', 107)],
        },
      ],
    };
    expect(planVenueSwitch(hall, venueId)).toMatchObject({ matched: 3, unmatched: [], unused: [] });
    const moved = switchVenue(hall, venueId, BUILTIN_TYPES);
    expect(moved.venue).toEqual({ id: venueId, name: 'Hall' });
    expect(moved.fixtures.map((light) => light.address)).toEqual([101, 104, 107]);
    expect(moved.scenes[0].values).toEqual({ 101: 10, 102: 11, 104: 20, 107: 30, 109: 31, 500: 99 });
    expect(moved.chases[0].blocks[0].fixtureId).toBe('c');
    expect(venuesOf(moved).map((venue) => [venue.name, venue.isActive])).toEqual([
      ['Hall', true],
      ['My venue', false],
    ]);
    // And back again: exactly as it was.
    const back = switchVenue(moved, 'main', BUILTIN_TYPES);
    expect(back.scenes).toEqual(home.scenes);
    expect(back.fixtures).toEqual(home.fixtures);
    expect(back.groups).toEqual(home.groups);
  });

  it('matches other lights by name and then by kind, and sets aside a missing light until it comes back', () => {
    // A bar with two pars, named differently: Left matches by name, the other takes the next par.
    const bar = { id: 'bar', name: 'Bar', fixtures: [par('x', 'Left', 21), par('y', 'Spot', 30)], groups: [] };
    const show = { ...home, venues: [bar] };
    expect(planVenueSwitch(show, 'bar')).toMatchObject({ matched: 2, unmatched: ['Right'], unused: [] });
    const atBar = switchVenue(show, 'bar', BUILTIN_TYPES);
    expect(atBar.scenes[0].values).toEqual({ 21: 10, 22: 11, 30: 20, 500: 99 });
    expect(atBar.scenes[0].parked).toEqual({ c: { kind: 'generic-rgb-par:0', values: { 0: 30, 2: 31 } } });
    expect(atBar.chases[0].blocks[0].fixtureId).toBe('c', 'a block on a missing light waits for it');
    const home2 = switchVenue(atBar, 'main', BUILTIN_TYPES);
    expect(home2.scenes[0].values).toEqual(home.scenes[0].values);
    expect(home2.scenes[0].parked).toBeUndefined();
  });

  it('does not bring set-aside values back onto a light of another kind', () => {
    const odd = {
      id: 'odd',
      name: 'Odd',
      fixtures: [{ id: 'c', name: 'Right', typeId: 'generic-dimmer', mode: 0, address: 7 }],
      groups: [],
    };
    const show = {
      ...home,
      venues: [odd],
      scenes: [{ ...home.scenes[0], parked: { c: { kind: 'generic-rgb-par:0', values: { 0: 30 } } } }],
    };
    const moved = switchVenue(show, 'odd', BUILTIN_TYPES);
    expect(moved.scenes[0].values[7]).toBeUndefined();
    expect(moved.scenes[0].parked.c.values).toEqual({ 0: 30, 2: 31 }); // still waiting, with this rig's values too
  });

  it('removes a venue, and with it what was set aside for lights no venue has any more', () => {
    const bar = { id: 'bar', name: 'Bar', fixtures: [par('z', 'Only', 1)], groups: [] };
    const show = {
      ...home,
      venues: [bar],
      scenes: [
        {
          ...home.scenes[0],
          parked: { z: { kind: 'generic-rgb-par:0', values: { 0: 1 } }, gone: { kind: 'k', values: { 0: 2 } } },
        },
      ],
    };
    expect(removeVenue(show, 'bar').scenes[0].parked).toBeUndefined();
    expect(removeVenue(show, 'nothing').scenes[0].parked).toEqual({
      z: { kind: 'generic-rgb-par:0', values: { 0: 1 } },
    });
    expect(() => planVenueSwitch(show, 'nothing')).toThrow();
  });
});
