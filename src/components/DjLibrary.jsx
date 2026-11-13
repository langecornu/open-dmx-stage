// The music library under the decks: the folder it reads on the computer running the app, a search, and every track
// with buttons to load it on deck A or B. Long libraries show the first matches only, so the list stays quick.
import { useEffect, useState } from 'react';

import { formatTime } from '../utils/deckMaths.js';
import { Icon } from './Icon.jsx';

const SHOWN = 150;

/**
 * @param {import('../hooks/useDecks.js').Track} track
 * @param {string} query lower case
 */
const matches = (track, query) =>
  query === '' || `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(query);

/** @param {{ decks: import('../hooks/useDecks.js').Decks }} props */
export function DjLibrary({ decks }) {
  const { library, libraryError, refreshLibrary, setFolder, load } = decks;
  const [query, setQuery] = useState('');
  const [folderDraft, setFolderDraft] = useState(/** @type {string | null} */ (null));
  const [folderError, setFolderError] = useState(/** @type {string | null} */ (null));
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (!library) {
      refreshLibrary();
    }
  }, [library, refreshLibrary]);

  const rescan = async () => {
    setIsScanning(true);
    await refreshLibrary(true);
    setIsScanning(false);
  };

  const saveFolder = async (event) => {
    event.preventDefault();
    if (!folderDraft?.trim()) {
      return;
    }
    setIsScanning(true);
    try {
      await setFolder(folderDraft.trim());
      setFolderDraft(null);
      setFolderError(null);
    } catch (error) {
      setFolderError(error.message);
    } finally {
      setIsScanning(false);
    }
  };

  const found = (library?.tracks ?? []).filter((track) => matches(track, query.trim().toLowerCase()));
  return (
    <section className="dj-library" aria-labelledby="dj-library-title">
      <div className="dj-library-head">
        <h3 id="dj-library-title" className="section-title">
          Music
          {library ? <span className="section-count">{library.tracks.length}</span> : null}
        </h3>
        <input
          className="input dj-search"
          type="search"
          placeholder="Search title, artist or album"
          aria-label="Search the music"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className="btn" onClick={rescan} disabled={isScanning}>
          <Icon name="refresh" size={14} />
          {isScanning ? 'Reading…' : 'Rescan'}
        </button>
      </div>

      <form className="dj-folder" onSubmit={saveFolder}>
        <label className="field field-inline">
          Music folder on the computer running the app
          <input
            className="input"
            value={folderDraft ?? library?.folder ?? ''}
            onChange={(event) => setFolderDraft(event.target.value)}
            placeholder="~/Music"
            spellCheck="false"
            autoCapitalize="off"
          />
        </label>
        {folderDraft !== null ? (
          <button type="submit" className="btn btn-primary" disabled={isScanning}>
            Use this folder
          </button>
        ) : null}
      </form>
      {folderError || libraryError ? (
        <p className="error-banner" role="alert">
          {folderError ?? libraryError}
        </p>
      ) : null}
      {library && !library.exists ? (
        <p className="dj-library-note">There is no folder at {library.folder}. Type the folder your music is in.</p>
      ) : null}
      {library?.exists && library.tracks.length === 0 ? (
        <p className="dj-library-note">No music files in this folder (MP3, AAC, M4A, WAV, FLAC, OGG or AIFF).</p>
      ) : null}
      {!library && !libraryError ? (
        <p className="dj-library-note" role="status">
          Reading the music folder…
        </p>
      ) : null}

      {found.length > 0 ? (
        <ul className="dj-tracks">
          {found.slice(0, SHOWN).map((track) => (
            <li key={track.id} className="dj-track">
              <div className="dj-track-name">
                <strong>{track.title}</strong>
                <span>{[track.artist, track.album].filter(Boolean).join(' · ')}</span>
              </div>
              <span className="dj-track-meta">
                {track.bpm ? `${track.bpm} BPM · ` : ''}
                {track.duration ? formatTime(track.duration) : ''}
              </span>
              <button type="button" className="dj-btn dj-load-a" onClick={() => load(0, track)}>
                A<span className="sr-only">{`: load ${track.title} on deck A`}</span>
              </button>
              <button type="button" className="dj-btn dj-load-b" onClick={() => load(1, track)}>
                B<span className="sr-only">{`: load ${track.title} on deck B`}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {found.length > SHOWN ? (
        <p className="dj-library-note">{`Showing ${SHOWN} of ${found.length}. Search to find the others.`}</p>
      ) : null}
      {library && library.tracks.length > 0 && found.length === 0 ? (
        <p className="dj-library-note">Nothing matches “{query}”.</p>
      ) : null}
    </section>
  );
}
