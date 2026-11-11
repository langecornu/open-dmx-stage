// Component tests for the search palette: opening, typing, moving, running and closing, from the keyboard and the mouse.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CommandPalette } from '../../src/components/CommandPalette.jsx';
import { accessibilityViolations } from './axe.js';

function makeCommands() {
  return [
    { id: 'a', group: 'Looks', label: 'Play Ocean', hint: 'Look', keywords: '', run: vi.fn() },
    { id: 'b', group: 'Looks', label: 'Play Sunset', hint: 'Look', keywords: '', run: vi.fn() },
    { id: 'c', group: 'Go to', label: 'Perform', hint: 'Run the show', keywords: '', run: vi.fn() },
  ];
}

function renderPalette(props = {}) {
  const commands = makeCommands();
  const onClose = vi.fn();
  const context = { name: 'context' };
  const view = render(<CommandPalette isOpen onClose={onClose} commands={commands} context={context} {...props} />);
  return { ...view, commands, onClose, context };
}

describe('CommandPalette', () => {
  it('renders nothing while closed', () => {
    renderPalette({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('focuses the search box and lists every command under its group', () => {
    renderPalette();
    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByText('Looks', { selector: '.palette-group' })).toBeInTheDocument();
    expect(screen.getByText('Go to', { selector: '.palette-group' })).toBeInTheDocument();
  });

  it('narrows the list as you type and says when nothing matches', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'sun');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Play SunsetLook']);
    await user.type(screen.getByRole('combobox'), 'zzz');
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });

  it('runs the highlighted command with Enter, passing the context, and closes', async () => {
    const user = userEvent.setup();
    const { commands, onClose, context } = renderPalette();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(commands[1].run).toHaveBeenCalledWith(context);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('wraps around when moving past either end, and keeps aria-activedescendant in step', async () => {
    const user = userEvent.setup();
    renderPalette();
    const box = screen.getByRole('combobox');
    await user.keyboard('{ArrowUp}');
    const options = screen.getAllByRole('option');
    expect(options[2]).toHaveAttribute('aria-selected', 'true');
    expect(box.getAttribute('aria-activedescendant')).toBe(options[2].id);
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('runs a command when it is clicked', async () => {
    const user = userEvent.setup();
    const { commands, onClose } = renderPalette();
    await user.click(screen.getByRole('option', { name: /Perform/ }));
    expect(commands[2].run).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('closes with Escape or a click outside, and does nothing on Enter with no results', async () => {
    const user = userEvent.setup();
    const { onClose, commands } = renderPalette();
    await user.type(screen.getByRole('combobox'), 'zzz{Enter}');
    for (const command of commands) {
      expect(command.run).not.toHaveBeenCalled();
    }
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(document.querySelector('.palette-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderPalette();
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
