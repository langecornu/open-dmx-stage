// The strip at the top of Perform: output, MIDI and music at a glance, each with a coloured dot and words (never colour
// alone), and the tempo with four lamps that pulse at its speed so the beat is visible even without music.
import { describePerformStatus } from '../utils/performStatus.js';

const BEATS = [0, 1, 2, 3];

export function PerformStatus({ connected, output, midi, follower, bpm, onShow }) {
  const chips = describePerformStatus({ connected, output, midi, follower });
  const beatMs = Math.round(60000 / bpm);

  return (
    <div className="perform-strip">
      <ul className="perform-chips" aria-label="Status">
        {chips.map((chip) => {
          const content = (
            <>
              <span className="dot" aria-hidden="true" />
              <span className="perform-chip-name">{chip.name}</span>
              <span className="perform-chip-value">{chip.value}</span>
            </>
          );
          // MIDI and music have their panel further down this screen; the output is fixed from the top bar.
          return (
            <li key={chip.id}>
              {chip.id === 'output' ? (
                <span className="perform-chip" data-tone={chip.tone}>
                  {content}
                </span>
              ) : (
                <button
                  type="button"
                  className="perform-chip"
                  data-tone={chip.tone}
                  aria-label={`${chip.name}: ${chip.value}. Show its settings`}
                  onClick={() => onShow(chip.id)}
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="perform-beat" role="group" aria-label={`Tempo: ${Math.round(bpm * 10) / 10} BPM`}>
        {/* Keyed on the tempo so the pulse restarts in step when it changes. */}
        <span key={beatMs} className="beat-lamps" style={{ '--beat': `${beatMs}ms` }} aria-hidden="true">
          {BEATS.map((beat) => (
            <span key={beat} className="beat-lamp" style={{ '--beat-index': beat }} />
          ))}
        </span>
        <span className="perform-beat-bpm" aria-hidden="true">
          {Math.round(bpm * 10) / 10} <small>BPM</small>
        </span>
      </div>
    </div>
  );
}
