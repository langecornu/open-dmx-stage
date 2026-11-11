// Component tests for the top bar: connection status, save status, show name, master, theme switch and blackout.
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

  it('has no automated accessibility violations', async () => {
    const { container } = renderBar();
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
