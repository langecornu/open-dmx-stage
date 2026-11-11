// Component tests for mute and solo on Perform: each light's state in words, the toggles, and clearing them all.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MuteSoloPanel } from '../../src/components/MuteSoloPanel.jsx';
import { accessibilityViolations } from './axe.js';

const project = {
  fixtures: [
    { id: 'a', name: 'Par 1' },
    { id: 'b', name: 'Par 2' },
    { id: 'c', name: 'Par 3' },
  ],
};

function renderPanel(engine = {}, show = project) {
  const live = { send: vi.fn(), engine: { muted: [], soloed: [], ...engine } };
  const view = render(<MuteSoloPanel project={show} live={live} />);
  return { ...view, live };
}

const row = (name) => screen.getByText(name).closest('li');

describe('MuteSoloPanel', () => {
  it('lists every light as lit, with nothing to clear', () => {
    renderPanel();
    expect(within(row('Par 1')).getByText('Lit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mute Par 1' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeDisabled();
  });

  it('mutes and solos a light, and undoes it from the same button', async () => {
    const user = userEvent.setup();
    const { live } = renderPanel({ muted: ['b'] });
    await user.click(screen.getByRole('button', { name: 'Mute Par 1' }));
    expect(live.send).toHaveBeenLastCalledWith({ type: 'mute', fixtureId: 'a', muted: true });
    await user.click(screen.getByRole('button', { name: 'Mute Par 2' }));
    expect(live.send).toHaveBeenLastCalledWith({ type: 'mute', fixtureId: 'b', muted: false });
    await user.click(screen.getByRole('button', { name: 'Solo Par 3' }));
    expect(live.send).toHaveBeenLastCalledWith({ type: 'solo', fixtureId: 'c', soloed: true });
  });

  it('says which lights are dark because another is solo, and clears everything', async () => {
    const user = userEvent.setup();
    const { live } = renderPanel({ muted: ['b'], soloed: ['a'] });
    expect(within(row('Par 1')).getByText('Lit (solo)')).toBeInTheDocument();
    expect(within(row('Par 2')).getByText('Muted')).toBeInTheDocument();
    expect(within(row('Par 3')).getByText('Dark: another light is solo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Solo Par 1' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(live.send).toHaveBeenCalledWith({ type: 'clearMuteSolo' });
  });

  it('points to Setup when the rig is empty', () => {
    renderPanel({}, { fixtures: [] });
    expect(screen.getByText('Add lights to your rig in Setup first.')).toBeInTheDocument();
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderPanel({ muted: ['b'], soloed: ['a'] });
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
