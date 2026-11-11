// Component tests for the Perform screen: big buttons, keyboard shortcuts, master and blackout, and MIDI learning.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { PerformView } from '../../src/components/PerformView.jsx';
import { accessibilityViolations } from './axe.js';
import { BUILTIN_TYPES } from './fixtures.js';

const project = {
  schemaVersion: 3,
  name: 'Test',
  fixtureTypes: [],
  fixtures: [{ id: 'a', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1 }],
  scenes: [
    { id: 'warm', name: 'Warm wash', values: { 1: 255, 2: 120 } },
    { id: 'cool', name: 'Cool wash', values: { 3: 255 } },
  ],
  chases: [
    {
      id: 'show',
      name: 'Opening',
      loop: true,
      timing: 'seconds',
      steps: [{ id: 's1', sceneId: 'warm', fadeMs: 0, holdMs: 1000, fadeBeats: 0, holdBeats: 2 }],
    },
  ],
  groups: [{ id: 'front', name: 'Front row', fixtureIds: ['a'] }],
};
const patch = buildPatch(project, BUILTIN_TYPES);

let live;
let flush;

function renderView(engine = {}) {
  live = {
    send: vi.fn(),
    engine: {
      master: 1,
      blackout: false,
      bpm: 120,
      effect: null,
      activeSceneId: null,
      activeChaseId: null,
      chaseStep: null,
      ...engine,
    },
  };
  flush = vi.fn().mockResolvedValue(undefined);
  return render(<PerformView project={project} patch={patch} live={live} flush={flush} />);
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  delete navigator.requestMIDIAccess;
});

describe('PerformView', () => {
  it('shows every look and sequence as a big button with its keyboard key', () => {
    renderView();
    expect(screen.getByRole('button', { name: 'Warm wash, Look, key 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cool wash, Look, key 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Opening, Sequence, key 3' })).toBeInTheDocument();
  });

  it('plays a look with the chosen fade when its button is pressed, after saving any pending edit', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: /Warm wash/ }));
    expect(flush).toHaveBeenCalled();
    expect(live.send).toHaveBeenCalledWith({ type: 'recall', sceneId: 'warm', fadeMs: 500 });
    await user.selectOptions(screen.getByLabelText('Fade when playing a look'), '0');
    await user.click(screen.getByRole('button', { name: /Cool wash/ }));
    expect(live.send).toHaveBeenLastCalledWith({ type: 'recall', sceneId: 'cool', fadeMs: 0 });
  });

  it('shows an error instead of losing it when playing fails, and clears it on the next press', async () => {
    const user = userEvent.setup();
    renderView();
    flush.mockRejectedValueOnce(new Error('The show could not be saved.'));
    await user.click(screen.getByRole('button', { name: /Warm wash/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The show could not be saved.');
    expect(live.send, 'nothing is played when the save failed').not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Cool wash/ }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(live.send).toHaveBeenCalledWith({ type: 'recall', sceneId: 'cool', fadeMs: 500 });
  });

  it('starts a sequence, and stops it when it is pressed again while playing', async () => {
    const user = userEvent.setup();
    const { unmount } = renderView();
    await user.click(screen.getByRole('button', { name: /Opening/ }));
    expect(live.send).toHaveBeenCalledWith({ type: 'chaseStart', chaseId: 'show' });
    unmount();

    renderView({ activeChaseId: 'show' });
    const tile = screen.getByRole('button', { name: /Opening/ });
    expect(tile).toHaveAttribute('aria-pressed', 'true');
    await user.click(tile);
    expect(live.send).toHaveBeenCalledWith({ type: 'chaseStop' });
  });

  it('plays looks and sequences from their keyboard keys', async () => {
    renderView();
    await act(async () => {
      fireEvent.keyDown(window, { key: '2' });
    });
    expect(live.send).toHaveBeenCalledWith({ type: 'recall', sceneId: 'cool', fadeMs: 500 });
    await act(async () => {
      fireEvent.keyDown(window, { key: '3' });
    });
    expect(live.send).toHaveBeenCalledWith({ type: 'chaseStart', chaseId: 'show' });
  });

  it('uses Space for blackout, Escape to stop, and [ and ] for the master', async () => {
    renderView({ master: 0.5, blackout: false });
    await act(async () => {
      fireEvent.keyDown(window, { key: ' ' });
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.keyDown(window, { key: ']' });
      fireEvent.keyDown(window, { key: '[' });
    });
    expect(live.send).toHaveBeenCalledWith({ type: 'blackout', enabled: true });
    expect(live.send).toHaveBeenCalledWith({ type: 'chaseStop' });
    expect(live.send).toHaveBeenCalledWith({ type: 'master', level: 0.6 });
    expect(live.send).toHaveBeenCalledWith({ type: 'master', level: 0.4 });
  });

  it('does not run shortcuts while a field has focus, so the fade menu stays usable', () => {
    renderView();
    const fade = screen.getByLabelText('Fade when playing a look');
    fade.focus();
    fireEvent.keyDown(fade, { key: '1' });
    expect(live.send).not.toHaveBeenCalled();
  });

  it('groups the pads into Looks and Sequences, with how many of each', () => {
    renderView();
    const looks = screen.getByRole('region', { name: /Looks/ });
    const sequences = screen.getByRole('region', { name: /Sequences/ });
    expect(within(looks).getByRole('button', { name: /Warm wash/ })).toBeInTheDocument();
    expect(within(looks).queryByRole('button', { name: /Opening/ })).not.toBeInTheDocument();
    expect(within(sequences).getByRole('button', { name: /Opening/ })).toBeInTheDocument();
    expect(within(looks).getByText('2', { selector: '.section-count' })).toBeInTheDocument();
    expect(within(sequences).getByText('1', { selector: '.section-count' })).toBeInTheDocument();
  });

  it('says On stage on the pad that is playing', () => {
    renderView({ activeChaseId: 'show' });
    expect(within(screen.getByRole('button', { name: /Opening/ })).getByText('On stage')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Warm wash/ })).queryByText('On stage')).not.toBeInTheDocument();
  });

  it('lists the keyboard shortcuts on screen', () => {
    renderView();
    const hints = screen.getByRole('list', { name: 'Keyboard shortcuts' });
    expect(hints).toHaveTextContent('Space Blackout');
    expect(hints).toHaveTextContent('Esc Stop');
  });

  it('leaves master, blackout and stop to the top bar and the On stage bar', () => {
    renderView({ master: 0.8 });
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Blackout/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sequence$/ })).not.toBeInTheDocument();
  });

  it('explains how to get started when there is nothing to perform', () => {
    live = {
      send: vi.fn(),
      engine: {
        master: 1,
        blackout: false,
        bpm: 120,
        effect: null,
        activeSceneId: null,
        activeChaseId: null,
      },
    };
    render(<PerformView project={{ ...project, scenes: [], chases: [] }} patch={patch} live={live} flush={vi.fn()} />);
    expect(screen.getByText('Nothing to perform yet')).toBeInTheDocument();
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderView();
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});

describe('PerformView MIDI', () => {
  function installFakeMidi() {
    const input = { name: 'Test Pad', onmidimessage: null };
    const access = { inputs: new Map([['one', input]]), onstatechange: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      value: vi.fn().mockResolvedValue(access),
      configurable: true,
      writable: true,
    });
    return { input };
  }
  const press = (input, note) => act(async () => input.onmidimessage({ data: Uint8Array.from([0x90, note, 100]) }));

  it('says when the browser has no MIDI, and does not offer to turn it on', () => {
    renderView();
    expect(screen.getByText(/does not support MIDI/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on MIDI' })).toBeDisabled();
  });

  it('links a pad to a look in learn mode, shows the link, then plays the look from the pad', async () => {
    const user = userEvent.setup();
    const { input } = installFakeMidi();
    renderView();
    await user.click(screen.getByRole('button', { name: 'Turn on MIDI' }));
    expect(await screen.findByText('Test Pad')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Learn MIDI' }));
    await user.click(screen.getByRole('button', { name: /Cool wash/ }));
    expect(live.send, 'tapping a tile in learn mode only selects it').not.toHaveBeenCalled();
    expect(screen.getByText('Press a pad or turn a knob…')).toBeInTheDocument();
    await press(input, 36);
    expect(screen.getByRole('button', { name: 'Cool wash, Look, key 2, Note 36 (ch 1)' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('odmx-midi-map'))).toEqual({ 'note:1:36': { type: 'look', id: 'cool' } });

    await user.click(screen.getByRole('button', { name: 'Done learning' }));
    await press(input, 36);
    expect(live.send).toHaveBeenCalledWith({ type: 'recall', sceneId: 'cool', fadeMs: 500 });
  });

  it('links the master to a knob and follows it', async () => {
    const user = userEvent.setup();
    const { input } = installFakeMidi();
    renderView();
    await user.click(screen.getByRole('button', { name: 'Turn on MIDI' }));
    await screen.findByText('Test Pad');
    await user.click(screen.getByRole('button', { name: 'Learn MIDI' }));
    await user.click(screen.getByRole('button', { name: /Link master to a knob/ }));
    await press(input, 36); // a pad is not a knob: ignored while linking the master
    expect(screen.queryByText(/CC 7/)).not.toBeInTheDocument();
    await act(async () => input.onmidimessage({ data: Uint8Array.from([0xb0, 7, 127]) }));
    expect(screen.getByRole('button', { name: /Link master to a knob · CC 7 \(ch 1\)/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done learning' }));
    await act(async () => input.onmidimessage({ data: Uint8Array.from([0xb0, 7, 0]) }));
    expect(live.send).toHaveBeenLastCalledWith({ type: 'master', level: 0 });
  });

  it('forgets links to looks that were deleted, and can clear all links', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'odmx-midi-map',
      JSON.stringify({ 'note:1:1': { type: 'look', id: 'deleted' }, 'note:1:2': { type: 'look', id: 'warm' } }),
    );
    installFakeMidi();
    renderView();
    expect(JSON.parse(localStorage.getItem('odmx-midi-map'))).toEqual({ 'note:1:2': { type: 'look', id: 'warm' } });
    await user.click(screen.getByRole('button', { name: 'Turn on MIDI' }));
    await screen.findByText('Test Pad');
    await user.click(screen.getByRole('button', { name: 'Clear links' }));
    expect(JSON.parse(localStorage.getItem('odmx-midi-map'))).toEqual({});
    expect(within(screen.getByRole('button', { name: /Warm wash/ })).queryByText(/Note/)).not.toBeInTheDocument();
  });

  it('only offers to link blackout and stop to a controller while learning', async () => {
    const user = userEvent.setup();
    installFakeMidi();
    renderView();
    expect(screen.queryByRole('button', { name: 'Link blackout to a pad' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Turn on MIDI' }));
    await screen.findByText('Test Pad');
    await user.click(screen.getByRole('button', { name: 'Learn MIDI' }));
    expect(screen.getByRole('button', { name: 'Link blackout to a pad' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link stop to a pad' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done learning' }));
    expect(screen.queryByRole('button', { name: 'Link stop to a pad' })).not.toBeInTheDocument();
  });
});
