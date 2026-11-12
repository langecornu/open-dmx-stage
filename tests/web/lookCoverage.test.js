// Tests for which lights a look sets, and filling lights added after the looks were saved.
import { describe, expect, it } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { fillLooks, lightsInLook, listNames, planFill } from '../../src/utils/lookCoverage.js';
import { BUILTIN_TYPES } from './fixtures.js';

const par = (id, address) => ({ id, name: id.toUpperCase(), typeId: 'generic-rgb-par', mode: 0, address });
const show = (fixtures, scenes) => ({
  schemaVersion: 4,
  name: 'S',
  fixtureTypes: [],
  fixtures,
  scenes,
  chases: [],
  groups: [],
});

describe('look coverage', () => {
  it('lists the lights a look sets', () => {
    const project = show([par('a', 1), par('b', 4)], []);
    expect(lightsInLook(project, buildPatch(project, BUILTIN_TYPES), { 5: 10 }).map((f) => f.id)).toEqual(['b']);
  });

  it('pairs new lights with lights of the same kind in rig order, cycling when there are more new ones', () => {
    const project = show(
      [par('a', 1), par('b', 4), par('c', 7), par('d', 10), par('e', 13)],
      [{ id: 's', name: 'S', values: { 1: 1, 4: 1 } }],
    );
    const plan = planFill(project, buildPatch(project, BUILTIN_TYPES));
    expect(plan.map(({ from, to }) => `${from.id}->${to.id}`)).toEqual(['a->c', 'b->d', 'a->e']);
  });

  it('offers nothing for a light with no partner of the same kind, or when there are no looks', () => {
    const lamp = { id: 'lamp', name: 'Lamp', typeId: 'generic-dimmer', mode: 0, address: 20 };
    const withLook = show([par('a', 1), lamp], [{ id: 's', name: 'S', values: { 1: 1 } }]);
    expect(planFill(withLook, buildPatch(withLook, BUILTIN_TYPES))).toEqual([]);
    const noLooks = show([par('a', 1), par('b', 4)], []);
    expect(planFill(noLooks, buildPatch(noLooks, BUILTIN_TYPES))).toEqual([]);
  });

  it('copies each channel by position and never overwrites a value already set', () => {
    const project = show([par('a', 1), par('b', 4)], []);
    const patch = buildPatch(project, BUILTIN_TYPES);
    const plan = [{ from: project.fixtures[0], to: project.fixtures[1] }];
    const [filled] = fillLooks([{ id: 's', name: 'S', values: { 1: 200, 3: 50, 5: 7 } }], patch, plan);
    expect(filled.values).toEqual({ 1: 200, 3: 50, 4: 200, 5: 7, 6: 50 });
  });

  it('lists names in plain words', () => {
    expect(listNames(['A'])).toBe('A');
    expect(listNames(['A', 'B'])).toBe('A and B');
    expect(listNames(['A', 'B', 'C'])).toBe('A, B and C');
  });
});
