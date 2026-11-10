// Component tests for the always-visible Perform controls: master, blackout, stop and the master's MIDI link.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PerformControls } from '../../src/components/PerformControls.jsx';
import { accessibilityViolations } from './axe.js';

function renderControls(props = {}) {
  const handlers = { onPress: vi.fn(), onMaster: vi.fn() };
  const view = render(
    <PerformControls
      master={0.5}
      isBlackout={false}
      isLearning={false}
      labelFor={(text) => text}
      isArmed={() => false}
      {...handlers}
      {...props}
    />,
  );
  return { ...view, ...handlers };
}

describe('PerformControls', () => {
  it('shows the master as a percentage and sends the new level from the slider', () => {
    const { onMaster } = renderControls({ master: 0.42 });
    expect(screen.getByText('42%')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: /Master/ }), { target: { value: '80' } });
    expect(onMaster).toHaveBeenCalledWith(0.8);
  });

  it('presses blackout and stop as actions, and shows when blackout is on', async () => {
    const user = userEvent.setup();
    const { onPress, rerender } = renderControls();
    expect(screen.getByRole('button', { name: 'Blackout' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Blackout' }));
    expect(onPress).toHaveBeenLastCalledWith({ type: 'blackout' });
    await user.click(screen.getByRole('button', { name: 'Stop sequence' }));
    expect(onPress).toHaveBeenLastCalledWith({ type: 'stop' });
    rerender(
      <PerformControls
        master={1}
        isBlackout
        isLearning={false}
        labelFor={(text) => text}
        isArmed={() => false}
        onPress={onPress}
        onMaster={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Blackout' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers to link the master to a knob only while learning, and shows which button is armed', async () => {
    const user = userEvent.setup();
    const quiet = renderControls();
    expect(screen.queryByRole('button', { name: /Link master/ })).not.toBeInTheDocument();
    quiet.unmount();
    const { onPress } = renderControls({
      isLearning: true,
      isArmed: (action) => action.type === 'master',
      labelFor: (text, action) => (action.type === 'stop' ? `${text} · Note 36` : text),
    });
    const link = screen.getByRole('button', { name: 'Link master to a knob' });
    expect(link).toHaveAttribute('data-armed', 'true');
    expect(screen.getByRole('button', { name: 'Blackout' })).toHaveAttribute('data-armed', 'false');
    expect(screen.getByRole('button', { name: 'Stop sequence · Note 36' })).toBeInTheDocument();
    await user.click(link);
    expect(onPress).toHaveBeenLastCalledWith({ type: 'master' });
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderControls({ isLearning: true });
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
