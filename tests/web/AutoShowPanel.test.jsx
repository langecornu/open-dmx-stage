// Component tests for the auto show panel on Perform: choosing what plays, starting and stopping, and what it says.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AutoShowPanel } from '../../src/components/AutoShowPanel.jsx';
import { accessibilityViolations } from './axe.js';

const step = (id, sceneId) => ({ id, sceneId, fadeMs: 0, holdMs: 1000, fadeBeats: 0, holdBeats: 1 });
const project = {
  scenes: [
    { id: 'red', name: 'Red', values: { 1: 255 } },
    { id: 'dark', name: 'Dark', values: { 1: 0 } },
  ],
  chases: [
    { id: 'c1', name: 'Opening', loop: true, timing: 'seconds', steps: [step('s1', 'red')] },
    { id: 'c2', name: 'Orphan', loop: true, timing: 'seconds', steps: [step('s2', 'deleted')] },
  ],
};

function renderPanel({ auto = null, show = project, flush = vi.fn().mockResolvedValue(undefined) } = {}) {
  const live = { send: vi.fn(), engine: { auto } };
  const view = render(<AutoShowPanel project={show} live={live} flush={flush} />);
  return { ...view, live, flush };
}

describe('AutoShowPanel', () => {
  it('counts only what an auto show can play: lit looks, and sequences with a look left', () => {
    renderPanel();
    expect(screen.getByRole('option', { name: 'Looks (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sequences (1)' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Not running.');
  });

  it('starts with the chosen settings, after saving any pending edit', async () => {
    const user = userEvent.setup();
    const { live, flush } = renderPanel();
    await user.selectOptions(screen.getByLabelText('Play'), 'sequences');
    await user.selectOptions(screen.getByLabelText('Change'), 'every 4 bars');
    await user.selectOptions(screen.getByLabelText('Order'), 'Shuffled');
    await user.click(screen.getByRole('button', { name: 'Start auto show' }));
    expect(flush).toHaveBeenCalled();
    expect(live.send).toHaveBeenCalledWith({ type: 'autoStart', source: 'sequences', beats: 16, order: 'shuffle' });
  });

  it('shows what is playing, locks the choices, and stops from the same button', async () => {
    const user = userEvent.setup();
    const { live } = renderPanel({ auto: { source: 'looks', beats: 4, order: 'order', itemId: 'red' } });
    expect(screen.getByRole('status')).toHaveTextContent('Playing Red. Looks · in order · changes every bar.');
    expect(screen.getByLabelText('Play')).toBeDisabled();
    expect(screen.getByLabelText('Change')).toHaveValue('4');
    const button = screen.getByRole('button', { name: 'Stop auto show' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await user.click(button);
    expect(live.send).toHaveBeenCalledWith({ type: 'autoStop' });
  });

  it('cannot start, and says why, when every look leaves the lights off', () => {
    renderPanel({ show: { scenes: [project.scenes[1]], chases: [] } });
    expect(screen.getByRole('button', { name: 'Start auto show' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Save a look with some light in it first');
  });

  it('shows an error instead of starting when the show cannot be saved', async () => {
    const user = userEvent.setup();
    const { live } = renderPanel({ flush: vi.fn().mockRejectedValue(new Error('The show could not be saved.')) });
    await user.click(screen.getByRole('button', { name: 'Start auto show' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The show could not be saved.');
    expect(live.send).not.toHaveBeenCalled();
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderPanel();
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
