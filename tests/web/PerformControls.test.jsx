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
      playingName={null}
      playTarget={{ id: 'show', name: 'Opening' }}
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

  it('presses blackout, and says so when blackout is on, in words and not only in colour', async () => {
    const user = userEvent.setup();
    const { onPress, rerender } = renderControls();
    expect(screen.getByRole('button', { name: 'Blackout' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Blackout' }));
    expect(onPress).toHaveBeenLastCalledWith({ type: 'blackout' });
    rerender(
      <PerformControls
        master={1}
        isBlackout
        isLearning={false}
        playingName={null}
        playTarget={null}
        labelFor={(text) => text}
        isArmed={() => false}
        onPress={onPress}
        onMaster={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Blackout is on' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Blackout is on, so the lights are dark.');
  });

  it('is one button: Play sequence when nothing is playing, with the sequence it will play', async () => {
    const user = userEvent.setup();
    const { onPress } = renderControls();
    expect(screen.getByRole('status')).toHaveTextContent('No sequence is playing.');
    expect(screen.queryByRole('button', { name: 'Stop sequence' })).not.toBeInTheDocument();
    const play = screen.getByRole('button', { name: 'Play sequence' });
    expect(play).toBeEnabled();
    expect(play).toHaveAttribute('title', 'Play Opening');
    await user.click(play);
    expect(onPress).toHaveBeenLastCalledWith({ type: 'sequence', id: 'show' });
  });

  it('becomes Stop sequence while one plays, names it, and stops it', async () => {
    const user = userEvent.setup();
    const { onPress } = renderControls({ playingName: 'Colour cycle' });
    expect(screen.getByRole('status')).toHaveTextContent('Playing: Colour cycle.');
    expect(screen.queryByRole('button', { name: 'Play sequence' })).not.toBeInTheDocument();
    const stop = screen.getByRole('button', { name: 'Stop sequence' });
    expect(stop).toBeEnabled();
    expect(stop).toHaveAttribute('title', 'Stop Colour cycle');
    await user.click(stop);
    expect(onPress).toHaveBeenLastCalledWith({ type: 'stop' });
  });

  it('is greyed out, with the reason, when there are no sequences to play', () => {
    renderControls({ playTarget: null });
    const button = screen.getByRole('button', { name: 'Play sequence' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Make a sequence first');
  });

  it('while learning MIDI, has a separate link button for stop, usable even when nothing plays', async () => {
    const user = userEvent.setup();
    const { onPress } = renderControls({ isLearning: true });
    const link = screen.getByRole('button', { name: 'Link stop to a pad' });
    expect(link).toBeEnabled();
    await user.click(link);
    expect(onPress).toHaveBeenLastCalledWith({ type: 'stop' });
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
    expect(screen.getByRole('button', { name: 'Link stop to a pad · Note 36' })).toBeInTheDocument();
    await user.click(link);
    expect(onPress).toHaveBeenLastCalledWith({ type: 'master' });
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderControls({ isLearning: true });
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
