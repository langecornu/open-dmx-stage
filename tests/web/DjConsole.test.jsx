// Component tests for the DJ console: the library and its folder, loading a track with its saved or new beat
// analysis, play, pause and cue, the tempo fader and sync, the mixer, the lights locking to the deck being heard, and
// the compact console in the visualizer. Media and Web Audio are stand-ins (see deckMocks.js).
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../src/api.js';
import { DjConsole } from '../../src/components/DjConsole.jsx';
import { DecksProvider, useDecks } from '../../src/hooks/useDecks.js';
import { accessibilityViolations } from './axe.js';
import { MockAudio, MockAudioContext, installMockDecks } from './deckMocks.js';

const TRACKS = [
  { id: 'one', file: 'a/one.mp3', title: 'Rapture', artist: '&ME', album: 'Pt III', duration: 417, bpm: 122 },
  { id: 'two', file: 'b/two.mp3', title: 'Be The One', artist: 'Adam Port', album: '', duration: 206, bpm: null },
];
const SAVED = { bpm: 120, firstBeatSeconds: 1, durationSeconds: 417, peaks: [0.2, 1, 0.5] };

let send;
let uninstall;

function renderConsole(props = {}) {
  send = vi.fn();
  return render(
    <DecksProvider send={send}>
      <DjConsole {...props} />
    </DecksProvider>,
  );
}

const deck = (side) => screen.getByRole('region', { name: `Deck ${side}` });

async function loadOnA(user, title = 'Rapture') {
  const row = (await screen.findByText(title)).closest('li');
  await user.click(within(row).getByRole('button', { name: /deck A/ }));
}

beforeEach(() => {
  uninstall = installMockDecks();
  vi.spyOn(api, 'getMusic').mockResolvedValue({ folder: '/Users/me/Music', exists: true, tracks: TRACKS });
  vi.spyOn(api, 'setMusicFolder').mockResolvedValue({ folder: '/Volumes/Music', exists: true, tracks: TRACKS });
  vi.spyOn(api, 'getTrackAnalysis').mockResolvedValue({ analysis: SAVED });
  vi.spyOn(api, 'saveTrackAnalysis').mockResolvedValue({ ok: true });
  vi.spyOn(api, 'getTrackAudio').mockResolvedValue(new ArrayBuffer(8));
});
afterEach(() => {
  uninstall();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('DjConsole', () => {
  it('lists the music folder, searches it, and is accessible', async () => {
    const user = userEvent.setup();
    const { container } = renderConsole();
    expect(await screen.findByText('Rapture')).toBeInTheDocument();
    expect(screen.getByText('122 BPM · 6:57')).toBeInTheDocument();
    expect(screen.getByLabelText('Music folder on the computer running the app')).toHaveValue('/Users/me/Music');
    await user.type(screen.getByRole('searchbox', { name: 'Search the music' }), 'adam');
    expect(screen.queryByText('Rapture')).not.toBeInTheDocument();
    expect(screen.getByText('Be The One')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
    expect(await accessibilityViolations(container)).toEqual([]);
  });

  it('changes the folder, reports a folder that is not one, and rescans', async () => {
    const user = userEvent.setup();
    renderConsole();
    const input = await screen.findByDisplayValue('/Users/me/Music');
    await user.clear(input);
    await user.type(input, '/Volumes/Music');
    await user.click(screen.getByRole('button', { name: 'Use this folder' }));
    expect(api.setMusicFolder).toHaveBeenCalledWith('/Volumes/Music');
    expect(await screen.findByDisplayValue('/Volumes/Music')).toBeInTheDocument();

    api.setMusicFolder.mockRejectedValueOnce(new Error('There is no folder at /nope on this computer.'));
    await user.clear(input);
    await user.type(input, '/nope');
    await user.click(screen.getByRole('button', { name: 'Use this folder' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('There is no folder at /nope');

    await user.click(screen.getByRole('button', { name: 'Rescan' }));
    expect(api.getMusic).toHaveBeenLastCalledWith(true);
  });

  it('explains a missing or empty folder, a failed read, and a long list', async () => {
    api.getMusic.mockResolvedValueOnce({ folder: '/gone', exists: false, tracks: [] });
    const { unmount } = renderConsole();
    expect(await screen.findByText(/There is no folder at \/gone/)).toBeInTheDocument();
    unmount();

    api.getMusic.mockResolvedValueOnce({ folder: '/empty', exists: true, tracks: [] });
    const second = renderConsole();
    expect(await screen.findByText(/No music files in this folder/)).toBeInTheDocument();
    second.unmount();

    api.getMusic.mockRejectedValueOnce(new Error('Server down'));
    const third = renderConsole();
    expect(await screen.findByRole('alert')).toHaveTextContent('Server down');
    third.unmount();

    const many = Array.from({ length: 160 }, (_, index) => ({ ...TRACKS[0], id: `t${index}`, title: `Song ${index}` }));
    api.getMusic.mockResolvedValueOnce({ folder: '/big', exists: true, tracks: many });
    renderConsole();
    expect(await screen.findByText('Showing 150 of 160. Search to find the others.')).toBeInTheDocument();
  });

  it('loads a track with its saved analysis, plays, pauses and cues it', async () => {
    const user = userEvent.setup();
    renderConsole();
    await loadOnA(user);
    const element = MockAudio.made[0];
    expect(element.src).toBe('/api/v1/music/tracks/one/audio');
    expect(element.preservesPitch).toBe(false);
    expect(await within(deck('A')).findByText('120.0')).toBeInTheDocument();
    expect(within(deck('A')).getByText('Rapture', { selector: 'strong' })).toBeInTheDocument();
    expect(api.saveTrackAnalysis).not.toHaveBeenCalled();

    await user.click(within(deck('A')).getByRole('button', { name: 'Play' }));
    expect(element.paused).toBe(false);
    expect(MockAudioContext.made[0].state).toBe('running');
    expect(within(deck('A')).getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(deck('A')).getByText('The lights follow this deck')).toBeInTheDocument();

    // Cue while playing: back to the cue point (the start), stopped.
    element.currentTime = 42;
    await user.click(within(deck('A')).getByRole('button', { name: 'Cue' }));
    expect(element.paused).toBe(true);
    expect(element.currentTime).toBe(0);
    // Cue while stopped: the cue point moves here.
    element.currentTime = 30;
    await user.click(within(deck('A')).getByRole('button', { name: 'Cue' }));
    await user.click(within(deck('A')).getByRole('button', { name: 'Play' }));
    element.currentTime = 60;
    await user.click(within(deck('A')).getByRole('button', { name: 'Cue' }));
    expect(element.currentTime).toBe(30);

    await user.click(within(deck('A')).getByRole('button', { name: 'Play' }));
    await user.click(within(deck('A')).getByRole('button', { name: 'Pause' }));
    expect(element.paused).toBe(true);
    act(() => element.dispatchEvent(new Event('ended')));

    fireEvent.change(screen.getByRole('slider', { name: 'Position on deck A' }), { target: { value: '100' } });
    expect(element.currentTime).toBe(100);
  });

  it('works out the beat of a track that has none saved, and keeps it in the library', async () => {
    api.getTrackAnalysis.mockResolvedValue({ analysis: null });
    const user = userEvent.setup();
    renderConsole();
    await loadOnA(user);
    await waitFor(() => expect(api.saveTrackAnalysis).toHaveBeenCalled());
    const [id, analysis] = api.saveTrackAnalysis.mock.calls[0];
    expect(id).toBe('one');
    expect(analysis.bpm).toBeGreaterThan(115);
    expect(analysis.bpm).toBeLessThan(125);
    expect(analysis.peaks.length).toBe(600);
  });

  it('says when a track cannot be analysed or played', async () => {
    api.getTrackAnalysis.mockResolvedValue({ analysis: null });
    MockAudioContext.failDecode = true;
    const user = userEvent.setup();
    renderConsole();
    await loadOnA(user);
    expect(await within(deck('A')).findByText(/No beat for the lights/)).toBeInTheDocument();

    MockAudio.failPlay = true;
    await user.click(within(deck('A')).getByRole('button', { name: 'Play' }));
    expect(await within(deck('A')).findByText('Could not play: blocked')).toBeInTheDocument();
    act(() => MockAudio.made[0].dispatchEvent(new Event('error')));
    expect(within(deck('A')).getByText('This track could not be played on this device.')).toBeInTheDocument();
  });

  it('sets the tempo fader, syncs one deck to the other, and mixes with volumes and the crossfader', async () => {
    const user = userEvent.setup();
    renderConsole();
    await loadOnA(user);
    api.getTrackAnalysis.mockResolvedValue({ analysis: { ...SAVED, bpm: 126 } });
    const row = screen.getByText('Be The One').closest('li');
    await user.click(within(row).getByRole('button', { name: /deck B/ }));
    expect(await within(deck('B')).findByText('126.0')).toBeInTheDocument();

    const [a, b] = MockAudio.made;
    fireEvent.change(within(deck('A')).getByRole('slider', { name: /Tempo/ }), { target: { value: '2' } });
    expect(a.playbackRate).toBeCloseTo(1.02);
    expect(within(deck('A')).getByText('122.4')).toBeInTheDocument();
    fireEvent.doubleClick(within(deck('A')).getByRole('slider', { name: /Tempo/ }));
    expect(a.playbackRate).toBe(1);

    await user.click(within(deck('A')).getByRole('button', { name: 'Sync' }));
    expect(a.playbackRate).toBeCloseTo(1.05);
    expect(b.playbackRate).toBe(1);

    const context = MockAudioContext.made[0];
    const [channelA, channelB, sideA, sideB] = context.gains;
    fireEvent.change(screen.getByRole('slider', { name: 'Deck B volume' }), { target: { value: '0.5' } });
    expect(channelB.gain.value).toBe(0.5);
    expect(channelA.gain.value).toBe(1);
    fireEvent.change(screen.getByRole('slider', { name: /Crossfader/ }), { target: { value: '1' } });
    expect(sideA.gain.value).toBeCloseTo(0);
    expect(sideB.gain.value).toBeCloseTo(1);
    fireEvent.doubleClick(screen.getByRole('slider', { name: /Crossfader/ }));
    expect(sideA.gain.value).toBeCloseTo(Math.SQRT1_2);
  });

  it('locks the lights to the beat of the deck being heard', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderConsole();
    await loadOnA(user);
    await within(deck('A')).findByText('120.0');
    await user.click(within(deck('A')).getByRole('button', { name: 'Play' }));
    const element = MockAudio.made[0];
    // A quarter of a second before the second bar (bars are 2 s at 120 BPM, from 1 s).
    element.currentTime = 2.8;
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(send).toHaveBeenCalledWith({ type: 'tempo', bpm: 120 });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(send).toHaveBeenCalledWith({ type: 'tempo', bpm: 120, sync: true });
    const synced = send.mock.calls.filter(([message]) => message.sync).length;
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(send.mock.calls.filter(([message]) => message.sync).length).toBe(synced);
  });

  it('shows a compact console with platters, transport and the crossfader', async () => {
    const { container } = renderConsole({ isCompact: true });
    expect(screen.getByRole('region', { name: 'Decks' })).toBeInTheDocument();
    expect(within(deck('A')).getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /Crossfader/ })).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Deck A volume' })).not.toBeInTheDocument();
    expect(screen.getByText('Lights: own tempo')).toBeInTheDocument();
    expect(await accessibilityViolations(container)).toEqual([]);
  });

  it('needs a provider above it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Lonely() {
      useDecks();
      return null;
    }
    expect(() => render(<Lonely />)).toThrow('useDecks needs a DecksProvider above it');
  });
});
