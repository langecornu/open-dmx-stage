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
      'Home',
      'Lights',
      'Looks',
      'Sequences',
      'Perform',
      'AI shows',
      'Setup',
      'Fixtures',
      'Output',
      'Settings',
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

  it('shows the output in the footer and opens Output from it', async () => {
    const user = userEvent.setup();
    const onOpenOutput = vi.fn();
    render(
      <Sidebar
        current="home"
        onSelect={vi.fn()}
        output={{ driver: 'open-dmx', connected: true }}
        onOpenOutput={onOpenOutput}
      />,
    );
    const card = screen.getByRole('button', { name: /USB-DMX cable/ });
    expect(card).toHaveTextContent('Connected');
    await user.click(card);
    expect(onOpenOutput).toHaveBeenCalled();
  });

  it.each([
    [{ driver: 'enttec-pro', connected: false }, true, 'Not connected'],
    [{ driver: 'enttec-pro', connected: true }, false, 'Server offline'],
  ])('says in words when the output is not usable (%j, server up: %s)', (output, isServerUp, expected) => {
    render(
      <Sidebar current="home" onSelect={vi.fn()} output={output} isServerUp={isServerUp} onOpenOutput={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: new RegExp(expected) })).toBeInTheDocument();
  });

  it('has no automated accessibility violations', async () => {
    const { container } = render(<Sidebar current="control" onSelect={vi.fn()} />);
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
