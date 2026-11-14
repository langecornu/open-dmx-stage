// Component tests for the song card of AI shows with the decks there: a track from the music library is listened to
// once, becomes the song to design for, and loads on deck A unless that is unticked.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiSongCard } from '../../src/components/AiSongCard.jsx';
import { accessibilityViolations } from './axe.js';

const decks = { library: null, libraryError: null, refreshLibrary: vi.fn(), load: vi.fn() };
vi.mock('../../src/hooks/useDecks.js', () => ({
  useOptionalDecks: () => decks,
  analyseLibraryTrack: vi.fn(),
}));
const { analyseLibraryTrack } = await import('../../src/hooks/useDecks.js');

const track = { id: 't1', file: 'a.mp3', title: 'Spore Signal', artist: 'Lange', album: '', duration: 200, bpm: 145 };
const other = { id: 't2', file: 'b.mp3', title: 'Fractal Bloom', artist: '', album: '', duration: null, bpm: null };
const song = {
  bpm: 145,
  durationSeconds: 200,
  firstBeatSeconds: 0.5,
  sections: [{ startBar: 0, bars: 8, energy: 0.9 }],
};
const analysis = { bpm: 145, firstBeatSeconds: 0.5, durationSeconds: 200, peaks: [] };

let latest;
function Harness() {
  const [current, setSong] = useState(null);
  latest = current;
  return <AiSongCard song={current} setSong={setSong} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(decks, { library: null, libraryError: null });
  analyseLibraryTrack.mockResolvedValue({ song, analysis });
});

describe('AiSongCard with the decks', () => {
  it('reads the music library, searches it, and loads the chosen track on deck A', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: /From your music/ }));
    expect(decks.refreshLibrary).toHaveBeenCalled();
    expect(screen.getByText('Reading your music…')).toBeInTheDocument();

    decks.library = { folder: '/music', exists: true, tracks: [track, other] };
    rerender(<Harness />);
    await user.type(screen.getByRole('searchbox', { name: 'Search your music' }), 'spore');
    expect(screen.queryByText('Fractal Bloom')).not.toBeInTheDocument();
    expect(screen.getByText('Lange · 3:20 · 145 BPM')).toBeInTheDocument();
    expect(await accessibilityViolations(container)).toEqual([]);

    await user.click(screen.getByRole('button', { name: /Spore Signal/ }));
    await waitFor(() => expect(latest).toEqual(song));
    expect(analyseLibraryTrack).toHaveBeenCalledWith('t1');
    expect(decks.load).toHaveBeenCalledWith(0, track, analysis);
    expect(screen.getByText('Lange – Spore Signal')).toBeInTheDocument();
    expect(screen.getByText(/loaded on deck A/)).toBeInTheDocument();
    expect(screen.getByText(/Play deck A and start the sequence/)).toBeInTheDocument();
  });

  it('leaves the decks alone when asked, and says when nothing matches or the folder is empty', async () => {
    const user = userEvent.setup();
    decks.library = { folder: '/music', exists: true, tracks: [other] };
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: /From your music/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Load it on deck A' }));
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No track matches.')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox'));
    await user.click(screen.getByRole('button', { name: /Fractal Bloom/ }));
    await waitFor(() => expect(latest).toEqual(song));
    expect(decks.load).not.toHaveBeenCalled();
    expect(screen.getByText(/Start the sequence on the first downbeat/)).toBeInTheDocument();

    decks.library = { folder: '/empty', exists: true, tracks: [] };
    await user.click(screen.getByRole('button', { name: /Another song/ }));
    expect(screen.getByText(/No music in \/empty/)).toBeInTheDocument();
  });

  it('shows a library that cannot be read, and a track that cannot be listened to', async () => {
    const user = userEvent.setup();
    decks.libraryError = 'The music folder is not there.';
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: /From your music/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('The music folder is not there.');

    decks.libraryError = null;
    decks.library = {
      folder: '/music',
      exists: true,
      tracks: Array.from({ length: 70 }, (_, i) => ({ ...other, id: `x${i}` })),
    };
    await user.click(screen.getByRole('button', { name: /From your music/ }));
    await user.click(screen.getByRole('button', { name: /From your music/ }));
    expect(screen.getByText(/Showing the first 60 of 70/)).toBeInTheDocument();
    analyseLibraryTrack.mockRejectedValue(new Error('Could not decode this file.'));
    await user.click(screen.getAllByRole('button', { name: /Fractal Bloom/ })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not decode this file.');
    expect(latest).toBeNull();
  });
});
