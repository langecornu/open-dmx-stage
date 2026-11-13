// Component tests for the Venues card on Setup: adding a venue as a copy or empty, renaming, switching (after asking,
// with what will match) and removing.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VenuesCard } from '../../src/components/VenuesCard.jsx';
import { accessibilityViolations } from './axe.js';
import { BUILTIN_TYPES } from './fixtures.js';

const par = (id, name, address) => ({ id, name, typeId: 'generic-rgb-par', mode: 0, address });
const start = {
  schemaVersion: 7,
  id: 'show',
  name: 'Show',
  venue: { id: 'main', name: 'My venue' },
  venues: [{ id: 'club', name: 'Club', fixtures: [par('a', 'Par 1', 101)], groups: [] }],
  fixtureTypes: [],
  fixtures: [par('a', 'Par 1', 1), par('b', 'Par 2', 4)],
  groups: [],
  scenes: [{ id: 's', name: 'Red', values: { 1: 255, 4: 255 } }],
  chases: [],
};

let latest;
function Harness() {
  const [project, setProject] = useState(start);
  latest = project;
  return (
    <VenuesCard
      project={project}
      library={BUILTIN_TYPES}
      update={(mutate) => setProject((current) => mutate(current))}
    />
  );
}

afterEach(() => vi.restoreAllMocks());

describe('VenuesCard', () => {
  it('lists the venue here first, and adds a venue as a copy of this one or empty', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('2 lights');
    expect(rows[0]).toHaveTextContent('output: the output as it is');
    expect(rows[1]).toHaveTextContent('keeps the output as it is');
    expect(within(rows[0]).getByText('Here now')).toBeInTheDocument();
    await user.type(screen.getByLabelText('New venue'), 'Hall');
    await user.click(screen.getByRole('button', { name: 'Add venue' }));
    expect(latest.venues.at(-1)).toMatchObject({ name: 'Hall', fixtures: start.fixtures });
    await user.type(screen.getByLabelText('New venue'), 'Garden');
    await user.selectOptions(screen.getByLabelText('Start with'), 'empty');
    await user.click(screen.getByRole('button', { name: 'Add venue' }));
    expect(latest.venues.at(-1)).toMatchObject({ name: 'Garden', fixtures: [] });
  });

  it('switches to a venue after saying what matches, moving the looks', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Switch here' }));
    expect(confirm.mock.calls[0][0]).toContain('Move the show to Club?');
    expect(confirm.mock.calls[0][0]).toContain('1 of 2 lights match');
    expect(confirm.mock.calls[0][0]).toContain('No match for Par 2');
    expect(latest.venue.name).toBe('Club');
    expect(latest.scenes[0].values).toEqual({ 101: 255 });
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('1 light');
  });

  it('renames a venue, and removes one only when confirmed', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<Harness />);
    const name = screen.getByLabelText('Venue name: My venue');
    await user.clear(name);
    await user.type(name, 'Home{Tab}');
    expect(latest.venue.name).toBe('Home');
    await user.click(screen.getByRole('button', { name: 'Remove Club' }));
    expect(latest.venues).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Remove Club' }));
    expect(latest.venues).toHaveLength(0);
  });

  it('has no automated accessibility violations', async () => {
    const { container } = render(<Harness />);
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
