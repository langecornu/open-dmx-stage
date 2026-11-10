// Tests for the tempo and effects controls on the Perform screen.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PerformView } from '../../src/components/PerformView.jsx';
import { accessibilityViolations } from './axe.js';

const project = {
  schemaVersion: 3,
  name: 'Test',
  fixtureTypes: [],
  fixtures: [],
  scenes: [],
  chases: [],
  groups: [{ id: 'front', name: 'Front row', fixtureIds: [] }],
};
const patch = { channels: new Map(), fixtures: [] };

let live;
function renderView(engine = {}) {
  live = {
    send: vi.fn(),
    engine: { master: 1, blackout: false, bpm: 120, effect: null, activeSceneId: null, activeChaseId: null, ...engine },
  };
  return render(<PerformView project={project} patch={patch} live={live} flush={vi.fn()} />);
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('tempo', () => {
  it('shows the tempo and sets a typed tempo when the field is left, limited to the allowed range', async () => {
    const user = userEvent.setup();
    renderView({ bpm: 128 });
    const field = screen.getByLabelText('Tempo (beats per minute)');
    expect(field).toHaveValue(128);
    await user.clear(field);
    await user.type(field, '140');
    await user.tab();
    expect(live.send).toHaveBeenLastCalledWith({ type: 'tempo', bpm: 140, sync: false });
    await user.clear(field);
    await user.type(field, '9000');
    await user.keyboard('{Enter}');
    expect(live.send).toHaveBeenLastCalledWith({ type: 'tempo', bpm: 300, sync: false });
  });

  it('halves and doubles the tempo', async () => {
    const user = userEvent.setup();
    renderView({ bpm: 100 });
    await user.click(screen.getByRole('button', { name: 'Double speed' }));
    expect(live.send).toHaveBeenLastCalledWith({ type: 'tempo', bpm: 200, sync: false });
    await user.click(screen.getByRole('button', { name: 'Half speed' }));
    expect(live.send).toHaveBeenLastCalledWith({ type: 'tempo', bpm: 50, sync: false });
  });

  it('taps a tempo from the button and the full stop key, lining the beat up on each tap', async () => {
    const user = userEvent.setup();
    const clock = vi.spyOn(performance, 'now');
    renderView({ bpm: 100 });
    clock.mockReturnValue(1000);
    await user.click(screen.getByRole('button', { name: 'Tap tempo' }));
    expect(live.send).toHaveBeenLastCalledWith({ type: 'tempo', bpm: 100, sync: true });
    clock.mockReturnValue(1500);
    fireEvent.keyDown(window, { key: '.' });
    expect(live.send).toHaveBeenLastCalledWith({ type: 'tempo', bpm: 120, sync: true });
  });
});

describe('effects', () => {
  it('starts an effect over all lights, and stops it when pressed again', async () => {
    const user = userEvent.setup();
    const { unmount } = renderView();
    await user.click(screen.getByRole('button', { name: 'Pulse' }));
    expect(live.send).toHaveBeenLastCalledWith({ type: 'effectStart', effect: 'pulse', beats: 1, groupId: null });
    unmount();

    renderView({ effect: { type: 'pulse', beats: 1, groupId: null } });
    expect(screen.getByRole('button', { name: 'Pulse' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('pulse running')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pulse' }));
    expect(live.send).toHaveBeenLastCalledWith({ type: 'effectStop' });
    await user.click(screen.getByRole('button', { name: 'Stop effect' }));
    expect(live.send).toHaveBeenLastCalledWith({ type: 'effectStop' });
  });

  it('runs on a chosen group and length, and restarts a running effect when either changes', async () => {
    const user = userEvent.setup();
    renderView({ effect: { type: 'sweep', beats: 1, groupId: null } });
    await user.selectOptions(screen.getByLabelText('Lights'), 'front');
    expect(live.send).toHaveBeenLastCalledWith({ type: 'effectStart', effect: 'sweep', beats: 1, groupId: 'front' });
    await user.selectOptions(screen.getByLabelText('One cycle lasts'), '4');
    expect(live.send).toHaveBeenLastCalledWith({ type: 'effectStart', effect: 'sweep', beats: 4, groupId: 'front' });
  });

  it('does not start anything when only the choices change and no effect is running', async () => {
    const user = userEvent.setup();
    renderView();
    await user.selectOptions(screen.getByLabelText('One cycle lasts'), '2');
    expect(live.send).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Rainbow' }));
    expect(live.send).toHaveBeenCalledWith({ type: 'effectStart', effect: 'rainbow', beats: 2, groupId: null });
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderView({ effect: { type: 'rainbow', beats: 2, groupId: null } });
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
