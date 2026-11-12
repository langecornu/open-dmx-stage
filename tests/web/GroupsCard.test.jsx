// Tests for fixture groups in Setup: create, rename, choose lights, delete, and cleaning up when a light is removed.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PatchView } from '../../src/components/PatchView.jsx';
import { BUILTIN_TYPES } from './fixtures.js';
import { buildPatch } from '../../shared/patch.js';

function makeProject(groups) {
  return {
    schemaVersion: 3,
    name: 'Test',
    fixtureTypes: [],
    fixtures: [
      { id: 'a', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1 },
      { id: 'b', name: 'Par 2', typeId: 'generic-rgb-par', mode: 0, address: 4 },
    ],
    scenes: [],
    chases: [],
    groups,
  };
}

function renderSetup(project) {
  const update = vi.fn();
  render(
    <PatchView
      project={project}
      library={BUILTIN_TYPES}
      patch={buildPatch(project, BUILTIN_TYPES)}
      update={update}
      replaceProject={vi.fn()}
    />,
  );
  return { update, apply: (index = 0) => update.mock.calls[index][0](project) };
}

describe('groups', () => {
  it('offers a way to make the first group, and creates an empty one', async () => {
    const user = userEvent.setup();
    const { apply } = renderSetup(makeProject([]));
    expect(screen.getByText(/Group lights/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New group' }));
    const created = apply().groups[0];
    expect(created).toMatchObject({ name: 'Group 1', fixtureIds: [] });
    expect(created.id).toBeTruthy();
  });

  it('adds and removes lights in a group with checkboxes, and deletes the group', async () => {
    const user = userEvent.setup();
    const project = makeProject([{ id: 'g', name: 'Front', fixtureIds: ['a'] }]);
    const { apply, update } = renderSetup(project);
    expect(screen.getByRole('checkbox', { name: 'Par 1' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Par 2' }));
    expect(apply(0).groups[0].fixtureIds).toEqual(['a', 'b']);
    await user.click(screen.getByRole('checkbox', { name: 'Par 1' }));
    expect(apply(1).groups[0].fixtureIds).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Delete Front' }));
    expect(update.mock.calls.at(-1)[0](project).groups).toEqual([]);
  });

  it('names the lights that are in no group, once there are groups', () => {
    renderSetup(makeProject([{ id: 'g1', name: 'Front', fixtureIds: ['a'] }]));
    expect(screen.getByRole('note')).toHaveTextContent('Not in any group: Par 2.');
  });

  it('says nothing about ungrouped lights before the first group is made', () => {
    renderSetup(makeProject([]));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('takes a removed light out of every group', async () => {
    const user = userEvent.setup();
    const project = makeProject([{ id: 'g', name: 'Front', fixtureIds: ['a', 'b'] }]);
    const { apply } = renderSetup(project);
    await user.click(screen.getByRole('button', { name: 'Remove Par 1' }));
    const next = apply();
    expect(next.fixtures.map((fixture) => fixture.id)).toEqual(['b']);
    expect(next.groups[0].fixtureIds).toEqual(['b']);
  });
});
