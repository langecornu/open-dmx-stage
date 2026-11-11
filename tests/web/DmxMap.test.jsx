// Component tests for the DMX address map on the Setup screen.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { DmxMap } from '../../src/components/DmxMap.jsx';
import { accessibilityViolations } from './axe.js';
import { BUILTIN_TYPES } from './fixtures.js';

function renderMap(addresses) {
  const project = {
    schemaVersion: 3,
    name: 'Test',
    fixtureTypes: [],
    fixtures: addresses.map((address, index) => ({
      id: `f${index}`,
      name: `Par ${index + 1}`,
      typeId: 'generic-rgb-par',
      mode: 0,
      address,
    })),
    scenes: [],
    chases: [],
    groups: [],
  };
  return render(<DmxMap project={project} patch={buildPatch(project, BUILTIN_TYPES)} />);
}

describe('DmxMap', () => {
  it('says how much of the universe is used and the next free address', () => {
    renderMap([1, 5]);
    expect(screen.getByText(/channels used · next free address/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /2 lights across \d+ of 512 channels/ })).toBeInTheDocument();
  });

  it('lists each light with its addresses', () => {
    renderMap([1, 20]);
    expect(screen.getByText('Par 1')).toBeInTheDocument();
    expect(screen.getByText('Par 2')).toBeInTheDocument();
    expect(screen.queryByText('Overlaps')).not.toBeInTheDocument();
  });

  it('warns in words when two lights share addresses', () => {
    renderMap([1, 2]);
    expect(screen.getAllByText('Overlaps').length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveTextContent(/share addresses/);
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderMap([1, 2]);
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
