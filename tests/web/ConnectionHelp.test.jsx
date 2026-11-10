// Component tests for the connection guide modal: tabs, keyboard use, focus return, scrolling and accessibility.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConnectionHelp } from '../../src/components/ConnectionHelp.jsx';
import { accessibilityViolations } from './axe.js';

const TAB_NAMES = [
  'Start here',
  'Passive or active?',
  'USB cable',
  'ENTTEC Pro',
  'Art-Net',
  'sACN',
  'Wiring & addresses',
  'Fix problems',
];

function Harness() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open the guide
      </button>
      {isOpen ? <ConnectionHelp onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}

describe('ConnectionHelp', () => {
  it('opens on the requested page and offers all eight pages', () => {
    render(<ConnectionHelp initialTab="artnet" onClose={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(TAB_NAMES);
    expect(screen.getByRole('tab', { name: 'Art-Net', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'How to connect your lights' })).toBeInTheDocument();
  });

  it('shows content on every page and has no automated accessibility violations on any of them', async () => {
    const user = userEvent.setup();
    const { container } = render(<ConnectionHelp onClose={vi.fn()} />);
    for (const name of TAB_NAMES) {
      await user.click(screen.getByRole('tab', { name }));
      const panel = screen.getByRole('tabpanel');
      expect(panel.textContent?.length ?? 0, `${name} has content`).toBeGreaterThan(100);
      expect(await accessibilityViolations(container), `${name} is accessible`).toEqual([]);
    }
  });

  it('moves between pages with the arrow, Home and End keys', async () => {
    const user = userEvent.setup();
    render(<ConnectionHelp onClose={vi.fn()} />);
    screen.getByRole('tab', { name: 'Start here' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Passive or active?', selected: true })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Fix problems', selected: true })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Start here', selected: true })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Fix problems', selected: true })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Start here', selected: true })).toHaveFocus();
  });

  it('returns focus to the button that opened it when it is closed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open the guide' });
    await user.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close guide' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('closes when the backdrop (the dialog itself) is clicked, but not when its content is', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open the guide' }));
    await user.click(screen.getByRole('tabpanel'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('scrolls back to the top when the page changes', async () => {
    const user = userEvent.setup();
    render(<ConnectionHelp onClose={vi.fn()} />);
    const panel = screen.getByRole('tabpanel');
    panel.scrollTop = 300;
    await user.click(screen.getByRole('tab', { name: 'Fix problems' }));
    expect(screen.getByRole('tabpanel').scrollTop).toBe(0);
  });
});
