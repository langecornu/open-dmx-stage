// The DJ console on Perform: two decks with a mixer between them (channel volumes and the crossfader) and the music
// library below. The sound comes out of the device showing it; the lights follow the deck being heard. The compact one
// sits in the visualizer with the platters, cue, play and the crossfader.
import { useDecks } from '../hooks/useDecks.js';
import { heardDeck } from '../utils/deckMaths.js';
import { DjDeck } from './DjDeck.jsx';
import { DjLibrary } from './DjLibrary.jsx';

/**
 * @param {{ decks: import('../hooks/useDecks.js').Decks, heard: number, isCompact: boolean }} props
 */
function DjMixer({ decks, heard, isCompact }) {
  return (
    <div className="dj-mixer" role="group" aria-label="Mixer">
      {isCompact ? null : (
        <div className="dj-channels">
          {['A', 'B'].map((side, index) => (
            <label key={side} className="dj-channel">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={decks.decks[index].volume}
                aria-label={`Deck ${side} volume`}
                onChange={(event) => decks.setVolume(index, Number(event.target.value))}
              />
              <span aria-hidden="true">{side}</span>
            </label>
          ))}
        </div>
      )}
      <label className="dj-crossfader">
        <span className="sr-only">Crossfader, deck A to deck B</span>
        <span aria-hidden="true">A</span>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={decks.crossfader}
          onChange={(event) => decks.setCrossfader(Number(event.target.value))}
          onDoubleClick={() => decks.setCrossfader(0)}
        />
        <span aria-hidden="true">B</span>
      </label>
      <p className="dj-follow">{heard < 0 ? 'Lights: own tempo' : `Lights follow ${heard === 0 ? 'A' : 'B'}`}</p>
    </div>
  );
}

/** @param {{ isCompact?: boolean }} props */
export function DjConsole({ isCompact = false }) {
  const decks = useDecks();
  const heard = heardDeck(decks.decks, decks.crossfader);
  return (
    <section
      className={`dj-console${isCompact ? ' dj-console-compact' : ' card'}`}
      aria-label={isCompact ? 'Decks' : undefined}
      aria-labelledby={isCompact ? undefined : 'dj-title'}
    >
      {isCompact ? null : (
        <div className="section-bar">
          <h2 className="section-title" id="dj-title">
            Decks
          </h2>
          <p className="dj-hint">Music from your library plays on this device; the lights lock to its beat.</p>
        </div>
      )}
      <div className="dj-decks">
        <DjDeck index={0} decks={decks} isCompact={isCompact} isHeard={heard === 0} />
        <DjMixer decks={decks} heard={heard} isCompact={isCompact} />
        <DjDeck index={1} decks={decks} isCompact={isCompact} isHeard={heard === 1} />
      </div>
      {isCompact ? null : <DjLibrary decks={decks} />}
    </section>
  );
}
