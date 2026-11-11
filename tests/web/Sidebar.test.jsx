// Component tests for the navigation rail.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Sidebar, VIEWS } from '../../src/components/Sidebar.jsx';
import { accessibilityViolations } from './axe.js';

describe('Sidebar', () => {
  it('lists every screen in a labelled navigation, in the documented order', () => {
    render(<Sidebar current="control" onSelect={vi.fn()} />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(VIEWS.map((view) => view.label)).toEqual([
      'Lights',
      'Looks',
      'Sequences',
      'Perform',
      'Setup',
      'Fixtures',
      'Output',
    ]);
    for (const view of VIEWS) {
      expect(nav).toContainElement(screen.getByRole('button', { name: view.label }));
    }
  });

  it('marks only the current screen, and selects another when pressed', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Sidebar current="scenes" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: 'Looks' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Lights' })).not.toHaveAttribute('aria-current');
    await user.click(screen.getByRole('button', { name: 'Perform' }));
    expect(onSelect).toHaveBeenCalledWith('perform');
  });

  it('groups the screens under Show and Rig headings', () => {
    render(<Sidebar current="control" onSelect={vi.fn()} />);
    const show = screen.getByRole('group', { name: 'Show' });
    const rig = screen.getByRole('group', { name: 'Rig' });
    expect(show).toContainElement(screen.getByRole('button', { name: 'Perform' }));
    expect(rig).toContainElement(screen.getByRole('button', { name: 'Output' }));
    expect(show).not.toContainElement(screen.getByRole('button', { name: 'Setup' }));
  });

  it('marks the screens that have something running, for screen readers too', () => {
    render(<Sidebar current="control" onSelect={vi.fn()} liveViews={['chases']} />);
    expect(screen.getByRole('button', { name: /Sequences.*on stage/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Looks' })).toBeInTheDocument();
  });

  it('has no automated accessibility violations', async () => {
    const { container } = render(<Sidebar current="control" onSelect={vi.fn()} />);
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
