// Component tests for the Lights screen: colours and brightness for all or selected fixtures, and per-channel faders.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { ControlView } from '../../src/components/ControlView.jsx';
import { frameStore } from '../../src/hooks/frameStore.js';
import { accessibilityViolations } from './axe.js';
import { BUILTIN_TYPES, makeLive, makeShow } from './fixtures.js';

function renderView({ project = makeShow(), live = makeLive() } = {}) {
  const patch = buildPatch(project, BUILTIN_TYPES);
  const props = { project, patch, live };
  const view = render(<ControlView {...props} />);
  return { ...view, live, rerenderWith: (nextLive) => view.rerender(<ControlView {...props} live={nextLive} />) };
}

const lastSet = (live) => live.setChannels.mock.calls.at(-1)[0];

afterEach(() => {
  act(() => frameStore.set(new Array(512).fill(0)));
});

describe('ControlView', () => {
  it('asks you to add lights when there are none', () => {
    renderView({ project: makeShow({ fixtures: [] }) });
    expect(screen.getByText('No lights yet')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Colour studio' })).not.toBeInTheDocument();
  });

  it('shows the colour studio and one tile per patched fixture, with its DMX range', () => {
    renderView();
    expect(screen.getByRole('region', { name: 'Colour studio' })).toBeInTheDocument();
    expect(screen.getByText('Par 1')).toBeInTheDocument();
    expect(screen.getByText('DMX 1–3')).toBeInTheDocument();
    expect(screen.getByText('DMX 10–10')).toBeInTheDocument();
    expect(screen.getByText('Applies to: all fixtures')).toBeInTheDocument();
  });

  it('applies a quick colour to every fixture', async () => {
    const user = userEvent.setup();
    const { live } = renderView();
    await user.click(screen.getByRole('button', { name: 'Red' }));
    const values = lastSet(live);
    expect([values[1], values[2], values[3]]).toEqual([255, 32, 48]);
    expect([values[4], values[5], values[6]]).toEqual([255, 32, 48]);
    expect(typeof values[10]).toBe('number');
  });

  it('applies colours only to the fixtures you pick, and says so', async () => {
    const user = userEvent.setup();
    const { live } = renderView();
    await user.click(screen.getByRole('button', { name: /Par 2/, pressed: false }));
    expect(screen.getByText('Applies to: 1 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Blue' }));
    const values = lastSet(live);
    expect(
      Object.keys(values)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([4, 5, 6]);
    expect(values[6]).toBe(255);
  });

  it('clears the selection, and deselects a fixture when it is picked again', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: /Par 1/, pressed: false }));
    await user.click(screen.getByRole('button', { name: /Lamp/, pressed: false }));
    expect(screen.getByText('Applies to: 2 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Lamp/, pressed: true }));
    expect(screen.getByText('Applies to: 1 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.getByText('Applies to: all fixtures')).toBeInTheDocument();
    expect(screen.getByText('Tap fixtures to pick which ones to colour')).toBeInTheDocument();
  });

  it('scales the colour with the brightness slider', () => {
    const { live } = renderView();
    fireEvent.change(screen.getByRole('slider', { name: /^Brightness/ }), { target: { value: '50' } });
    const values = lastSet(live);
    expect([values[1], values[2], values[3]]).toEqual([128, 95, 60]); // warm white at half brightness
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('picking a colour while the brightness is at zero brings the brightness back up', async () => {
    const user = userEvent.setup();
    renderView();
    fireEvent.change(screen.getByRole('slider', { name: /^Brightness/ }), { target: { value: '0' } });
    await user.click(screen.getByRole('button', { name: 'Green' }));
    expect(screen.getByRole('slider', { name: /^Brightness/ })).toHaveValue('100');
  });

  it('resets manual changes only when there are some, and says how many', async () => {
    const user = userEvent.setup();
    const quiet = renderView();
    expect(screen.getByRole('button', { name: 'Reset manual changes' })).toBeDisabled();
    quiet.unmount();
    const busy = renderView({ live: makeLive({ programmerChannels: [1, 2] }) });
    const button = screen.getByRole('button', { name: 'Reset manual changes (2)' });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(busy.live.send).toHaveBeenCalledWith({ type: 'clearProgrammer' });
  });

  it('opens a fixture to show its channel faders, and sets one channel at a time', async () => {
    const user = userEvent.setup();
    const { live } = renderView();
    const tile = screen.getByText('Par 1').closest('article');
    const toggle = within(tile).getByRole('button', { name: 'Channels' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(within(tile).getByRole('button', { name: 'Hide channels' })).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['Red', 'Green', 'Blue']) {
      expect(within(tile).getByRole('slider', { name })).toBeInTheDocument();
    }
    fireEvent.change(within(tile).getByRole('slider', { name: 'Green' }), { target: { value: '77' } });
    expect(live.setChannels).toHaveBeenLastCalledWith({ 2: 77 });
    expect(within(tile).getByRole('slider', { name: 'Green' })).toHaveValue('77');
    await user.click(within(tile).getByRole('button', { name: 'Hide channels' }));
    expect(within(tile).queryByRole('slider', { name: 'Green' })).not.toBeInTheDocument();
  });

  it('forgets the fader values you set once the server drops the manual changes', async () => {
    const user = userEvent.setup();
    const manual = makeLive({ programmerChannels: [2] });
    const { rerenderWith } = renderView({ live: manual });
    const tile = screen.getByText('Par 1').closest('article');
    await user.click(within(tile).getByRole('button', { name: 'Channels' }));
    fireEvent.change(within(tile).getByRole('slider', { name: 'Green' }), { target: { value: '77' } });
    expect(within(tile).getByRole('slider', { name: 'Green' })).toHaveValue('77');
    rerenderWith(makeLive({ programmerChannels: [] }));
    expect(within(tile).getByRole('slider', { name: 'Green' })).toHaveValue('0');
  });

  it('shows what the lights are really doing, from the live frame', () => {
    const { container } = renderView();
    const frame = new Array(512).fill(0);
    frame[0] = 255; // Par 1 red
    act(() => frameStore.set(frame));
    const orb = container.querySelector('.tile .orb');
    expect(orb?.getAttribute('style') ?? '').toMatch(/box-shadow/);
  });

  it('has no automated accessibility violations', async () => {
    const user = userEvent.setup();
    const { container } = renderView();
    await user.click(within(screen.getByText('Par 1').closest('article')).getByRole('button', { name: 'Channels' }));
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
