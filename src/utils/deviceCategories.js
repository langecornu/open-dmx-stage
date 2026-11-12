// The device category of every light in the rig, for its icon: its own setting, else its fixture type's, else a guess.
import { categoryOf } from '../../shared/categories.js';
import { indexFixtureTypes } from '../../shared/patch.js';

/**
 * @param {{ fixtures: { id: string, typeId: string, category?: string }[], fixtureTypes: object[] }} project
 * @param {object[]} library the built-in fixture types
 * @returns {Map<string, import('../../shared/categories.js').DeviceCategory>} by fixture id
 */
export function categoriesByFixture(project, library) {
  const typesById = indexFixtureTypes({ ...project, fixtureTypes: project.fixtureTypes ?? [] }, library ?? []);
  return new Map(project.fixtures.map((fixture) => [fixture.id, categoryOf(fixture, typesById.get(fixture.typeId))]));
}
