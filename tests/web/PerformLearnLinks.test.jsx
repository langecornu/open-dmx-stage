// Component tests for the learn-mode strip that links blackout, stop and master to a controller.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PerformLearnLinks } from '../../src/components/PerformLearnLinks.jsx';
import { accessibilityViolations } from './axe.js';

function renderLinks(props = {}) {
  const onPress = vi.fn();
  const view = render(
    <PerformLearnLinks labelFor={(text) => text} isArmed={() => false} onPress={onPress} {...props} />,
  );
  return { ...view, onPress };
}

describe('PerformLearnLinks', () => {
  it.each([
    ['Link blackout to a pad', { type: 'blackout' }],
    ['Link stop to a pad', { type: 'stop' }],
    ['Link master to a knob', { type: 'master' }],
  ])('arms "%s" when pressed', async (name, action) => {
    const { onPress } = renderLinks();
    await userEvent.click(screen.getByRole('button', { name }));
    expect(onPress).toHaveBeenCalledWith(action);
  });

  it('shows which one is armed and the control it is already linked to', () => {
    renderLinks({
      isArmed: (action) => action.type === 'stop',
      labelFor: (text, action) => (action.type === 'master' ? `${text} · CC 7` : text),
    });
    expect(screen.getByRole('button', { name: 'Link stop to a pad' })).toHaveAttribute('data-armed', 'true');
    expect(screen.getByRole('button', { name: 'Link blackout to a pad' })).toHaveAttribute('data-armed', 'false');
    expect(screen.getByRole('button', { name: 'Link master to a knob · CC 7' })).toBeInTheDocument();
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderLinks();
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
