// Tests for the fixture definition helpers.
import { describe, expect, it } from 'vitest';

import {
  canAddChannel,
  duplicateFixtureType,
  fixtureTitle,
  newFixtureType,
  usageCount,
} from '../../src/utils/fixtureTypes.js';

describe('fixture definitions', () => {
  it('starts a new fixture with one mode and one dimmer channel, and a new id each time', () => {
    const first = newFixtureType();
    expect(first.modes).toHaveLength(1);
    expect(first.modes[0].channels).toEqual([{ name: 'Intensity', type: 'intensity', defaultValue: 0 }]);
    expect(first.description).toBe('');
    expect(newFixtureType().id).not.toBe(first.id);
  });

  it('copies a fixture with a new id and a distinct name, without sharing its channels', () => {
    const original = { ...newFixtureType(), manufacturer: "U'King", name: 'Head', description: 'About' };
    const copy = duplicateFixtureType(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('Head (copy)');
    expect(copy.manufacturer).toBe("U'King");
    expect(copy.description).toBe('About');
    copy.modes[0].channels[0].name = 'Changed';
    expect(original.modes[0].channels[0].name).toBe('Intensity');
  });

  it('keeps a copied name within the 80 character limit', () => {
    const copy = duplicateFixtureType({ ...newFixtureType(), name: 'x'.repeat(80) });
    expect(copy.name).toHaveLength(80);
  });

  it('counts the lights that use a fixture, and titles it with the brand when there is one', () => {
    const project = { fixtures: [{ typeId: 'a' }, { typeId: 'b' }, { typeId: 'a' }] };
    expect(usageCount(project, 'a')).toBe(2);
    expect(usageCount(project, 'none')).toBe(0);
    expect(fixtureTitle({ manufacturer: "U'King", name: 'Head' })).toBe("U'King Head");
    expect(fixtureTitle({ manufacturer: '', name: 'Head' })).toBe('Head');
  });

  it('stops adding channels at one universe', () => {
    expect(canAddChannel(511)).toBe(true);
    expect(canAddChannel(512)).toBe(false);
  });
});
