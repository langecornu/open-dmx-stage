// Component tests for the keyboard shortcut cheat sheet.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ShortcutsDialog } from '../../src/components/ShortcutsDialog.jsx';
import { accessibilityViolations } from './axe.js';

describe('ShortcutsDialog', () => {
  it('renders nothing while closed', () => {
    render(<ShortcutsDialog isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists the shortcuts under Anywhere and On Perform, and focuses Close', () => {
    render(<ShortcutsDialog isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Anywhere' })).toHaveTextContent('Search screens');
    expect(screen.getByRole('region', { name: 'On Perform' })).toHaveTextContent('Blackout on or off');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('closes with the button, Escape, or a click outside', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ShortcutsDialog isOpen onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.keyboard('{Escape}');
    await user.click(document.querySelector('.palette-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('has no automated accessibility violations', async () => {
    const { container } = render(<ShortcutsDialog isOpen onClose={vi.fn()} />);
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
