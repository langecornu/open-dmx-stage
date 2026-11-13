// One deck of the console: what is loaded, its tempo, the platter, the waveform, cue, play and sync, and the tempo
// fader. The compact one (in the visualizer) keeps the platter, the transport and the tempo readout.
import { DjPlatter } from './DjPlatter.jsx';
import { DjWaveform } from './DjWaveform.jsx';
import { Icon } from './Icon.jsx';
import { PITCH_RANGE, playingBpm } from '../utils/deckMaths.js';

/**
 * The line under a deck: a problem, the beat being found, or that the lights follow it.
 * @param {import('../hooks/useDecks.js').DeckState} deck
 * @param {boolean} isHeard
 * @returns {string}
 */
function statusOf(deck, isHeard) {
  if (deck.error) {
    return deck.error;
  }
  if (deck.isAnalysing) {
    return 'Finding the beat…';
  }
  return isHeard ? 'The lights follow this deck' : '';
}

/**
 * @param {{ index: number, decks: import('../hooks/useDecks.js').Decks, isCompact?: boolean, isHeard: boolean }} props
 */
export function DjDeck({ index, decks, isCompact = false, isHeard }) {
  const deck = decks.decks[index];
  const side = index === 0 ? 'A' : 'B';
  const other = decks.decks[1 - index];
  const bpm = playingBpm(deck.analysis, deck.pitch);
  const duration = deck.analysis?.durationSeconds ?? deck.track?.duration ?? 0;
  const position = () => decks.positionOf(index);
  const hasTrack = Boolean(deck.track);

  return (
    <section className={`dj-deck dj-deck-${side.toLowerCase()}`} aria-label={`Deck ${side}`}>
      <header className="dj-deck-head">
        <span className="dj-deck-letter" aria-hidden="true">
          {side}
        </span>
        <div className="dj-deck-track">
          <strong>{deck.track?.title ?? 'No track loaded'}</strong>
          <span>{deck.track ? deck.track.artist || deck.track.album || ' ' : 'Load one from the library'}</span>
        </div>
        <div className="dj-deck-bpm">
          <strong>{bpm ? bpm.toFixed(1) : deck.isAnalysing ? '…' : '--'}</strong>
          <span>BPM</span>
        </div>
      </header>

      <div className="dj-deck-body">
        <DjPlatter side={side} deck={deck} position={position} isCompact={isCompact} />
        {isCompact ? null : (
          <label className="dj-pitch">
            <span>Tempo</span>
            <input
              type="range"
              min={-PITCH_RANGE}
              max={PITCH_RANGE}
              step="0.05"
              value={deck.pitch}
              aria-valuetext={`${deck.pitch > 0 ? '+' : ''}${deck.pitch.toFixed(2)} %`}
              onChange={(event) => decks.setPitch(index, Number(event.target.value))}
              onDoubleClick={() => decks.setPitch(index, 0)}
            />
            <output>{`${deck.pitch > 0 ? '+' : ''}${deck.pitch.toFixed(1)}%`}</output>
          </label>
        )}
      </div>

      {isCompact ? null : (
        <DjWaveform
          side={side}
          deck={deck}
          position={position}
          duration={duration}
          onSeek={(seconds) => decks.seek(index, seconds)}
        />
      )}

      <div className="dj-transport">
        <button type="button" className="dj-btn dj-cue" disabled={!hasTrack} onClick={() => decks.cue(index)}>
          Cue
        </button>
        <button
          type="button"
          className="dj-btn dj-play"
          disabled={!hasTrack}
          aria-pressed={deck.playing}
          onClick={() => (deck.playing ? decks.pause(index) : decks.play(index))}
        >
          <Icon name={deck.playing ? 'pause' : 'play'} size={16} />
          {deck.playing ? 'Pause' : 'Play'}
        </button>
        {isCompact ? null : (
          <button
            type="button"
            className="dj-btn"
            disabled={!deck.analysis || !other.analysis}
            onClick={() => decks.sync(index)}
          >
            Sync
          </button>
        )}
      </div>

      <p className={`dj-deck-status${deck.error ? ' dj-deck-error' : ''}`} role="status">
        {statusOf(deck, isHeard)}
      </p>
    </section>
  );
}
