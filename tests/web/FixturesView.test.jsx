// Component tests for the Fixtures screen: the built-in example, copying it, and editing manufacturer, model,
// description, modes and channels by hand.
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FixturesView } from '../../src/components/FixturesView.jsx';
import { accessibilityViolations } from './axe.js';

const EXAMPLE = {
  id: 'uking-40w-beam-moving-head',
  manufacturer: "U'King",
  name: '40W RGBW Moving Head Light',
  description: '40W Beam Moving Head Light DMX512 RGBW Stage Light',
  modes: [
    {
      name: '13 channel',
      channels: [
        { name: 'Pan', type: 'pan', defaultValue: 128 },
        { name: 'Dimmer', type: 'intensity', defaultValue: 255 },
      ],
    },
  ],
};
const MINE = {
  id: 'mine',
  manufacturer: 'Acme',
  name: 'Wash 3',
  description: 'A wash',
  modes: [
    { name: '3 channel', channels: [{ name: 'Red', type: 'red', defaultValue: 0 }] },
    { name: '4 channel', channels: [{ name: 'Green', type: 'green', defaultValue: 0 }] },
  ],
};

function makeProject(fixtureTypes = [], fixtures = []) {
  return { schemaVersion: 3, name: 'T', fixtureTypes, fixtures, scenes: [], chases: [], groups: [] };
}

function renderView(project = makeProject()) {
  const update = vi.fn();
  render(<FixturesView project={project} library={[EXAMPLE]} update={update} />);
  return { update, last: () => update.mock.calls.at(-1)[0](project) };
}

describe('FixturesView', () => {
  it('shows the U`King moving head as a read-only example with manufacturer, model and description', () => {
    renderView();
    expect(screen.getByLabelText('Manufacturer')).toHaveValue("U'King");
    expect(screen.getByLabelText('Model')).toHaveValue('40W RGBW Moving Head Light');
    expect(screen.getByLabelText('Description')).toHaveValue('40W Beam Moving Head Light DMX512 RGBW Stage Light');
    expect(screen.getByLabelText('Model')).toBeDisabled();
    expect(screen.getByText(/built-in example/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete this fixture' })).not.toBeInTheDocument();
  });

  it('makes an editable copy of the example, with its own id', async () => {
    const user = userEvent.setup();
    const { last } = renderView();
    await user.click(screen.getByRole('button', { name: 'Make a copy' }));
    const created = last().fixtureTypes[0];
    expect(created.id).not.toBe(EXAMPLE.id);
    expect(created).toMatchObject({ manufacturer: "U'King", name: '40W RGBW Moving Head Light (copy)' });
    expect(created.modes[0].channels).toHaveLength(2);
  });

  it('creates a blank fixture from New fixture', async () => {
    const user = userEvent.setup();
    const { last } = renderView();
    await user.click(screen.getByRole('button', { name: 'New fixture' }));
    expect(last().fixtureTypes[0]).toMatchObject({ name: 'New fixture', manufacturer: '', description: '' });
  });

  it('edits manufacturer, model and description of your own fixture', () => {
    const { last } = renderView(makeProject([MINE]));
    fireEvent.change(screen.getByLabelText('Manufacturer'), { target: { value: 'Beta' } });
    expect(last().fixtureTypes[0].manufacturer).toBe('Beta');
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Wash 4' } });
    expect(last().fixtureTypes[0].name).toBe('Wash 4');
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'New text' } });
    expect(last().fixtureTypes[0].description).toBe('New text');
  });

  it('edits channels: name, type, resting value, order, add and remove', async () => {
    const user = userEvent.setup();
    const two = {
      ...MINE,
      modes: [
        {
          name: 'Two',
          channels: [
            { name: 'A', type: 'red', defaultValue: 0 },
            { name: 'B', type: 'green', defaultValue: 0 },
          ],
        },
      ],
    };
    const { last } = renderView(makeProject([two]));
    fireEvent.change(screen.getByLabelText('Name of channel 1'), { target: { value: 'Red' } });
    expect(last().fixtureTypes[0].modes[0].channels[0].name).toBe('Red');
    await user.selectOptions(screen.getByLabelText('Type of channel 2'), 'blue');
    expect(last().fixtureTypes[0].modes[0].channels[1].type).toBe('blue');
    fireEvent.change(screen.getByLabelText('Resting value of channel 1'), { target: { value: '999' } });
    expect(last().fixtureTypes[0].modes[0].channels[0].defaultValue).toBe(255);
    await user.click(screen.getByRole('button', { name: 'Move channel 1 down' }));
    expect(last().fixtureTypes[0].modes[0].channels.map((channel) => channel.name)).toEqual(['B', 'A']);
    expect(screen.getByRole('button', { name: 'Move channel 1 up' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Remove channel 1' }));
    expect(last().fixtureTypes[0].modes[0].channels.map((channel) => channel.name)).toEqual(['B']);
    await user.click(screen.getByRole('button', { name: 'Add channel' }));
    expect(last().fixtureTypes[0].modes[0].channels).toHaveLength(3);
  });

  it('adds a mode, and removes one only when the fixture is not in use and another mode remains', async () => {
    const user = userEvent.setup();
    const { last } = renderView(makeProject([MINE]));
    await user.click(screen.getByRole('button', { name: 'Add mode' }));
    expect(last().fixtureTypes[0].modes).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Remove mode 1' }));
    expect(last().fixtureTypes[0].modes.map((mode) => mode.name)).toEqual(['4 channel']);
  });

  it('refuses to delete or remove modes from a fixture that lights in the rig use', () => {
    renderView(makeProject([MINE], [{ id: 'f', name: 'Wash', typeId: 'mine', mode: 0, address: 1 }]));
    expect(screen.getByRole('button', { name: 'Delete this fixture' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove mode 1' })).toBeDisabled();
    expect(screen.getByText(/Used by 1 light in your rig/)).toBeInTheDocument();
  });

  it('deletes an unused fixture of your own and goes back to the example', async () => {
    const user = userEvent.setup();
    const { last } = renderView(makeProject([MINE]));
    await user.click(screen.getByRole('button', { name: 'Delete this fixture' }));
    expect(last().fixtureTypes).toEqual([]);
    expect(screen.getByLabelText('Model')).toHaveValue('40W RGBW Moving Head Light');
  });

  it('lists your fixtures and the built-in ones apart, and switches between them', async () => {
    const user = userEvent.setup();
    renderView(makeProject([MINE]));
    expect(within(screen.getByRole('list', { name: 'Your fixtures' })).getByText('Wash 3')).toBeInTheDocument();
    await user.click(
      within(screen.getByRole('list', { name: 'Built-in fixtures' })).getByRole('button', { name: /Moving Head/ }),
    );
    expect(screen.getByLabelText('Manufacturer')).toHaveValue("U'King");
  });

  it('has no automated accessibility violations', async () => {
    const { container } = render(<FixturesView project={makeProject([MINE])} library={[EXAMPLE]} update={vi.fn()} />);
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
