// The song card of AI shows: pick a song to build a sequence to, from the music library on the computer running the app
// (it then loads on deck A, ready to play with the lights) or from this device. Its tempo, first downbeat and energy map
// are worked out in this browser, and only those numbers are sent to the AI.
import { useEffect, useState } from 'react';

import { analyseLibraryTrack, useOptionalDecks } from '../hooks/useDecks.js';
import { formatTime, plural } from '../utils/format.js';
import { analyseSongFile } from '../utils/songAnalysis.js';
import { Icon } from './Icon.jsx';

const SHOWN = 60;

/**
 * A bar's energy in a word.
 * @param {number} energy 0 to 1
 * @returns {string}
 */
function energyWord(energy) {
  if (energy < 0.33) {
    return 'quiet';
  }
  return energy < 0.66 ? 'medium' : 'high';
}

/** @param {{ title: string, artist: string }} track */
const trackName = (track) => (track.artist ? `${track.artist} – ${track.title}` : track.title);

export function AiSongCard({ song, setSong }) {
  const decks = useOptionalDecks();
  const [state, setState] = useState(
    /** @type {{ busy: boolean, error: string | null, name: string, onDeck: boolean }} */ ({
      busy: false,
      error: null,
      name: '',
      onDeck: false,
    }),
  );
  const [isPicking, setIsPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [loadOnDeck, setLoadOnDeck] = useState(true);

  useEffect(() => {
    if (isPicking && decks && !decks.library) {
      decks.refreshLibrary();
    }
  }, [isPicking, decks]);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setIsPicking(false);
    setState({ busy: true, error: null, name: file.name, onDeck: false });
    try {
      setSong(await analyseSongFile(file));
      setState({ busy: false, error: null, name: file.name, onDeck: false });
    } catch (error) {
      setSong(null);
      setState({ busy: false, error: error.message, name: '', onDeck: false });
    }
  };

  /** @param {import('../hooks/useDecks.js').Track} track */
  const pickTrack = async (track) => {
    const name = trackName(track);
    setIsPicking(false);
    setState({ busy: true, error: null, name, onDeck: false });
    try {
      const { song: analysed, analysis } = await analyseLibraryTrack(track.id);
      setSong(analysed);
      const onDeck = Boolean(decks && loadOnDeck);
      if (onDeck) {
        decks?.load(0, track, analysis);
      }
      setState({ busy: false, error: null, name, onDeck });
    } catch (error) {
      setSong(null);
      setState({ busy: false, error: error.message, name: '', onDeck: false });
    }
  };

  const setBpm = (bpm) => setSong({ ...song, bpm: Math.max(40, Math.min(240, Math.round(bpm * 10) / 10)) });
  const wanted = query.trim().toLowerCase();
  const found = (decks?.library?.tracks ?? []).filter(
    (track) => wanted === '' || `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(wanted),
  );

  return (
    <section className="card card-pad ai-card" aria-labelledby="ai-song-title">
      <div className="ai-card-head">
        <h2 className="section-title" id="ai-song-title">
          Song <span className="ai-optional">optional</span>
        </h2>
        <div className="toolbar">
          {decks ? (
            <button
              type="button"
              className={`btn${song ? '' : ' btn-primary'}`}
              aria-expanded={isPicking}
              onClick={() => setIsPicking((open) => !open)}
            >
              <Icon name="music" size={16} />
              {song ? 'Another song' : 'From your music'}
            </button>
          ) : null}
          <label className="btn btn-ghost">
            <Icon name="upload" size={16} />
            {decks ? 'From this device' : song ? 'Choose another song' : 'Choose a song'}
            <input className="sr-only" type="file" accept="audio/*" onChange={handleFile} />
          </label>
          {song ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSong(null);
                setState({ busy: false, error: null, name: '', onDeck: false });
              }}
            >
              No song
            </button>
          ) : null}
        </div>
      </div>
      {song || isPicking ? null : (
        <p className="view-sub">
          One sequence will follow the song section by section. It is listened to in this browser: only its tempo and
          energy go to the AI, never the audio.
        </p>
      )}

      {isPicking && decks ? (
        <div className="ai-tracks">
          <div className="toolbar">
            <input
              className="input"
              type="search"
              placeholder="Search your music"
              aria-label="Search your music"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <label className="ai-check">
              <input type="checkbox" checked={loadOnDeck} onChange={(event) => setLoadOnDeck(event.target.checked)} />
              Load it on deck A
            </label>
          </div>
          {decks.libraryError ? (
            <p className="error-banner" role="alert">
              {decks.libraryError}
            </p>
          ) : !decks.library ? (
            <p className="fixture-meta" role="status">
              Reading your music…
            </p>
          ) : found.length === 0 ? (
            <p className="fixture-meta">
              {decks.library.tracks.length === 0
                ? `No music in ${decks.library.folder}. Choose the folder under the decks on Perform, or pick a file from this device.`
                : 'No track matches.'}
            </p>
          ) : (
            <ul className="ai-track-list" aria-label="Your music">
              {found.slice(0, SHOWN).map((track) => (
                <li key={track.id}>
                  <button type="button" className="ai-track" onClick={() => pickTrack(track)}>
                    <span className="ai-track-title">{track.title}</span>
                    <span className="fixture-meta">
                      {[
                        track.artist,
                        track.duration ? formatTime(track.duration) : '',
                        track.bpm ? `${track.bpm} BPM` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {found.length > SHOWN ? (
            <p className="fixture-meta">
              Showing the first {SHOWN} of {found.length}. Search to narrow it down.
            </p>
          ) : null}
        </div>
      ) : null}

      {state.busy ? (
        <p className="fixture-meta" role="status">
          Listening to {state.name}…
        </p>
      ) : null}
      {state.error ? (
        <p className="error-banner" role="alert">
          {state.error}
        </p>
      ) : null}
      {song ? (
        <div className="ai-song">
          <p className="ai-song-name">
            <strong>{state.name || 'Your song'}</strong>
            <span className="fixture-meta">
              {formatTime(song.durationSeconds)} · first downbeat at {song.firstBeatSeconds.toFixed(2)} s
              {state.onDeck ? ' · loaded on deck A' : ''}
            </span>
          </p>
          <div className="ai-energy" role="img" aria-label="Energy of the song by section">
            {song.sections.map((section) => (
              <span
                key={section.startBar}
                className="ai-energy-section"
                data-level={energyWord(section.energy)}
                style={{ flexGrow: section.bars, height: `${20 + section.energy * 80}%` }}
                title={`Bars ${section.startBar + 1} to ${section.startBar + section.bars}: ${energyWord(section.energy)}`}
              />
            ))}
          </div>
          <div className="toolbar">
            <label className="field ai-tempo">
              Tempo (BPM)
              <input
                className="input input-narrow"
                type="number"
                min="40"
                max="240"
                step="0.1"
                value={song.bpm}
                onChange={(event) => setBpm(Number(event.target.value) || song.bpm)}
              />
            </label>
            <button
              type="button"
              className="btn btn-compact"
              title="If the tempo sounds twice too fast"
              onClick={() => setBpm(song.bpm / 2)}
            >
              Half
            </button>
            <button
              type="button"
              className="btn btn-compact"
              title="If the tempo sounds twice too slow"
              onClick={() => setBpm(song.bpm * 2)}
            >
              Double
            </button>
            <span className="fixture-meta">
              {plural(song.sections.length, 'section')}, {song.sections.reduce((sum, s) => sum + s.bars, 0)} bars.{' '}
              {state.onDeck
                ? 'Play deck A and start the sequence: the lights lock to it.'
                : 'Start the sequence on the first downbeat, with Follow the music on.'}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
