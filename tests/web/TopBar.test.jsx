// Component tests for the top bar: connection status, save status, show name, the show list, the venue, master, theme
// switch and blackout.
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TopBar } from '../../src/components/TopBar.jsx';
import { accessibilityViolations } from './axe.js';

function renderBar(props = {}) {
  const handlers = { onRename: vi.fn(), onToggleTheme: vi.fn(), send: vi.fn() };
  const view = render(
    <TopBar
      projectName="My show"
      saveStatus="saved"
      connected
      output={{ driver: 'mock', connected: true }}
      engine={{ master: 1, blackout: false }}
      theme="light"
      {...handlers}
      {...props}
    />,
  );
  return { ...view, ...handlers };
}

describe('TopBar', () => {
  it('opens the show list, and switches venue or goes to manage venues from the venue picker', async () => {
    const user = userEvent.setup();
    const onOpenShows = vi.fn();
    const onSwitchVenue = vi.fn();
    const onManageVenues = vi.fn();
    renderBar({
      onOpenShows,
      onSwitchVenue,
      onManageVenues,
      venues: [
        { id: 'main', name: 'Home', isActive: true },
        { id: 'club', name: 'Club', isActive: false },
      ],
    });
    await user.click(screen.getByRole('button', { name: 'File' }));
    expect(onOpenShows).toHaveBeenCalled();
    const picker = screen.getByRole('combobox', { name: 'Venue' });
    expect(picker).toHaveValue('main');
    await user.selectOptions(picker, 'Club');
    expect(onSwitchVenue).toHaveBeenCalledWith('club');
    await user.selectOptions(picker, 'Add or change venues…');
    expect(onManageVenues).toHaveBeenCalled();
  });

  it.each([
    [{ connected: false, output: null }, 'Server offline'],
    [{ connected: true, output: { driver: 'mock', connected: true } }, 'Simulator'],
    [{ connected: true, output: { driver: 'enttec-pro', connected: true } }, 'DMX ready'],
    [{ connected: true, output: { driver: 'open-dmx', connected: false } }, 'DMX not connected'],
  ])('says in words what the output is doing (%j)', (props, label) => {
    renderBar(props);
    expect(screen.getByRole('status')).toHaveTextContent(label);
  });

  it.each([
    ['saved', 'Saved'],
    ['saving', 'Saving…'],
    ['pending', 'Unsaved'],
    ['error', 'Save failed'],
  ])('shows the save state %s as "%s"', (saveStatus, label) => {
    renderBar({ saveStatus });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('offers a Fix button that opens Output when the lights are not connected', async () => {
    const user = userEvent.setup();
    const onOpenOutput = vi.fn();
    renderBar({ output: { driver: 'open-dmx', connected: false }, onOpenOutput });
    await user.click(screen.getByRole('button', { name: 'Fix' }));
    expect(onOpenOutput).toHaveBeenCalledTimes(1);
  });

  it('has no Fix button while the output works', () => {
    renderBar({ onOpenOutput: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Fix' })).not.toBeInTheDocument();
  });

  it('has a search button that opens the palette, and shows its shortcut', async () => {
    const user = userEvent.setup();
    const onOpenSearch = vi.fn();
    renderBar({ onOpenSearch });
    const button = screen.getByRole('button', { name: 'Search' });
    expect(button).toHaveTextContent('K');
    await user.click(button);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it('shows the show name and renames it as you type', async () => {
    const user = userEvent.setup();
    const { onRename } = renderBar();
    const field = screen.getByLabelText('Show name');
    expect(field).toHaveValue('My show');
    await user.type(field, '!');
    expect(onRename).toHaveBeenCalledWith('My show!');
  });

  it('shows the master as a percentage and sends the new level from the slider', () => {
    const { send } = renderBar({ engine: { master: 0.4, blackout: false } });
    expect(screen.getByText('40%')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Master brightness'), { target: { value: '75' } });
    expect(send).toHaveBeenCalledWith({ type: 'master', level: 0.75 });
  });

  it('toggles blackout, and shows when it is on', async () => {
    const user = userEvent.setup();
    const { send, rerender, onRename, onToggleTheme } = renderBar();
    const button = screen.getByRole('button', { name: 'Blackout' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.click(button);
    expect(send).toHaveBeenLastCalledWith({ type: 'blackout', enabled: true });
    rerender(
      <TopBar
        projectName="My show"
        onRename={onRename}
        saveStatus="saved"
        connected
        output={{ driver: 'mock', connected: true }}
        engine={{ master: 1, blackout: true }}
        send={send}
        theme="light"
        onToggleTheme={onToggleTheme}
      />,
    );
    expect(screen.getByRole('button', { name: 'Blackout' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Blackout' }));
    expect(send).toHaveBeenLastCalledWith({ type: 'blackout', enabled: false });
  });

  it('switches the theme', async () => {
    const user = userEvent.setup();
    const { onToggleTheme } = renderBar({ theme: 'dark' });
    const toggle = screen.getByRole('switch', { name: 'Dark theme' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('opens and closes the rest of the controls with More, for a phone', async () => {
    const user = userEvent.setup();
    const { container } = renderBar();
    const header = container.querySelector('header');
    expect(header).not.toHaveAttribute('data-more');
    await user.click(screen.getByRole('button', { name: 'More controls' }));
    expect(header).toHaveAttribute('data-more');
    expect(screen.getByRole('button', { name: 'Fewer controls' })).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Fewer controls' }));
    expect(header).not.toHaveAttribute('data-more');
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderBar();
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
