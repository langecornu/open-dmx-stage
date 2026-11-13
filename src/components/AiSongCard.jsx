// The song card of AI shows: pick a song to build a sequence to. Its tempo, first downbeat and energy map are worked
// out in this browser, and only those numbers are sent to the AI.
import { useState } from 'react';

import { formatTime, plural } from '../utils/format.js';
import { analyseSongFile } from '../utils/songAnalysis.js';
import { Icon } from './Icon.jsx';

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

export function AiSongCard({ song, setSong }) {
  const [state, setState] = useState(
    /** @type {{ busy: boolean, error: string | null, name: string }} */ ({
      busy: false,
      error: null,
      name: '',
    }),
  );

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setState({ busy: true, error: null, name: file.name });
    try {
      setSong(await analyseSongFile(file));
      setState({ busy: false, error: null, name: file.name });
    } catch (error) {
      setSong(null);
      setState({ busy: false, error: error.message, name: '' });
    }
  };

  const setBpm = (bpm) => setSong({ ...song, bpm: Math.max(40, Math.min(240, Math.round(bpm * 10) / 10)) });

  return (
    <section className="card card-pad ai-card" aria-labelledby="ai-song-title">
      <h2 className="section-title" id="ai-song-title">
        Song (optional)
      </h2>
      <p className="view-sub">
        Pick the song to design for. It is analysed here, in your browser: only its tempo, length and how its energy
        rises and falls are sent to the AI, never the audio. Play it from your deck as usual.
      </p>
      <div className="toolbar">
        <label className="btn">
          <Icon name="upload" size={16} />
          {song ? 'Choose another song' : 'Choose a song'}
          <input className="sr-only" type="file" accept="audio/*" onChange={handleFile} />
        </label>
        {song ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setSong(null);
              setState({ busy: false, error: null, name: '' });
            }}
          >
            No song
          </button>
        ) : null}
        {state.busy ? (
          <span className="fixture-meta" role="status">
            Listening to {state.name}…
          </span>
        ) : null}
      </div>
      {state.error ? (
        <p className="error-banner" role="alert">
          {state.error}
        </p>
      ) : null}
      {song ? (
        <div className="ai-song">
          <p className="fixture-meta">
            {state.name ? `${state.name} · ` : ''}
            {formatTime(song.durationSeconds)} · first downbeat at {song.firstBeatSeconds.toFixed(2)} s
          </p>
          <div className="toolbar">
            <label className="field">
              Tempo (beats a minute)
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
            <button type="button" className="btn btn-compact" onClick={() => setBpm(song.bpm / 2)}>
              Half
            </button>
            <button type="button" className="btn btn-compact" onClick={() => setBpm(song.bpm * 2)}>
              Double
            </button>
            <span className="fixture-meta">If the tempo sounds twice too fast or slow, halve or double it.</span>
          </div>
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
          <p className="fixture-meta">
            {plural(song.sections.length, 'section')} over {song.sections.reduce((sum, s) => sum + s.bars, 0)} bars. The
            AI makes one sequence that follows the whole song: start it on the first downbeat, and turn on Follow the
            music on Perform so the lights stay on the beat.
          </p>
        </div>
      ) : null}
    </section>
  );
}
